// test-stress-15.js
// Hard-testing suite running 15 diverse user & agent scenarios

const http = require('http');
const WebSocket = require('ws');
const assert = require('assert');

function sendEvent(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3333,
      path: '/api/event',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runHardTests() {
  console.log('⚡ Starting 15 Hard-Test Scenarios for Streeam...\n');

  const ws = new WebSocket('ws://127.0.0.1:3333/ws');
  await new Promise(r => ws.on('open', r));
  let liveEvents = [];
  ws.on('message', (raw) => {
    const d = JSON.parse(raw);
    if (Array.isArray(d.events)) liveEvents = d.events;
  });

  const scenarios = [
    { name: '1. Standard developer prompt', event: { source: 'orca', project: 'STORELLO', type: 'user', title: 'Add dark mode toggle to navigation' } },
    { name: '2. High-level architecture strategy', event: { source: 'orca', project: 'STORELLO', type: 'plan', title: 'Designing decoupled theme provider with local storage persistence' } },
    { name: '3. Rapid consecutive bash executions', event: { source: 'terminal', project: 'STORELLO', type: 'action', title: 'Running TypeScript compiler tsc --noEmit' } },
    { name: '4. Large multi-step sprint checklist init', event: { source: 'pi', project: 'STORELLO', type: 'plan', title: 'Sprint: Dark Mode', meta: { kind: 'todo_list', planId: 'plan-storello-darkmode', phase: 'Dark Mode Rollout', items: [{ text: 'Create ThemeContext', done: false }, { text: 'Add toggle component', done: false }, { text: 'Write E2E tests', done: false }] } } },
    { name: '5. Plan step 1 completion in-place', event: { source: 'pi', project: 'STORELLO', type: 'plan', title: 'Sprint Progress', meta: { kind: 'todo_list', planId: 'plan-storello-darkmode', phase: 'Dark Mode Rollout', items: [{ text: 'Create ThemeContext', done: true }, { text: 'Add toggle component', done: false }, { text: 'Write E2E tests', done: false }] } } },
    { name: '6. Plan step 2 completion in-place', event: { source: 'pi', project: 'STORELLO', type: 'plan', title: 'Sprint Progress', meta: { kind: 'todo_list', planId: 'plan-storello-darkmode', phase: 'Dark Mode Rollout', items: [{ text: 'Create ThemeContext', done: true }, { text: 'Add toggle component', done: true }, { text: 'Write E2E tests', done: false }] } } },
    { name: '7. Plan step 3 completion (100% completed)', event: { source: 'pi', project: 'STORELLO', type: 'plan', title: 'Sprint Progress', meta: { kind: 'todo_list', planId: 'plan-storello-darkmode', phase: 'Dark Mode Rollout', items: [{ text: 'Create ThemeContext', done: true }, { text: 'Add toggle component', done: true }, { text: 'Write E2E tests', done: true }] } } },
    { name: '8. Milestone finished step with celebration', event: { source: 'orca', project: 'STORELLO', type: 'done', title: 'Dark mode navigation toggle successfully merged and verified' } },
    { name: '9. Claude Code source ingestion', event: { source: 'claude', project: 'CLAUDE-WORK', type: 'action', title: 'Auditing bundle dependencies via package.json' } },
    { name: '10. Codex reasoning thought ingestion', event: { source: 'codex', project: 'CODEX-CLI', type: 'plan', title: 'Analyzing recursive memory consumption across workers' } },
    { name: '11. Tmux terminal pane output event', event: { source: 'tmux', project: 'DOCKER', type: 'action', title: 'Container postgres-primary healthy on port 5432' } },
    { name: '12. Superset workspace switch', event: { source: 'superset', project: 'SUPERSET', type: 'system', title: 'Workspace switched to Redesign Lead' } },
    { name: '13. Very long developer prompt (stress test text wrapping)', event: { source: 'terminal', project: 'DEV', type: 'user', title: 'Please refactor our payment webhook handlers to verify cryptographic HMAC-SHA256 signatures, handle idempotency keys safely, and retry with exponential backoff on transient network failures.' } },
    { name: '14. Special characters and HTML entities injection safety', event: { source: 'terminal', project: 'SECURITY', type: 'action', title: '<script>alert("xss")</script> & "escaped" \'entities\' & symbols <div>' } },
    { name: '15. Final celebratory milestone', event: { source: 'terminal', project: 'STREEAM', type: 'done', title: 'All 15 verification stress-tests executed with zero memory leaks!' } },
  ];

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const res = await sendEvent(s.event);
    assert.strictEqual(res.ok, true, `Scenario failed: ${s.name}`);
    await delay(120);
    console.log(`  ✓ Passed scenario ${s.name}`);
  }

  await delay(300);

  // Check that plan was updated in-place and didn't create duplicate cards
  const matchingPlans = liveEvents.filter(e => e.meta && e.meta.planId === 'plan-storello-darkmode');
  assert.strictEqual(matchingPlans.length, 1, `Expected exactly 1 plan instance, found ${matchingPlans.length}`);
  assert.strictEqual(matchingPlans[0].meta.items.every(it => it.done), true, 'Expected all items in plan to be marked completed');
  console.log('\n  ✅ Verified: Plan updated strictly in-place with 0 duplicates!');

  ws.close();
  console.log('\n✨ All 15 Hard-Test Scenarios passed with 100% success!\n');
}

runHardTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
