// adapters/types.js
/**
 * Standardized Unified Stream Event
 * @typedef {'user' | 'plan' | 'action' | 'done' | 'system'} EventType
 * @typedef {'pi' | 'orca' | 'claude' | 'codex' | 'tmux' | 'superset' | 'terminal' | 'webhook' | 'mcp'} SourceType
 *
 * @typedef {Object} UnifiedEvent
 * @property {string} id - Unique event identifier
 * @property {string} time - HH:MM:SS formatted time
 * @property {number} timestamp - Epoch ms
 * @property {SourceType} source - Source runtime identifier
 * @property {string} project - Project or workspace name
 * @property {EventType} type - Semantic kind of activity
 * @property {string} badge - Human label (e.g. "STORELLO • USER PROMPT", "ORCA • AGENT PLAN")
 * @property {string} title - Human readable description or message
 * @property {string} [raw] - Original snippet if helpful
 * @property {Record<string, any>} [meta] - Contextual metadata
 */

const BADGE_LABELS = {
  user: 'USER PROMPT',
  plan: 'AGENT PLAN',
  action: 'AGENT ACTION',
  done: 'COMPLETED STEP',
  system: 'ENVIRONMENT',
};

function createUnifiedEvent({
  source = 'terminal',
  project = 'DEFAULT',
  type = 'action',
  badge = '',
  title = '',
  raw = '',
  meta = {},
  timestamp = Date.now(),
}) {
  const d = new Date(timestamp);
  const time = d.toTimeString().split(' ')[0];
  const typeLabel = BADGE_LABELS[type] || type.toUpperCase();
  const cleanBadge = badge || `${project.toUpperCase()} • ${typeLabel}`;

  return {
    id: `ev-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    time,
    timestamp,
    source,
    project: (project || 'DEFAULT').toUpperCase(),
    type,
    badge: cleanBadge,
    title: (title || '').trim(),
    raw,
    meta,
  };
}

module.exports = {
  createUnifiedEvent,
  BADGE_LABELS,
};
