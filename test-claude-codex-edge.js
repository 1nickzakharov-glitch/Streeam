// test-claude-codex-edge.js
// Tests Claude Code projects watcher and Codex session watcher with real edge cases

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ClaudeAdapter = require('./adapters/claude');
const CodexAdapter = require('./adapters/codex');

const TEST_DIR = path.join(__dirname, 'test-fixtures-ai');

async function testAICliWatchers() {
  console.log('🧪 Testing Claude Code and Codex Adapters...\n');

  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });

  // 1. Claude Adapter Tests
  console.log('  1. Claude Code project directory watcher...');
  const claudeProjects = path.join(TEST_DIR, 'claude-projects', '-test-project-alpha');
  fs.mkdirSync(claudeProjects, { recursive: true });
  const claudeSession = path.join(claudeProjects, 'session-abc.jsonl');
  fs.writeFileSync(claudeSession, '');

  const claude = new ClaudeAdapter({ projectsRoot: path.join(TEST_DIR, 'claude-projects'), pollInterval: 60 });
  const claudeEvents = [];
  claude.on('event', e => claudeEvents.push(e));
  await claude.start();

  fs.appendFileSync(claudeSession, JSON.stringify({ type: 'ai-title', aiTitle: 'Redesign Database Schema' }) + '\n');
  fs.appendFileSync(claudeSession, JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'git status' } }] },
    timestamp: new Date().toISOString(),
  }) + '\n');

  await new Promise(r => setTimeout(r, 200));
  assert.ok(claudeEvents.length >= 2, 'Should capture ai-title and assistant tool use');
  console.log('     ✓ Claude events captured:', claudeEvents.map(e => e.type).join(', '));
  await claude.stop();

  // 2. Codex Adapter Tests
  console.log('  2. Codex sessions watcher...');
  const codexDir = path.join(TEST_DIR, 'codex-root', 'sessions');
  fs.mkdirSync(codexDir, { recursive: true });
  const codexSession = path.join(codexDir, 'rollout-test.jsonl');
  fs.writeFileSync(codexSession, '');

  const codex = new CodexAdapter({ codexRoot: path.join(TEST_DIR, 'codex-root'), pollInterval: 60 });
  const codexEvents = [];
  codex.on('event', e => codexEvents.push(e));
  await codex.start();

  fs.appendFileSync(codexSession, JSON.stringify({
    type: 'session_meta',
    payload: { cwd: '/Users/nikitazaharov/Desktop/Storello' },
    timestamp: new Date().toISOString(),
  }) + '\n');

  fs.appendFileSync(codexSession, JSON.stringify({
    type: 'response_item',
    payload: { type: 'reasoning', summary: 'Check lock contention in postgres thread pool' },
    timestamp: new Date().toISOString(),
  }) + '\n');

  await new Promise(r => setTimeout(r, 200));
  assert.ok(codexEvents.length >= 2, 'Should capture session meta and reasoning');
  console.log('     ✓ Codex events captured:', codexEvents.map(e => e.type).join(', '));
  await codex.stop();

  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  console.log('\n✨ Claude & Codex Watchers tested successfully!\n');
}

testAICliWatchers().catch(e => {
  console.error('AI cli test failed:', e);
  process.exit(1);
});
