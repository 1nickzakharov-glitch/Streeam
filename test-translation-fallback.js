// test-translation-fallback.js
// Tests translator timeouts, offline API fallback, error isolation, and cache

const assert = require('assert');
const Translator = require('./adapters/translator');

async function testTranslator() {
  console.log('🧪 Testing Translator Robustness & Offline Fallbacks...\n');

  // 1. Completely offline / bad endpoint fallback test
  console.log('  1. Testing offline/unreachable API URL fallback...');
  const offlineTranslator = new Translator({
    apiKey: 'fake_key',
    apiUrl: 'http://127.0.0.1:54321/v1/chat/completions', // dead port
  });

  const rawText = 'Запустить проверку безопасности и закрыть уязвимости в коде';
  const start = Date.now();
  const fallbackResult = await offlineTranslator.translate(rawText, 'goal');
  console.log(`     ✓ Handled gracefully without crash: "${fallbackResult.slice(0, 50)}..."`);
  assert.ok(fallbackResult, 'Must return fallback string when LLM is unreachable');

  // 2. Short / empty string guard
  console.log('  2. Testing edge case empty / short strings...');
  const emptyRes = await offlineTranslator.translate('', 'goal');
  assert.strictEqual(emptyRes, '');
  const oneChar = await offlineTranslator.translate('a', 'goal');
  assert.strictEqual(oneChar, 'a');
  console.log('     ✓ Edge cases passed.');

  // 3. Cache test
  console.log('  3. Testing in-memory cache...');
  offlineTranslator.cache.set('Cache me', 'Cached English text');
  const cached = await offlineTranslator.translate('Cache me', 'goal');
  assert.strictEqual(cached, 'Cached English text');
  console.log('     ✓ Cached hit returned immediately.');

  console.log('\n✨ Translator robustness verified!\n');
}

testTranslator().catch(e => {
  console.error('Translator test failed:', e);
  process.exit(1);
});
