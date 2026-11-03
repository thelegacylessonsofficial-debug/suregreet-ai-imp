import { Router } from 'express';
import { scrapeClinicWebsite, scrapeAndIngestLead, scrapeBulkLeads } from '../services/scraperService.js';
import { getProspects } from '../services/outreachService.js';

export const scraperRouter = Router();

// 1. Inspect a clinic website without saving (dry run)
scraperRouter.post('/inspect', async (req, res) => {
  const { url } = req.body || {};
  if (!url) {
    return res.status(400).json({ status: 'error', message: 'Field "url" is required' });
  }

  try {
    const data = await scrapeClinicWebsite(url);
    if (!data.success) {
      return res.status(400).json({ status: 'error', error: data.error });
    }
    res.json({ status: 'success', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2. Scrape a website and immediately ingest into Supabase
scraperRouter.post('/ingest', async (req, res) => {
  const { url, city, treatment, doctorName } = req.body || {};
  if (!url) {
    return res.status(400).json({ status: 'error', message: 'Field "url" is required' });
  }

  try {
    const result = await scrapeAndIngestLead({
      url,
      cityOverride: city,
      treatmentOverride: treatment,
      doctorOverride: doctorName,
    });

    if (result.success) {
      res.json({ status: 'success', message: 'Prospect scraped and ingested into Supabase', ...result });
    } else {
      res.status(400).json({ status: 'failed', ...result });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 3. Bulk scrape a list of clinic URLs
scraperRouter.post('/bulk', async (req, res) => {
  let { urls } = req.body || {};
  if (!urls) {
    return res.status(400).json({ status: 'error', message: 'Field "urls" (array or newline-separated string) is required' });
  }

  if (typeof urls === 'string') {
    urls = urls.split(/\r?\n/).map((u) => u.trim()).filter(Boolean);
  }

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ status: 'error', message: 'At least one valid URL is required' });
  }

  // Limit batch size to 15 per call to prevent timeout on Render
  const batch = urls.slice(0, 15);

  try {
    const summary = await scrapeBulkLeads(batch);
    res.json({ status: 'success', ...summary });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 4. Standalone Web Dashboard for live lead scraping in browser
scraperRouter.get('/dashboard', async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SureGreet AI — Autonomous Lead Scraper</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0b0f19; color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
</head>
<body class="p-6 md:p-10">
  <div class="max-w-4xl mx-auto space-y-6">
    
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-gray-800 pb-5">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <span>⚡</span> SureGreet AI Lead Scraper & Enrichment Engine
        </h1>
        <p class="text-xs text-gray-400 mt-1">Autonomous MedSpa Extraction • Meta Pixel Verification • Supabase Pipeline Sync</p>
      </div>
      <a href="/outreach/prospects" target="_blank" class="text-xs bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg hover:bg-blue-600/30 transition">
        View Supabase Prospects ↗
      </a>
    </div>

    <!-- Single URL Box -->
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-gray-400">Extract Single Clinic Domain</h2>
      <div class="flex gap-2">
        <input id="singleUrl" type="url" placeholder="https://clinicname.com" class="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
        <button onclick="scrapeSingle()" id="btnSingle" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-5 py-2.5 rounded-lg transition flex items-center gap-2">
          <span>Scrape & Ingest</span>
        </button>
      </div>
      <div id="singleResult" class="hidden text-xs bg-gray-950 p-4 rounded-lg border border-gray-800 font-mono overflow-x-auto"></div>
    </div>

    <!-- Bulk URLs Box -->
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-gray-400">Bulk Ingestion (Paste Multiple URLs, One Per Line)</h2>
      <textarea id="bulkUrls" rows="4" placeholder="https://clinic1.com&#10;https://clinic2.com&#10;https://clinic3.com" class="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono"></textarea>
      <div class="flex justify-between items-center">
        <span class="text-xs text-gray-500">Max 15 domains per batch (rate-limited)</span>
        <button onclick="scrapeBulk()" id="btnBulk" class="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-5 py-2 rounded-lg transition">
          Start Bulk Extraction
        </button>
      </div>
      <div id="bulkResult" class="hidden text-xs bg-gray-950 p-4 rounded-lg border border-gray-800 font-mono overflow-x-auto"></div>
    </div>

  </div>

  <script>
    async function scrapeSingle() {
      const url = document.getElementById('singleUrl').value.trim();
      if (!url) return alert('Please enter a URL');

      const btn = document.getElementById('btnSingle');
      const resBox = document.getElementById('singleResult');
      btn.innerHTML = '<span>⏳ Crawling...</span>';
      resBox.classList.remove('hidden');
      resBox.innerText = 'Connecting to domain, crawling /about, /team, and checking Meta pixel...';

      try {
        const res = await fetch('/scraper/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        btn.innerHTML = '<span>Scrape & Ingest</span>';
        resBox.innerText = JSON.stringify(data, null, 2);
      } catch (e) {
        btn.innerHTML = '<span>Scrape & Ingest</span>';
        resBox.innerText = 'Error: ' + e.message;
      }
    }

    async function scrapeBulk() {
      const text = document.getElementById('bulkUrls').value.trim();
      if (!text) return alert('Please enter at least one URL');

      const btn = document.getElementById('btnBulk');
      const resBox = document.getElementById('bulkResult');
      btn.innerText = 'Extracting Batch...';
      resBox.classList.remove('hidden');
      resBox.innerText = 'Running sequential crawl with 1.2s jitter...';

      try {
        const res = await fetch('/scraper/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: text })
        });
        const data = await res.json();
        btn.innerText = 'Start Bulk Extraction';
        resBox.innerText = JSON.stringify(data, null, 2);
      } catch (e) {
        btn.innerText = 'Start Bulk Extraction';
        resBox.innerText = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>`);
});
