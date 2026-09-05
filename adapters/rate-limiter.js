// adapters/rate-limiter.js
/**
 * Throttler ensuring stream HUD remains high-signal and readable:
 * Limits frequent updates while allowing critical transitions (User Prompts & Plan Checklists) immediately.
 */
class StreamRateLimiter {
  constructor(options = {}) {
    this.minIntervalMs = options.minIntervalMs || 8000;
    this.lastTimestamps = new Map();
  }

  shouldBroadcast(event) {
    if (!event) return false;

    // Critical transitions ALWAYS broadcast immediately:
    // 1. User prompts
    // 2. Sprint Plans and Todo Checklists
    if (event.type === 'user' || event.type === 'plan' || (event.meta && event.meta.kind === 'todo_list')) {
      this.lastTimestamps.set(event.source, Date.now());
      return true;
    }

    const key = `${event.source}:${event.project || 'MAIN'}`;
    const now = Date.now();
    const last = this.lastTimestamps.get(key) || 0;

    if (now - last < this.minIntervalMs) {
      return false; // Skip excessive noise within throttle window
    }

    this.lastTimestamps.set(key, now);
    return true;
  }
}

module.exports = StreamRateLimiter;
