// adapters/index.js
const EventEmitter = require('events');
const Translator = require('./translator');
const StreamRateLimiter = require('./rate-limiter');
const PiAdapter = require('./pi');
const ClaudeAdapter = require('./claude');
const CodexAdapter = require('./codex');
const TmuxAdapter = require('./tmux');
const SupersetAdapter = require('./superset');
const { createUnifiedEvent } = require('./types');

class AdapterManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.translator = new Translator(options.llm || {});
    this.rateLimiter = new StreamRateLimiter({ minIntervalMs: options.throttleMs || 10000 });
    this.adapters = new Map();
    this._initAdapters();
  }

  _initAdapters() {
    // 1. Pi / Orca Agent Watcher
    const pi = new PiAdapter({ translator: this.translator, ...this.options.pi });
    this.register('pi', pi);

    // 2. Claude Code Watcher
    const claude = new ClaudeAdapter({ translator: this.translator, ...this.options.claude });
    this.register('claude', claude);

    // 3. Codex Session Watcher
    const codex = new CodexAdapter({ translator: this.translator, ...this.options.codex });
    this.register('codex', codex);

    // 4. Tmux Terminal Panes
    const tmux = new TmuxAdapter({ ...this.options.tmux });
    this.register('tmux', tmux);

    // 5. Superset Workspace
    const superset = new SupersetAdapter({ ...this.options.superset });
    this.register('superset', superset);
  }

  register(name, adapter) {
    this.adapters.set(name, adapter);
    adapter.on('event', (ev) => {
      if (this.rateLimiter.shouldBroadcast(ev)) {
        this.emit('event', ev);
      }
    });
  }

  // Allow external push (HTTP Webhook / CLI / MCP)
  ingest(rawPayload) {
    const event = createUnifiedEvent(rawPayload);
    // Preserve explicit planId if passed from outside
    if (rawPayload.meta && rawPayload.meta.planId) {
      event.meta.planId = rawPayload.meta.planId;
      event.id = rawPayload.meta.planId;
    }
    if (this.rateLimiter.shouldBroadcast(event)) {
      this.emit('event', event);
    }
    return event;
  }

  async startAll() {
    for (const [name, adapter] of this.adapters.entries()) {
      try {
        await adapter.start();
      } catch (err) {
        console.warn(`[streeam:${name}] adapter start warning:`, err.message);
      }
    }
  }

  async stopAll() {
    for (const [name, adapter] of this.adapters.entries()) {
      try {
        await adapter.stop();
      } catch (err) {
        console.warn(`[streeam:${name}] adapter stop warning:`, err.message);
      }
    }
  }

  getSources() {
    return Array.from(this.adapters.keys()).concat(['webhook', 'mcp', 'terminal']);
  }
}

module.exports = AdapterManager;
