const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;

// ── ENV KEYS ──────────────────────────────────────────────────
const GEMINI_KEY   = process.env.GEMINI_KEY   || '';
const CLAUDE_KEY   = process.env.CLAUDE_KEY   || 'v5BCnln_o6mSoZilLS4ueGEHOM8dAa9e';
const GROQ_KEY     = process.env.GROQ_KEY     || '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';
const BENZINGA_KEY = process.env.BENZINGA_KEY || '49k3R513d89itAXMocZtrZVNOdmuSX17';

// ── GEMINI PROXY ──────────────────────────────────────────────
app.post('/api/gemini', async (req, res) => {
  try {
    const { prompt, model } = req.body;
    const mdl = model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${GEMINI_KEY}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const d = await r.json();
    res.json(d);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CLAUDE PROXY ──────────────────────────────────────────────
app.post('/api/claude', async (req, res) => {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const d = await r.json();
    res.json(d);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GROQ PROXY ────────────────────────────────────────────────
app.post('/api/groq', async (req, res) => {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify(req.body)
    });
    const d = await r.json();
    res.json(d);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BENZINGA NEWS PROXY ───────────────────────────────────────
app.get('/api/news', async (req, res) => {
  try {
    const { tickers, pageSize } = req.query;
    const url = `https://api.polygon.io/v2/reference/news?ticker=${tickers||''}&limit=${pageSize||5}&order=desc&sort=published_utc&apiKey=${BENZINGA_KEY}`;
    const r = await fetch(url);
    const d = await r.json();
    res.json(d);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── YAHOO FINANCE PROXY (commodities) ────────────────────────
app.get('/api/commodity', async (req, res) => {
  try {
    const { symbol } = req.query;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const d = await r.json();
    res.json(d);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── COINGLASS PROXY (funding rates + OI) ─────────────────────
app.get('/api/funding', async (req, res) => {
  try {
    const r = await fetch('https://open-api.coinglass.com/public/v2/funding', {
      headers: { 'coinglassSecret': '' }
    });
    const d = await r.json();
    res.json(d);
  } catch(e) { res.status(500).json({ results: [] }); }
});

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

app.listen(PORT, () => console.log(`CryptoSentinel server running on port ${PORT}`));
