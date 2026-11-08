import { Router } from 'express';
import { scrapeClinicWebsite, scrapeAndIngestLead, scrapeBulkLeads } from '../services/scraperService.js';
import { getProspects } from '../services/outreachService.js';

export const scraperRouter = Router();

// Shared Nav Header HTML Generator
function getNavHeader(activeTab) {
  return `
  <!-- Unified Global Header -->
  <header class="border-b border-gray-800/80 bg-gray-950/80 backdrop-blur-md sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-blue-500/20">
          ⚡
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <span class="text-base font-bold tracking-tight text-white">SureGreet AI</span>
            <span class="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Agency Hub</span>
          </div>
          <p class="text-[11px] text-gray-400">24/7 AI Voice & Speed-to-Lead Outbound Infrastructure</p>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <nav class="flex items-center space-x-1.5 bg-gray-900/90 p-1.5 rounded-xl border border-gray-800 text-xs">
        <a href="/outreach/prospects" class="px-3.5 py-1.5 rounded-lg font-semibold transition ${
          activeTab === 'pipeline'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
        }">
          📊 Pipeline CRM
        </a>
        <a href="/scraper/dashboard" class="px-3.5 py-1.5 rounded-lg font-semibold transition ${
          activeTab === 'scraper'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
        }">
          ⚡ Lead Scraper Studio
        </a>
        <a href="/outreach/preview" class="px-3.5 py-1.5 rounded-lg font-semibold transition ${
          activeTab === 'preview'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
        }">
          ✉️ Email Script Studio
        </a>
      </nav>

      <!-- External Quick Links -->
      <div class="flex items-center space-x-2 text-xs">
        <a href="https://www.facebook.com/ads/library/?country=US&q=MedSpa%20Miami" target="_blank" class="px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 transition flex items-center gap-1">
          <span>Meta Ads</span>
          <span class="text-gray-500 text-[10px]">↗</span>
        </a>
        <a href="/health" target="_blank" class="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px] flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Online</span>
        </a>
      </div>
    </div>
  </header>`;
}

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
  <title>SureGreet AI — Autonomous Lead Scraper Studio</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0b0f19; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    @keyframes pulse-subtle { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .pulse-subtle { animation: pulse-subtle 2s infinite ease-in-out; }
  </style>
</head>
<body class="min-h-screen">
  ${getNavHeader('scraper')}

  <main class="max-w-7xl mx-auto p-4 sm:p-6 lg:p-10 space-y-8">
    
    <!-- Hero Banner -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-blue-950/40 via-gray-900 to-gray-900 border border-blue-500/20 rounded-2xl p-6 shadow-xl">
      <div class="space-y-1">
        <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <span>🎯 Scout Engine</span>
        </div>
        <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white">Autonomous Lead Extraction & Ad Verification</h1>
        <p class="text-xs sm:text-sm text-gray-400 max-w-2xl">
          Feed in clinic website domains. The engine extracts the medical director, validates Meta/Google Ads tracking pixels, tags high-ticket procedures, and commits directly into Supabase.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <a href="/outreach/prospects" class="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold border border-gray-700 transition flex items-center gap-2">
          <span>📊 View Ingested Pipeline</span>
          <span class="text-gray-400">→</span>
        </a>
      </div>
    </div>

    <!-- Quick Presets -->
    <div class="bg-gray-900/60 border border-gray-800 rounded-xl p-4 flex flex-wrap items-center gap-3 text-xs">
      <span class="text-gray-400 font-semibold flex items-center gap-1.5">
        <span>⚡ Quick Test Presets:</span>
      </span>
      <button onclick="setPreset('https://www.medaestheticsmiami.com')" class="px-3 py-1.5 rounded-lg bg-gray-950 hover:bg-blue-600/20 text-gray-300 hover:text-blue-300 border border-gray-800 transition">
        Miami: Med Aesthetics (Morpheus8)
      </button>
      <button onclick="setPreset('https://www.rejuvemedspa.com')" class="px-3 py-1.5 rounded-lg bg-gray-950 hover:bg-blue-600/20 text-gray-300 hover:text-blue-300 border border-gray-800 transition">
        Dallas: Rejuve Med-Spa
      </button>
      <button onclick="setPreset('https://www.vitalyc.com')" class="px-3 py-1.5 rounded-lg bg-gray-950 hover:bg-blue-600/20 text-gray-300 hover:text-blue-300 border border-gray-800 transition">
        Texas: Vitalyc Medspa
      </button>
      <button onclick="setPreset('https://ellemesmedspa.com')" class="px-3 py-1.5 rounded-lg bg-gray-950 hover:bg-blue-600/20 text-gray-300 hover:text-blue-300 border border-gray-800 transition">
        Atlanta: ELLEMES Med Spa
      </button>
    </div>

    <!-- Dual Studio Grid: Single Extraction vs Bulk Ingestion -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

      <!-- Left Column: Single Clinic Ingestor (7 Cols) -->
      <div class="lg:col-span-7 bg-gray-900/90 border border-gray-800 rounded-2xl p-6 space-y-5 shadow-xl">
        <div class="flex items-center justify-between border-b border-gray-800 pb-3">
          <div>
            <h2 class="text-sm font-bold text-white flex items-center gap-2">
              <span>🔍</span> Deep Single Clinic Inspection & Ingest
            </h2>
            <p class="text-xs text-gray-400 mt-0.5">Scrapes homepage + /about + /team + /contact with NLP extraction</p>
          </div>
          <span class="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            Cheerio Engine
          </span>
        </div>

        <div class="space-y-3">
          <label class="block text-xs font-semibold uppercase tracking-wider text-gray-400">
            Target Clinic Website Domain:
          </label>
          <div class="flex gap-2">
            <input 
              id="singleUrl" 
              type="url" 
              placeholder="https://luxeaestheticsmiami.com" 
              class="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition font-mono"
            />
            <button 
              onclick="scrapeSingle()" 
              id="btnSingle" 
              class="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg shadow-blue-600/20 whitespace-nowrap"
            >
              <span>⚡</span>
              <span>Scrape & Ingest</span>
            </button>
          </div>
        </div>

        <!-- Progress Visualizer Bar -->
        <div id="scrapeProgress" class="hidden border border-gray-800 bg-gray-950/80 rounded-xl p-4 space-y-2.5 text-xs">
          <div class="flex items-center justify-between">
            <span id="progressText" class="font-medium text-blue-400">Connecting to domain...</span>
            <span id="progressPercent" class="font-mono text-gray-400">20%</span>
          </div>
          <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
            <div id="progressBar" class="bg-blue-500 h-full w-1/5 transition-all duration-300"></div>
          </div>
        </div>

        <!-- Enriched Lead Result Card -->
        <div id="singleResultCard" class="hidden border border-gray-800 bg-gray-950/60 rounded-xl p-5 space-y-4">
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-2">
                <h3 id="resClinicName" class="text-base font-bold text-white">Clinic Name</h3>
                <span id="resPixelBadge" class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Meta Pixel Active
                </span>
              </div>
              <p id="resCity" class="text-xs text-gray-400 mt-0.5">Location</p>
            </div>
            <span class="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
              ✓ Ingested to Supabase
            </span>
          </div>

          <!-- 4 Grid Vectors -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-gray-800/80 text-xs">
            <div class="bg-gray-900 p-3 rounded-lg border border-gray-800">
              <span class="text-[10px] uppercase font-bold text-gray-400">Doctor / Director</span>
              <div id="resDoctor" class="text-xs font-semibold text-white mt-1">Dr. Name</div>
            </div>
            <div class="bg-gray-900 p-3 rounded-lg border border-gray-800">
              <span class="text-[10px] uppercase font-bold text-gray-400">Direct Email</span>
              <div id="resEmail" class="text-xs font-mono text-blue-400 mt-1 truncate">email@clinic.com</div>
            </div>
            <div class="bg-gray-900 p-3 rounded-lg border border-gray-800">
              <span class="text-[10px] uppercase font-bold text-gray-400">Primary Treatment</span>
              <div id="resTreatment" class="text-xs font-semibold text-white mt-1">Morpheus8</div>
            </div>
            <div class="bg-gray-900 p-3 rounded-lg border border-gray-800">
              <span class="text-[10px] uppercase font-bold text-gray-400">Front Desk Phone</span>
              <div id="resPhone" class="text-xs font-mono text-gray-300 mt-1">(555) 000-0000</div>
            </div>
          </div>
        </div>

      </div>

      <!-- Right Column: Bulk Ingestion Studio (5 Cols) -->
      <div class="lg:col-span-5 bg-gray-900/90 border border-gray-800 rounded-2xl p-6 space-y-5 shadow-xl flex flex-col justify-between">
        <div class="space-y-4">
          <div class="flex items-center justify-between border-b border-gray-800 pb-3">
            <div>
              <h2 class="text-sm font-bold text-white flex items-center gap-2">
                <span>📋</span> Bulk Ingestion Studio
              </h2>
              <p class="text-xs text-gray-400 mt-0.5">Paste a list of URLs copied from Meta Ads Library</p>
            </div>
            <span class="text-[11px] font-mono text-gray-400">Up to 15 / batch</span>
          </div>

          <div class="space-y-2">
            <label class="block text-xs font-semibold uppercase tracking-wider text-gray-400">
              Paste URLs (One Per Line):
            </label>
            <textarea 
              id="bulkUrls" 
              rows="6" 
              placeholder="https://clinic1.com&#10;https://clinic2.com&#10;https://clinic3.com" 
              class="w-full bg-gray-950 border border-gray-800 rounded-xl p-3.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono leading-relaxed"
            ></textarea>
          </div>
        </div>

        <div class="space-y-3 pt-3 border-t border-gray-800">
          <div class="flex items-center justify-between">
            <span class="text-[11px] text-gray-500">Auto-applies 1.2s anti-rate-limit jitter</span>
            <button 
              onclick="scrapeBulk()" 
              id="btnBulk" 
              class="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
            >
              <span>🚀</span>
              <span>Start Bulk Extraction</span>
            </button>
          </div>

          <div id="bulkResult" class="hidden text-xs bg-gray-950 p-4 rounded-xl border border-gray-800 font-mono max-h-48 overflow-y-auto"></div>
        </div>
      </div>

    </div>

  </main>

  <script>
    function setPreset(url) {
      document.getElementById('singleUrl').value = url;
      scrapeSingle();
    }

    async function scrapeSingle() {
      const url = document.getElementById('singleUrl').value.trim();
      if (!url) return alert('Please enter a clinic URL');

      const btn = document.getElementById('btnSingle');
      const progress = document.getElementById('scrapeProgress');
      const bar = document.getElementById('progressBar');
      const text = document.getElementById('progressText');
      const percent = document.getElementById('progressPercent');
      const card = document.getElementById('singleResultCard');

      btn.disabled = true;
      btn.innerHTML = '<span>⏳ Crawling...</span>';
      progress.classList.remove('hidden');
      card.classList.add('hidden');

      bar.style.width = '25%';
      text.innerText = 'Connecting to domain ' + url + '...';
      percent.innerText = '25%';

      const progressInterval = setInterval(() => {
        const cur = parseInt(bar.style.width) || 25;
        if (cur < 85) {
          bar.style.width = (cur + 15) + '%';
          percent.innerText = (cur + 15) + '%';
          if (cur > 40) text.innerText = 'Crawling /about and /team pages for doctor names...';
          if (cur > 65) text.innerText = 'Scanning for Meta Pixel (fbq) and Google Ads tags...';
        }
      }, 600);

      try {
        const res = await fetch('/scraper/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        clearInterval(progressInterval);
        bar.style.width = '100%';
        percent.innerText = '100%';
        text.innerText = 'Extraction complete!';

        const data = await res.json();
        btn.disabled = false;
        btn.innerHTML = '<span>⚡</span><span>Scrape & Ingest</span>';

        setTimeout(() => {
          progress.classList.add('hidden');
          if (data.status === 'success' || data.scrapedData) {
            const d = data.scrapedData || data.data;
            document.getElementById('resClinicName').innerText = d.clinicName || 'Clinic';
            document.getElementById('resCity').innerText = d.city || 'United States';
            document.getElementById('resDoctor').innerText = d.doctorName || 'Medical Director';
            document.getElementById('resEmail').innerText = d.email || 'None';
            document.getElementById('resTreatment').innerText = d.treatment || 'Morpheus8';
            document.getElementById('resPhone').innerText = d.phone || 'N/A';

            const badge = document.getElementById('resPixelBadge');
            if (d.adSignals?.hasPaidAds) {
              badge.innerText = '✓ Meta / Google Ads Active';
              badge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
            } else {
              badge.innerText = 'Organic Traffic';
              badge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-800 text-gray-400 border border-gray-700';
            }

            card.classList.remove('hidden');
          } else {
            alert(data.message || data.error || 'Extraction completed, but no direct email found.');
          }
        }, 400);

      } catch (err) {
        clearInterval(progressInterval);
        btn.disabled = false;
        btn.innerHTML = '<span>⚡</span><span>Scrape & Ingest</span>';
        progress.classList.add('hidden');
        alert('Extraction failed: ' + err.message);
      }
    }

    async function scrapeBulk() {
      const text = document.getElementById('bulkUrls').value.trim();
      if (!text) return alert('Please enter at least one URL');

      const btn = document.getElementById('btnBulk');
      const resBox = document.getElementById('bulkResult');

      btn.disabled = true;
      btn.innerHTML = '<span>⏳ Extracting Batch...</span>';
      resBox.classList.remove('hidden');
      resBox.innerText = 'Initiating sequential crawl with 1.2s anti-rate-limit delays...';

      try {
        const res = await fetch('/scraper/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: text })
        });
        const data = await res.json();
        btn.disabled = false;
        btn.innerHTML = '<span>🚀</span><span>Start Bulk Extraction</span>';
        resBox.innerText = JSON.stringify(data, null, 2);
      } catch (e) {
        btn.disabled = false;
        btn.innerHTML = '<span>🚀</span><span>Start Bulk Extraction</span>';
        resBox.innerText = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>`);
});
