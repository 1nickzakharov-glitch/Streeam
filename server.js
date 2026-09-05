const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const AdapterManager = require('./adapters');

const PORT = process.env.STREAM_OVERLAY_PORT || 3333;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_LOGS = 80;

let currentProject = 'MULTI-AGENT';
let currentStatus = 'LIVE';
let logEvents = [];

const adapterManager = new AdapterManager();

function broadcastPayload() {
  const payload = JSON.stringify({
    project: currentProject,
    status: currentStatus,
    events: logEvents,
    sources: adapterManager.getSources(),
  });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function addEvent(event) {
  if (!event || !event.title) return;

  // Deduplicate consecutive identical messages
  if (logEvents.length > 0) {
    const last = logEvents[logEvents.length - 1];
    if (last.id === event.id && last.title === event.title) {
      return;
    }
  }

  // If this is an existing plan update with a matching planId or ID, update it IN-PLACE!
  if (event.meta && event.meta.kind === 'todo_list') {
    const targetPlanId = (event.meta && event.meta.planId) || event.id;
    const existingIndex = logEvents.findIndex(e => e.id === targetPlanId || (e.meta && e.meta.planId === targetPlanId));
    if (existingIndex !== -1) {
      logEvents[existingIndex] = event;
      broadcastPayload();
      return;
    }
  }

  currentStatus = 'ACTIVE';
  if (event.project && event.project !== 'DEFAULT') {
    currentProject = event.project;
  }

  logEvents.push(event);
  if (logEvents.length > MAX_LOGS) {
    logEvents.shift();
  }
  broadcastPayload();
}

adapterManager.on('event', (ev) => {
  addEvent(ev);
});

// HTTP Server
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API Ingest Webhook: POST /api/event
  if (req.method === 'POST' && req.url === '/api/event') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const ev = adapterManager.ingest(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, event: ev }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // API Status & Sources
  if (req.method === 'GET' && req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: currentStatus,
      project: currentProject,
      eventCount: logEvents.length,
      sources: adapterManager.getSources(),
    }));
    return;
  }

  // API Clear Events
  if (req.method === 'POST' && req.url === '/api/clear') {
    logEvents = [];
    currentStatus = 'IDLE';
    broadcastPayload();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Static File Serving
  let reqPath = req.url.split('?')[0];
  let filePath = path.join(PUBLIC_DIR, reqPath === '/' ? 'index.html' : reqPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', ws => {
  ws.send(JSON.stringify({
    project: currentProject,
    status: currentStatus,
    events: logEvents,
    sources: adapterManager.getSources(),
  }));
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`[stream-overlay] Multi-Engine Overlay running on http://127.0.0.1:${PORT}`);
  await adapterManager.startAll();
});

process.on('SIGTERM', async () => {
  await adapterManager.stopAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await adapterManager.stopAll();
  process.exit(0);
});
