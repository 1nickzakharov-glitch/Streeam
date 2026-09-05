// adapters/pi.js
const fs = require('fs');
const path = require('path');
const BaseAdapter = require('./base');
const { createUnifiedEvent } = require('./types');

class PiAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('pi', options);
    this.sessionsRoot = options.sessionsRoot || path.join(process.env.HOME || '', '.pi/agent/sessions');
    this.translator = options.translator;
    this.pollInterval = options.pollInterval || 500;
    this.watchedOffsets = new Map();
    this.timer = null;
    this.maxRecentSessions = options.maxRecentSessions || 4;
    // Track active sprint todo state per project
    this.activeTodos = new Map();
  }

  deriveProject(filePath) {
    try {
      const parentDir = path.basename(path.dirname(filePath));
      const cleaned = parentDir.replace(/^--|--$/g, '');
      const parts = cleaned.split('-');

      if (cleaned.includes('orca-workspaces')) {
        const idx = parts.indexOf('workspaces');
        if (idx !== -1 && parts[idx + 2]) {
          return parts.slice(idx + 2).join('-').toUpperCase();
        }
      }
      if (cleaned.includes('Storello')) return 'STORELLO';
      if (cleaned.includes('FastToChart')) return 'FASTTOCHART';
      if (cleaned.includes('stream-overlay') || cleaned.includes('streeam')) return 'STREEAM';
      if (cleaned.includes('SuperWhisper')) return 'SUPERWHISPER';
      return (parts[parts.length - 1] || 'DEV').toUpperCase();
    } catch (e) {
      return 'DEV';
    }
  }

  async formatAction(tool, args) {
    if (tool === 'edit' || tool === 'write') {
      const file = args?.path ? args.path.split('/').slice(-2).join('/') : '';
      return file 
        ? `Modifying ${file} to implement requested architectural updates` 
        : 'Editing source code to apply changes';
    }
    if (tool === 'todo') {
      return null;
    }
    if (tool === 'bash') {
      const cmd = args?.command || '';
      if (cmd.includes('typecheck') || cmd.includes('check') || cmd.includes('tsc')) {
        return 'Running full TypeScript typechecker to verify strict types';
      }
      if (cmd.includes('deploy')) {
        return 'Initiating automated deploy pipeline to staging';
      }
      if (cmd.includes('build-prod') || cmd.includes('npm run build')) {
        return 'Compiling production web bundle and optimizing assets';
      }
      if (cmd.includes('git commit') || cmd.includes('git push')) {
        return 'Safely versioning changes and pushing commits to remote';
      }
      if (cmd.includes('playwright') || cmd.includes('browser') || cmd.includes('cypress')) {
        return 'Verifying user interface with automated browser tests and snapshots';
      }
      if (cmd.startsWith('git status') || cmd.startsWith('git diff')) {
        return 'Inspecting current git diff to review code modifications';
      }
      if (cmd.startsWith('npm install') || cmd.startsWith('pnpm install')) {
        return 'Resolving and updating project dependencies';
      }
      if (this.translator && cmd.length > 5) {
        return await this.translator.translate(cmd, 'action');
      }
      return 'Running verification command in terminal';
    }
    return null;
  }

  cleanSnippet(content) {
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
      let out = '';
      for (const p of content) {
        if (p.type === 'text') out += p.text;
      }
      return out.trim();
    }
    return '';
  }

  async processLine(line, filePath, project) {
    try {
      const obj = JSON.parse(line);
      const isRecordMessage = obj.recordType === 'message';
      const isPlainMessage = obj.type === 'message';
      if (!isRecordMessage && !isPlainMessage) return;

      const role = obj.role || obj.message?.role;
      const content = obj.message?.content || obj.text;
      const timestamp = obj.timestamp ? new Date(obj.timestamp).getTime() : Date.now();

      if (role === 'user') {
        const rawText = this.cleanSnippet(content);
        if (rawText && rawText.length > 3 && !rawText.startsWith('data:image') && !rawText.includes('[prompt redacted]')) {
          const enGoal = this.translator ? await this.translator.translate(rawText, 'goal') : rawText;
          this.emitEvent(createUnifiedEvent({
            source: 'pi',
            project,
            type: 'user',
            badge: `${project} • USER PROMPT`,
            title: enGoal,
            raw: rawText,
            timestamp,
          }));
        }
      } else if (role === 'assistant' && Array.isArray(content)) {
        // 1. Todo tool call: parse and emit real checklist!
        for (const p of content) {
          if (p.type === 'toolCall' && p.name === 'todo') {
            const args = p.arguments || {};
            if (args.op === 'init' && args.list && Array.isArray(args.list)) {
              const allItems = [];
              const phaseName = args.list[0]?.phase || 'Sprint Roadmap';
              args.list.forEach(ph => {
                if (Array.isArray(ph.items)) {
                  ph.items.forEach(it => allItems.push({ text: it, done: false }));
                }
              });
              // Keep a stable deterministic ID for this plan so updates reuse the same event
              const planId = `plan-${project}-${phaseName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
              this.activeTodos.set(project, { id: planId, phase: phaseName, items: allItems });
              
              const planEvent = createUnifiedEvent({
                source: 'pi',
                project,
                type: 'plan',
                badge: `${project} • AGENT PLAN`,
                title: `Active Plan: ${phaseName}`,
                meta: { kind: 'todo_list', phase: phaseName, items: allItems, planId },
                timestamp,
              });
              planEvent.id = planId;
              this.emitEvent(planEvent);
            } else if (args.op === 'done' && args.task) {
              const current = this.activeTodos.get(project);
              if (current && Array.isArray(current.items)) {
                const found = current.items.find(it => it.text === args.task);
                if (found) found.done = true;
                
                const updateEvent = createUnifiedEvent({
                  source: 'pi',
                  project,
                  type: 'plan',
                  badge: `${project} • AGENT PLAN`,
                  title: `Sprint Progress: ${current.phase}`,
                  meta: { kind: 'todo_list', phase: current.phase, items: current.items, planId: current.id },
                  timestamp,
                });
                updateEvent.id = current.id; // REUSE EXACT SAME ID SO IT UPDATES IN PLACE!
                this.emitEvent(updateEvent);
              }
            }
          }
        }

        // 2. High-level agent plan / reasoning thoughts
        for (const p of content) {
          if (p.type === 'thinking' && p.thinking) {
            const lines = p.thinking.split('\n').map(l => l.replace(/\*\*/g, '').trim()).filter(Boolean);
            const good = lines.find(l => l.length > 25 && l.length < 180 && !l.startsWith('Evaluating') && !/pixel|rgba|viewport|1280px/i.test(l));
            if (good) {
              const enPlan = this.translator ? await this.translator.translate(good, 'plan') : good;
              this.emitEvent(createUnifiedEvent({
                source: 'pi',
                project,
                type: 'plan',
                badge: `${project} • AGENT PLAN`,
                title: enPlan,
                timestamp,
              }));
            }
          }
        }

        // 3. High-level meaningful action
        for (const p of content) {
          if (p.type === 'toolCall' && p.name !== 'todo') {
            const macro = await this.formatAction(p.name, p.arguments);
            if (macro) {
              this.emitEvent(createUnifiedEvent({
                source: 'pi',
                project,
                type: 'action',
                badge: `${project} • AGENT ACTION`,
                title: macro,
                meta: { tool: p.name },
                timestamp,
              }));
            }
          }
        }

        // 4. Completed step summary
        for (const p of content) {
          if (p.type === 'text' && p.text && p.text.trim().length > 15) {
            const first = p.text.split('\n\n')[0].trim();
            if (first && !first.startsWith('{') && !first.startsWith('```') && first.length < 350) {
              const enSummary = this.translator ? await this.translator.translate(first, 'summary') : first;
              this.emitEvent(createUnifiedEvent({
                source: 'pi',
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
    } catch (e) {}
  }

  findRecentSessionFiles() {
    if (!fs.existsSync(this.sessionsRoot)) return [];
    const files = [];

    const walk = (dir, depth = 0) => {
      if (depth > 4) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath, depth + 1);
          } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            const stat = fs.statSync(fullPath);
            files.push({
              path: fullPath,
              project: this.deriveProject(fullPath),
              mtime: stat.mtimeMs,
              size: stat.size,
            });
          }
        }
      } catch (e) {}
    };

    walk(this.sessionsRoot);
    files.sort((a, b) => b.mtime - a.mtime);
    return files.slice(0, this.maxRecentSessions);
  }

  async backfillSession(sess) {
    try {
      const readSize = Math.min(sess.size, 512 * 1024);
      const buffer = Buffer.alloc(readSize);
      const fd = fs.openSync(sess.path, 'r');
      fs.readSync(fd, buffer, 0, readSize, Math.max(0, sess.size - readSize));
      fs.closeSync(fd);

      this.watchedOffsets.set(sess.path, sess.size);
      const lines = buffer.toString('utf8').split('\n').filter(Boolean);
      // Read last 25 lines so active todo list is backfilled
      for (const line of lines.slice(-25)) {
        await this.processLine(line, sess.path, sess.project);
      }
    } catch (e) {}
  }

  async start() {
    await super.start();
    const recent = this.findRecentSessionFiles();
    for (const sess of recent) {
      await this.backfillSession(sess);
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

module.exports = PiAdapter;
