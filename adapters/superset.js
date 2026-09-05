// adapters/superset.js
const fs = require('fs');
const path = require('path');
const BaseAdapter = require('./base');
const { createUnifiedEvent } = require('./types');

class SupersetAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('superset', options);
    this.supersetRoot = options.supersetRoot || path.join(process.env.HOME || '', '.superset');
    this.pollInterval = options.pollInterval || 1000;
    this.timer = null;
    this.lastStateHash = '';
  }

  async poll() {
    try {
      const appStatePath = path.join(this.supersetRoot, 'app-state.json');
      const windowsStatePath = path.join(this.supersetRoot, 'windows-state.json');

      if (fs.existsSync(appStatePath)) {
        const raw = fs.readFileSync(appStatePath, 'utf8');
        if (raw !== this.lastStateHash) {
          this.lastStateHash = raw;
          const parsed = JSON.parse(raw);
          const activeWorkspace = parsed.activeWorkspace || parsed.currentProject || 'SUPERSET';
          this.emitEvent(createUnifiedEvent({
            source: 'superset',
            project: String(activeWorkspace).toUpperCase(),
            type: 'system',
            badge: 'SUPERSET • WORKSPACE',
            title: `Workspace switched: ${activeWorkspace}`,
            meta: parsed,
          }));
        }
      }
    } catch (e) {}
  }

  async start() {
    await super.start();
    if (!fs.existsSync(this.supersetRoot)) return;
    this.poll();
    this.timer = setInterval(() => this.poll(), this.pollInterval);
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await super.stop();
  }
}

module.exports = SupersetAdapter;
