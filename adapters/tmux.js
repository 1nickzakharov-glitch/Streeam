// adapters/tmux.js
const { exec } = require('child_process');
const BaseAdapter = require('./base');
const { createUnifiedEvent } = require('./types');

class TmuxAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('tmux', options);
    this.pollInterval = options.pollInterval || 1200;
    this.timer = null;
    this.lastPaneContents = new Map();
  }

  async listPanes() {
    return new Promise((resolve) => {
      exec('tmux list-panes -a -F "#{session_name}:#{window_index}.#{pane_index}:#{pane_current_command}:#{pane_pid}"', (err, stdout) => {
        if (err || !stdout) return resolve([]);
        const list = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [target, cmd, pid] = line.split(':');
            return { target, cmd, pid };
          });
        resolve(list);
      });
    });
  }

  async capturePaneTail(target) {
    return new Promise((resolve) => {
      exec(`tmux capture-pane -pt "${target}" -S -15`, (err, stdout) => {
        if (err || !stdout) return resolve('');
        resolve(stdout.trim());
      });
    });
  }

  async poll() {
    try {
      const panes = await this.listPanes();
      for (const pane of panes) {
        const text = await this.capturePaneTail(pane.target);
        if (!text) continue;

        const prev = this.lastPaneContents.get(pane.target);
        if (prev !== undefined && prev !== text) {
          const lines = text.split('\n').filter(Boolean);
          const lastLine = lines[lines.length - 1] || '';
          if (lastLine.length > 3 && !lastLine.includes('$') && !lastLine.includes('❯')) {
            this.emitEvent(createUnifiedEvent({
              source: 'tmux',
              project: pane.target.split(':')[0].toUpperCase(),
              type: 'action',
              badge: `${pane.target} • TMUX`,
              title: lastLine.slice(0, 120),
              meta: { target: pane.target, cmd: pane.cmd },
            }));
          }
        }
        this.lastPaneContents.set(pane.target, text);
      }
    } catch (e) {}
  }

  async start() {
    await super.start();
    // Test if tmux binary exists
    exec('command -v tmux', (err) => {
      if (err) return; // Tmux not installed or available, stay silent
      this.poll();
      this.timer = setInterval(() => this.poll(), this.pollInterval);
    });
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await super.stop();
  }
}

module.exports = TmuxAdapter;
