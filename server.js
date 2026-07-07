require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;
const SAKANA_BASE_URL = (process.env.SAKANA_BASE_URL || 'https://api.sakana.ai/v1').replace(/\/+$/, '');
const SAKANA_API_KEY = process.env.SAKANA_API_KEY;

if (!SAKANA_API_KEY) {
  console.warn('[fugu-chat] SAKANA_API_KEY is not set — add it to .env, then restart.');
}

// The official openai SDK just needs a baseURL override to talk to any
// OpenAI-compatible API, which is what Sakana's docs say Fugu is.
const client = new OpenAI({
  apiKey: SAKANA_API_KEY || 'missing-key',
  baseURL: SAKANA_BASE_URL,
});

const MODELS_PATH = path.join(__dirname, 'models.json');
function getCatalog() {
  return JSON.parse(fs.readFileSync(MODELS_PATH, 'utf-8'));
}

app.use(express.json({ limit: '20mb' })); // generous limit so base64 image attachments fit
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/models', (req, res) => {
  try {
    res.json(getCatalog());
  } catch (err) {
    res.status(500).json({ error: 'Could not read models.json' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { input, model, instructions, reasoningEffort } = req.body || {};

  if (!Array.isArray(input) || input.length === 0) {
    return res.status(400).json({ error: 'input[] is required' });
  }
  if (!SAKANA_API_KEY) {
    return res.status(500).json({ error: 'Server is missing SAKANA_API_KEY. Add it to .env and restart the server.' });
  }

  let validSlugs = ['fugu', 'fugu-ultra'];
  try {
    validSlugs = getCatalog().models.map((m) => m.slug);
  } catch {
    /* fall back to the defaults above */
  }
  const chosenModel = validSlugs.includes(model) ? model : validSlugs[0];

  let stream;
  try {
    // Sakana's docs say to prefer the Responses API over Chat Completions for
    // generation requests, so that's what this proxies to.
    stream = await client.responses.stream({
      model: chosenModel,
      input,
      instructions: instructions || undefined,
      reasoning: reasoningEffort ? { effort: reasoningEffort } : undefined,
    });
  } catch (err) {
    console.error('[fugu-chat] Sakana API error:', err);
    return res.status(err.status || 502).json({ error: err.message || 'Could not reach the Sakana API.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  if (res.socket) res.socket.setNoDelay(true);

  req.on('close', () => {
    try { stream.abort(); } catch { /* already finished */ }
  });

  try {
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        res.write(`data: ${JSON.stringify({ delta: event.delta })}\n\n`);
      } else if (event.type === 'error' || event.type === 'response.failed') {
        const message = event.message || event.response?.error?.message || 'Generation failed';
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      }
    }
  } catch (err) {
    console.error('[fugu-chat] stream error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'Stream error' })}\n\n`);
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Fugu Chat running at http://localhost:${PORT}`);
});
