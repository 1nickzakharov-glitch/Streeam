// test-tmux-superset.js
// Tests Tmux parsing and Superset workspace states

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const SupersetAdapter = require('./adapters/superset');
const TmuxAdapter = require('./adapters/tmux');

const TEST_DIR = path.join(__dirname, 'test-fixtures-tmux');

async function testTmuxAndSuperset() {
  console.log('🧪 Testing Superset and Tmux Adapters...\n');

  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });

  // 1. Superset State Poller
  console.log('  1. Superset app-state poller...');
  const appStatePath = path.join(TEST_DIR, 'app-state.json');
  fs.writeFileSync(appStatePath, JSON.stringify({ activeWorkspace: 'Storello-redesign' }));

  const superset = new SupersetAdapter({ supersetRoot: TEST_DIR, pollInterval: 60 });
  const superEvents = [];
  superset.on('event', e => superEvents.push(e));
  await superset.start();

  await new Promise(r => setTimeout(r, 100));
  assert.ok(superEvents.length >= 1, 'Should emit initial workspace event');
  assert.strictEqual(superEvents[0].project, 'STORELLO-REDESIGN');
  console.log('     ✓ Detected workspace:', superEvents[0].project);

  // Switch workspace
  fs.writeFileSync(appStatePath, JSON.stringify({ activeWorkspace: 'FastToChart-test' }));
  await new Promise(r => setTimeout(r, 150));
  assert.strictEqual(superEvents[superEvents.length - 1].project, 'FASTTOCHART-TEST');
  console.log('     ✓ Detected workspace switch to:', superEvents[superEvents.length - 1].project);

  await superset.stop();

  // 2. Tmux Adapter
  console.log('  2. Tmux adapter check...');
  const tmux = new TmuxAdapter();
  await tmux.start();
  const panes = await tmux.listPanes();
  console.log(`     ✓ Tmux queried cleanly (found ${panes.length} active panes without error)`);
  await tmux.stop();

  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  console.log('\n✨ Superset & Tmux tests passed!\n');
}

testTmuxAndSuperset().catch(e => {
  console.error('Tmux/Superset test failed:', e);
  process.exit(1);
});
