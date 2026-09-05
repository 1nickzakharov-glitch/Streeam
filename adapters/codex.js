// adapters/codex.js
const fs = require('fs');
const path = require('path');
const BaseAdapter = require('./base');
const { createUnifiedEvent } = require('./types');

class CodexAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('codex', options);
    this.codexRoot = options.codexRoot || path.join(process.env.HOME || '', '.codex');
    this.translator = options.translator;
    this.pollInterval = options.pollInterval || 500;
    this.watchedOffsets = new Map();
    this.timer = null;
    this.maxRecentSessions = options.maxRecentSessions || 4;
  }

  deriveProject(payload) {
    if (payload?.cwd) {
      const parts = payload.cwd.split('/').filter(Boolean);
      return (parts[parts.length - 1] || 'CODEX').toUpperCase();
    }
    return 'CODEX';
  }

  async processLine(line, filePath) {
    try {
      const obj = JSON.parse(line);
      const timestamp = obj.timestamp ? new Date(obj.timestamp).getTime() : Date.now();
      const type = obj.type;
      const payload = obj.payload;

      if (type === 'session_meta') {
        const project = this.deriveProject(payload);
        this.emitEvent(createUnifiedEvent({
          source: 'codex',
          project,
          type: 'system',
          badge: `${project} • ENVIRONMENT`,
          title: `Codex environment initialized at ${payload?.cwd || 'workspace'}`,
          meta: payload,
          timestamp,
        }));
        return;
      }

      if (type === 'response_item') {
        const itemType = payload?.type;
        const project = 'CODEX';

        if (itemType === 'message') {
          const role = payload?.role;
          const text = typeof payload?.content === 'string' 
            ? payload.content 
            : Array.isArray(payload?.content)
              ? payload.content.map(c => c.text || '').join(' ')
              : '';

          if (role === 'user' && text && text.length > 3) {
            const enGoal = this.translator ? await this.translator.translate(text, 'goal') : text;
            this.emitEvent(createUnifiedEvent({
              source: 'codex',
              project,
              type: 'user',
              badge: `${project} • USER PROMPT`,
              title: enGoal,
              raw: text,
              timestamp,
            }));
          } else if (role === 'assistant' && text && text.length > 15) {
            const first = text.split('\n\n')[0].trim();
            if (first && !first.startsWith('{') && first.length < 350) {
              const enSummary = this.translator ? await this.translator.translate(first, 'summary') : first;
              this.emitEvent(createUnifiedEvent({
                source: 'codex',
                project,
                type: 'done',
                badge: `${project} • COMPLETED STEP`,
                title: enSummary,
                timestamp,
              }));
            }
          }
        } else if (itemType === 'reasoning') {
          const summary = payload?.summary;
          if (summary) {
            const enPlan = this.translator ? await this.translator.translate(summary, 'plan') : summary;
            this.emitEvent(createUnifiedEvent({
              source: 'codex',
              project,
              type: 'plan',
              badge: `${project} • AGENT PLAN`,
              title: enPlan,
              timestamp,
            }));
          }
        } else if (itemType === 'web_search_call' || itemType === 'function_call' || itemType === 'custom_tool_call') {
          const actionName = payload?.action || payload?.name || itemType;
          let humanAction = `Executing tool operation: ${actionName}`;
          if (this.translator) {
            humanAction = await this.translator.translate(`Codex invoking ${actionName}: ${JSON.stringify(payload)}`, 'action');
          }
          this.emitEvent(createUnifiedEvent({
            source: 'codex',
            project,
            type: 'action',
            badge: `${project} • AGENT ACTION`,
            title: humanAction,
            meta: payload,
            timestamp,
          }));
        }
      }
    } catch (e) {}
  }

  findRecentSessionFiles() {
    const sessionsDir = path.join(this.codexRoot, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
      // Also check root if sessions dir is not separate
      if (fs.existsSync(this.codexRoot)) {
        return [];
      }
      return [];
    }
    const files = [];

    const walk = (dir, depth = 0) => {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath, depth + 1);
          } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            const st = fs.statSync(fullPath);
            files.push({
              path: fullPath,
              mtime: st.mtimeMs,
              size: st.size,
            });
          }
        }
      } catch (e) {}
    };

    walk(sessionsDir);
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
        await this.processLine(line, sess.path);
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
              await this.processLine(line, sess.path);
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

module.exports = CodexAdapter;
