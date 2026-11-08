import { Router } from 'express';
import { scrapeClinicWebsite, scrapeAndIngestLead, scrapeBulkLeads } from '../services/scraperService.js';
import { runAutonomousHunt, huntAndEnrichLead, commitLeadToSupabase } from '../services/leadHunterService.js';
import { runDigitalAudit, auditAndSaveProspect } from '../services/auditorService.js';
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

// 4. Autonomous Lead Hunter (Search + Enrich + Audit + Supabase Ingest)
scraperRouter.post('/hunt', async (req, res) => {
  const { city, niche, query, limit } = req.body || {};
  try {
    const result = await runAutonomousHunt({
      city: city || 'Miami, FL',
      niche: niche || 'medspa',
      query,
      limit: Math.min(Number(limit) || 5, 10),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Digital Auditor (Run diagnostic audit on any URL or prospect)
scraperRouter.post('/audit', async (req, res) => {
  const { url, prospectId, niche } = req.body || {};
  try {
    if (prospectId) {
      const result = await auditAndSaveProspect(prospectId);
      return res.json(result);
    }

    if (!url) {
      return res.status(400).json({ success: false, error: 'Provide "url" or "prospectId"' });
    }

    const result = await runDigitalAudit({ url, niche: niche || 'medspa' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Standalone Web Dashboard for Lead Hunting, Scraping & Auditing
scraperRouter.get('/dashboard', async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SureGreet AI — Autonomous Lead Hunter & Scraper Studio</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0b0f19; color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .glass-card { background: rgba(17, 24, 39, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(55, 65, 81, 0.5); }
    @keyframes pulse-fast { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    .pulse-fast { animation: pulse-fast 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
  </style>
</head>
<body class="min-h-screen">

  ${getNavHeader('scraper')}

  <main class="max-w-7xl mx-auto p-4 sm:p-6 lg:p-10 space-y-8">
    
    <!-- Top Hero Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5">
      <div>
        <div class="flex items-center space-x-2">
          <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <span>⚡</span> Lead Hunter & Digital Auditor Studio
          </h1>
          <span class="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Pillars 1 & 2 Active
          </span>
        </div>
        <p class="text-xs text-gray-400 mt-1">Autonomous Business Sourcing • Jina AI Digital Diagnostics • Meta Pixel Verification • Supabase Sync</p>
      </div>

      <div class="flex items-center space-x-3">
        <a href="/outreach/prospects" class="text-xs bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 px-4 py-2 rounded-xl transition flex items-center gap-1.5">
          <span>📊 View Prospects CRM</span>
          <span class="text-gray-500 text-[10px]">↗</span>
        </a>
        <a href="/outreach/preview" class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl transition shadow-lg shadow-blue-600/20">
          ✉️ Script Studio
        </a>
      </div>
    </div>

    <!-- PILLAR 1 & 2: THE AUTONOMOUS LEAD HUNTER & AUDITOR -->
    <div class="glass-card rounded-2xl p-6 sm:p-7 space-y-6 shadow-2xl border-l-4 border-l-blue-500">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800/80 pb-4">
        <div>
          <span class="text-[10px] font-mono uppercase tracking-wider text-blue-400 font-bold">Pillars 1 & 2 • Autonomous Sourcing</span>
          <h2 class="text-base sm:text-lg font-bold text-white flex items-center gap-2 mt-0.5">
            <span>🎯</span> The Autonomous Lead Hunter & Diagnostic Auditor
          </h2>
          <p class="text-xs text-gray-400 mt-0.5">Zero-cost search engine extraction + Jina AI Reader analysis for speed-to-lead and booking friction gaps.</p>
        </div>
        <div class="flex items-center gap-2 text-xs">
          <span class="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
            $0 / Month • Zero Scraper Subscriptions
          </span>
        </div>
      </div>

      <!-- Controls: Niche, City, Search Query -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Target Niche</label>
          <select id="huntNiche" onchange="updateNicheDefaults()" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium">
            <option value="medspa">✨ High-Ticket MedSpas & Aesthetic Clinics</option>
            <option value="hvac">❄️ Emergency HVAC & Plumbing Contractors</option>
          </select>
        </div>

        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Target US Metro / City</label>
          <input id="huntCity" type="text" value="Miami, FL" class="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium" placeholder="e.g. Austin, TX or Phoenix, AZ">
        </div>

        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Batch Extraction Size</label>
          <div class="flex gap-2">
            <select id="huntLimit" class="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium">
              <option value="3">3 Qualified Leads</option>
              <option value="5" selected>5 Qualified Leads</option>
              <option value="8">8 Qualified Leads</option>
            </select>
            <button onclick="runAutonomousHuntClient()" id="btnLaunchHunter" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-blue-600/30">
              <span>🚀</span>
              <span>Launch Hunter</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Quick Preset City Badges -->
      <div class="flex items-center gap-2 flex-wrap text-xs pt-1">
        <span class="text-gray-500 text-[11px]">High-demand markets:</span>
        <button onclick="setHuntPreset('Miami, FL')" class="px-2.5 py-1 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 transition">🌴 Miami, FL</button>
        <button onclick="setHuntPreset('Dallas, TX')" class="px-2.5 py-1 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 transition">🤠 Dallas, TX</button>
        <button onclick="setHuntPreset('Austin, TX')" class="px-2.5 py-1 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 transition">🎸 Austin, TX</button>
        <button onclick="setHuntPreset('Phoenix, AZ')" class="px-2.5 py-1 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 transition">☀️ Phoenix, AZ</button>
        <button onclick="setHuntPreset('Atlanta, GA')" class="px-2.5 py-1 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 transition">🍑 Atlanta, GA</button>
      </div>

      <!-- Live Hunting Status Console -->
      <div id="huntConsole" class="hidden bg-gray-950 rounded-xl p-4 border border-gray-800 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-blue-400 font-mono font-medium flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-blue-400 pulse-fast"></span>
            <span id="huntConsoleStatus">Searching local business registries...</span>
          </span>
          <span id="huntTimer" class="text-gray-500 font-mono text-[11px]">0.0s</span>
        </div>
        <div class="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
          <div id="huntProgressBar" class="bg-blue-500 h-1.5 transition-all duration-500 rounded-full" style="width: 15%"></div>
        </div>
      </div>

      <!-- Hunter Results Grid -->
      <div id="hunterResultsContainer" class="hidden space-y-3 pt-2">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-300">Enriched & Audited Leads</h3>
          <span id="hunterStatsBadge" class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"></span>
        </div>
        <div id="hunterCardsList" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
      </div>
    </div>

    <!-- PILLAR 1 MANUAL TOOLS: SINGLE DOMAIN EXTRACTION & BULK INGESTION -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- Single URL Box -->
      <div class="glass-card rounded-2xl p-6 space-y-5 shadow-xl">
        <div class="border-b border-gray-800/80 pb-3">
          <div class="text-[10px] font-mono uppercase tracking-wider text-gray-400">Manual Scout Routine</div>
          <h2 class="text-sm font-bold text-white mt-0.5">Single Clinic Deep Extraction</h2>
        </div>

        <div class="space-y-3">
          <div class="flex gap-2">
            <input 
              id="singleUrl" 
              type="url" 
              placeholder="https://clinicname.com" 
              class="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition font-mono"
            >
            <button 
              onclick="scrapeSingle()" 
              id="btnSingle" 
              class="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-blue-600/20 shrink-0"
            >
              <span>⚡</span>
              <span>Scrape & Audit</span>
            </button>
          </div>

          <!-- Quick Test Presets -->
          <div class="flex items-center gap-1.5 flex-wrap text-xs">
            <span class="text-gray-500 text-[11px]">Quick presets:</span>
            <button onclick="setPreset('https://vitalyc.com')" class="px-2 py-0.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white border border-gray-800 transition text-[11px]">Vitalyc (Dallas)</button>
            <button onclick="setPreset('https://ellemesmedspa.com')" class="px-2 py-0.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white border border-gray-800 transition text-[11px]">ELLEMES (Atlanta)</button>
          </div>
        </div>

        <!-- Extraction Progress Card -->
        <div id="scrapeProgress" class="hidden bg-gray-950/80 rounded-xl p-4 border border-gray-800/80 space-y-3">
          <div class="flex items-center justify-between text-xs">
            <span id="progressText" class="text-gray-300 font-medium">Connecting to domain...</span>
            <span id="progressPercent" class="text-blue-400 font-mono">25%</span>
          </div>
          <div class="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
            <div id="progressBar" class="bg-blue-500 h-1.5 transition-all duration-300 rounded-full" style="width: 25%"></div>
          </div>
        </div>

        <!-- Single Scrape Result Card -->
        <div id="singleResultCard" class="hidden bg-gray-950 rounded-xl p-4 border border-gray-800 space-y-3">
          <div class="flex items-start justify-between">
            <div>
              <div id="resClinicName" class="font-bold text-white text-sm">Med Aesthetics Miami</div>
              <div id="resCity" class="text-[11px] text-gray-400">Miami, FL</div>
            </div>
            <span id="resPixelBadge" class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              ✓ Meta Ads Active
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs border-t border-gray-800/80 pt-2.5">
            <div>
              <span class="text-gray-500 text-[10px] uppercase font-semibold">Doctor / Lead</span>
              <div id="resDoctor" class="text-gray-200 font-medium">Dr. Carlos Riveros</div>
            </div>
            <div>
              <span class="text-gray-500 text-[10px] uppercase font-semibold">Direct Email</span>
              <div id="resEmail" class="text-blue-400 font-mono truncate">coralgables@...</div>
            </div>
            <div>
              <span class="text-gray-500 text-[10px] uppercase font-semibold">Procedure / Service</span>
              <div id="resTreatment" class="text-purple-300 font-medium">Morpheus8</div>
            </div>
            <div>
              <span class="text-gray-500 text-[10px] uppercase font-semibold">Front Desk Phone</span>
              <div id="resPhone" class="text-gray-300 font-mono">(305) 356-7402</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bulk Ingestion Studio (Meta Ads Library) -->
      <div class="glass-card rounded-2xl p-6 space-y-5 shadow-xl">
        <div class="flex items-center justify-between border-b border-gray-800/80 pb-3">
          <div>
            <div class="text-[10px] font-mono uppercase tracking-wider text-gray-400">Bulk Meta Ad Ingestion</div>
            <h2 class="text-sm font-bold text-white mt-0.5">Paste Up to 15 Ad Spender Domains</h2>
          </div>
          <a href="https://www.facebook.com/ads/library/?country=US&q=MedSpa%20Miami" target="_blank" class="text-[11px] text-blue-400 hover:underline flex items-center gap-1">
            <span>Meta Ads Library</span>
            <span>↗</span>
          </a>
        </div>

        <div class="space-y-3">
          <textarea 
            id="bulkUrls" 
            rows="5" 
            placeholder="https://clinic1.com&#10;https://clinic2.com&#10;https://clinic3.com" 
            class="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono leading-relaxed"
          ></textarea>

          <div class="flex items-center justify-between pt-1">
            <span class="text-[11px] text-gray-500">Auto-applies 1.2s anti-rate-limit jitter</span>
            <button 
              onclick="scrapeBulk()" 
              id="btnBulk" 
              class="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
            >
              <span>🚀</span>
              <span>Start Bulk Ingestion</span>
            </button>
          </div>

          <div id="bulkResult" class="hidden text-xs bg-gray-950 p-3.5 rounded-xl border border-gray-800 font-mono max-h-40 overflow-y-auto"></div>
        </div>
      </div>

    </div>

  </main>

  <script>
    function setPreset(url) {
      document.getElementById('singleUrl').value = url;
      scrapeSingle();
    }

    function setHuntPreset(city) {
      document.getElementById('huntCity').value = city;
    }

    function updateNicheDefaults() {
      const niche = document.getElementById('huntNiche').value;
      if (niche === 'hvac') {
        document.getElementById('huntCity').value = 'Phoenix, AZ';
      } else {
        document.getElementById('huntCity').value = 'Miami, FL';
      }
    }

    async function runAutonomousHuntClient() {
      const niche = document.getElementById('huntNiche').value;
      const city = document.getElementById('huntCity').value.trim();
      const limit = document.getElementById('huntLimit').value;
      const btn = document.getElementById('btnLaunchHunter');
      const consoleBox = document.getElementById('huntConsole');
      const statusText = document.getElementById('huntConsoleStatus');
      const timerEl = document.getElementById('huntTimer');
      const bar = document.getElementById('huntProgressBar');
      const resultsContainer = document.getElementById('hunterResultsContainer');
      const cardsList = document.getElementById('hunterCardsList');
      const statsBadge = document.getElementById('hunterStatsBadge');

      btn.disabled = true;
      btn.innerHTML = '<span>⏳ Hunting...</span>';
      consoleBox.classList.remove('hidden');
      resultsContainer.classList.add('hidden');
      cardsList.innerHTML = '';

      let seconds = 0;
      const timerInterval = setInterval(() => {
        seconds += 0.5;
        timerEl.innerText = seconds.toFixed(1) + 's';
      }, 500);

      bar.style.width = '20%';
      statusText.innerText = 'Searching DuckDuckGo for top-ranked ' + niche + ' practices in ' + city + '...';

      setTimeout(() => {
        bar.style.width = '45%';
        statusText.innerText = 'Extracting decision-makers, checking Meta Pixels & phone numbers...';
      }, 2500);

      setTimeout(() => {
        bar.style.width = '75%';
        statusText.innerText = 'Running Jina AI Reader to diagnose booking friction & after-hours gaps...';
      }, 5500);

      try {
        const res = await fetch('/scraper/hunt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city, niche, limit })
        });
        const data = await res.json();

        clearInterval(timerInterval);
        btn.disabled = false;
        btn.innerHTML = '<span>🚀</span><span>Launch Hunter</span>';
        bar.style.width = '100%';
        statusText.innerText = 'Hunt complete! ' + (data.leads ? data.leads.length : 0) + ' businesses processed.';

        if (data.leads && data.leads.length > 0) {
          statsBadge.innerText = data.committedCount + ' Committed to Supabase';
          cardsList.innerHTML = data.leads.map(lead => {
            const hasHook = lead.specificObservation;
            const badgeClass = lead.dbStatus === 'saved'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : lead.dbStatus === 'duplicate'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'bg-gray-800 text-gray-400';
            const badgeText = lead.dbStatus === 'saved' ? '✓ Saved to CRM' : lead.dbStatus === 'duplicate' ? 'Already in CRM' : 'No Email';

            let hookHtml = '';
            if (hasHook) {
              hookHtml = '<div class="bg-blue-950/30 border border-blue-500/20 rounded-lg p-2.5 text-[11px] text-blue-200 space-y-1">' +
                '<div class="font-semibold text-blue-400 flex items-center gap-1"><span>💡 The Auditor Observation:</span></div>' +
                '<p class="italic text-gray-300">\\"' + (lead.specificObservation || '') + '\\"</p></div>';
            }

            return '<div class="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-3">' +
              '<div class="flex items-start justify-between">' +
                '<div>' +
                  '<h4 class="font-bold text-white text-sm">' + (lead.clinicName || 'Practice') + '</h4>' +
                  '<p class="text-[11px] text-gray-400">' + (lead.doctorName || 'Lead') + ' • ' + (lead.city || city) + '</p>' +
                '</div>' +
                '<span class="text-[10px] font-semibold px-2 py-0.5 rounded ' + badgeClass + '">' + badgeText + '</span>' +
              '</div>' +
              '<div class="text-xs space-y-1.5 border-t border-gray-800/60 pt-2.5">' +
                '<div class="flex items-center justify-between text-gray-400"><span>Email:</span><span class="text-blue-400 font-mono truncate max-w-[200px]">' + (lead.email || 'None found') + '</span></div>' +
                '<div class="flex items-center justify-between text-gray-400"><span>Phone:</span><span class="text-gray-300 font-mono">' + (lead.phone || 'N/A') + '</span></div>' +
                '<div class="flex items-center justify-between text-gray-400"><span>Procedure / Service:</span><span class="text-purple-300 font-medium">' + (lead.treatment || 'High-Ticket') + '</span></div>' +
              '</div>' +
              hookHtml +
              '<div class="pt-2 border-t border-gray-800/60 flex items-center justify-between text-[11px]">' +
                '<a href="/outreach/preview" target="_blank" class="text-blue-400 hover:underline">Preview Harvey Email →</a>' +
                '<a href="' + (lead.url || '#') + '" target="_blank" class="text-gray-500 hover:text-gray-300">Visit Site ↗</a>' +
              '</div>' +
            '</div>';
          }).join('');

          resultsContainer.classList.remove('hidden');
        } else {
          alert('Hunt completed, but no direct clinic sites were parsed. Try a different city or query.');
        }

      } catch (err) {
        clearInterval(timerInterval);
        btn.disabled = false;
        btn.innerHTML = '<span>🚀</span><span>Launch Hunter</span>';
        alert('Hunt failed: ' + err.message);
      }
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
        btn.innerHTML = '<span>⚡</span><span>Scrape & Audit</span>';

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
        btn.innerHTML = '<span>⚡</span><span>Scrape & Audit</span>';
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
        btn.innerHTML = '<span>🚀</span><span>Start Bulk Ingestion</span>';
        resBox.innerText = JSON.stringify(data, null, 2);
      } catch (e) {
        btn.disabled = false;
        btn.innerHTML = '<span>🚀</span><span>Start Bulk Ingestion</span>';
        resBox.innerText = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>`);
});
