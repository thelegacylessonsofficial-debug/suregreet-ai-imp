import { Router } from 'express';
import { scrapeClinicWebsite, scrapeAndIngestLead, scrapeBulkLeads } from '../services/scraperService.js';
import { runAutonomousHunt, huntAndEnrichLead, commitLeadToSupabase, TERRITORY_CASCADE, ORDERED_CASCADE_CITIES, getNextCascadeCity } from '../services/leadHunterService.js';
import { runDigitalAudit, auditAndSaveProspect } from '../services/auditorService.js';
import { getProspects, deleteProspect } from '../services/outreachService.js';
import { renderSaasShell, getSvgIcon } from '../views/saasLayout.js';
import { getShortBusinessName, formatSalutation } from '../templates/outreachTemplates.js';

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
  const keyParam = authKey ? '?key=' + encodeURIComponent(authKey) : '';

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
        <a href="https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&q=HVAC%20Los%20Angeles" id="topMetaAdsBtn" target="_blank" rel="noopener noreferrer" class="text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 font-semibold cursor-pointer" title="Direct Redirection to Live Active Meta Advertisers">
          <span>Meta Ads Library</span>
          ${getSvgIcon('external', 'w-3 h-3 text-cyan-400')}
        </a>
        <a href="/outreach/prospects${keyParam}" class="text-xs bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] px-4 py-2 rounded-xl transition flex items-center gap-1.5 font-semibold">
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
          <p class="text-xs text-[var(--text-secondary)] mt-0.5">Zero-cost search engine extraction + Jina AI Reader analysis for speed-to-lead and after-hours call leak gaps.</p>
        </div>
        <div class="flex items-center gap-2.5 text-xs flex-wrap">
          <a href="https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&q=HVAC%20Los%20Angeles" id="cardMetaAdsBtn" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-cyan-500/10 cursor-pointer" title="Search Active Paid Advertisers in Meta Ads Library">
            <span>Meta Ads Library ↗</span>
          </a>
          <span class="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
            $0 / Month • Zero Scraper Subscriptions
          </span>
        </div>
      </div>

      <!-- Controls: Niche, City, Search Query -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Target Trade Niche</label>
          <select id="huntNiche" onchange="updateNicheDefaults()" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 font-medium">
            <option value="hvac" selected>⚡ Emergency HVAC & AC Repair Contractors (Primary)</option>
            <option value="plumbing">⚡ 24/7 Emergency Plumbing & Drain Cleaning</option>
            <option value="roofing">⚡ Roofing & Emergency Storm Damage Contractors</option>
            <option value="electrical">⚡ 24/7 Emergency Electrician & Generators</option>
            <option value="water_damage">⚡ Water Damage Restoration & Drying</option>
          </select>
        </div>

        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Target US Metro / City</label>
          <input id="huntCity" type="text" value="Los Angeles, CA" onkeydown="if(event.key==='Enter') runAutonomousHuntClient()" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 font-medium" placeholder="e.g. Los Angeles, CA or Phoenix, AZ">
        </div>

        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Batch Extraction Size</label>
          <div class="flex gap-2">
            <select id="huntLimit" class="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-cyan-300 focus:outline-none focus:border-cyan-500 font-mono font-bold">
              <option value="5">5 Qualified Leads</option>
              <option value="10">10 Qualified Leads</option>
              <option value="20">20 Qualified Leads</option>
              <option value="30">30 Qualified Leads (Daily Target)</option>
              <option value="40" selected>40 Qualified Leads (Daily Max)</option>
            </select>
            <button onclick="runAutonomousHuntClient()" id="btnLaunchHunter" type="button" class="bg-cyan-500 hover:opacity-90 text-black font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 active:scale-95 cursor-pointer">
              ${getSvgIcon('bolt', 'w-4 h-4')}
              <span>Launch Hunter</span>
            </button>
            <button onclick="stepNextTerritoryCity()" id="btnNextTerritory" type="button" class="bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-cyan-300 border border-cyan-500/30 font-bold text-xs px-3 py-2.5 rounded-xl transition flex items-center gap-1 shadow-sm cursor-pointer" title="Auto-advance to next territory in sequence (Pacific Top 5 -> Eastern Top 5)">
              <span>Next City ⏭</span>
            </button>
          </div>
        </div>
      </div>

      <!-- SYSTEMATIC TERRITORY CASCADE NAVIGATOR -->
      <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-3.5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)]/70 pb-2.5">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-cyan-400 font-mono uppercase tracking-wider">🎯 Territory Cascade Navigator</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono font-bold">Pacific First → Eastern Second</span>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <span class="text-[11px] text-[var(--text-muted)]">Rule: Top 3–5 Cities per State until Timezone Region Exhausted</span>
          </div>
        </div>

        <!-- Timezone Navigation Tabs -->
        <div class="flex items-center gap-2 overflow-x-auto text-xs pb-1">
          <button type="button" id="tabPacificTz" onclick="switchTerritoryTab('pacific')" class="tz-tab-btn px-3 py-1.5 rounded-xl bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 font-bold transition flex items-center gap-1.5 cursor-pointer">
            <span>⚡ Phase 1: Pacific Timezone (PT)</span>
            <span class="text-[10px] px-1.5 py-0.2 bg-cyan-500/20 rounded font-mono">CA • WA • OR • NV</span>
          </button>
          <button type="button" id="tabEasternTz" onclick="switchTerritoryTab('eastern')" class="tz-tab-btn px-3 py-1.5 rounded-xl bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium transition flex items-center gap-1.5 cursor-pointer">
            <span>⚡ Phase 2: Eastern Timezone (ET)</span>
            <span class="text-[10px] px-1.5 py-0.2 bg-[var(--bg-surface)] rounded font-mono">FL • NY • GA</span>
          </button>
        </div>

        <!-- PACIFIC TIMEZONE CITIES PANEL -->
        <div id="panelPacificTz" class="space-y-3">
          <!-- California -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <span class="text-amber-400">📍</span> California (CA) — Top 5 Priority:
              </span>
              <span class="text-[10px] text-[var(--text-muted)] font-mono">Pop / GDP Ranked</span>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap text-xs">
              <button type="button" onclick="setHuntPreset('Los Angeles, CA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Los Angeles</button>
              <button type="button" onclick="setHuntPreset('San Diego, CA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">San Diego</button>
              <button type="button" onclick="setHuntPreset('San Jose, CA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">San Jose</button>
              <button type="button" onclick="setHuntPreset('San Francisco, CA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">San Francisco</button>
              <button type="button" onclick="setHuntPreset('Fresno, CA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Fresno</button>
            </div>
          </div>

          <!-- Washington -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <span class="text-cyan-400">📍</span> Washington (WA) — Top 5 Priority:
              </span>
              <span class="text-[10px] text-[var(--text-muted)] font-mono">Pop / GDP Ranked</span>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap text-xs">
              <button type="button" onclick="setHuntPreset('Seattle, WA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Seattle</button>
              <button type="button" onclick="setHuntPreset('Spokane, WA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Spokane</button>
              <button type="button" onclick="setHuntPreset('Tacoma, WA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Tacoma</button>
              <button type="button" onclick="setHuntPreset('Vancouver, WA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Vancouver</button>
              <button type="button" onclick="setHuntPreset('Bellevue, WA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Bellevue</button>
            </div>
          </div>

          <!-- Oregon -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <span class="text-emerald-400">📍</span> Oregon (OR) — Top 5 Priority:
              </span>
              <span class="text-[10px] text-[var(--text-muted)] font-mono">Pop / GDP Ranked</span>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap text-xs">
              <button type="button" onclick="setHuntPreset('Portland, OR', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Portland</button>
              <button type="button" onclick="setHuntPreset('Eugene, OR', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Eugene</button>
              <button type="button" onclick="setHuntPreset('Salem, OR', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Salem</button>
              <button type="button" onclick="setHuntPreset('Gresham, OR', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Gresham</button>
              <button type="button" onclick="setHuntPreset('Hillsboro, OR', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Hillsboro</button>
            </div>
          </div>

          <!-- Nevada -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <span class="text-purple-400">📍</span> Nevada (NV) — Top 5 Priority:
              </span>
              <span class="text-[10px] text-[var(--text-muted)] font-mono">Pop / GDP Ranked</span>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap text-xs">
              <button type="button" onclick="setHuntPreset('Las Vegas, NV', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Las Vegas</button>
              <button type="button" onclick="setHuntPreset('Henderson, NV', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Henderson</button>
              <button type="button" onclick="setHuntPreset('North Las Vegas, NV', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">North Las Vegas</button>
              <button type="button" onclick="setHuntPreset('Reno, NV', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Reno</button>
              <button type="button" onclick="setHuntPreset('Sparks, NV', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Sparks</button>
            </div>
          </div>
        </div>

        <!-- EASTERN TIMEZONE CITIES PANEL -->
        <div id="panelEasternTz" class="hidden space-y-3">
          <!-- Florida -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <span class="text-orange-400">📍</span> Florida (FL) — Top 5 Priority:
              </span>
              <span class="text-[10px] text-[var(--text-muted)] font-mono">Pop / GDP Ranked</span>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap text-xs">
              <button type="button" onclick="setHuntPreset('Jacksonville, FL', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Jacksonville</button>
              <button type="button" onclick="setHuntPreset('Miami, FL', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Miami</button>
              <button type="button" onclick="setHuntPreset('Tampa, FL', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Tampa</button>
              <button type="button" onclick="setHuntPreset('Orlando, FL', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Orlando</button>
              <button type="button" onclick="setHuntPreset('St. Petersburg, FL', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">St. Petersburg</button>
            </div>
          </div>

          <!-- New York -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <span class="text-blue-400">📍</span> New York (NY) — Top 5 Priority:
              </span>
              <span class="text-[10px] text-[var(--text-muted)] font-mono">Pop / GDP Ranked</span>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap text-xs">
              <button type="button" onclick="setHuntPreset('New York City, NY', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">New York City</button>
              <button type="button" onclick="setHuntPreset('Buffalo, NY', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Buffalo</button>
              <button type="button" onclick="setHuntPreset('Rochester, NY', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Rochester</button>
              <button type="button" onclick="setHuntPreset('Yonkers, NY', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Yonkers</button>
              <button type="button" onclick="setHuntPreset('Syracuse, NY', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Syracuse</button>
            </div>
          </div>

          <!-- Georgia -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <span class="text-rose-400">📍</span> Georgia (GA) — Top 5 Priority:
              </span>
              <span class="text-[10px] text-[var(--text-muted)] font-mono">Pop / GDP Ranked</span>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap text-xs">
              <button type="button" onclick="setHuntPreset('Atlanta, GA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Atlanta</button>
              <button type="button" onclick="setHuntPreset('Augusta, GA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Augusta</button>
              <button type="button" onclick="setHuntPreset('Columbus, GA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Columbus</button>
              <button type="button" onclick="setHuntPreset('Macon, GA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Macon</button>
              <button type="button" onclick="setHuntPreset('Savannah, GA', this)" class="market-preset-btn px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] transition">Savannah</button>
            </div>
          </div>
        </div>

        <!-- All-Markets Cascade Dropdown -->
        <div class="flex items-center gap-2 pt-1 border-t border-[var(--border-subtle)]/70">
          <span class="text-[var(--text-muted)] text-[11px] font-semibold whitespace-nowrap">All Cascade Markets:</span>
          <select id="marketQuickPicker" onchange="setHuntPreset(this.value)" class="flex-1 bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[11px] font-semibold rounded-xl px-3 py-1.5 text-cyan-300 focus:outline-none focus:border-cyan-500 transition cursor-pointer">
            <option value="" disabled selected>— Select from Systematic Cascade (Pacific & Eastern) —</option>
            <optgroup label="PACIFIC — CALIFORNIA (CA) TOP 5">
              <option value="Los Angeles, CA">Los Angeles, CA</option>
              <option value="San Diego, CA">San Diego, CA</option>
              <option value="San Jose, CA">San Jose, CA</option>
              <option value="San Francisco, CA">San Francisco, CA</option>
              <option value="Fresno, CA">Fresno, CA</option>
            </optgroup>
            <optgroup label="PACIFIC — WASHINGTON (WA) TOP 5">
              <option value="Seattle, WA">Seattle, WA</option>
              <option value="Spokane, WA">Spokane, WA</option>
              <option value="Tacoma, WA">Tacoma, WA</option>
              <option value="Vancouver, WA">Vancouver, WA</option>
              <option value="Bellevue, WA">Bellevue, WA</option>
            </optgroup>
            <optgroup label="PACIFIC — OREGON (OR) TOP 5">
              <option value="Portland, OR">Portland, OR</option>
              <option value="Eugene, OR">Eugene, OR</option>
              <option value="Salem, OR">Salem, OR</option>
              <option value="Gresham, OR">Gresham, OR</option>
              <option value="Hillsboro, OR">Hillsboro, OR</option>
            </optgroup>
            <optgroup label="PACIFIC — NEVADA (NV) TOP 5">
              <option value="Las Vegas, NV">Las Vegas, NV</option>
              <option value="Henderson, NV">Henderson, NV</option>
              <option value="North Las Vegas, NV">North Las Vegas, NV</option>
              <option value="Reno, NV">Reno, NV</option>
              <option value="Sparks, NV">Sparks, NV</option>
            </optgroup>
            <optgroup label="EASTERN — FLORIDA (FL) TOP 5">
              <option value="Jacksonville, FL">Jacksonville, FL</option>
              <option value="Miami, FL">Miami, FL</option>
              <option value="Tampa, FL">Tampa, FL</option>
              <option value="Orlando, FL">Orlando, FL</option>
              <option value="St. Petersburg, FL">St. Petersburg, FL</option>
            </optgroup>
            <optgroup label="EASTERN — NEW YORK (NY) TOP 5">
              <option value="New York City, NY">New York City, NY</option>
              <option value="Buffalo, NY">Buffalo, NY</option>
              <option value="Rochester, NY">Rochester, NY</option>
              <option value="Yonkers, NY">Yonkers, NY</option>
              <option value="Syracuse, NY">Syracuse, NY</option>
            </optgroup>
            <optgroup label="EASTERN — GEORGIA (GA) TOP 5">
              <option value="Atlanta, GA">Atlanta, GA</option>
              <option value="Augusta, GA">Augusta, GA</option>
              <option value="Columbus, GA">Columbus, GA</option>
              <option value="Macon, GA">Macon, GA</option>
              <option value="Savannah, GA">Savannah, GA</option>
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
              onkeydown="if(event.key==='Enter') scrapeSingle()"
              class="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-cyan-500 transition font-mono"
            >
            <button 
              onclick="scrapeSingle()" 
              id="btnSingle" 
              class="bg-cyan-500 hover:opacity-90 text-black font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-cyan-500/20 shrink-0 cursor-pointer active:scale-95"
            >
              ${getSvgIcon('bolt', 'w-4 h-4')}
              <span>Scrape & Audit</span>
            </button>
          </div>

          <!-- Quick Test Presets -->
          <div class="flex items-center gap-1.5 flex-wrap text-xs">
            <span class="text-[var(--text-muted)] text-[11px]">Quick presets:</span>
            <button onclick="setPreset('https://vitalyc.com')" class="px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition text-[11px] cursor-pointer">Vitalyc (Dallas)</button>
            <button onclick="setPreset('https://ellemesmedspa.com')" class="px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition text-[11px] cursor-pointer">ELLEMES (Atlanta)</button>
          </div>
        </div>

        <!-- Extraction Progress Card -->
        <div id="scrapeProgress" class="hidden bg-[var(--bg-surface)] rounded-xl p-4 border border-cyan-500/30 space-y-2.5 shadow-inner">
          <div class="flex items-center justify-between text-xs">
            <span class="text-cyan-400 font-mono font-medium flex items-center gap-2">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span id="progressText">Connecting to target domain...</span>
            </span>
            <div class="flex items-center gap-2">
              <span id="singleTimer" class="text-[var(--text-muted)] font-mono text-[11px]">0.0s</span>
              <span id="progressPercent" class="text-cyan-400 font-mono font-bold text-xs">25%</span>
            </div>
          </div>
          <div class="w-full bg-[var(--bg-card)] rounded-full h-2 overflow-hidden border border-[var(--border-subtle)]">
            <div id="progressBar" class="bg-gradient-to-r from-cyan-500 to-emerald-400 h-2 transition-all duration-300 rounded-full" style="width: 25%"></div>
          </div>
        </div>

        <!-- Single Scrape Result Card -->
        <div id="singleResultCard" class="hidden bg-[var(--bg-surface)] rounded-xl p-4 border border-emerald-500/30 space-y-3 shadow-lg">
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
            <span class="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
              <span>✓</span>
              <span>Saved in Pipeline CRM</span>
            </span>
            <div class="flex items-center gap-2">
              <a href="/outreach/prospects${keyParam}" class="text-[11px] text-cyan-400 hover:underline font-semibold flex items-center gap-1">
                <span>View in CRM →</span>
              </a>
              <button onclick="removeSingleScrapedLead()" class="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-semibold transition flex items-center gap-1 cursor-pointer" title="Remove this lead from CRM database">
                ${getSvgIcon('trash', 'w-3 h-3')}
                <span>Delete</span>
              </button>
            </div>
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
          <a href="https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&q=MedSpa%20Miami" target="_blank" class="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer">
            <span>Meta Ads Library</span>
            ${getSvgIcon('external', 'w-3 h-3')}
          </a>
        </div>

        <div class="space-y-3">
          <textarea 
            id="bulkUrls" 
            rows="4" 
            placeholder="https://clinic1.com&#10;https://clinic2.com&#10;https://clinic3.com" 
            class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-cyan-500 font-mono leading-relaxed"
          ></textarea>

          <div class="flex items-center justify-between pt-1">
            <span class="text-[11px] text-[var(--text-muted)]">Auto-applies 1.2s anti-rate-limit jitter</span>
            <button 
              onclick="scrapeBulk()" 
              id="btnBulk" 
              class="bg-emerald-500 hover:opacity-90 text-black font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer active:scale-95"
            >
              ${getSvgIcon('play', 'w-4 h-4')}
              <span>Start Bulk Ingestion</span>
            </button>
          </div>

          <!-- Live Bulk Progress Console -->
          <div id="bulkProgressConsole" class="hidden bg-[var(--bg-surface)] rounded-xl p-4 border border-emerald-500/30 space-y-2.5 shadow-inner">
            <div class="flex items-center justify-between text-xs">
              <span class="text-emerald-400 font-mono font-medium flex items-center gap-2">
                <span class="relative flex h-2 w-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span id="bulkStatusText">Initializing batch ingestion...</span>
              </span>
              <div class="flex items-center gap-2">
                <span id="bulkTimer" class="text-[var(--text-muted)] font-mono text-[11px]">0.0s</span>
                <span id="bulkProgressPercent" class="text-emerald-400 font-mono font-bold text-xs">15%</span>
              </div>
            </div>
            <div class="w-full bg-[var(--bg-card)] rounded-full h-2 overflow-hidden border border-[var(--border-subtle)]">
              <div id="bulkProgressBar" class="bg-gradient-to-r from-emerald-500 to-cyan-400 h-2 transition-all duration-300 rounded-full" style="width: 15%"></div>
            </div>
          </div>

          <!-- Bulk Result Summary Container -->
          <div id="bulkResultContainer" class="hidden space-y-3 pt-1">
            <div id="bulkSummaryBanner" class="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span id="bulkSummaryText" class="font-bold text-emerald-300"></span>
              </div>
              <a href="/outreach/prospects${keyParam}" class="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-lg text-[11px] transition whitespace-nowrap flex items-center gap-1 shadow-sm">
                <span>View in CRM →</span>
              </a>
            </div>
            <div id="bulkResultsList" class="space-y-2 max-h-56 overflow-y-auto pr-1"></div>
          </div>
        </div>
      </div>

    </div>
  `;

  const extraScripts = `
    <script>
      const CASCADE_LIST = ${JSON.stringify(ORDERED_CASCADE_CITIES)};

      window.switchTerritoryTab = function(tz) {
        const pacificPanel = document.getElementById('panelPacificTz');
        const easternPanel = document.getElementById('panelEasternTz');
        const tabPac = document.getElementById('tabPacificTz');
        const tabEast = document.getElementById('tabEasternTz');

        if (tz === 'pacific') {
          if (pacificPanel) pacificPanel.classList.remove('hidden');
          if (easternPanel) easternPanel.classList.add('hidden');
          if (tabPac) {
            tabPac.classList.remove('bg-[var(--bg-card)]', 'text-[var(--text-secondary)]', 'border-[var(--border-subtle)]', 'font-medium');
            tabPac.classList.add('bg-cyan-500/15', 'text-cyan-300', 'border-cyan-500/40', 'font-bold');
          }
          if (tabEast) {
            tabEast.classList.remove('bg-cyan-500/15', 'text-cyan-300', 'border-cyan-500/40', 'font-bold');
            tabEast.classList.add('bg-[var(--bg-card)]', 'text-[var(--text-secondary)]', 'border-[var(--border-subtle)]', 'font-medium');
          }
        } else {
          if (pacificPanel) pacificPanel.classList.add('hidden');
          if (easternPanel) easternPanel.classList.remove('hidden');
          if (tabEast) {
            tabEast.classList.remove('bg-[var(--bg-card)]', 'text-[var(--text-secondary)]', 'border-[var(--border-subtle)]', 'font-medium');
            tabEast.classList.add('bg-cyan-500/15', 'text-cyan-300', 'border-cyan-500/40', 'font-bold');
          }
          if (tabPac) {
            tabPac.classList.remove('bg-cyan-500/15', 'text-cyan-300', 'border-cyan-500/40', 'font-bold');
            tabPac.classList.add('bg-[var(--bg-card)]', 'text-[var(--text-secondary)]', 'border-[var(--border-subtle)]', 'font-medium');
          }
        }
      };

      window.stepNextTerritoryCity = function() {
        const input = document.getElementById('huntCity');
        const cur = (input ? input.value : '').trim().toLowerCase();
        let nextCity = CASCADE_LIST[0];
        const idx = CASCADE_LIST.findIndex(c => c.toLowerCase().includes(cur) || cur.includes(c.toLowerCase()));
        if (idx !== -1 && idx < CASCADE_LIST.length - 1) {
          nextCity = CASCADE_LIST[idx + 1];
        }
        window.setHuntPreset(nextCity);
        showToast('Territory Advanced', 'Next in cascade: ' + nextCity, 'info');
      };

      function setPreset(url) {
        document.getElementById('singleUrl').value = url;
        scrapeSingle();
      }

      window.setHuntPreset = function(city, btnEl) {
        if (!city) return;
        const input = document.getElementById('huntCity');
        if (input) {
          input.value = city;
          input.classList.add('ring-2', 'ring-cyan-400', 'border-cyan-400', 'bg-cyan-950/20');
          setTimeout(() => {
            input.classList.remove('ring-2', 'ring-cyan-400', 'border-cyan-400', 'bg-cyan-950/20');
          }, 800);
          try {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          } catch(e) {}
        }

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
        if (picker) {
          for (let i = 0; i < picker.options.length; i++) {
            if (picker.options[i].value && picker.options[i].value.toLowerCase().includes(city.split(',')[0].toLowerCase())) {
              picker.selectedIndex = i;
              break;
            }
          }
        }

        window.updateMetaAdsRedirection();
        showToast('Market Selected', 'Ready to hunt ' + city + '. Click Launch Hunter or press Enter.', 'info');
      };

      window.updateMetaAdsRedirection = function() {
        const nicheEl = document.getElementById('huntNiche');
        const cityEl = document.getElementById('huntCity');
        const niche = nicheEl ? nicheEl.value : 'hvac';
        const rawCity = (cityEl && cityEl.value ? cityEl.value : 'Los Angeles, CA').trim();
        const cleanCity = rawCity.split(',')[0].trim() || 'Los Angeles';
        const keywords = {
          hvac: 'HVAC AC Repair',
          plumbing: 'Emergency Plumber',
          roofing: 'Roofing Contractor',
          electrical: 'Emergency Electrician',
          water_damage: 'Water Damage Restoration',
          medspa: 'MedSpa',
        };
        const searchTerm = (keywords[niche] || 'HVAC Repair') + ' ' + cleanCity;
        const metaUrl = 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&q=' + encodeURIComponent(searchTerm);

        const topBtn = document.getElementById('topMetaAdsBtn');
        const cardBtn = document.getElementById('cardMetaAdsBtn');
        if (topBtn) topBtn.href = metaUrl;
        if (cardBtn) cardBtn.href = metaUrl;
      };

      window.updateNicheDefaults = function() {
        const nicheSelect = document.getElementById('huntNiche');
        if (!nicheSelect) return;
        const niche = nicheSelect.value;
        const input = document.getElementById('huntCity');
        const currentVal = input ? input.value.trim() : '';

        const placeholders = {
          hvac: 'e.g. Los Angeles, CA or Phoenix, AZ',
          plumbing: 'e.g. San Diego, CA or Dallas, TX',
          roofing: 'e.g. Tampa, FL or Atlanta, GA',
          electrical: 'e.g. Seattle, WA or Houston, TX',
          water_damage: 'e.g. Miami, FL or Orlando, FL',
        };

        if (input && placeholders[niche]) {
          input.placeholder = placeholders[niche];
        }

        window.updateMetaAdsRedirection();
      };

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
        btn.innerHTML = '${getSvgIcon('spinner', 'w-4 h-4 mr-1 text-black')}<span>Hunting Leads...</span>';
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

              const isChain = lead.multiLocation && lead.multiLocation.isMultiLocation;
              const chainBadge = isChain
                ? '<span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">⚠ Chain</span>'
                : '<span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">✓ Single Practice</span>';

              const gmb = lead.socialSignals && lead.socialSignals.hasGmb;
              const ig = lead.socialSignals && lead.socialSignals.hasInstagram;
              const fb = lead.socialSignals && lead.socialSignals.hasFacebook;
              const socialHtml = '<div class="flex items-center gap-2 text-[10px] font-mono">' +
                '<span class="' + (gmb ? 'text-emerald-400 font-bold' : 'text-gray-500') + '">' + (gmb ? 'GMB:✓' : 'GMB:○') + '</span>' +
                '<span class="' + (ig ? 'text-purple-400 font-bold' : 'text-gray-500') + '">' + (ig ? 'IG:✓' : 'IG:○') + '</span>' +
                '<span class="' + (fb ? 'text-blue-400 font-bold' : 'text-gray-500') + '">' + (fb ? 'FB:✓' : 'FB:○') + '</span>' +
              '</div>';

              const salutationHtml = lead.salutation
                ? '<div class="text-[10px] text-gray-400 font-mono pt-1">Salutation: <span class="text-cyan-300">"Hey ' + lead.salutation + ',"</span></div>'
                : '';

              return '<div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-3 hunter-card">' +
                '<div class="flex items-start justify-between gap-2">' +
                  '<div>' +
                    '<div class="flex items-center gap-1.5 flex-wrap">' +
                      '<h4 class="font-bold text-[var(--text-primary)] text-sm">' + (lead.clinicName || 'Practice') + '</h4>' +
                      chainBadge +
                    '</div>' +
                    '<p class="text-[11px] text-[var(--text-muted)] mt-0.5">' + (lead.doctorName || 'Lead') + ' • ' + (lead.city || city) + '</p>' +
                    salutationHtml +
                  '</div>' +
                  '<div class="flex items-center gap-1.5 shrink-0">' +
                    '<span class="text-[10px] font-semibold px-2 py-0.5 rounded ' + badgeClass + '">' + badgeText + '</span>' +
                    '<button type="button" data-email="' + (lead.email || '') + '" data-clinic="' + (lead.clinicName || 'Lead').replace(/"/g, '&quot;') + '" onclick="removeHuntedLead(this)" class="p-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] transition cursor-pointer" title="Remove lead from database">' +
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
                  '<div class="flex items-center justify-between text-[var(--text-muted)] text-[11px]">' +
                    '<span>Procedure: <span class="text-purple-300 font-medium">' + (lead.treatment || 'High-Ticket') + '</span></span>' +
                    socialHtml +
                  '</div>' +
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
        const urlInput = document.getElementById('singleUrl');
        const url = (urlInput ? urlInput.value : '').trim();
        if (!url) {
          showToast('Domain Required', 'Please enter a clinic URL or select a quick preset.', 'warning');
          return;
        }

        const btn = document.getElementById('btnSingle');
        const progress = document.getElementById('scrapeProgress');
        const bar = document.getElementById('progressBar');
        const text = document.getElementById('progressText');
        const percent = document.getElementById('progressPercent');
        const timerEl = document.getElementById('singleTimer');
        const card = document.getElementById('singleResultCard');

        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '${getSvgIcon('spinner', 'w-4 h-4 mr-1 text-black')}<span>Auditing Domain...</span>';
        }
        if (progress) progress.classList.remove('hidden');
        if (card) card.classList.add('hidden');

        if (bar) bar.style.width = '15%';
        if (percent) percent.innerText = '15%';
        if (text) text.innerText = 'Connecting to ' + url.replace(/^https?:\\/\\//, '') + '...';
        if (timerEl) timerEl.innerText = '0.0s';

        let seconds = 0;
        const singleTimerInterval = setInterval(() => {
          seconds += 0.2;
          if (timerEl) timerEl.innerText = seconds.toFixed(1) + 's';
        }, 200);

        let currentProgress = 15;
        const progressInterval = setInterval(() => {
          if (currentProgress < 90) {
            currentProgress += (currentProgress < 60 ? 12 : 6);
            if (bar) bar.style.width = currentProgress + '%';
            if (percent) percent.innerText = currentProgress + '%';
            if (text) {
              if (currentProgress >= 25 && currentProgress < 45) {
                text.innerText = 'Resolving DNS & testing SSL handshake...';
              } else if (currentProgress >= 45 && currentProgress < 65) {
                text.innerText = 'Crawling homepage & scanning Meta Pixel (fbq) tags...';
              } else if (currentProgress >= 65 && currentProgress < 80) {
                text.innerText = 'Deep-crawling /about & /team for medical director...';
              } else if (currentProgress >= 80) {
                text.innerText = 'Diagnosing booking friction & committing to CRM...';
              }
            }
          }
        }, 500);

        try {
          const data = await safeFetchJson('/scraper/ingest', {
            method: 'POST',
            body: JSON.stringify({ url })
          });

          clearInterval(singleTimerInterval);
          clearInterval(progressInterval);

          if (bar) bar.style.width = '100%';
          if (percent) percent.innerText = '100%';
          if (text) text.innerText = 'Extraction and audit complete!';

          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '${getSvgIcon('bolt', 'w-4 h-4')}<span>Scrape & Audit</span>';
          }

          setTimeout(() => {
            if (progress) progress.classList.add('hidden');
            if (data.status === 'success' || data.scrapedData) {
              const d = data.scrapedData || data.data || {};
              const clinicNameEl = document.getElementById('resClinicName');
              const cityEl = document.getElementById('resCity');
              const doctorEl = document.getElementById('resDoctor');
              const emailEl = document.getElementById('resEmail');
              const treatmentEl = document.getElementById('resTreatment');
              const phoneEl = document.getElementById('resPhone');
              const badge = document.getElementById('resPixelBadge');

              if (clinicNameEl) clinicNameEl.innerText = d.clinicName || 'Clinic';
              if (cityEl) cityEl.innerText = d.city || 'United States';
              if (doctorEl) doctorEl.innerText = d.doctorName || 'Medical Director';
              if (emailEl) emailEl.innerText = d.email || 'None';
              if (treatmentEl) treatmentEl.innerText = d.treatment || 'High-Ticket Aesthetic';
              if (phoneEl) phoneEl.innerText = d.phone || 'N/A';

              if (badge) {
                if (d.adSignals?.hasPaidAds) {
                  badge.innerText = '✓ Meta / Google Ads Active';
                  badge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                } else {
                  badge.innerText = 'Organic Traffic';
                  badge.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-800 text-gray-400 border border-gray-700';
                }
              }

              if (card) card.classList.remove('hidden');
              if (data.status === 'success' || data.success) {
                showToast('Lead Sourced', (d.clinicName || 'Domain') + ' audited and saved in CRM.', 'success');
              } else if (data.message && data.message.includes('already exists')) {
                showToast('Already in CRM', (d.clinicName || 'Clinic') + ' is already recorded in your pipeline CRM.', 'info');
              } else {
                showToast('Audit Warning', data.message || 'Scraped successfully.', 'warning');
              }
            } else {
              showToast('Scrape Warning', data.message || 'No direct email found.', 'warning');
            }
          }, 350);

        } catch (err) {
          clearInterval(singleTimerInterval);
          clearInterval(progressInterval);
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '${getSvgIcon('bolt', 'w-4 h-4')}<span>Scrape & Audit</span>';
          }
          if (progress) progress.classList.add('hidden');
          showToast('Extraction Failed', err.message, 'error');
        }
      }

      async function scrapeBulk() {
        const textarea = document.getElementById('bulkUrls');
        const rawText = (textarea ? textarea.value : '').trim();
        if (!rawText) {
          showToast('Input Required', 'Please paste at least one domain URL.', 'warning');
          return;
        }

        const urls = rawText.split(/[\\r\\n,]+/).map(u => u.trim()).filter(Boolean);
        if (urls.length === 0) {
          showToast('Input Required', 'Please enter valid URLs.', 'warning');
          return;
        }

        const btn = document.getElementById('btnBulk');
        const consoleBox = document.getElementById('bulkProgressConsole');
        const statusText = document.getElementById('bulkStatusText');
        const timerEl = document.getElementById('bulkTimer');
        const percentEl = document.getElementById('bulkProgressPercent');
        const bar = document.getElementById('bulkProgressBar');
        const resultContainer = document.getElementById('bulkResultContainer');
        const summaryText = document.getElementById('bulkSummaryText');
        const resultsList = document.getElementById('bulkResultsList');

        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '${getSvgIcon('spinner', 'w-4 h-4 mr-1 text-black')}<span>Processing ' + urls.length + ' Domains...</span>';
        }
        if (consoleBox) consoleBox.classList.remove('hidden');
        if (resultContainer) resultContainer.classList.add('hidden');
        if (resultsList) resultsList.innerHTML = '';

        if (bar) bar.style.width = '10%';
        if (percentEl) percentEl.innerText = '10%';
        if (statusText) statusText.innerText = 'Initiating batch crawl of ' + urls.length + ' domains with anti-rate-limit jitter...';
        if (timerEl) timerEl.innerText = '0.0s';

        let seconds = 0;
        const bulkTimerInterval = setInterval(() => {
          seconds += 0.2;
          if (timerEl) timerEl.innerText = seconds.toFixed(1) + 's';
        }, 200);

        let bulkProgress = 10;
        const bulkProgressInterval = setInterval(() => {
          if (bulkProgress < 90) {
            bulkProgress += (bulkProgress < 50 ? 10 : 5);
            if (bar) bar.style.width = bulkProgress + '%';
            if (percentEl) percentEl.innerText = bulkProgress + '%';
            if (statusText) {
              if (bulkProgress >= 20 && bulkProgress < 40) {
                statusText.innerText = 'Auditing Meta Pixel & Google Ads signals across batch...';
              } else if (bulkProgress >= 40 && bulkProgress < 65) {
                statusText.innerText = 'Crawling staff & provider directories for decision-makers...';
              } else if (bulkProgress >= 65 && bulkProgress < 85) {
                statusText.innerText = 'Checking speed-to-lead gaps & deduplicating CRM entries...';
              } else if (bulkProgress >= 85) {
                statusText.innerText = 'Ingesting verified leads into Supabase pipeline...';
              }
            }
          }
        }, 800);

        try {
          const data = await safeFetchJson('/scraper/bulk', {
            method: 'POST',
            body: JSON.stringify({ urls: rawText })
          });

          clearInterval(bulkTimerInterval);
          clearInterval(bulkProgressInterval);

          if (bar) bar.style.width = '100%';
          if (percentEl) percentEl.innerText = '100%';
          if (statusText) statusText.innerText = 'Batch ingestion complete!';

          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '${getSvgIcon('play', 'w-4 h-4')}<span>Start Bulk Ingestion</span>';
          }

          setTimeout(() => {
            if (consoleBox) consoleBox.classList.add('hidden');

            const total = data.total || urls.length;
            const ingested = data.ingestedCount || 0;
            const results = data.results || [];

            if (summaryText) {
              summaryText.innerText = '✓ ' + ingested + ' of ' + total + ' Leads Sourced & Saved in Pipeline CRM';
            }

            if (resultsList) {
              if (results.length === 0) {
                resultsList.innerHTML = '<p class="text-xs text-[var(--text-muted)] italic py-2">No domains processed.</p>';
              } else {
                resultsList.innerHTML = results.map(item => {
                  const d = item.scrapedData || {};
                  const isSuccess = item.success;
                  const clinic = d.clinicName || item.url.replace(/^https?:\\/\\//, '').split('/')[0];
                  const doc = d.doctorName || 'Director';
                  const email = d.email || '';
                  const phone = d.phone || '';
                  const badgeClass = isSuccess 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                  const badgeText = isSuccess ? '✓ Ingested' : (item.message && item.message.includes('already exists') ? 'In CRM' : (item.error ? 'Crawl Blocked' : 'Notice'));

                  let subline = '';
                  if (isSuccess || d.email) {
                    subline = '<span>' + doc + '</span><span>•</span><span class="text-cyan-400 truncate">' + (email || 'No email') + '</span>' + (phone ? '<span>•</span><span>' + phone + '</span>' : '');
                  } else {
                    subline = '<span class="text-[var(--text-muted)] italic truncate max-w-sm">' + (item.error || item.message || 'No direct email found') + '</span>';
                  }

                  return '<div class="p-3 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between gap-3 text-xs">' +
                    '<div class="min-w-0">' +
                      '<div class="flex items-center gap-2">' +
                        '<span class="font-bold text-[var(--text-primary)] truncate">' + clinic + '</span>' +
                        '<span class="text-[10px] px-2 py-0.5 rounded font-mono font-semibold ' + badgeClass + '">' + badgeText + '</span>' +
                      '</div>' +
                      '<div class="text-[11px] text-[var(--text-muted)] flex items-center gap-2 mt-0.5 font-mono">' +
                        subline +
                      '</div>' +
                    '</div>' +
                    '<a href="' + getAuthUrl('/outreach/prospects') + '" class="text-[11px] text-cyan-400 hover:underline font-semibold whitespace-nowrap">CRM →</a>' +
                  '</div>';
                }).join('');
              }
            }

            if (resultContainer) resultContainer.classList.remove('hidden');
            showToast('Batch Complete', ingested + ' of ' + total + ' leads saved to CRM.', 'success');
          }, 400);

        } catch (e) {
          clearInterval(bulkTimerInterval);
          clearInterval(bulkProgressInterval);
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '${getSvgIcon('play', 'w-4 h-4')}<span>Start Bulk Ingestion</span>';
          }
          if (consoleBox) consoleBox.classList.add('hidden');
          showToast('Bulk Ingestion Error', e.message, 'error');
        }
      }

      async function removeHuntedLead(btnEl, passedEmail, passedClinic) {
        const email = (passedEmail || btnEl.getAttribute('data-email') || '').trim();
        const clinicName = (passedClinic || btnEl.getAttribute('data-clinic') || 'Lead').trim();
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

      document.addEventListener('DOMContentLoaded', () => {
        if (typeof window.updateMetaAdsRedirection === 'function') {
          window.updateMetaAdsRedirection();
        }
        const cityInput = document.getElementById('huntCity');
        if (cityInput) {
          cityInput.addEventListener('input', () => {
            if (typeof window.updateMetaAdsRedirection === 'function') {
              window.updateMetaAdsRedirection();
            }
          });
        }
      });
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
