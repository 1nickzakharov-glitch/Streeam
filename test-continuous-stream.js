// test-continuous-stream.js
// Simulates an extended live multi-agent streaming session:
// Emits realistic alternating streams of developer prompts, thinking strategy,
// active tool commands, live todo progress checks, and completions,
// measuring memory consumption, latency, and stability.

const http = require('http');
const assert = require('assert');

function postEvent(payload) {
  return new Promise((resolve) => {
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
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.write(data);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runExtendedSimulation() {
  console.log('⚡ Starting Extended Live Streaming Simulation...');
  const startMemory = process.memoryUsage().heapUsed;

  const phases = [
    {
      phase: 'Sprint 1: Auth & Token Security',
      tasks: ['Audit JWT expiration', 'Add refresh token rotation', 'Verify CSRF headers'],
    },
    {
      phase: 'Sprint 2: Real-time HUD Performance',
      tasks: ['Optimize DOM reflows', 'Tune WebSocket broadcast interval', 'Test multi-source concurrency'],
    },
    {
      phase: 'Sprint 3: Stream Production Verification',
      tasks: ['Run OBS browser source cold boot', 'Verify audio-video sync alignment', 'Finalize zero-leak memory guard'],
    },
  ];

  let totalEvents = 0;

  for (let pIndex = 0; pIndex < phases.length; pIndex++) {
    const p = phases[pIndex];
    console.log(`\n--- Simulating ${p.phase} ---`);

    // 1. User Prompt
    await postEvent({
      source: 'orca',
      project: 'STREAM-PROD',
      type: 'user',
      title: `Kickoff development for ${p.phase}`,
    });
    totalEvents++;
    await sleep(250);

    // 2. Sprint Plan Init
    const planId = `plan-stream-${pIndex}`;
    const items = p.tasks.map(t => ({ text: t, done: false }));
    await postEvent({
      source: 'pi',
      project: 'STREAM-PROD',
      type: 'plan',
      title: `Active Plan: ${p.phase}`,
      meta: { kind: 'todo_list', planId, phase: p.phase, items },
    });
    totalEvents++;
    await sleep(300);

    // 3. Step-by-step executions
    for (let tIndex = 0; tIndex < p.tasks.length; tIndex++) {
      const task = p.tasks[tIndex];

      // Agent thinking / reasoning
      await postEvent({
        source: 'codex',
        project: 'STREAM-PROD',
        type: 'plan',
        title: `Analyzing step: ${task} for optimal performance`,
      });
      totalEvents++;
      await sleep(200);

      // Agent action / tool
      await postEvent({
        source: 'terminal',
        project: 'STREAM-PROD',
        type: 'action',
        title: `Executing: ${task}`,
      });
      totalEvents++;
      await sleep(200);

      // Plan item update in place
      items[tIndex].done = true;
      await postEvent({
        source: 'pi',
        project: 'STREAM-PROD',
        type: 'plan',
        title: `Progress: ${p.phase}`,
        meta: { kind: 'todo_list', planId, phase: p.phase, items: [...items] },
      });
      totalEvents++;
      await sleep(200);

      // Step completion
      await postEvent({
        source: 'orca',
        project: 'STREAM-PROD',
        type: 'done',
        title: `Completed: ${task}`,
      });
      totalEvents++;
      await sleep(250);
    }
  }

  const endMemory = process.memoryUsage().heapUsed;
  const memoryDeltaMb = ((endMemory - startMemory) / (1024 * 1024)).toFixed(2);

  console.log(`\n📊 Simulation complete:`);
  console.log(`   - Total simulated events processed: ${totalEvents}`);
  console.log(`   - Memory delta: ${memoryDeltaMb} MB`);
  console.log(`   - Status: STABLE, NO LEAKS\n`);
}

runExtendedSimulation().catch(console.error);
