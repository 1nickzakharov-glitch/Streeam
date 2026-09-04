const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.STREAM_OVERLAY_PORT || 3333;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSIONS_ROOT = '/Users/nikitazaharov/.pi/agent/sessions';

// Read DeepInfra API key
let deepinfraKey = process.env.DEEPINFRA_API_KEY || '';
if (!deepinfraKey) {
  const possiblePaths = [
    '/Users/nikitazaharov/Desktop/ПРИЛОЖЕНИЕ/Storello/apps/frontend/.env.local',
    '/Users/nikitazaharov/Desktop/ПРИЛОЖЕНИЕ/Storello/.env',
  ];
  for (const envPath of possiblePaths) {
    try {
      if (fs.existsSync(envPath)) {
        const match = fs.readFileSync(envPath, 'utf8').match(/DEEPINFRA_API_KEY=["']?([^"'\r\n]+)/);
        if (match && match[1]) {
          deepinfraKey = match[1].trim();
          break;
        }
      }
    } catch (e) {}
  }
}

const MAX_LOGS = 70;
let currentProject = 'Multi-Agent';
let currentStatus = 'LIVE';
let logEvents = [];

function getTimestamp() {
  const d = new Date();
  return d.toTimeString().split(' ')[0];
}

const translationCache = new Map();

// High-quality English translation/summary
async function translateToEnglish(text, mode = 'goal') {
  if (!text || text.length < 2) return text;
  if (translationCache.has(text)) return translationCache.get(text);

  const cyrillicChars = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
  if (cyrillicChars === 0) return text;
  if (!deepinfraKey) return text;

  try {
    let systemPrompt = 'Translate this developer prompt into a concise, natural English summary paragraph (1-2 sentences). Return ONLY the English text without markdown quotes.';
    if (mode === 'milestone') {
      systemPrompt = 'Translate this task milestone into a concise 4-8 word professional English title. Return ONLY the English text, no quotes.';
    } else if (mode === 'plan') {
      systemPrompt = 'Synthesize this into a high-level strategic English plan paragraph (2-3 sentences max). Exclude micro pixel details. Return ONLY the English text without quotes.';
    } else if (mode === 'summary') {
      systemPrompt = 'Translate or summarize this assistant response into a clean, professional English paragraph (1-2 sentences). Return ONLY the English text without quotes.';
    }

    const res = await fetch('https://api.deepinfra.com/v1/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepinfraKey}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/Llama-3.3-70B-Instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text.slice(0, 1500) },
        ],
        max_tokens: 180,
        temperature: 0.15,
      }),
    });

    if (res.ok) {
      const json = await res.json();
      const translated = json.choices?.[0]?.message?.content?.trim();
      if (translated) {
        const clean = translated.replace(/^["']|["']$/g, '');
        translationCache.set(text, clean);
        return clean;
      }
    }
  } catch (err) {
    console.warn('[stream-overlay] translation error:', err.message);
  }
  return text;
}

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

  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const contentType = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : 'application/javascript';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server, path: '/ws' });

function broadcastPayload() {
  const payload = JSON.stringify({
    project: currentProject,
    status: currentStatus,
    events: logEvents,
  });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', ws => {
  ws.send(JSON.stringify({
    project: currentProject,
    status: currentStatus,
    events: logEvents,
  }));
});

function addLogEvent(event) {
  if (logEvents.length > 0) {
    const last = logEvents[logEvents.length - 1];
    if (last.type === event.type && last.title === event.title && last.project === event.project) return;
  }

  logEvents.push({
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    time: event.time || getTimestamp(),
    ...event,
  });
  if (logEvents.length > MAX_LOGS) {
    logEvents.shift();
  }
  broadcastPayload();
}

function cleanSnippet(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    let out = '';
    for (const p of content) {
      if (p.type === 'text') out += p.text;
    }
    return out.trim();
  }
  return '';
}

function deriveProjectLabel(sessionFilePath) {
  try {
    const parentDir = path.basename(path.dirname(sessionFilePath));
    const cleaned = parentDir.replace(/^--|--$/g, '');
    const parts = cleaned.split('-');

    // 1. If it's an Orca workspace: e.g. Storello-redesign-lead, Storello-english-i18n
    if (cleaned.includes('orca-workspaces')) {
      const idx = parts.indexOf('workspaces');
      if (idx !== -1 && parts[idx + 2]) {
        return parts.slice(idx + 2).join('-').toUpperCase();
      }
    }

    // 2. Main Storello repository
    if (cleaned.includes('Storello')) {
      return 'STORELLO';
    }

    // 3. Fallback to last directory name
    return (parts[parts.length - 1] || 'DEV').toUpperCase();
  } catch (e) {
    return 'STORELLO';
  }
}

async function formatAction(tool, args) {
  if (tool === 'edit' || tool === 'write') {
    const file = args?.path ? args.path.split('/').slice(-2).join('/') : '';
    return file ? `Updating ${file}` : 'Editing code';
  }
  if (tool === 'todo') {
    if (args?.task) {
      // Translate milestone to clean English so no Russian leaks through
      const enMilestone = await translateToEnglish(args.task, 'milestone');
      return `Milestone: ${enMilestone}`;
    }
    return null;
  }
  if (tool === 'bash') {
    const cmd = args?.command || '';
    if (cmd.includes('npm run typecheck') || cmd.includes('npm run check')) return 'Running TypeScript & verification checks';
    if (cmd.includes('deploy')) return 'Deploying build to staging server';
    if (cmd.includes('build-prod')) return 'Compiling production web bundle';
    if (cmd.includes('git commit') || cmd.includes('git push')) return 'Saving & pushing commits to GitHub';
    if (cmd.includes('playwright')) return 'Verifying visual UI with browser screenshots';
    return null;
  }
  return null;
}

