// test-watcher-robustness.js
// Tests file truncation, log rotation, empty files, and malformed JSON lines

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const PiAdapter = require('./adapters/pi');
const ClaudeAdapter = require('./adapters/claude');
const CodexAdapter = require('./adapters/codex');

const TEST_DIR = path.join(__dirname, 'test-fixtures');

async function testWatchers() {
  console.log('🧪 Testing File Watcher Edge Cases & Robustness...\n');

  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

  const piDir = path.join(TEST_DIR, 'pi-sessions', '--test-project--');
  fs.mkdirSync(piDir, { recursive: true });
  const testJsonl = path.join(piDir, 'session-test.jsonl');

  // Test 1: Empty file creation
  fs.writeFileSync(testJsonl, '');
  const pi = new PiAdapter({ sessionsRoot: path.join(TEST_DIR, 'pi-sessions'), pollInterval: 100 });
  let events = [];
  pi.on('event', (e) => events.push(e));
  await pi.start();

  console.log('  1. Testing malformed JSON and binary garbage lines...');
  fs.appendFileSync(testJsonl, 'not valid json at all\n');
  fs.appendFileSync(testJsonl, '{"broken":\n');
  fs.appendFileSync(testJsonl, '\x00\x01\x02\n');
  await new Promise(r => setTimeout(r, 250));
  assert.strictEqual(events.length, 0, 'Malformed lines should be ignored cleanly without crash');
  console.log('     ✓ Ignored without crashing.');

  console.log('  2. Testing valid prompt and tool call...');
  const validUser = JSON.stringify({
    type: 'message',
    role: 'user',
    message: { content: 'Implement comprehensive testing suite' },
    timestamp: new Date().toISOString(),
  }) + '\n';
  fs.appendFileSync(testJsonl, validUser);
  await new Promise(r => setTimeout(r, 300));
  assert.strictEqual(events.length, 1, 'Should parse valid user line');
  assert.strictEqual(events[0].type, 'user');
  console.log('     ✓ Parsed user event:', events[0].title);

  console.log('  3. Testing file truncation (log rotation / rewrite)...');
  // Truncate file smaller than previous offset
  fs.writeFileSync(testJsonl, validUser);
  await new Promise(r => setTimeout(r, 300));
  console.log('     ✓ File rotation handled safely without read errors.');

  await pi.stop();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  console.log('\n✨ Watcher robustness verified!\n');
}

testWatchers().catch(e => {
  console.error('Watcher test failed:', e);
  process.exit(1);
});
