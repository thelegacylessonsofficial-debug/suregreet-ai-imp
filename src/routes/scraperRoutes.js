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
            <button onclick="runAutonomousHuntClient()" id="btnLaunchHunter" type="button" class="bg-cyan-500 hover:opacity-90 text-black font-bold text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 active:scale-95 cursor-pointer">
              ${getSvgIcon('bolt', 'w-4 h-4')}
              <span>Launch Hunter</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Territory Cascade Selector (Minimal & Fast) -->
      <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <span class="text-xs font-bold text-cyan-400 font-mono uppercase tracking-wider">🎯 Territory Cascade:</span>
          <select id="marketQuickPicker" onchange="setHuntPreset(this.value)" class="bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-semibold rounded-xl px-3.5 py-2 text-cyan-300 focus:outline-none focus:border-cyan-500 transition cursor-pointer">
            <option value="" disabled>— Select Target Metro —</option>
            <optgroup label="PACIFIC — CALIFORNIA (CA) TOP 5">
              <option value="Los Angeles, CA" selected>Los Angeles, CA</option>
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
            <optgroup label="🏆 HIGH-INCOME SUBURBS — INDIANA (IN)">
              <option value="Carmel, IN">Carmel, IN</option>
              <option value="Zionsville, IN">Zionsville, IN</option>
            </optgroup>
            <optgroup label="🏆 HIGH-INCOME SUBURBS — OHIO (OH)">
              <option value="Dublin, OH">Dublin, OH</option>
            </optgroup>
            <optgroup label="🏆 HIGH-INCOME SUBURBS — TEXAS (TX)">
              <option value="Prosper, TX">Prosper, TX</option>
              <option value="Celina, TX">Celina, TX</option>
              <option value="Fulshear, TX">Fulshear, TX</option>
            </optgroup>
            <optgroup label="🏆 HIGH-INCOME SUBURBS — TENNESSEE (TN)">
              <option value="Brentwood, TN">Brentwood, TN</option>
            </optgroup>
          </select>
        </div>

        <button onclick="stepNextTerritoryCity()" id="btnNextTerritory" type="button" class="bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-cyan-300 border border-cyan-500/30 font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer" title="Auto-advance to next territory in sequence">
          <span>Next Cascade City ⏭</span>
        </button>
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
                  '<h4 class="text-sm font-bold text-white">' + data.committedCount + ' Qualified Leads → Pipeline CRM</h4>' +
                '</div>' +
                '<p class="text-xs text-gray-400 mt-0.5">' + (data.disqualifiedCount || 0) + ' leads rejected by qualifier (score &lt; 60/100). Only verified high-ticket targets saved.</p>' +
              '</div>' +
              '<a href="' + crmUrl + '" class="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl text-xs transition shadow-md shadow-emerald-500/20 whitespace-nowrap flex items-center gap-1.5">' +
                '<span>View in Pipeline CRM</span>' +
                '<span>→</span>' +
              '</a>' +
            '</div>';

            cardsList.innerHTML = bannerHtml + data.leads.map(lead => {
              const hasHook = lead.specificObservation;
              const qual = lead.qualification || {};
              const qualScore = qual.score !== undefined ? qual.score : null;
              const qualGrade = qual.grade || '';
              const qualPassed = qual.qualified === true;

              // Score badge
              const scoreColor = qualScore >= 75 ? 'emerald' : qualScore >= 60 ? 'yellow' : 'rose';
              const scoreBadge = qualScore !== null
                ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-' + scoreColor + '-500/10 text-' + scoreColor + '-400 border border-' + scoreColor + '-500/20 font-mono">' + (qualPassed ? '✓ ' : '✗ ') + qualScore + '/100 ' + qualGrade + '</span>'
                : '';

              const badgeClass = lead.dbStatus === 'saved'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : lead.dbStatus === 'duplicate'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : lead.dbStatus === 'disqualified'
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                : 'bg-gray-800 text-gray-400';
              const badgeText = lead.dbStatus === 'saved'
                ? '✓ Saved to CRM'
                : lead.dbStatus === 'duplicate'
                ? 'Already in CRM'
                : lead.dbStatus === 'disqualified'
                ? '✗ Rejected'
                : 'No Email';

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

              // ── Qualification Score Card ──────────────────────────────────────
              const qual = lead.qualification || {};
              const qualScore = qual.score !== undefined ? qual.score : null;
              const qualGrade = qual.grade || '';
              const qualPassed = qual.qualified === true;
              const scoreColor = qualScore !== null ? (qualScore >= 75 ? 'emerald' : qualScore >= 60 ? 'yellow' : 'rose') : 'gray';
              const scoreBadge = qualScore !== null
                ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-' + scoreColor + '-500/10 text-' + scoreColor + '-400 border border-' + scoreColor + '-500/20 font-mono">' + (qualPassed ? '✓ ' : '✗ ') + qualScore + '/100 ' + qualGrade + '</span>'
                : '';

              // Breakdown mini-table (collapsed inline)
              let qualBreakdownHtml = '';
              if (qual.breakdown) {
                const rows = Object.values(qual.breakdown).map(b =>
                  '<div class="flex items-center justify-between gap-2">' +
                    '<span class="' + (b.pass ? 'text-emerald-400' : 'text-gray-500') + '">' + (b.pass ? '✓' : '✗') + ' ' + b.label + '</span>' +
                    '<span class="font-mono font-bold ' + (b.earned > 0 ? 'text-cyan-300' : 'text-gray-600') + '">' + b.earned + '/' + b.max + '</span>' +
                  '</div>'
                ).join('');
                qualBreakdownHtml = '<details class="text-[10px] text-gray-400 mt-1">' +
                  '<summary class="cursor-pointer hover:text-gray-300 font-semibold">🎯 Qual Score: ' + (qualScore || '?') + '/100 ' + qualGrade + ' — click to expand</summary>' +
                  '<div class="mt-2 space-y-1 bg-[var(--bg-card)] rounded-lg p-2.5 border border-[var(--border-subtle)]">' + rows + '</div>' +
                  (qual.disqualifyReasons && qual.disqualifyReasons.length > 0
                    ? '<div class="mt-1 text-rose-400 text-[10px]">Rejected: ' + qual.disqualifyReasons.join(' · ') + '</div>'
                    : '') +
                '</details>';
              }

              return '<div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-3 hunter-card' + (lead.dbStatus === 'disqualified' ? ' opacity-60' : '') + '">' +
                '<div class="flex items-start justify-between gap-2">' +
                  '<div>' +
                    '<div class="flex items-center gap-1.5 flex-wrap">' +
                      '<h4 class="font-bold text-[var(--text-primary)] text-sm">' + (lead.clinicName || 'Practice') + '</h4>' +
                      chainBadge +
                      scoreBadge +
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
                  qualBreakdownHtml +
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
