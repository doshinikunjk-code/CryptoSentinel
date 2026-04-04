const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Explicit root route — guarantees index.html is served
app.get('/', (req, res) => {
  const p = path.join(__dirname, 'index.html');
  if (fs.existsSync(p)) {
    res.sendFile(p);
  } else {
    res.status(404).send('index.html not found in: ' + __dirname + '<br>Files: ' + fs.readdirSync(__dirname).join(', '));
  }
});

const PORT = process.env.PORT || 3000;

// ── ENV KEYS (set in Railway Variables tab — never hardcode) ──
const GEMINI_KEY   = process.env.GEMINI_KEY   || '';
const CLAUDE_KEY   = process.env.CLAUDE_KEY   || '';
const GROQ_KEY     = process.env.GROQ_KEY     || '';
const BENZINGA_KEY = process.env.BENZINGA_KEY || '';

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

// ── COINBASE PRICE PROXY (real-time, no key needed) ──────────
// Coinbase /v2/prices/:pair/spot returns live mid-market price
const CB_PAIRS = [
  'BTC-USD','ETH-USD','SOL-USD','XRP-USD','AVAX-USD',
  'LINK-USD','RENDER-USD','FET-USD','BNB-USD','DOGE-USD'
];

app.get('/api/cb/prices', async (req, res) => {
  try {
    // Fetch all pairs in parallel
    const results = await Promise.allSettled(
      CB_PAIRS.map(pair =>
        fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`, {
          headers: { 'Accept': 'application/json', 'CB-VERSION': '2016-02-18' }
        }).then(r => r.json()).then(d => ({ pair, price: parseFloat(d.data?.amount || 0) }))
      )
    );
    const prices = {};
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value.price > 0) {
        prices[r.value.pair] = r.value.price;
      }
    });
    console.log('[CB prices]', Object.entries(prices).map(([k,v]) => `${k}:${v}`).join(' '));
    res.json(prices);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── COINGECKO PROXY (avoids browser CORS block) ───────────────
app.get('/api/cg/simple', async (req, res) => {
  try {
    const ids = req.query.ids || '';
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_last_updated_at=true`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const d = await r.json();
    res.json(d);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Cache markets for 3 min
let _cgMarketsCache = null, _cgMarketsTs = 0;
app.get('/api/cg/markets', async (req, res) => {
  try {
    if (_cgMarketsCache && Date.now() - _cgMarketsTs < 180000) {
      return res.json(_cgMarketsCache);
    }
    const ids = req.query.ids || '';
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=20&sparkline=false&price_change_percentage=7d`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error('CG markets HTTP ' + r.status);
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error('CG markets not array: ' + JSON.stringify(d).slice(0,80));
    _cgMarketsCache = d; _cgMarketsTs = Date.now();
    res.json(d);
  } catch(e) {
    console.error('[CG markets]', e.message);
    if (_cgMarketsCache) return res.json(_cgMarketsCache);
    res.status(500).json({ error: e.message });
  }
});

// Cache global data for 2 min to avoid CoinGecko rate limits
let _cgGlobalCache = null, _cgGlobalTs = 0;
app.get('/api/cg/global', async (req, res) => {
  try {
    if (_cgGlobalCache && Date.now() - _cgGlobalTs < 120000) {
      return res.json(_cgGlobalCache);
    }
    const r = await fetch('https://api.coingecko.com/api/v3/global', { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error('CG global HTTP ' + r.status);
    const d = await r.json();
    _cgGlobalCache = d; _cgGlobalTs = Date.now();
    res.json(d);
  } catch(e) {
    console.error('[CG global]', e.message);
    // Return cached if available, else fallback
    if (_cgGlobalCache) return res.json(_cgGlobalCache);
    res.json({ data: { market_cap_percentage: { btc: 54 }, market_cap_change_percentage_24h_usd: 0 } });
  }
});

// ── FEAR & GREED PROXY ────────────────────────────────────────
app.get('/api/feargreed', async (req, res) => {
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=1');
    const d = await r.json();
    res.json(d);
  } catch(e) { res.status(500).json({ data: [{ value: '50', value_classification: 'Neutral' }] }); }
});

// ── FAVICON (prevents 404 noise) ─────────────────────────────
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ── API KEY HEALTH CHECK ──────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    ts: Date.now(),
    keys: {
      claude:   CLAUDE_KEY   ? `set (${CLAUDE_KEY.slice(0,8)}...)`   : 'MISSING',
      groq:     GROQ_KEY     ? `set (${GROQ_KEY.slice(0,8)}...)`     : 'MISSING',
      gemini:   GEMINI_KEY   ? `set (${GEMINI_KEY.slice(0,8)}...)`   : 'MISSING',
      benzinga: BENZINGA_KEY ? `set (${BENZINGA_KEY.slice(0,8)}...)` : 'MISSING',
    }
  });
});

app.listen(PORT, () => console.log(`CryptoSentinel server running on port ${PORT}`));
