// adapters/claude.js
const fs = require('fs');
const path = require('path');
const BaseAdapter = require('./base');
const { createUnifiedEvent } = require('./types');

class ClaudeAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('claude', options);
    this.projectsRoot = options.projectsRoot || path.join(process.env.HOME || '', '.claude/projects');
    this.translator = options.translator;
    this.pollInterval = options.pollInterval || 500;
    this.watchedOffsets = new Map();
    this.timer = null;
    this.maxRecentSessions = options.maxRecentSessions || 4;
  }

  deriveProject(projectDirPath) {
    try {
      const base = path.basename(projectDirPath);
      const cleaned = base.replace(/^-+|-+$/g, '');
      if (cleaned.includes('Storello')) return 'STORELLO';
      if (cleaned.includes('FastToChart')) return 'FASTTOCHART';
      if (cleaned.includes('stream-overlay') || cleaned.includes('streeam')) return 'STREEAM';
      if (cleaned.includes('extension')) return 'EXTENSION';
      const parts = cleaned.split('-').filter(Boolean);
      return (parts[parts.length - 1] || 'CLAUDE').toUpperCase();
    } catch (e) {
      return 'CLAUDE';
    }
  }

  extractText(content) {
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
      return content
        .map(item => (typeof item === 'string' ? item : item.text || ''))
        .filter(Boolean)
        .join(' ')
        .trim();
    }
    return '';
  }

  async processLine(line, filePath, project) {
    try {
      const obj = JSON.parse(line);
      const type = obj.type;
      const timestamp = obj.timestamp ? new Date(obj.timestamp).getTime() : Date.now();

      if (type === 'ai-title' && obj.aiTitle) {
        this.emitEvent(createUnifiedEvent({
          source: 'claude',
          project,
          type: 'plan',
          badge: `${project} • AGENT PLAN`,
          title: `Active session focus: ${obj.aiTitle}`,
          timestamp,
        }));
        return;
      }

      if (type === 'user') {
        const text = this.extractText(obj.message?.content);
        if (text && text.length > 3 && !text.startsWith('data:image')) {
          const enGoal = this.translator ? await this.translator.translate(text, 'goal') : text;
          this.emitEvent(createUnifiedEvent({
            source: 'claude',
            project,
            type: 'user',
            badge: `${project} • USER PROMPT`,
            title: enGoal,
            raw: text,
            timestamp,
          }));
        }
      } else if (type === 'assistant') {
        const content = obj.message?.content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'tool_use') {
              const toolName = item.name || 'tool';
              const inputDesc = item.input?.command || item.input?.path || item.input?.file_path || '';
              let explanation = `Invoking tool ${toolName} to process updates`;
              if (this.translator && inputDesc) {
                explanation = await this.translator.translate(`${toolName}: ${String(inputDesc)}`, 'action');
              }
              this.emitEvent(createUnifiedEvent({
                source: 'claude',
                project,
                type: 'action',
                badge: `${project} • AGENT ACTION`,
                title: explanation,
                meta: { tool: toolName },
                timestamp,
              }));
            } else if (item.type === 'text' && item.text && item.text.trim().length > 15) {
              const first = item.text.split('\n\n')[0].trim();
              if (first && !first.startsWith('```') && first.length < 350) {
                const enSummary = this.translator ? await this.translator.translate(first, 'summary') : first;
                this.emitEvent(createUnifiedEvent({
                  source: 'claude',
                  project,
                  type: 'done',
                  badge: `${project} • COMPLETED STEP`,
                  title: enSummary,
                  timestamp,
                }));
              }
            }
          }
        }
      }
    } catch (e) {}
  }

  findRecentSessionFiles() {
    if (!fs.existsSync(this.projectsRoot)) return [];
    const files = [];

    const dirs = fs.readdirSync(this.projectsRoot);
    for (const d of dirs) {
      const fullDir = path.join(this.projectsRoot, d);
      try {
        const statDir = fs.statSync(fullDir);
        if (!statDir.isDirectory()) continue;
        const project = this.deriveProject(fullDir);

        const inner = fs.readdirSync(fullDir);
        for (const f of inner) {
          if (f.endsWith('.jsonl')) {
            const p = path.join(fullDir, f);
            const st = fs.statSync(p);
            files.push({
              path: p,
              project,
              mtime: st.mtimeMs,
              size: st.size,
            });
          }
        }
      } catch (e) {}
    }

    files.sort((a, b) => b.mtime - a.mtime);
    return files.slice(0, this.maxRecentSessions);
  }

  async backfillSession(sess) {
    try {
      const readSize = Math.min(sess.size, 256 * 1024);
      const buffer = Buffer.alloc(readSize);
      const fd = fs.openSync(sess.path, 'r');
      fs.readSync(fd, buffer, 0, readSize, Math.max(0, sess.size - readSize));
      fs.closeSync(fd);

      this.watchedOffsets.set(sess.path, sess.size);
      const lines = buffer.toString('utf8').split('\n').filter(Boolean);
      for (const line of lines.slice(-6)) {
        await this.processLine(line, sess.path, sess.project);
      }
    } catch (e) {}
  }

  async start() {
    await super.start();
    const recent = this.findRecentSessionFiles();
    for (const sess of recent) {
      this.watchedOffsets.set(sess.path, sess.size);
    }

    this.timer = setInterval(async () => {
      const sessions = this.findRecentSessionFiles();
      for (const sess of sessions) {
        try {
          const stat = fs.statSync(sess.path);
          const prev = this.watchedOffsets.get(sess.path) ?? stat.size;
          if (stat.size > prev) {
            const diff = stat.size - prev;
            const buffer = Buffer.alloc(diff);
            const fd = fs.openSync(sess.path, 'r');
            fs.readSync(fd, buffer, 0, diff, prev);
            fs.closeSync(fd);

            this.watchedOffsets.set(sess.path, stat.size);
            const lines = buffer.toString('utf8').split('\n').filter(Boolean);
            for (const line of lines) {
              await this.processLine(line, sess.path, sess.project);
            }
          }
        } catch (e) {}
      }
    }, this.pollInterval);
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await super.stop();
  }
}

module.exports = ClaudeAdapter;
