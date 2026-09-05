// adapters/translator.js
const fs = require('fs');

class Translator {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.STREEAM_LLM_KEY || process.env.DEEPINFRA_API_KEY || process.env.OPENAI_API_KEY || this._findApiKey();
    this.apiUrl = options.apiUrl || process.env.STREEAM_LLM_URL || (process.env.OPENAI_API_KEY ? 'https://api.openai.com/v1/chat/completions' : 'https://api.deepinfra.com/v1/openai/chat/completions');
    // Economical, ultra-fast model by default (e.g. Llama-3.3-70B on DeepInfra, gpt-4o-mini on OpenAI, or local Ollama)
    this.model = options.model || process.env.STREEAM_LLM_MODEL || (this.apiUrl.includes('openai.com') ? 'gpt-4o-mini' : 'meta-llama/Llama-3.3-70B-Instruct');
    this.cache = new Map();
  }

  _findApiKey() {
    const possiblePaths = [
      '/Users/nikitazaharov/Desktop/ПРИЛОЖЕНИЕ/Storello/apps/frontend/.env.local',
      '/Users/nikitazaharov/Desktop/ПРИЛОЖЕНИЕ/Storello/.env',
    ];
    for (const envPath of possiblePaths) {
      try {
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, 'utf8');
          const matchDeep = content.match(/DEEPINFRA_API_KEY=["']?([^"'\r\n]+)/);
          if (matchDeep && matchDeep[1]) return matchDeep[1].trim();
          const matchOpenAI = content.match(/OPENAI_API_KEY=["']?([^"'\r\n]+)/);
          if (matchOpenAI && matchOpenAI[1]) return matchOpenAI[1].trim();
        }
      } catch (e) {}
    }
    return '';
  }

  async translate(text, mode = 'goal') {
    if (!text || text.length < 2) return text;
    if (this.cache.has(text)) return this.cache.get(text);

    // If no LLM configured, clean up and return raw
    if (!this.apiKey && !this.apiUrl.includes('localhost') && !this.apiUrl.includes('127.0.0.1')) {
      return text.length > 200 ? text.slice(0, 200) + '...' : text;
    }

    try {
      let systemPrompt = 'You are an AI broadcasting stream narrator. Formulate what the developer is asking in 1 clear, natural English sentence without jargon or quotes.';
      
      if (mode === 'plan') {
        systemPrompt = 'You are an AI stream narrator. Describe the agent\'s high-level strategy and next steps in 1-2 engaging, natural English sentences (e.g. "To verify the landing page fixes, I will open it directly in the browser and take full-resolution screenshots."). Never output raw code or markdown quotes.';
      } else if (mode === 'action') {
        systemPrompt = 'You are an AI stream narrator. Convert this technical tool invocation or terminal command into a natural, friendly 1-sentence English explanation of what the agent is currently doing (e.g. "Running automated test suites to ensure zero regressions."). No raw CLI commands or quotes.';
      } else if (mode === 'milestone') {
        systemPrompt = 'Translate this task milestone into a concise 4-8 word professional English title. No quotes.';
      } else if (mode === 'summary') {
        systemPrompt = 'Summarize what was accomplished in 1 concise, natural English sentence. No quotes.';
      }

      const headers = {
        'Content-Type': 'application/json',
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text.slice(0, 1400) },
          ],
          max_tokens: 140,
          temperature: 0.2,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const translated = json.choices?.[0]?.message?.content?.trim();
        if (translated) {
          const clean = translated.replace(/^["'«»]|["'«»]$/g, '').replace(/^AI:\s*/i, '');
          this.cache.set(text, clean);
          return clean;
        }
      }
    } catch (err) {
      console.warn('[streeam:narrator] LLM synthesis warning:', err.message);
    }
    return text;
  }
}

module.exports = Translator;
