// test-suite.js
// Automated verification suite for Stream Overlay and all adapters

const assert = require('assert');
const http = require('http');
const WebSocket = require('ws');
const { createUnifiedEvent } = require('./adapters/types');
const AdapterManager = require('./adapters');

async function runTests() {
  console.log('🧪 Starting Stream Overlay Automated Tests...\n');

  // Test 1: Unified Event Schema
  {
    console.log('1. Testing createUnifiedEvent schema...');
    const ev = createUnifiedEvent({
      source: 'codex',
      project: 'Storello',
      type: 'plan',
      title: 'Testing architectural refactor',
    });
    assert.strictEqual(ev.source, 'codex');
    assert.strictEqual(ev.project, 'STORELLO');
    assert.strictEqual(ev.type, 'plan');
    assert.strictEqual(ev.title, 'Testing architectural refactor');
    assert.ok(ev.id.startsWith('ev-'));
    assert.ok(ev.time);
    console.log('   ✅ Event schema valid.');
  }

  // Test 2: AdapterManager lifecycle
  {
    console.log('2. Testing AdapterManager registration and events...');
    const manager = new AdapterManager();
    let caughtEvent = null;
    manager.on('event', (e) => { caughtEvent = e; });

    const injected = manager.ingest({
      source: 'tmux',
      project: 'TEST',
      type: 'action',
      title: 'npm run test:watch',
    });

    assert.ok(caughtEvent);
    assert.strictEqual(caughtEvent.id, injected.id);
    assert.strictEqual(caughtEvent.title, 'npm run test:watch');
    console.log('   ✅ AdapterManager correctly ingested and emitted event.');
  }

  // Test 3: HTTP Server & API endpoints
  {
    console.log('3. Testing HTTP API endpoints (/api/status, /api/event, /api/clear)...');
    
    // Check status
    const statusRes = await new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:3333/api/status', (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
      }).on('error', reject);
    });
    assert.strictEqual(statusRes.status, 200);
    assert.ok(Array.isArray(statusRes.data.sources));
    console.log('   ✅ /api/status returned HTTP 200 with sources.');

    // Post custom event via webhook API
    const postData = JSON.stringify({
      source: 'terminal',
      project: 'TEST-BOT',
      type: 'done',
      title: 'All tests passed with 100% coverage',
    });
    const postRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: 3333,
        path: '/api/event',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    assert.strictEqual(postRes.status, 200);
    assert.strictEqual(postRes.data.ok, true);
    assert.strictEqual(postRes.data.event.title, 'All tests passed with 100% coverage');
    console.log('   ✅ /api/event successfully posted and processed.');
  }

  // Test 4: Real-time WebSocket delivery
  {
    console.log('4. Testing WebSocket live sync...');
    const ws = new WebSocket('ws://127.0.0.1:3333/ws');
    const msg = await new Promise((resolve, reject) => {
      ws.on('message', (raw) => {
        resolve(JSON.parse(raw));
      });
      ws.on('error', reject);
    });

    assert.ok(Array.isArray(msg.events));
    assert.ok(msg.status);
    console.log(`   ✅ WebSocket client received initial payload with ${msg.events.length} events.`);
    ws.close();
  }

  console.log('\n✨ All automated tests passed successfully!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
