#!/usr/bin/env node
// cli/log.js
// Universal CLI for streaming events into overlay from standard scripts, terminals, hooks, or CI

const http = require('http');

const args = process.argv.slice(2);
const port = process.env.STREAM_OVERLAY_PORT || 3333;

function parseArgs() {
  const result = {
    source: 'terminal',
    project: 'DEV',
    type: 'action',
    title: '',
    badge: '',
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--source' || a === '-s') result.source = args[++i];
    else if (a === '--project' || a === '-p') result.project = args[++i];
    else if (a === '--type' || a === '-t') result.type = args[++i];
    else if (a === '--badge' || a === '-b') result.badge = args[++i];
    else if (!result.title) result.title = a;
    else result.title += ' ' + a;
  }
  return result;
}

const payload = parseArgs();
if (!payload.title) {
  console.log('Usage: stream-log [--source <name>] [--project <proj>] [--type <user|plan|action|done|system>] <message>');
  process.exit(1);
}

const data = JSON.stringify(payload);

const req = http.request({
  hostname: '127.0.0.1',
  port,
  path: '/api/event',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
}, (res) => {
  if (res.statusCode >= 200 && res.statusCode < 300) {
    process.exit(0);
  } else {
    console.error(`Overlay returned HTTP ${res.statusCode}`);
    process.exit(1);
  }
});

req.on('error', (err) => {
  // Silent fail if overlay is offline so build/scripts don't break
  process.exit(0);
});

req.write(data);
req.end();
