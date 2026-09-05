// adapters/rate-limiter.js
/**
 * Throttler ensuring stream HUD remains high-signal and readable:
 * Limits updates from a given agent/source to one meaningful message per 10-25 seconds,
 * while allowing critical transitions (like User Prompts) to pass immediately.
 */
class StreamRateLimiter {
  constructor(options = {}) {
    this.minIntervalMs = options.minIntervalMs || 10000; // 10 seconds default window
    this.lastTimestamps = new Map();
  }

  shouldBroadcast(event) {
    if (!event) return false;

    // User prompts are always broadcasted immediately without delay
    if (event.type === 'user') {
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
