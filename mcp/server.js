#!/usr/bin/env node
// mcp/server.js
// Standard MCP Server implementing overlay event submission for Claude Code, Codex, and Cursor

const http = require('http');
const readline = require('readline');

const port = process.env.STREAM_OVERLAY_PORT || 3333;

function sendToOverlay(event) {
  return new Promise((resolve) => {
    const data = JSON.stringify(event);
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
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.write(data);
    req.end();
  });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', async (line) => {
  try {
    const msg = JSON.parse(line);

    // Handle MCP initialize
    if (msg.method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'stream-overlay-mcp',
            version: '1.1.0',
          },
        },
      };
      process.stdout.write(JSON.stringify(response) + '\n');
      return;
    }

    // Handle tools/list
    if (msg.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          tools: [
            {
              name: 'overlay_broadcast',
              description: 'Broadcast live activity, milestones, or thoughts directly to the streamer OBS overlay',
              inputSchema: {
                type: 'object',
                properties: {
                  project: { type: 'string', description: 'Project or workspace label' },
                  type: {
                    type: 'string',
                    enum: ['user', 'plan', 'action', 'done', 'system'],
                    description: 'Kind of broadcast entry',
                  },
                  badge: { type: 'string', description: 'Short badge title e.g. "AI • REFACTOR"' },
                  title: { type: 'string', description: 'Clean, descriptive message to show on stream' },
                },
                required: ['title'],
              },
            },
          ],
        },
      };
      process.stdout.write(JSON.stringify(response) + '\n');
      return;
    }

    // Handle tools/call
    if (msg.method === 'tools/call') {
      const { name, arguments: args } = msg.params || {};
      if (name === 'overlay_broadcast') {
        const ok = await sendToOverlay({
          source: 'mcp',
          project: args?.project || 'MCP-AGENT',
          type: args?.type || 'action',
          badge: args?.badge || `${(args?.project || 'MCP').toUpperCase()} • LIVE`,
          title: args?.title || '',
        });

        const response = {
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            content: [
              {
                type: 'text',
                text: ok ? 'Successfully broadcasted to live stream overlay' : 'Overlay is currently offline or unreachable',
              },
            ],
          },
        };
        process.stdout.write(JSON.stringify(response) + '\n');
        return;
      }
    }

    // Default null response for unhandled requests with id
    if (msg.id !== undefined) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }) + '\n');
    }
  } catch (err) {}
});
