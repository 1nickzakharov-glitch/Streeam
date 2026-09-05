// adapters/base.js
const EventEmitter = require('events');

class BaseAdapter extends EventEmitter {
  constructor(name, options = {}) {
    super();
    this.name = name;
    this.options = options;
    this.active = false;
  }

  async start() {
    this.active = true;
  }

  async stop() {
    this.active = false;
  }

  emitEvent(event) {
    if (!this.active) return;
    this.emit('event', event);
  }
}

module.exports = BaseAdapter;