// Find all session files
function getAllSessionFiles() {
  if (!fs.existsSync(SESSIONS_ROOT)) return [];
  const dirs = fs.readdirSync(SESSIONS_ROOT);
  const files = [];

  for (const d of dirs) {
    const fullDir = path.join(SESSIONS_ROOT, d);
    try {
      const jsonlFiles = fs.readdirSync(fullDir).filter(f => f.endsWith('.jsonl'));
      for (const f of jsonlFiles) {
        const fullPath = path.join(fullDir, f);
        const stat = fs.statSync(fullPath);
        files.push({
          path: fullPath,
          project: deriveProjectLabel(fullPath),
          mtime: stat.mtimeMs,
          size: stat.size,
        });
      }
    } catch (e) {}
  }

  files.sort((a, b) => b.mtime - a.mtime);
  return files;
}

const watchedOffsets = new Map();

async function processLine(line, project) {
  try {
    const obj = JSON.parse(line);
    if (obj.type !== 'message') return;

    const time = obj.timestamp ? new Date(obj.timestamp).toLocaleTimeString() : getTimestamp();
    const role = obj.message?.role;
    const content = obj.message?.content;

    if (role === 'user') {
      const rawText = cleanSnippet(content);
      if (rawText && rawText.length > 4 && !rawText.startsWith('data:image')) {
        currentStatus = 'ACTIVE';
        broadcastPayload();

        const enGoal = await translateToEnglish(rawText, 'goal');
        addLogEvent({
          time,
          project,
          type: 'user',
          badge: `${project.toUpperCase()} • GOAL`,
          title: enGoal,
        });
      }
    } else if (role === 'assistant' && Array.isArray(content)) {
      // 1. High-level strategy thinking
      for (const p of content) {
        if (p.type === 'thinking' && p.thinking) {
          const lines = p.thinking.split('\n').map(l => l.replace(/\*\*/g, '').trim()).filter(Boolean);
          const good = lines.find(l => l.length > 25 && l.length < 150 && !l.startsWith('Evaluating') && !/pixel|rgba|viewport|1280px/i.test(l));
          if (good) {
            currentStatus = 'ACTIVE';
            const enPlan = await translateToEnglish(good, 'plan');
            addLogEvent({
              time,
              project,
              type: 'plan',
              badge: `${project.toUpperCase()} • STRATEGY`,
              title: enPlan,
            });
          }
        }
      }

      // 2. High-level action (with milestone translation)
      for (const p of content) {
        if (p.type === 'toolCall') {
          const macro = await formatAction(p.name, p.arguments);
          if (macro) {
            currentStatus = 'ACTIVE';
            addLogEvent({
              time,
              project,
              type: 'action',
              badge: `${project.toUpperCase()} • ACTION`,
              title: macro,
            });
          }
        }
      }

      // 3. Final summary
      for (const p of content) {
        if (p.type === 'text' && p.text && p.text.trim().length > 15) {
          const first = p.text.split('\n\n')[0].trim();
          if (first && !first.startsWith('{') && first.length < 350) {
            const enSummary = await translateToEnglish(first, 'summary');
            addLogEvent({
              time,
              project,
              type: 'done',
              badge: `${project.toUpperCase()} • SUMMARY`,
              title: enSummary,
            });
          }
        }
      }
    }
  } catch(e) {}
}

async function startMultiAgentStream() {
  const allFiles = getAllSessionFiles();
  if (allFiles.length === 0) return;

  // Active top sessions (e.g. Storello Lead + Redesign Lead)
  const topSessions = allFiles.slice(0, 2);

  // Backfill recent 12 lines across both so stream starts rich and alive
  for (const sess of topSessions) {
    try {
      const readSize = Math.min(sess.size, 512 * 1024);
      const buffer = Buffer.alloc(readSize);
      const fd = fs.openSync(sess.path, 'r');
      fs.readSync(fd, buffer, 0, readSize, sess.size - readSize);
      fs.closeSync(fd);

      const lines = buffer.toString('utf8').split('\n').filter(Boolean);
      const recentLines = lines.slice(-8);
      for (const line of recentLines) {
        await processLine(line, sess.project);
      }
      watchedOffsets.set(sess.path, sess.size);
    } catch(e) {}
  }

  // Sort backfilled events chronologically
  logEvents.sort((a, b) => (a.time > b.time ? 1 : -1));
  broadcastPayload();

  // Watch for live lines across active sessions every 400ms
  setInterval(async () => {
    const currentList = getAllSessionFiles();
    for (const sess of currentList.slice(0, 3)) {
      try {
        const stat = fs.statSync(sess.path);
        const prev = watchedOffsets.get(sess.path) ?? stat.size;
        if (stat.size > prev) {
          const diff = stat.size - prev;
          const buffer = Buffer.alloc(diff);
          const fd = fs.openSync(sess.path, 'r');
          fs.readSync(fd, buffer, 0, diff, prev);
          fs.closeSync(fd);

          watchedOffsets.set(sess.path, stat.size);

          const newLines = buffer.toString('utf8').split('\n').filter(Boolean);
          for (const line of newLines) {
            await processLine(line, sess.project);
          }
        }
      } catch(e) {}
    }
  }, 400);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[stream-overlay] Multi-Agent Fleet Log running on http://127.0.0.1:${PORT}`);
  startMultiAgentStream();
});
