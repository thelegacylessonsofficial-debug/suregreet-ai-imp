import { Router } from 'express';
import { scrapeClinicWebsite, scrapeAndIngestLead, scrapeBulkLeads } from '../services/scraperService.js';
import { runAutonomousHunt, huntAndEnrichLead, commitLeadToSupabase } from '../services/leadHunterService.js';
import { runDigitalAudit, auditAndSaveProspect } from '../services/auditorService.js';
import { getProspects, deleteProspect } from '../services/outreachService.js';
import { renderSaasShell, getSvgIcon } from '../views/saasLayout.js';

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
      limit: Math.min(Math.max(Number(limit) || 5, 1), 25),
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

// 6. Delete / Remove Lead Route
scraperRouter.post(['/lead/delete', '/remove'], async (req, res) => {
  const { prospectId, email, url } = req.body || {};
  const target = prospectId || email || url;
  if (!target) {
    return res.status(400).json({ status: 'error', message: 'Field "prospectId" or "email" is required' });
  }

  try {
    const result = await deleteProspect(target);
    if (result.success) {
      res.json({ status: 'success', message: 'Lead permanently removed from database', deleted: result.deleted });
    } else {
      res.status(400).json({ status: 'error', message: result.error || 'Failed to remove lead' });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 7. Standalone Web Dashboard for Lead Hunting, Scraping & Auditing
scraperRouter.get('/dashboard', async (req, res) => {
  const authKey = req.query.key || '';

  const bodyContent = `
    <!-- Top Hero Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
      <div>
        <div class="flex items-center space-x-2">
          <h2 class="text-lg font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <span>Lead Hunter & Diagnostic Auditor Studio</span>
          </h2>
          <span class="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
            Pillars 1 & 2 Active
          </span>
        </div>
        <p class="text-xs text-[var(--text-secondary)] mt-1">Autonomous Business Sourcing • Jina AI Digital Diagnostics • Meta Pixel Verification • Supabase Sync</p>
      </div>

      <div class="flex items-center space-x-3">
        <a href="/outreach/prospects" class="text-xs bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] px-4 py-2 rounded-xl transition flex items-center gap-1.5 font-semibold">
          <span>View Pipeline CRM</span>
          ${getSvgIcon('external', 'w-3 h-3 text-[var(--text-muted)]')}
        </a>
      </div>
    </div>

    <!-- PILLAR 1 & 2: THE AUTONOMOUS LEAD HUNTER & AUDITOR -->
    <div class="bg-[var(--bg-card)] rounded-2xl p-6 sm:p-7 space-y-6 shadow-2xl border border-[var(--border-subtle)] border-l-4 border-l-cyan-500">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <span class="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold">Pillars 1 & 2 • Autonomous Sourcing</span>
          <h3 class="text-base sm:text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 mt-0.5">
            <span>The Autonomous Lead Hunter & Diagnostic Auditor</span>
          </h3>
          <p class="text-xs text-[var(--text-secondary)] mt-0.5">Zero-cost search engine extraction + Jina AI Reader analysis for speed-to-lead and booking friction gaps.</p>
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
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Target Niche</label>
          <select id="huntNiche" onchange="updateNicheDefaults()" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 font-medium">
            <option value="medspa">High-Ticket MedSpas & Aesthetic Clinics</option>
            <option value="hvac">Emergency HVAC & Plumbing Contractors</option>
          </select>
        </div>

        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Target US Metro / City</label>
          <input id="huntCity" type="text" value="Miami, FL" onkeydown="if(event.key==='Enter') runAutonomousHuntClient()" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 font-medium" placeholder="e.g. Austin, TX or Phoenix, AZ">
        </div>

        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Batch Extraction Size</label>
          <div class="flex gap-2">
            <select id="huntLimit" class="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-cyan-300 focus:outline-none focus:border-cyan-500 font-mono font-bold">
              <option value="5">5 Qualified Leads</option>
              <option value="10">10 Qualified Leads</option>
              <option value="15">15 Qualified Leads</option>
              <option value="20" selected>20 Qualified Leads (Max Batch)</option>
            </select>
            <button onclick="runAutonomousHuntClient()" id="btnLaunchHunter" type="button" class="bg-cyan-500 hover:opacity-90 text-black font-bold text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 active:scale-95 cursor-pointer">
              ${getSvgIcon('bolt', 'w-4 h-4')}
              <span>Launch Hunter</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Quick Preset City Badges & Regional Directory (20+ Top US Metros) -->
      <div class="space-y-2.5 pt-1">
        <div class="flex items-center gap-2 flex-wrap text-xs">
          <span class="text-[var(--text-muted)] text-[11px] font-semibold">Top US Markets:</span>
          <button type="button" onclick="setHuntPreset('Miami, FL', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 font-bold transition flex items-center gap-1 shadow-sm shadow-cyan-500/10 active cursor-pointer">
            <span>📍 Miami, FL</span>
          </button>
          <button type="button" onclick="setHuntPreset('Dallas, TX', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Dallas, TX</span>
          </button>
          <button type="button" onclick="setHuntPreset('Houston, TX', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Houston, TX</span>
          </button>
          <button type="button" onclick="setHuntPreset('Austin, TX', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Austin, TX</span>
          </button>
          <button type="button" onclick="setHuntPreset('Phoenix, AZ', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Phoenix, AZ</span>
          </button>
          <button type="button" onclick="setHuntPreset('Atlanta, GA', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Atlanta, GA</span>
          </button>
          <button type="button" onclick="setHuntPreset('Los Angeles, CA', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Los Angeles, CA</span>
          </button>
          <button type="button" onclick="setHuntPreset('San Diego, CA', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 San Diego, CA</span>
          </button>
          <button type="button" onclick="setHuntPreset('San Francisco, CA', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 San Francisco, CA</span>
          </button>
          <button type="button" onclick="setHuntPreset('Las Vegas, NV', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Las Vegas, NV</span>
          </button>
          <button type="button" onclick="setHuntPreset('Seattle, WA', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Seattle, WA</span>
          </button>
          <button type="button" onclick="setHuntPreset('Denver, CO', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Denver, CO</span>
          </button>
          <button type="button" onclick="setHuntPreset('Orlando, FL', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Orlando, FL</span>
          </button>
          <button type="button" onclick="setHuntPreset('Tampa, FL', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Tampa, FL</span>
          </button>
          <button type="button" onclick="setHuntPreset('Nashville, TN', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Nashville, TN</span>
          </button>
          <button type="button" onclick="setHuntPreset('Charlotte, NC', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Charlotte, NC</span>
          </button>
          <button type="button" onclick="setHuntPreset('Chicago, IL', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Chicago, IL</span>
          </button>
          <button type="button" onclick="setHuntPreset('Boston, MA', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Boston, MA</span>
          </button>
          <button type="button" onclick="setHuntPreset('Philadelphia, PA', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Philadelphia, PA</span>
          </button>
          <button type="button" onclick="setHuntPreset('New York, NY', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 New York, NY</span>
          </button>
          <button type="button" onclick="setHuntPreset('Washington, DC', this)" class="market-preset-btn px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1 cursor-pointer">
            <span>📍 Washington, DC</span>
          </button>
        </div>

        <div class="flex items-center gap-2 pt-0.5">
          <span class="text-[var(--text-muted)] text-[11px] font-semibold">Regional Directory:</span>
          <select id="marketQuickPicker" onchange="setHuntPreset(this.value)" class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-semibold rounded-xl px-3 py-1.5 text-cyan-300 focus:outline-none focus:border-cyan-500 transition cursor-pointer">
            <option value="" disabled selected>— Select from 20+ High-Ticket US Metros —</option>
            <optgroup label="Florida & Southeast (Sunbelt Capital)">
              <option value="Miami, FL">Miami, FL (Aesthetics & Surgery Capital)</option>
              <option value="Orlando, FL">Orlando, FL (Central Florida)</option>
              <option value="Tampa, FL">Tampa, FL (Gulf Coast)</option>
              <option value="Atlanta, GA">Atlanta, GA (Buckhead / Metro)</option>
              <option value="Nashville, TN">Nashville, TN (High-Growth Healthcare)</option>
              <option value="Charlotte, NC">Charlotte, NC (Rapid Expansion)</option>
            </optgroup>
            <optgroup label="Texas Corridor (High-Density Private Practices)">
              <option value="Dallas, TX">Dallas / Fort Worth, TX (High Net-Worth)</option>
              <option value="Houston, TX">Houston, TX (Galleria / River Oaks)</option>
              <option value="Austin, TX">Austin, TX (Tech / Rapid Growth)</option>
            </optgroup>
            <optgroup label="West Coast & Mountain (PST / MST)">
              <option value="Los Angeles, CA">Los Angeles / Beverly Hills, CA (Premier Aesthetic Capital)</option>
              <option value="San Diego, CA">San Diego, CA (Coastal Private Practices)</option>
              <option value="San Francisco, CA">San Francisco / Bay Area, CA (High Ticket)</option>
              <option value="Las Vegas, NV">Las Vegas, NV (Tourism & Aesthetic Medical)</option>
              <option value="Phoenix, AZ">Phoenix / Scottsdale, AZ (Year-Round Aesthetic Hub)</option>
              <option value="Seattle, WA">Seattle, WA (Pacific Northwest Capital)</option>
              <option value="Denver, CO">Denver, CO (Cherry Creek / Metro)</option>
            </optgroup>
            <optgroup label="Midwest, Mid-Atlantic & Northeast (EST / CST)">
              <option value="Chicago, IL">Chicago, IL (Gold Coast / Mag Mile)</option>
              <option value="New York, NY">New York, NY (Manhattan / TriBeCa)</option>
              <option value="Boston, MA">Boston, MA (Back Bay / Cambridge)</option>
              <option value="Philadelphia, PA">Philadelphia, PA (Main Line / Center City)</option>
              <option value="Washington, DC">Washington, DC (Capitol Region)</option>
            </optgroup>
          </select>
        </div>
      </div>

      <!-- Live Hunting Status Console -->
      <div id="huntConsole" class="hidden bg-[var(--bg-surface)] rounded-xl p-4 border border-[var(--border-subtle)] space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-cyan-400 font-mono font-medium flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-cyan-400 pulse-dot"></span>
            <span id="huntConsoleStatus">Searching local business registries...</span>
          </span>
          <span id="huntTimer" class="text-[var(--text-muted)] font-mono text-[11px]">0.0s</span>
        </div>
        <div class="w-full bg-[var(--bg-card)] rounded-full h-1.5 overflow-hidden">
          <div id="huntProgressBar" class="bg-cyan-500 h-1.5 transition-all duration-500 rounded-full" style="width: 15%"></div>
        </div>
      </div>

      <!-- Hunter Results Grid -->
      <div id="hunterResultsContainer" class="hidden space-y-3 pt-2">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">Enriched & Audited Leads</h4>
          <span id="hunterStatsBadge" class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"></span>
        </div>
        <div id="hunterCardsList" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
      </div>
    </div>

    <!-- PILLAR 1 MANUAL TOOLS: SINGLE DOMAIN EXTRACTION & BULK INGESTION -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- Single URL Box -->
      <div class="bg-[var(--bg-card)] rounded-2xl p-6 space-y-5 shadow-xl border border-[var(--border-subtle)]">
        <div class="border-b border-[var(--border-subtle)] pb-3">
          <div class="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Manual Scout Routine</div>
          <h3 class="text-sm font-bold text-[var(--text-primary)] mt-0.5">Single Clinic Deep Extraction</h3>
        </div>

        <div class="space-y-3">
          <div class="flex gap-2">
            <input 
              id="singleUrl" 
              type="url" 
              placeholder="https://clinicname.com" 
              class="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-cyan-500 transition font-mono"
            >
            <button 
              onclick="scrapeSingle()" 
              id="btnSingle" 
              class="bg-cyan-500 hover:opacity-90 text-black font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-cyan-500/20 shrink-0"
            >
              ${getSvgIcon('bolt', 'w-4 h-4')}
              <span>Scrape & Audit</span>
            </button>
          </div>

          <!-- Quick Test Presets -->
          <div class="flex items-center gap-1.5 flex-wrap text-xs">
            <span class="text-[var(--text-muted)] text-[11px]">Quick presets:</span>
            <button onclick="setPreset('https://vitalyc.com')" class="px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition text-[11px]">Vitalyc (Dallas)</button>
            <button onclick="setPreset('https://ellemesmedspa.com')" class="px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition text-[11px]">ELLEMES (Atlanta)</button>
          </div>
        </div>

        <!-- Extraction Progress Card -->
        <div id="scrapeProgress" class="hidden bg-[var(--bg-surface)] rounded-xl p-4 border border-[var(--border-subtle)] space-y-3">
          <div class="flex items-center justify-between text-xs">
            <span id="progressText" class="text-[var(--text-primary)] font-medium">Connecting to domain...</span>
            <span id="progressPercent" class="text-cyan-400 font-mono">25%</span>
          </div>
          <div class="w-full bg-[var(--bg-card)] rounded-full h-1.5 overflow-hidden">
            <div id="progressBar" class="bg-cyan-500 h-1.5 transition-all duration-300 rounded-full" style="width: 25%"></div>
          </div>
        </div>

        <!-- Single Scrape Result Card -->
        <div id="singleResultCard" class="hidden bg-[var(--bg-surface)] rounded-xl p-4 border border-[var(--border-subtle)] space-y-3">
          <div class="flex items-start justify-between">
            <div>
              <div id="resClinicName" class="font-bold text-[var(--text-primary)] text-sm">Med Aesthetics Miami</div>
              <div id="resCity" class="text-[11px] text-[var(--text-muted)]">Miami, FL</div>
            </div>
            <span id="resPixelBadge" class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              ✓ Meta Ads Active
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs border-t border-[var(--border-subtle)] pt-2.5">
            <div>
              <span class="text-[var(--text-muted)] text-[10px] uppercase font-semibold">Doctor / Lead</span>
              <div id="resDoctor" class="text-[var(--text-primary)] font-medium">Dr. Carlos Riveros</div>
            </div>
            <div>
              <span class="text-[var(--text-muted)] text-[10px] uppercase font-semibold">Procedure / Service</span>
              <div id="resTreatment" class="text-purple-300 font-medium">Morpheus8</div>
            </div>
            <div>
              <span class="text-[var(--text-muted)] text-[10px] uppercase font-semibold">Front Desk Phone</span>
              <div id="resPhone" class="text-[var(--text-primary)] font-mono font-bold">(305) 356-7402</div>
            </div>
            <div>
              <span class="text-[var(--text-muted)] text-[10px] uppercase font-semibold">Direct Email</span>
              <div id="resEmail" class="text-cyan-400 font-mono truncate">coralgables@...</div>
            </div>
          </div>

          <div class="border-t border-[var(--border-subtle)] pt-2.5 flex items-center justify-between">
            <span class="text-[10px] text-[var(--text-muted)]">Saved in Supabase CRM</span>
            <button onclick="removeSingleScrapedLead()" class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-semibold transition flex items-center gap-1" title="Remove this lead from CRM database">
              ${getSvgIcon('trash', 'w-3 h-3')}
              <span>Remove from CRM</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Bulk Ingestion Studio (Meta Ads Library) -->
      <div class="bg-[var(--bg-card)] rounded-2xl p-6 space-y-5 shadow-xl border border-[var(--border-subtle)]">
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div>
            <div class="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Bulk Meta Ad Ingestion</div>
            <h3 class="text-sm font-bold text-[var(--text-primary)] mt-0.5">Paste Up to 15 Ad Spender Domains</h3>
          </div>
          <a href="https://www.facebook.com/ads/library/?country=US&q=MedSpa%20Miami" target="_blank" class="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 font-semibold">
            <span>Meta Ads Library</span>
            ${getSvgIcon('external', 'w-3 h-3')}
          </a>
        </div>

        <div class="space-y-3">
          <textarea 
            id="bulkUrls" 
            rows="5" 
            placeholder="https://clinic1.com&#10;https://clinic2.com&#10;https://clinic3.com" 
            class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-cyan-500 font-mono leading-relaxed"
          ></textarea>

          <div class="flex items-center justify-between pt-1">
            <span class="text-[11px] text-[var(--text-muted)]">Auto-applies 1.2s anti-rate-limit jitter</span>
            <button 
              onclick="scrapeBulk()" 
              id="btnBulk" 
              class="bg-emerald-500 hover:opacity-90 text-black font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
            >
              ${getSvgIcon('play', 'w-4 h-4')}
              <span>Start Bulk Ingestion</span>
            </button>
          </div>

          <div id="bulkResult" class="hidden text-xs bg-[var(--bg-surface)] p-3.5 rounded-xl border border-[var(--border-subtle)] font-mono max-h-40 overflow-y-auto"></div>
        </div>
      </div>

    </div>
  `;

  const extraScripts = `
    <script>
      function setPreset(url) {
        document.getElementById('singleUrl').value = url;
        scrapeSingle();
      }

      function setHuntPreset(city, btnEl) {
        if (!city) return;
        document.getElementById('huntCity').value = city;

        // Visual selection indicator on preset badges
        let matchedBtn = btnEl;
        document.querySelectorAll('.market-preset-btn').forEach(btn => {
          btn.classList.remove('bg-cyan-500/15', 'text-cyan-300', 'border-cyan-500/40', 'font-bold', 'shadow-sm', 'shadow-cyan-500/10', 'active');
          btn.classList.add('bg-[var(--bg-surface)]', 'text-[var(--text-secondary)]', 'border-[var(--border-subtle)]', 'font-medium');
          if (!matchedBtn && btn.innerText.toLowerCase().includes(city.split(',')[0].toLowerCase())) {
            matchedBtn = btn;
          }
        });

        if (matchedBtn) {
          matchedBtn.classList.remove('bg-[var(--bg-surface)]', 'text-[var(--text-secondary)]', 'border-[var(--border-subtle)]', 'font-medium');
          matchedBtn.classList.add('bg-cyan-500/15', 'text-cyan-300', 'border-cyan-500/40', 'font-bold', 'shadow-sm', 'shadow-cyan-500/10', 'active');
        }

        const picker = document.getElementById('marketQuickPicker');
        if (picker && picker.value !== city) {
          picker.value = city;
        }

        showToast('Market Selected', 'Ready to hunt ' + city + '. Click Launch Hunter or press Enter.', 'info');
      }

      function updateNicheDefaults() {
        const niche = document.getElementById('huntNiche').value;
        const targetCity = niche === 'hvac' ? 'Phoenix, AZ' : 'Miami, FL';
        document.getElementById('huntCity').value = targetCity;

        // Auto update active button
        document.querySelectorAll('.market-preset-btn').forEach(btn => {
          if (btn.innerText.includes(targetCity.split(',')[0])) {
            setHuntPreset(targetCity, btn);
          }
        });
      }

      async function safeFetchJson(url, options = {}) {
        const fullUrl = getAuthUrl(url);
        const res = await fetch(fullUrl, {
          ...options,
          credentials: 'include',
          headers: getAuthHeaders(options.headers || {})
        });

        if (!res.ok) {
          let errMessage = 'Request failed (HTTP ' + res.status + ')';
          try {
            const errData = await res.json();
            errMessage = errData.message || errData.error || errMessage;
          } catch (e) {
            if (res.status === 401) {
              errMessage = 'Authentication required. Please refresh this page and log in (admin / suregreet2026!).';
            }
          }
          throw new Error(errMessage);
        }
        return await res.json();
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

        bar.style.width = '30%';
        statusText.innerText = 'Sourcing top-tier verified domains in ' + city + ' (' + niche + ')...';

        const step1 = setTimeout(() => {
          bar.style.width = '65%';
          statusText.innerText = 'Extracting decision-makers, direct phones & ad spend in parallel...';
        }, 1200);

        const step2 = setTimeout(() => {
          bar.style.width = '85%';
          statusText.innerText = 'Running speed-to-lead audit & diagnosing after-hours booking friction...';
        }, 2800);

        try {
          const data = await safeFetchJson('/scraper/hunt', {
            method: 'POST',
            body: JSON.stringify({ city, niche, limit })
          });

          bar.style.width = '100%';
          statusText.innerText = 'Hunt complete! ' + (data.leads ? data.leads.length : 0) + ' businesses processed.';

          if (data.leads && data.leads.length > 0) {
            statsBadge.innerText = data.committedCount + ' Committed to Supabase';

            const crmUrl = getAuthUrl('/outreach/prospects');
            let bannerHtml = '<div class="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 shadow-lg">' +
              '<div>' +
                '<div class="flex items-center gap-2">' +
                  '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>' +
                  '<h4 class="text-sm font-bold text-white">' + data.committedCount + ' New Leads Committed to Pipeline CRM</h4>' +
                '</div>' +
                '<p class="text-xs text-gray-400 mt-0.5">Leads are saved in Supabase as pending. Open the CRM to review doctor observations or trigger outreach.</p>' +
              '</div>' +
              '<a href="' + crmUrl + '" class="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl text-xs transition shadow-md shadow-emerald-500/20 whitespace-nowrap flex items-center gap-1.5">' +
                '<span>View in Pipeline CRM</span>' +
                '<span>→</span>' +
              '</a>' +
            '</div>';

            cardsList.innerHTML = bannerHtml + data.leads.map(lead => {
              const hasHook = lead.specificObservation;
              const badgeClass = lead.dbStatus === 'saved'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : lead.dbStatus === 'duplicate'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-gray-800 text-gray-400';
              const badgeText = lead.dbStatus === 'saved' ? '✓ Saved to CRM' : lead.dbStatus === 'duplicate' ? 'Already in CRM' : 'No Email';

              let hookHtml = '';
              if (hasHook) {
                hookHtml = '<div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-2.5 text-[11px] space-y-1">' +
                  '<div class="font-semibold text-cyan-400 flex items-center gap-1"><span>💡 Auditor Observation:</span></div>' +
                  '<p class="italic text-[var(--text-secondary)]">\\"' + (lead.specificObservation || '') + '\\"</p></div>';
              }

              return '<div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-3 hunter-card">' +
                '<div class="flex items-start justify-between">' +
                  '<div>' +
                    '<h4 class="font-bold text-[var(--text-primary)] text-sm">' + (lead.clinicName || 'Practice') + '</h4>' +
                    '<p class="text-[11px] text-[var(--text-muted)]">' + (lead.doctorName || 'Lead') + ' • ' + (lead.city || city) + '</p>' +
                  '</div>' +
                  '<div class="flex items-center gap-1.5">' +
                    '<span class="text-[10px] font-semibold px-2 py-0.5 rounded ' + badgeClass + '">' + badgeText + '</span>' +
                    '<button onclick="removeHuntedLead(this, \'' + (lead.email || '') + '\', \'' + (lead.clinicName || 'Lead').replace(/'/g, "\\\\'") + '\')" class="p-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] transition cursor-pointer" title="Remove lead from database">' +
                      '${getSvgIcon('trash', 'w-3 h-3')}' +
                    '</button>' +
                  '</div>' +
                '</div>' +
                '<div class="text-xs space-y-2 border-t border-[var(--border-subtle)] pt-2.5">' +
                  '<div class="flex items-center justify-between gap-2 p-2 rounded-xl bg-[var(--bg-card)]/60 border border-[var(--border-subtle)]/70 text-[11px]">' +
                    '<div class="flex items-center gap-1.5 font-mono text-[var(--text-primary)] font-bold">' +
                      '<span>📞</span>' +
                      (lead.phone ? '<a href="tel:' + String(lead.phone).replace(/[^0-9+]/g, '') + '" class="hover:text-emerald-400 transition" title="Click to dial">' + lead.phone + '</a>' : '<span class="text-[var(--text-muted)] italic font-normal">No phone</span>') +
                    '</div>' +
                    '<div class="flex items-center gap-1.5 font-mono text-cyan-400">' +
                      '<span>✉️</span>' +
                      (lead.email ? '<a href="mailto:' + lead.email + '" class="hover:underline truncate max-w-[190px]" title="Click to email ' + lead.email + '">' + lead.email + '</a>' : '<span class="text-[var(--text-muted)] italic">No email</span>') +
                    '</div>' +
                  '</div>' +
                  '<div class="flex items-center justify-between text-[var(--text-muted)] text-[11px]"><span>Procedure:</span><span class="text-purple-300 font-medium">' + (lead.treatment || 'High-Ticket') + '</span></div>' +
                '</div>' +
                hookHtml +
                '<div class="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">' +
                  '<a href="' + getAuthUrl('/outreach/preview') + '" target="_blank" class="text-cyan-400 hover:underline">Preview Harvey Email →</a>' +
                  '<a href="' + (lead.url || '#') + '" target="_blank" class="text-[var(--text-muted)] hover:text-[var(--text-primary)]">Visit Site ↗</a>' +
                '</div>' +
              '</div>';
            }).join('');

            resultsContainer.classList.remove('hidden');
            showToast('Hunt Complete', data.committedCount + ' leads committed to Supabase', 'success');
          } else {
            showToast('No New Leads', data.message || 'All target domains in this market are already in your CRM.', 'info');
          }

        } catch (err) {
          showToast('Hunt Error', err.message, 'error');
        } finally {
          clearInterval(timerInterval);
          clearTimeout(step1);
          clearTimeout(step2);
          btn.disabled = false;
          btn.innerHTML = '${getSvgIcon('bolt', 'w-4 h-4')}<span>Launch Hunter</span>';
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
          const data = await safeFetchJson('/scraper/ingest', {
            method: 'POST',
            body: JSON.stringify({ url })
          });
          clearInterval(progressInterval);
          bar.style.width = '100%';
          percent.innerText = '100%';
          text.innerText = 'Extraction complete!';

          btn.disabled = false;
          btn.innerHTML = '${getSvgIcon('bolt', 'w-4 h-4')}<span>Scrape & Audit</span>';

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
              showToast('Lead Sourced', d.clinicName + ' audited and saved.', 'success');
            } else {
              showToast('Scrape Warning', data.message || 'No direct email found.', 'warning');
            }
          }, 400);

        } catch (err) {
          clearInterval(progressInterval);
          btn.disabled = false;
          btn.innerHTML = '${getSvgIcon('bolt', 'w-4 h-4')}<span>Scrape & Audit</span>';
          progress.classList.add('hidden');
          showToast('Extraction Failed', err.message, 'error');
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
          const data = await safeFetchJson('/scraper/bulk', {
            method: 'POST',
            body: JSON.stringify({ urls: text })
          });
          btn.disabled = false;
          btn.innerHTML = '${getSvgIcon('play', 'w-4 h-4')}<span>Start Bulk Ingestion</span>';
          resBox.innerText = JSON.stringify(data, null, 2);
          showToast('Bulk Ingestion Finished', 'Processed domains successfully.', 'success');
        } catch (e) {
          btn.disabled = false;
          btn.innerHTML = '${getSvgIcon('play', 'w-4 h-4')}<span>Start Bulk Ingestion</span>';
          resBox.innerText = 'Error: ' + e.message;
          showToast('Bulk Error', e.message, 'error');
        }
      }

      async function removeHuntedLead(btnEl, email, clinicName) {
        if (!email) {
          const card = btnEl.closest('.hunter-card');
          if (card) card.remove();
          return;
        }
        if (!confirm('Permanently remove ' + clinicName + ' from the database?')) return;
        const card = btnEl.closest('.hunter-card');
        try {
          const data = await safeFetchJson('/scraper/lead/delete', {
            method: 'POST',
            body: JSON.stringify({ email })
          });
          if (data.status === 'success') {
            showToast('Lead Deleted', clinicName + ' removed from database.', 'success');
            if (card) {
              card.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
              card.style.opacity = '0';
              card.style.transform = 'scale(0.95)';
              setTimeout(() => card.remove(), 300);
            }
          } else {
            showToast('Delete Failed', data.message || 'Error deleting lead', 'error');
          }
        } catch (e) {
          showToast('Error', e.message, 'error');
        }
      }

      async function removeSingleScrapedLead() {
        const email = document.getElementById('resEmail').innerText.trim();
        const clinic = document.getElementById('resClinicName').innerText.trim();
        if (!email || email === 'None') return;
        if (!confirm('Permanently delete ' + clinic + ' from the database?')) return;
        try {
          const data = await safeFetchJson('/scraper/lead/delete', {
            method: 'POST',
            body: JSON.stringify({ email })
          });
          if (data.status === 'success') {
            showToast('Lead Deleted', clinic + ' removed from CRM.', 'success');
            document.getElementById('singleResultCard').classList.add('hidden');
          } else {
            showToast('Delete Failed', data.message || 'Error', 'error');
          }
        } catch (e) {
          showToast('Error', e.message, 'error');
        }
      }
    </script>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(
    renderSaasShell({
      title: 'SureGreet AI — Lead Hunter & Digital Auditor Studio',
      activeNav: 'scraper',
      pageHeading: 'Lead Hunter & Diagnostic Auditor Studio',
      badgeText: 'Pillars 1 & 2 • $0 Sourcing',
      bodyContent,
      extraScripts,
      authKeyParam: authKey,
    })
  );
});
