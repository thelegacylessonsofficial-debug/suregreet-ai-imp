import { Router } from 'express';
import { scrapeClinicWebsite, scrapeAndIngestLead, scrapeBulkLeads } from '../services/scraperService.js';
import {
  runAutonomousHunt,
  startHuntJob,
  getHuntJob,
  cancelHuntJob,
  huntAndEnrichLead,
  commitLeadToSupabase,
  TERRITORY_CASCADE,
  ORDERED_CASCADE_CITIES,
  getNextCascadeCity,
} from '../services/leadHunterService.js';
import { DEFAULT_QUALIFY_THRESHOLD } from '../services/qualifierService.js';
import { runDigitalAudit, auditAndSaveProspect } from '../services/auditorService.js';
import { deleteProspect, getProspectById, addProspect, updateProspect } from '../services/outreachService.js';
import { renderSaasShell, getSvgIcon } from '../views/saasLayout.js';

export const scraperRouter = Router();

const FEATURED_SUBURBS = [
  'Carmel, IN',
  'Zionsville, IN',
  'Dublin, OH',
  'Prosper, TX',
  'Celina, TX',
  'Brentwood, TN',
  'Fulshear, TX',
];

function escapeHtmlAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildTerritoryOptionsHtml() {
  const groups = [];

  groups.push(
    '<optgroup label="Affluent Suburbs (High-Ticket Owner-Operators)">' +
      FEATURED_SUBURBS.map((c) => '<option value="' + escapeHtmlAttr(c) + '">' + escapeHtmlAttr(c) + '</option>').join('') +
      '</optgroup>'
  );

  for (const tz of Object.values(TERRITORY_CASCADE)) {
    for (const st of Object.values(tz.states || {})) {
      const cities = [...(st.topTier || []), ...(st.secondaryTier || [])];
      if (!cities.length) continue;
      groups.push(
        '<optgroup label="' +
          escapeHtmlAttr(tz.name + ' - ' + st.name) +
          '">' +
          cities.map((c) => '<option value="' + escapeHtmlAttr(c) + '">' + escapeHtmlAttr(c) + '</option>').join('') +
          '</optgroup>'
      );
    }
  }

  return groups.join('\n');
}

// 1. Inspect a contractor website without saving (dry run)
scraperRouter.post('/inspect', async (req, res) => {
  const { url, niche } = req.body || {};
  if (!url) {
    return res.status(400).json({ status: 'error', message: 'Field "url" is required' });
  }

  try {
    const data = await scrapeClinicWebsite(url, { niche: niche || 'hvac' });
    if (!data.success) {
      return res.status(400).json({ status: 'error', error: data.error });
    }
    res.json({ status: 'success', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 1b. Qualify a single URL (10-Second Eye Test + 100-Pt Scoring Gate + optional CRM commit)
scraperRouter.post('/qualify', async (req, res) => {
  const { url, city, niche, minScore, autoCommit } = req.body || {};
  if (!url) {
    return res.status(400).json({ success: false, message: 'Field "url" is required' });
  }

  try {
    const parsedScore = minScore !== undefined && minScore !== '' ? Number(minScore) : DEFAULT_QUALIFY_THRESHOLD;
    const threshold = Math.min(Math.max(Number.isFinite(parsedScore) ? parsedScore : DEFAULT_QUALIFY_THRESHOLD, 0), 100);
    const enriched = await huntAndEnrichLead({
      url,
      city: city || '',
      niche: niche || 'hvac',
      fast: false,
      minScore: threshold,
    });

    let commitRes = null;
    if (autoCommit) {
      commitRes = await commitLeadToSupabase(enriched);
      enriched.savedToDb = commitRes.success;
      enriched.dbStatus = commitRes.alreadyExists
        ? 'duplicate'
        : commitRes.disqualified
        ? 'disqualified'
        : commitRes.success
        ? 'saved'
        : 'no_email';
    }

    res.json({
      success: true,
      lead: enriched,
      qualification: enriched.qualification,
      committed: commitRes?.success || false,
      commitMessage: commitRes?.message || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Scrape a website, qualify it, and ingest ONLY if qualified (unless force=true)
scraperRouter.post('/ingest', async (req, res) => {
  const {
    url,
    city,
    treatment,
    doctorName,
    clinicName,
    email,
    phone,
    specificObservation,
    recommendedAngle,
    qualification: preQualification,
    niche,
    minScore,
    force,
  } = req.body || {};
  if (!url) {
    return res.status(400).json({ status: 'error', message: 'Field "url" is required' });
  }

  try {
    // Fast deterministic Force-Add path when Lead Hunter / Single-Test already extracted card data
    const hasPreScraped = Boolean(force && (clinicName || email || phone || preQualification));
    if (hasPreScraped) {
      const normalizedUrl = /^https?:\/\//i.test(String(url).trim()) ? String(url).trim() : `https://${String(url).trim()}`;
      let hostname = 'contractor.com';
      try {
        hostname = new URL(normalizedUrl).hostname.replace(/^www\./, '');
      } catch (_) {}

      const emailMatch = email ? String(email).trim().toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/) : null;
      const finalEmail = emailMatch ? emailMatch[0] : `info@${hostname}`;
      const qualObj = preQualification && typeof preQualification === 'object' ? preQualification : {};
      const qualScore = Number.isFinite(Number(qualObj.score)) ? Number(qualObj.score) : null;
      const qualGrade = qualObj.grade || (qualScore != null ? (qualScore >= 80 ? 'A' : qualScore >= 60 ? 'B' : 'C') : 'C');
      const qualPassed = Boolean(qualObj.qualified);
      const resolvedClinic = clinicName || hostname;
      const resolvedDoctor = doctorName || `Owner / Operations Lead at ${resolvedClinic}`;
      const resolvedCity = city || 'US';
      const resolvedTreatment = treatment || 'Emergency Service';
      const resolvedNiche = niche || 'hvac';

      const existing = await getProspectById(finalEmail);
      if (existing) {
        const patch = {};
        if (!existing.phone && phone) patch.phone = phone;
        if ((!existing.city || existing.city === 'US') && resolvedCity && resolvedCity !== 'US') patch.city = resolvedCity;
        if (!existing.website_url && normalizedUrl) patch.website_url = normalizedUrl;
        if (!existing.specific_observation && specificObservation) patch.specific_observation = specificObservation;
        if (!existing.recommended_angle && recommendedAngle) patch.recommended_angle = recommendedAngle;
        if (existing.clinic_name && /^bot verification|kevin whelan site/i.test(existing.clinic_name) && clinicName) patch.clinic_name = clinicName;
        if (existing.qual_status !== 'qualified') patch.qual_status = qualPassed ? 'qualified' : 'manual_override';
        if (existing.qual_score == null && qualScore != null) patch.qual_score = qualScore;
        if (!existing.qual_grade && qualGrade) patch.qual_grade = qualGrade;

        const updatedRow = Object.keys(patch).length ? await updateProspect(existing.id, patch) : existing;
        if (!updatedRow) {
          const errMsg = 'Failed to sync existing prospect in CRM';
          console.error('[ScraperIngest] Force sync error:', finalEmail, errMsg);
          return res.status(500).json({ status: 'failed', error: errMsg, message: errMsg });
        }
        console.log(`[ScraperIngest] Force Add synced existing CRM prospect ${finalEmail} (ID: ${updatedRow.id})`);
        return res.json({
          status: 'success',
          alreadyExists: true,
          synced: true,
          message: `Prospect ${finalEmail} is already in Pipeline CRM (synced).`,
          prospect: updatedRow,
          qualification: qualObj,
        });
      }

      const addRes = await addProspect({
        doctorName: resolvedDoctor,
        clinicName: resolvedClinic,
        email: finalEmail,
        city: resolvedCity,
        treatment: resolvedTreatment,
        phone: phone || '',
        website_url: normalizedUrl,
        niche: resolvedNiche,
        specific_observation: specificObservation || '',
        recommended_angle: recommendedAngle || '',
        notes: `Force Added from Lead Hunter: ${normalizedUrl} | Qual: ${qualScore != null ? qualScore : 'N/A'}/100 (${qualGrade}) | Phone: ${phone || 'N/A'}`,
        qual_score: qualScore,
        qual_grade: qualGrade,
        qual_status: qualPassed ? 'qualified' : 'manual_override',
        qual_breakdown: Object.keys(qualObj).length ? qualObj : null,
        review_count: qualObj.reviewCount ?? null,
        google_rating: qualObj.googleRating ?? null,
        fleet_size: qualObj.fleetSize ?? null,
      });

      if (!addRes || !addRes.success) {
        const errMsg = (addRes && (addRes.error || addRes.message)) || 'Failed to save lead into Pipeline CRM';
        console.error('[ScraperIngest] Force Add insert failed:', finalEmail, errMsg);
        return res.status(500).json({ status: 'failed', error: errMsg, message: errMsg });
      }

      console.log(`[ScraperIngest] Force Add created prospect ${finalEmail} (ID: ${addRes.prospect?.id})`);
      return res.json({
        status: 'success',
        message: 'Lead force-added to Pipeline CRM',
        prospect: addRes.prospect,
        qualification: qualObj,
      });
    }

    const result = await scrapeAndIngestLead({
      url,
      cityOverride: city,
      treatmentOverride: treatment,
      doctorOverride: doctorName,
      nicheOverride: niche || 'hvac',
      minScore: minScore || DEFAULT_QUALIFY_THRESHOLD,
      force: Boolean(force),
    });

    if (result.success) {
      res.json({ status: 'success', message: result.message || 'Qualified prospect added to Pipeline CRM', ...result });
    } else if (result.disqualified) {
      res.status(200).json({ status: 'disqualified', ...result });
    } else {
      res.status(400).json({ status: 'failed', ...result });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 3. Bulk scrape a list of URLs with qualification gate
scraperRouter.post('/bulk', async (req, res) => {
  let { urls, minScore, force, niche } = req.body || {};
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
    const summary = await scrapeBulkLeads(batch, {
      minScore: minScore || DEFAULT_QUALIFY_THRESHOLD,
      force: Boolean(force),
      nicheOverride: niche || 'hvac',
    });
    res.json({ status: 'success', ...summary });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 4a. Async Non-Blocking Hunt Starter (Prevents Reverse Proxy 502 Timeouts)
scraperRouter.post('/hunt/start', (req, res) => {
  const { city, niche, query, limit, minScore, notifyTelegram } = req.body || {};
  try {
    const parsedMin = minScore !== undefined && minScore !== '' ? Number(minScore) : DEFAULT_QUALIFY_THRESHOLD;
    const job = startHuntJob({
      city: (city || 'Los Angeles, CA').trim(),
      niche: niche || 'hvac',
      query,
      limit: Math.min(Math.max(Number(limit) || 10, 1), 40),
      minScore: Math.min(Math.max(Number.isFinite(parsedMin) ? parsedMin : DEFAULT_QUALIFY_THRESHOLD, 0), 100),
      notifyTelegram: notifyTelegram !== false,
    });
    res.status(202).json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4b. Poll Live Hunt Job Progress + Incremental Streamed Leads
scraperRouter.get('/hunt/status/:jobId', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const job = getHuntJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Hunt job not found or expired' });
  }
  res.json({ success: true, job });
});

// 4c. Cancel Active Hunt Job
scraperRouter.post('/hunt/cancel/:jobId', (req, res) => {
  const cancelled = cancelHuntJob(req.params.jobId);
  res.json({ success: true, cancelled });
});

// 4d. Synchronous Autonomous Lead Hunter (kept for direct REST callers; capped safely inside service)
scraperRouter.post('/hunt', async (req, res) => {
  const { city, niche, query, limit, minScore, notifyTelegram } = req.body || {};
  try {
    const parsedMin = minScore !== undefined && minScore !== '' ? Number(minScore) : DEFAULT_QUALIFY_THRESHOLD;
    const result = await runAutonomousHunt({
      city: (city || 'Los Angeles, CA').trim(),
      niche: niche || 'hvac',
      query,
      limit: Math.min(Math.max(Number(limit) || 5, 1), 10),
      minScore: Math.min(Math.max(Number.isFinite(parsedMin) ? parsedMin : DEFAULT_QUALIFY_THRESHOLD, 0), 100),
      notifyTelegram: notifyTelegram !== false,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4e. Territory Cascade lookup endpoint
scraperRouter.get('/cascade', (req, res) => {
  res.json({
    success: true,
    orderedCities: ORDERED_CASCADE_CITIES,
    nextCity: getNextCascadeCity(String(req.query.current || '')),
    territoryCascade: TERRITORY_CASCADE,
  });
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

    const result = await runDigitalAudit({ url, niche: niche || 'hvac' });
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

// 7. Standalone Web Dashboard for Lead Hunting, Qualification & Auditing
scraperRouter.get('/dashboard', (req, res) => {
  const authKey = req.query.key || '';
  const keyParam = authKey ? '?key=' + encodeURIComponent(authKey) : '';
  const cascadeOptionsHtml = buildTerritoryOptionsHtml();
  const safeCascadeJson = JSON.stringify(ORDERED_CASCADE_CITIES).replace(/</g, '\\u003c');

  const bodyContent = `
    <style>
      .badge-amber { background: rgba(245, 158, 11, 0.14); color: #F59E0B; border-color: rgba(245, 158, 11, 0.30); }
      .badge-rose { background: rgba(244, 63, 94, 0.14); color: #FB7185; border-color: rgba(244, 63, 94, 0.30); }
      html.light .badge-amber { background: rgba(217, 119, 6, 0.10); color: #B45309; border-color: rgba(217, 119, 6, 0.30); }
      html.light .badge-rose { background: rgba(225, 29, 72, 0.10); color: #BE123C; border-color: rgba(225, 29, 72, 0.28); }
      details > summary::-webkit-details-marker { display: none; }
    </style>

    <!-- Studio Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
      <div class="space-y-1">
        <div class="flex items-center gap-2.5 flex-wrap">
          <h2 class="text-xl font-bold tracking-tight text-[var(--text-primary)]">Lead Hunter</h2>
          <span class="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-[var(--accent-emerald-subtle)] text-[var(--accent-emerald)] border border-emerald-500/25 font-mono">
            ${getSvgIcon('shield', 'w-3 h-3')}
            <span>100-Pt Eye Test Gate</span>
          </span>
        </div>
        <p class="text-xs text-[var(--text-secondary)]">
          Source local trade contractors, audit after-hours intake leaks, and auto-commit qualified owners to Pipeline CRM.
        </p>
      </div>

      <div class="flex items-center gap-2.5 flex-wrap shrink-0">
        <a href="https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&q=HVAC%20Los%20Angeles%2C%20CA" id="topMetaAdsBtn" target="_blank" rel="noopener noreferrer" class="px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--accent-cyan)] border border-[var(--border-subtle)] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500" title="Open live Meta Ads Library for the active trade and city">
          ${getSvgIcon('globe', 'w-3.5 h-3.5')}
          <span>Meta Ads Library</span>
          ${getSvgIcon('external', 'w-3 h-3 opacity-75')}
        </a>
        <a href="/outreach/prospects${keyParam}" class="px-4 py-2 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
          ${getSvgIcon('pipeline', 'w-3.5 h-3.5 text-[var(--accent-emerald)]')}
          <span>Pipeline CRM</span>
          ${getSvgIcon('arrowRight', 'w-3 h-3 text-[var(--text-muted)]')}
        </a>
      </div>
    </div>

    <!-- Primary Hunt Control Deck -->
    <section class="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 space-y-5 shadow-sm">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label for="huntNiche" class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Trade Vertical</label>
          <select id="huntNiche" onchange="syncMetaAdsLink()" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-xs text-[var(--text-primary)] font-medium focus:outline-none focus:border-cyan-500 transition cursor-pointer">
            <option value="hvac" selected>HVAC &amp; AC Repair Contractors</option>
            <option value="plumbing">Plumbing &amp; Drain Service</option>
            <option value="roofing">Roofing &amp; Storm Restoration</option>
            <option value="electrical">Electrical &amp; Standby Generators</option>
            <option value="water_damage">Water Damage &amp; Mitigation</option>
          </select>
        </div>

        <div>
          <label for="huntCity" class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Target US City / Suburb</label>
          <div class="relative">
            <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--text-muted)]">
              ${getSvgIcon('mapPin', 'w-3.5 h-3.5')}
            </span>
            <input id="huntCity" type="text" value="Carmel, IN" oninput="syncMetaAdsLink()" onkeydown="if(event.key==='Enter'){event.preventDefault();runAutonomousHuntClient();}" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl pl-8 pr-3 py-2.5 text-xs text-[var(--text-primary)] font-medium focus:outline-none focus:border-cyan-500 transition" placeholder="e.g. Carmel, IN or Los Angeles, CA">
          </div>
        </div>

        <div>
          <label for="huntMinScore" class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">CRM Gate Threshold</label>
          <select id="huntMinScore" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-xs text-[var(--text-primary)] font-medium focus:outline-none focus:border-cyan-500 transition cursor-pointer">
            <option value="50">50+ Pts (Manual Review)</option>
            <option value="60" selected>60+ Pts (Tier B + Tier A Gate)</option>
            <option value="80">80+ Pts (Tier A Priority Only)</option>
          </select>
        </div>

        <div>
          <label for="huntLimit" class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Target Qualified Batch</label>
          <select id="huntLimit" class="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-xs text-[var(--text-primary)] font-medium focus:outline-none focus:border-cyan-500 transition cursor-pointer">
            <option value="5">5 Qualified Leads</option>
            <option value="10" selected>10 Qualified Leads</option>
            <option value="20">20 Qualified Leads</option>
            <option value="30">30 Qualified Leads</option>
            <option value="40">40 Qualified Leads</option>
          </select>
        </div>
      </div>

      <!-- Territory Cascade & Action Row -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
        <div class="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0">
          <label for="cascadeCitySelect" class="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] shrink-0">Territory Preset</label>
          <div class="flex items-center gap-2 flex-1 max-w-md">
            <select id="cascadeCitySelect" onchange="selectCascadeCity(this.value)" class="flex-1 min-w-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 cursor-pointer">
              ${cascadeOptionsHtml}
            </select>
            <button type="button" onclick="nextTerritoryCity()" class="px-3 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition inline-flex items-center gap-1.5 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500" title="Advance to the next city in the US territory cascade">
              <span>Next City</span>
              ${getSvgIcon('arrowRight', 'w-3 h-3')}
            </button>
          </div>
        </div>

        <div class="flex items-center gap-2.5 shrink-0">
          <button type="button" id="btnStopHunt" onclick="stopActiveHunt()" class="hidden px-4 py-2.5 rounded-xl badge-rose border text-xs font-bold transition items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
            ${getSvgIcon('close', 'w-3.5 h-3.5')}
            <span>Stop</span>
          </button>
          <button type="button" id="btnRunHunt" onclick="runAutonomousHuntClient()" class="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-md shadow-cyan-500/15 inline-flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
            ${getSvgIcon('play', 'w-3.5 h-3.5')}
            <span id="btnRunHuntLabel">Run Hunt</span>
          </button>
        </div>
      </div>

      <!-- Divider: Single URL Qualifier + Collapsible Rubric -->
      <div class="border-t border-[var(--border-subtle)] pt-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div class="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
          <div class="flex items-center gap-2 flex-1 max-w-lg">
            <input id="singleUrlInput" type="url" onkeydown="if(event.key==='Enter'){event.preventDefault();runSingleUrlTest();}" class="flex-1 min-w-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-cyan-500" placeholder="Inspect a single domain (e.g. https://aroundtheclockair.com)">
            <button type="button" id="btnTestSingle" onclick="runSingleUrlTest()" class="px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition inline-flex items-center gap-1.5 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
              ${getSvgIcon('sliders', 'w-3.5 h-3.5 text-[var(--accent-cyan)]')}
              <span id="btnTestSingleLabel">Test URL</span>
            </button>
          </div>
          <label class="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
            <input type="checkbox" id="singleAutoCommit" checked class="rounded border-[var(--border-strong)] accent-cyan-500 cursor-pointer">
            <span>Commit to CRM if passed</span>
          </label>
        </div>

        <button type="button" id="btnToggleRubric" onclick="toggleRubricPanel()" aria-expanded="false" aria-controls="rubricPanel" class="self-start lg:self-auto px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition inline-flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
          <span>Scoring Rubric</span>
          ${getSvgIcon('chevronDown', 'w-3.5 h-3.5 transition-transform duration-200')}
        </button>
      </div>

      <!-- Collapsible Qualification Rubric -->
      <div id="rubricPanel" class="hidden border-t border-[var(--border-subtle)] pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div class="bg-[var(--bg-card-subtle)] rounded-xl border border-[var(--border-subtle)] p-4 space-y-2.5">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-[var(--text-primary)]">Hard Must-Haves &amp; Auto-Blocklist</h3>
            <span class="text-[10px] font-mono text-rose-500 uppercase">Any NO = Instant Skip</span>
          </div>
          <ul class="space-y-1.5 text-[var(--text-secondary)]">
            <li class="flex items-center justify-between gap-2"><span>1. US Residential Service Only</span><span class="font-mono text-[11px] text-[var(--accent-emerald)]">No Commercial</span></li>
            <li class="flex items-center justify-between gap-2"><span>2. Goldilocks Fleet (2-15 Trucks / 20-500 Rev)</span><span class="font-mono text-[11px] text-[var(--accent-emerald)]">&gt;500 &amp; &lt;15 Blocked</span></li>
            <li class="flex items-center justify-between gap-2"><span>3. 100% Independent Owner</span><span class="font-mono text-[11px] text-[var(--accent-emerald)]">PE / AI Blocked</span></li>
            <li class="flex items-center justify-between gap-2"><span>4. Active Phone + Verified Owner Name</span><span class="font-mono text-[11px] text-[var(--accent-emerald)]">No Generic Only</span></li>
            <li class="flex items-center justify-between gap-2"><span>5. Compatible Stack (GCal/HCP/Jobber/GHL)</span><span class="font-mono text-[11px] text-[var(--accent-emerald)]">No Affiliates</span></li>
            <li class="flex items-center justify-between gap-2"><span>6. Verifiable Intake Friction</span><span class="font-mono text-[11px] text-[var(--accent-emerald)]">Form / 5 PM Gap</span></li>
          </ul>
        </div>
        <div class="bg-[var(--bg-card-subtle)] rounded-xl border border-[var(--border-subtle)] p-4 space-y-2.5">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-[var(--text-primary)]">100-Point Matrix &amp; Action Tiers</h3>
            <span class="text-[10px] font-mono text-[var(--accent-cyan)]">80+ Tier A | 60-79 Tier B</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[var(--text-secondary)]">
            <div class="flex justify-between"><span>A. Pain Signals (Test Call/Form/Hrs)</span><span class="font-mono font-semibold text-[var(--text-primary)]">35 pts</span></div>
            <div class="flex justify-between"><span>B. Fit &amp; Urgency (Fleet/Ads/Climate)</span><span class="font-mono font-semibold text-[var(--text-primary)]">25 pts</span></div>
            <div class="flex justify-between"><span>C. Ability to Buy (3+ Yrs &amp; High-Ticket)</span><span class="font-mono font-semibold text-[var(--text-primary)]">20 pts</span></div>
            <div class="flex justify-between"><span>D. Stack &amp; Owner Reachability</span><span class="font-mono font-semibold text-[var(--text-primary)]">20 pts</span></div>
          </div>
          <div class="pt-1.5 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] font-mono">
            Tier A (80-100): Dial + Custom PAS | Tier B (60-79): 4-Step Cadence | Tier C (&lt;60): Deleted
          </div>
        </div>
      </div>
    </section>

    <!-- Inline Error Recovery Alert -->
    <div id="huntErrorAlert" role="alert" class="hidden rounded-2xl border badge-rose p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="flex items-start gap-2.5 text-xs">
        ${getSvgIcon('alertTriangle', 'w-4 h-4 shrink-0 mt-0.5')}
        <div>
          <p class="font-bold">Hunt Execution Interrupted</p>
          <p id="huntErrorMessage" class="opacity-90 mt-0.5">Unable to complete scrape cycle.</p>
        </div>
      </div>
      <button type="button" onclick="runAutonomousHuntClient()" class="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs transition shrink-0 cursor-pointer">
        Retry Hunt
      </button>
    </div>

    <!-- Live Stream Telemetry Bar & Counters -->
    <section id="huntTelemetryPanel" aria-live="polite" aria-busy="false" class="hidden bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div class="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
          <span id="telemetryIcon">${getSvgIcon('spinner', 'w-4 h-4 text-[var(--accent-cyan)] animate-spin')}</span>
          <span id="telemetryStage">Initializing search job...</span>
        </div>
        <span id="telemetryProgressLabel" class="text-[11px] font-mono text-[var(--text-muted)]">0 / 0 evaluated</span>
      </div>

      <div class="w-full h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
        <div id="telemetryBar" class="h-full bg-cyan-500 rounded-full transition-all duration-300 motion-reduce:transition-none" style="width: 5%"></div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Discovered</div>
          <div id="kpiDiscovered" class="text-lg font-bold font-mono text-[var(--text-primary)] mt-0.5">0</div>
        </div>
        <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Audited</div>
          <div id="kpiEvaluated" class="text-lg font-bold font-mono text-[var(--accent-cyan)] mt-0.5">0</div>
        </div>
        <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">CRM Qualified</div>
          <div id="kpiCommitted" class="text-lg font-bold font-mono text-[var(--accent-emerald)] mt-0.5">0</div>
        </div>
        <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Blocked / Below Gate</div>
          <div id="kpiRejected" class="text-lg font-bold font-mono text-amber-500 mt-0.5">0</div>
        </div>
      </div>
    </section>

    <!-- Single-URL Qualification Preview Container -->
    <div id="singleQualCard" class="hidden space-y-2"></div>

    <!-- Streamed Leads Section -->
    <section id="resultsSection" class="space-y-4">
      <div id="resultsToolbar" class="hidden flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-1.5 flex-wrap text-xs">
          <button type="button" id="filterAllBtn" onclick="setResultFilter('all')" class="result-filter-btn px-3 py-1.5 rounded-xl bg-cyan-500/15 text-[var(--accent-cyan)] border border-cyan-500/35 font-bold cursor-pointer transition">All (0)</button>
          <button type="button" id="filterQualifiedBtn" onclick="setResultFilter('qualified')" class="result-filter-btn px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium cursor-pointer transition">Qualified (0)</button>
          <button type="button" id="filterDisqualifiedBtn" onclick="setResultFilter('disqualified')" class="result-filter-btn px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium cursor-pointer transition">Disqualified (0)</button>
        </div>
        <a href="/outreach/prospects${keyParam}" class="text-xs font-semibold text-[var(--accent-emerald)] hover:underline inline-flex items-center gap-1">
          <span>Open Pipeline CRM</span>
          ${getSvgIcon('arrowRight', 'w-3 h-3')}
        </a>
      </div>

      <div id="leadsContainer" class="space-y-3">
        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-10 text-center space-y-2">
          <div class="w-10 h-10 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center mx-auto text-[var(--accent-cyan)]">
            ${getSvgIcon('hunter', 'w-5 h-5')}
          </div>
          <h3 class="text-sm font-bold text-[var(--text-primary)]">Ready to Scout Trade Markets</h3>
          <p class="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            Select a vertical and target city above, then click <span class="font-semibold text-[var(--text-primary)]">Run Hunt</span>. Qualified owner-operators meeting the score gate are committed automatically to Pipeline CRM.
          </p>
        </div>
      </div>
    </section>
  `;

  const extraScripts = `
  <script>
    const CASCADE_CITIES = ${safeCascadeJson};
    const NICHE_LABELS = {
      hvac: 'HVAC',
      plumbing: 'Plumbing',
      roofing: 'Roofing',
      electrical: 'Electrician',
      water_damage: 'Water Damage Restoration'
    };

    const SVG = {
      checkCircle: '${getSvgIcon('checkCircle', 'w-3.5 h-3.5 shrink-0').replace(/'/g, "\\'")}',
      xCircle: '${getSvgIcon('xCircle', 'w-3.5 h-3.5 shrink-0').replace(/'/g, "\\'")}',
      alertTriangle: '${getSvgIcon('alertTriangle', 'w-3.5 h-3.5 shrink-0').replace(/'/g, "\\'")}',
      star: '${getSvgIcon('star', 'w-3.5 h-3.5 shrink-0').replace(/'/g, "\\'")}',
      mapPin: '${getSvgIcon('mapPin', 'w-3 h-3 shrink-0').replace(/'/g, "\\'")}',
      phone: '${getSvgIcon('phone', 'w-3 h-3 shrink-0').replace(/'/g, "\\'")}',
      mail: '${getSvgIcon('mail', 'w-3 h-3 shrink-0').replace(/'/g, "\\'")}',
      external: '${getSvgIcon('external', 'w-3 h-3 shrink-0').replace(/'/g, "\\'")}',
      plus: '${getSvgIcon('plus', 'w-3 h-3 shrink-0').replace(/'/g, "\\'")}',
      chevronDown: '${getSvgIcon('chevronDown', 'w-3.5 h-3.5 shrink-0').replace(/'/g, "\\'")}',
      spinner: '${getSvgIcon('spinner', 'w-4 h-4 text-[var(--accent-cyan)] animate-spin shrink-0').replace(/'/g, "\\'")}',
      done: '${getSvgIcon('checkCircle', 'w-4 h-4 text-[var(--accent-emerald)] shrink-0').replace(/'/g, "\\'")}',
      fail: '${getSvgIcon('xCircle', 'w-4 h-4 text-rose-500 shrink-0').replace(/'/g, "\\'")}'
    };

    let activeJobId = null;
    let pollTimer = null;
    let pollFailures = 0;
    let currentLeads = [];
    let currentFilter = 'all';
    let lastRenderedSig = '';

    function esc(str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function safeUrl(raw) {
      const val = String(raw || '').trim();
      if (!val) return '';
      if (/^https?:\\/\\//i.test(val)) return val;
      if (/^[a-z0-9.-]+\\.[a-z]{2,}/i.test(val)) return 'https://' + val;
      return '';
    }

    function fmtPhone(raw) {
      const digits = String(raw || '').replace(/[^0-9]/g, '');
      if (digits.length === 11 && digits.startsWith('1')) {
        return '+1 (' + digits.slice(1, 4) + ') ' + digits.slice(4, 7) + '-' + digits.slice(7);
      }
      if (digits.length === 10) {
        return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
      }
      return String(raw || '');
    }

    function syncMetaAdsLink() {
      const niche = document.getElementById('huntNiche').value || 'hvac';
      const city = document.getElementById('huntCity').value.trim() || 'Los Angeles, CA';
      const label = NICHE_LABELS[niche] || 'HVAC';
      const btn = document.getElementById('topMetaAdsBtn');
      if (btn) {
        btn.href = 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&q=' + encodeURIComponent(label + ' ' + city);
      }
    }

    function selectCascadeCity(cityVal) {
      if (!cityVal) return;
      document.getElementById('huntCity').value = cityVal;
      syncMetaAdsLink();
    }

    function nextTerritoryCity() {
      const input = document.getElementById('huntCity');
      const cur = (input.value || '').trim().toLowerCase();
      let idx = CASCADE_CITIES.findIndex((c) => c.toLowerCase() === cur || cur.indexOf(c.toLowerCase()) !== -1);
      if (idx === -1 || idx >= CASCADE_CITIES.length - 1) idx = 0;
      else idx += 1;
      const nextCity = CASCADE_CITIES[idx];
      input.value = nextCity;
      const sel = document.getElementById('cascadeCitySelect');
      if (sel) sel.value = nextCity;
      syncMetaAdsLink();
      showToast('Territory Shifted', 'Next market set to ' + nextCity, 'success');
    }

    function toggleRubricPanel() {
      const panel = document.getElementById('rubricPanel');
      const btn = document.getElementById('btnToggleRubric');
      if (!panel || !btn) return;
      const isHidden = panel.classList.contains('hidden');
      panel.classList.toggle('hidden');
      btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      const svg = btn.querySelector('svg');
      if (svg) svg.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    function eyeChip(item, fallbackLabel) {
      const state = item && typeof item === 'object' ? item.pass : item;
      const lbl = (item && item.label) ? item.label : fallbackLabel;
      if (state === true) {
        return '<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium bg-[var(--accent-emerald-subtle)] text-[var(--accent-emerald)] border-emerald-500/25" title="' + esc(lbl) + '">' +
          SVG.checkCircle + '<span>' + esc(fallbackLabel) + '</span></div>';
      }
      if (state === null || state === undefined) {
        return '<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)]" title="' + esc(lbl) + '">' +
          SVG.alertTriangle + '<span>' + esc(fallbackLabel) + ' (Unpublished)</span></div>';
      }
      return '<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium badge-rose" title="' + esc(lbl) + '">' +
        SVG.xCircle + '<span>' + esc(fallbackLabel) + '</span></div>';
    }

    function scoreBarRow(label, metricObj, maxPts) {
      const earned = metricObj && typeof metricObj === 'object' ? Number(metricObj.earned || 0) : Number(metricObj || 0);
      const detail = metricObj && metricObj.detail ? metricObj.detail : '';
      const pct = maxPts > 0 ? Math.min(100, Math.round((earned / maxPts) * 100)) : 0;
      return '<div class="space-y-1" title="' + esc(detail) + '">' +
        '<div class="flex justify-between text-[11px]">' +
          '<span class="text-[var(--text-secondary)]">' + esc(label) + '</span>' +
          '<span class="font-mono font-semibold text-[var(--text-primary)]">' + earned + '/' + maxPts + '</span>' +
        '</div>' +
        '<div class="w-full h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">' +
          '<div class="h-full rounded-full bg-cyan-500" style="width:' + pct + '%"></div>' +
        '</div>' +
        (detail ? '<div class="text-[10px] text-[var(--text-muted)] truncate">' + esc(detail) + '</div>' : '') +
      '</div>';
    }

    function extractHost(rawUrl) {
      try {
        return new URL(safeUrl(rawUrl) || rawUrl).hostname.replace(/^www\\./i, '');
      } catch (_) {
        return String(rawUrl || '');
      }
    }

    function renderLeadCard(lead, isSinglePreview) {
      const q = lead.qualification || {};
      const eye = q.eyeTest || {};
      const bd = q.breakdown || {};
      const score = Number.isFinite(q.score) ? q.score : 0;
      const passed = Boolean(q.qualified);
      const href = safeUrl(lead.url);
      const domainLabel = esc(extractHost(lead.domain || lead.url || ''));
      const bizName = lead.clinicName || lead.businessName || domainLabel;
      const ownerName = lead.doctorName || lead.ownerName || 'Owner / Team';
      const hookText = lead.specificObservation || lead.hook || lead.recommendedAngle || '';
      const revCount = q.reviewCount != null ? q.reviewCount : lead.reviewCount;
      const gRating = q.googleRating != null ? q.googleRating : lead.googleRating;
      const fleetSz = q.fleetSize != null ? q.fleetSize : lead.fleetSize;
      const phoneStr = lead.phone ? fmtPhone(lead.phone) : '';
      const telHref = lead.phone ? 'tel:' + String(lead.phone).replace(/[^0-9+]/g, '') : '';

      let scoreCls = 'badge-rose';
      if (passed && score >= 80) scoreCls = 'bg-[var(--accent-emerald-subtle)] text-[var(--accent-emerald)] border-emerald-500/30';
      else if (passed && score >= 60) scoreCls = 'bg-cyan-500/15 text-[var(--accent-cyan)] border-cyan-500/30';

      let dbPill = '';
      if (lead.dbStatus === 'saved') {
        dbPill = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--accent-emerald-subtle)] text-[var(--accent-emerald)] border border-emerald-500/30">' + SVG.checkCircle + '<span>Committed to CRM</span></span>';
      } else if (lead.dbStatus === 'duplicate') {
        dbPill = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"><span>Already in CRM</span></span>';
      } else if (lead.dbStatus === 'no_email') {
        dbPill = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold badge-amber border">' + SVG.alertTriangle + '<span>Qualified (No Email)</span></span>';
      } else if (lead.dbStatus === 'disqualified' || !passed) {
        dbPill = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold badge-rose border">' + SVG.xCircle + '<span>Tier C · Blocked</span></span>';
      }

      const ratingHtml = revCount
        ? '<span class="inline-flex items-center gap-1 text-[11px] font-mono badge-amber px-2 py-0.5 rounded-md border">' + SVG.star + '<span>' + esc(gRating || '4.8') + ' (' + esc(revCount) + ' rev)</span></span>'
        : '';

      const mh = q.mustHaves || {};
      const stackTag = q.schedulingStack && q.schedulingStack.stackName ? q.schedulingStack.stackName : '';

      window.__suregreetLeadMap = window.__suregreetLeadMap || {};
      window.__suregreetForceSavedUrls = window.__suregreetForceSavedUrls || {};
      window.__suregreetForceSavedHrefs = window.__suregreetForceSavedHrefs || {};
      const leadKey = String(href || lead.url || '').toLowerCase();
      if (leadKey) window.__suregreetLeadMap[leadKey] = lead;
      const forceState = leadKey ? window.__suregreetForceSavedUrls[leadKey] : null;
      const forcedHref = (leadKey && window.__suregreetForceSavedHrefs[leadKey]) || getAuthUrl('/outreach/prospects');

      const forceBtn = forceState === 'saved' || forceState === 'synced'
        ? '<div data-force-key="' + esc(leadKey) + '" class="inline-flex items-center gap-1.5 flex-wrap">' +
            '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--accent-emerald-subtle)] text-[var(--accent-emerald)] border border-emerald-500/30">' + (forceState === 'synced' ? 'Synced in CRM' : 'Added to CRM') + '</span>' +
            '<a href="' + esc(forcedHref) + '" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cyan-500/15 text-[var(--accent-cyan)] border border-cyan-500/30 hover:bg-cyan-500/25 transition">Open CRM</a>' +
          '</div>'
        : forceState === 'saving'
        ? '<button type="button" disabled data-force-key="' + esc(leadKey) + '" data-url="' + esc(href || lead.url) + '" data-city="' + esc(lead.city || '') + '" data-niche="' + esc(lead.niche || 'hvac') + '" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-secondary)] opacity-75">Saving...</button>'
        : (!passed || lead.dbStatus === 'disqualified' || lead.dbStatus === 'no_email') && (lead.email || href || lead.url) && lead.dbStatus !== 'saved' && lead.dbStatus !== 'duplicate'
        ? '<button type="button" onclick="forceAddLead(this)" data-force-key="' + esc(leadKey) + '" data-url="' + esc(href || lead.url) + '" data-city="' + esc(lead.city || '') + '" data-niche="' + esc(lead.niche || 'hvac') + '" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-primary)] cursor-pointer transition">' + SVG.plus + '<span>Force Add to CRM</span></button>'
        : '';

      const headerTag = isSinglePreview
        ? '<div class="text-[10px] font-mono uppercase tracking-wider text-[var(--accent-cyan)] mb-2 font-bold">Single-Domain Diagnostic</div>'
        : '';

      return '<article class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 sm:p-5 space-y-3.5 transition hover:border-[var(--border-strong)]">' +
        headerTag +
        '<div class="flex flex-col md:flex-row md:items-start justify-between gap-3">' +
          '<div class="space-y-1 min-w-0">' +
            '<div class="flex items-center gap-2 flex-wrap">' +
              '<h4 class="text-sm font-bold text-[var(--text-primary)] truncate">' + esc(bizName) + '</h4>' +
              (href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--accent-cyan)] hover:underline">' + domainLabel + ' ' + SVG.external + '</a>' : '') +
              ratingHtml +
            '</div>' +
            '<div class="flex items-center gap-3 flex-wrap text-xs text-[var(--text-secondary)]">' +
              '<span class="inline-flex items-center gap-1">' + SVG.mapPin + '<span>' + esc(lead.city || 'United States') + '</span></span>' +
              '<span>Owner/Lead: <strong class="text-[var(--text-primary)]">' + esc(ownerName) + '</strong></span>' +
              (fleetSz ? '<span class="font-mono text-[11px]">~' + esc(fleetSz) + ' trucks</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-2 flex-wrap shrink-0">' +
            '<span class="px-2.5 py-1 rounded-lg text-xs font-bold font-mono border ' + scoreCls + '">' + score + '/100 &middot; Tier ' + esc(q.grade || 'C') + '</span>' +
            dbPill +
          '</div>' +
        '</div>' +

        '<!-- Direct Contact + Call Leak Observation -->' +
        '<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3">' +
          '<div class="flex items-center gap-2 flex-wrap">' +
            (phoneStr
              ? '<a href="' + esc(telHref) + '" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent-emerald-subtle)] text-[var(--accent-emerald)] border border-emerald-500/25 font-mono text-xs font-bold hover:opacity-85 transition">' + SVG.phone + '<span>' + esc(phoneStr) + '</span></a>'
              : '<span class="text-xs text-[var(--text-muted)] italic">No phone found</span>') +
            (lead.email
              ? '<a href="mailto:' + esc(lead.email) + '" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 text-[var(--accent-cyan)] border border-cyan-500/25 font-mono text-xs hover:opacity-85 transition">' + SVG.mail + '<span>' + esc(lead.email) + '</span></a>'
              : '<span class="text-xs text-[var(--text-muted)] italic">No direct email</span>') +
          '</div>' +
          '<div class="text-xs text-[var(--text-secondary)] truncate lg:max-w-md" title="' + esc(hookText) + '">' +
            '<span class="font-semibold text-[var(--text-primary)]">Gap: </span>' + esc(hookText || q.tierLabel || 'Manual call-leak review recommended') +
          '</div>' +
        '</div>' +

        '<!-- Hard Must-Haves & Stack Row -->' +
        '<div class="flex items-center gap-2 flex-wrap">' +
          eyeChip(mh.residentialFocus || true, 'Residential Focus') +
          eyeChip(eye.reviewsInRange, '20-500 Reviews') +
          eyeChip(mh.independentOwnership || eye.familyOwned, 'Independent Owner') +
          eyeChip(mh.verifiablePhoneAndOwner, 'Verified Owner + Phone') +
          eyeChip(mh.compatibleStack, stackTag || 'Compatible Stack') +
          eyeChip(mh.verifiableIntakeFriction || eye.painConfirmed, 'Intake Friction') +
          eyeChip(eye.activeAds, 'Active Paid Ads') +
        '</div>' +

        '<!-- Expandable Score Breakdown & Force Override -->' +
        '<div class="flex items-center justify-between gap-3 pt-1">' +
          '<details class="flex-1">' +
            '<summary class="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer select-none list-none">' +
              SVG.chevronDown +
              '<span>Score Matrix (Pain 35 · Fit 25 · Ability 20 · Reach 20)</span>' +
            '</summary>' +
            '<div class="mt-3 pt-3 border-t border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">' +
              scoreBarRow('A. Pain Signals', bd.painSignals || bd.intakeFriction, 35) +
              scoreBarRow('B. Fit & Urgency', bd.fitAndUrgency || bd.fleetSize, 25) +
              scoreBarRow('C. Ability to Buy', bd.abilityToBuy || bd.highTicket, 20) +
              scoreBarRow('D. Stack & Owner', bd.easeAndReach || bd.ownerContact, 20) +
            '</div>' +
            (q.disqualifyReasons && q.disqualifyReasons.length
              ? '<div class="mt-2.5 text-[11px] text-amber-500 font-mono">Disqualifiers: ' + esc(q.disqualifyReasons.join(' | ')) + '</div>'
              : '') +
          '</details>' +
          '<div class="shrink-0">' + forceBtn + '</div>' +
        '</div>' +
      '</article>';
    }

    function setResultFilter(mode) {
      currentFilter = mode;
      document.querySelectorAll('.result-filter-btn').forEach((btn) => {
        btn.className = 'result-filter-btn px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-medium cursor-pointer transition';
      });
      const activeBtn = document.getElementById(
        mode === 'qualified' ? 'filterQualifiedBtn' : mode === 'disqualified' ? 'filterDisqualifiedBtn' : 'filterAllBtn'
      );
      if (activeBtn) {
        activeBtn.className = 'result-filter-btn px-3 py-1.5 rounded-xl bg-cyan-500/15 text-[var(--accent-cyan)] border border-cyan-500/35 font-bold cursor-pointer transition';
      }
      renderLeadsStream(true);
    }

    function renderLeadsStream(forceRedraw) {
      const sig = currentFilter + ':' + currentLeads.length + ':' + currentLeads.map((l) => (l.url || l.domain || '') + (l.dbStatus || '')).join(',');
      if (!forceRedraw && sig === lastRenderedSig) return;
      lastRenderedSig = sig;

      const totalCount = currentLeads.length;
      const qualLeads = currentLeads.filter((l) => l.qualification && l.qualification.qualified);
      const disqLeads = currentLeads.filter((l) => !l.qualification || !l.qualification.qualified);

      const toolbar = document.getElementById('resultsToolbar');
      if (totalCount > 0) toolbar.classList.remove('hidden');

      document.getElementById('filterAllBtn').textContent = 'All (' + totalCount + ')';
      document.getElementById('filterQualifiedBtn').textContent = 'Qualified (' + qualLeads.length + ')';
      document.getElementById('filterDisqualifiedBtn').textContent = 'Disqualified (' + disqLeads.length + ')';

      const list = currentFilter === 'qualified' ? qualLeads : currentFilter === 'disqualified' ? disqLeads : currentLeads;
      const container = document.getElementById('leadsContainer');

      if (!list.length) {
        container.innerHTML = '<div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-8 text-center text-xs text-[var(--text-secondary)]">No evaluated leads match the active filter yet.</div>';
        return;
      }

      container.innerHTML = list.map((lead) => renderLeadCard(lead, false)).join('');
    }

    function showHuntError(msg) {
      const box = document.getElementById('huntErrorAlert');
      document.getElementById('huntErrorMessage').textContent = msg || 'Unknown error while hunting leads.';
      box.classList.remove('hidden');
    }

    function clearHuntError() {
      document.getElementById('huntErrorAlert').classList.add('hidden');
    }

    function setHuntingUiState(isRunning) {
      const btn = document.getElementById('btnRunHunt');
      const lbl = document.getElementById('btnRunHuntLabel');
      const stopBtn = document.getElementById('btnStopHunt');
      const panel = document.getElementById('huntTelemetryPanel');
      btn.disabled = isRunning;
      btn.classList.toggle('opacity-60', isRunning);
      btn.classList.toggle('cursor-not-allowed', isRunning);
      lbl.textContent = isRunning ? 'Hunting Market...' : 'Run Hunt';
      if (isRunning) {
        stopBtn.classList.remove('hidden');
        stopBtn.classList.add('inline-flex');
        panel.classList.remove('hidden');
        panel.setAttribute('aria-busy', 'true');
      } else {
        stopBtn.classList.add('hidden');
        stopBtn.classList.remove('inline-flex');
        panel.setAttribute('aria-busy', 'false');
      }
    }

    async function runAutonomousHuntClient() {
      if (activeJobId && pollTimer) return;
      const city = document.getElementById('huntCity').value.trim();
      const niche = document.getElementById('huntNiche').value;
      const minScore = Number(document.getElementById('huntMinScore').value || 60);
      const limit = Number(document.getElementById('huntLimit').value || 10);

      if (!city) {
        showHuntError('Enter a target US city or select one from Territory Preset before launching.');
        document.getElementById('huntCity').focus();
        return;
      }

      clearHuntError();
      currentLeads = [];
      lastRenderedSig = '';
      pollFailures = 0;
      setHuntingUiState(true);

      document.getElementById('telemetryIcon').innerHTML = SVG.spinner;
      document.getElementById('telemetryStage').textContent = 'Starting search in ' + city + '...';
      document.getElementById('telemetryProgressLabel').textContent = '0 evaluated';
      document.getElementById('telemetryBar').style.width = '6%';
      document.getElementById('kpiDiscovered').textContent = '0';
      document.getElementById('kpiEvaluated').textContent = '0';
      document.getElementById('kpiCommitted').textContent = '0';
      document.getElementById('kpiRejected').textContent = '0';

      try {
        const res = await fetch(getAuthUrl('/scraper/hunt/start'), {
          method: 'POST',
          credentials: 'include',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ city, niche, limit, minScore, notifyTelegram: true }),
        });

        const data = await res.json();
        if (!res.ok || !data.success || !data.job) {
          throw new Error(data.error || data.message || 'Server failed to start hunt job (' + res.status + ')');
        }

        activeJobId = data.job.jobId;
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(pollHuntStatus, 1200);
        setTimeout(pollHuntStatus, 450);
      } catch (err) {
        activeJobId = null;
        setHuntingUiState(false);
        document.getElementById('telemetryIcon').innerHTML = SVG.fail;
        document.getElementById('telemetryStage').textContent = 'Failed to launch hunt';
        showHuntError(err.message);
      }
    }

    async function pollHuntStatus() {
      if (!activeJobId) return;
      try {
        const res = await fetch(getAuthUrl('/scraper/hunt/status/' + encodeURIComponent(activeJobId)), {
          credentials: 'include',
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (!res.ok || !data.success || !data.job) {
          throw new Error(data.error || 'Status check failed (' + res.status + ')');
        }

        pollFailures = 0;
        const job = data.job;
        const total = Math.max(job.totalCandidates || job.targetLimit || 1, 1);
        const pct = job.status === 'completed' ? 100 : Math.min(95, Math.max(8, Math.round(((job.evaluatedCount || 0) / total) * 100)));

        document.getElementById('telemetryStage').textContent = job.stage || 'Scanning contractors...';
        document.getElementById('telemetryProgressLabel').textContent = (job.evaluatedCount || 0) + ' / ' + (job.totalCandidates || '?') + ' evaluated';
        document.getElementById('telemetryBar').style.width = pct + '%';

        document.getElementById('kpiDiscovered').textContent = String(job.totalCandidates || 0);
        document.getElementById('kpiEvaluated').textContent = String(job.evaluatedCount || 0);
        document.getElementById('kpiCommitted').textContent = String(job.committedCount || 0);
        document.getElementById('kpiRejected').textContent = String(job.disqualifiedCount || 0);

        if (Array.isArray(job.leads)) {
          currentLeads = job.leads;
          renderLeadsStream(false);
        }

        if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed') {
          clearInterval(pollTimer);
          pollTimer = null;
          activeJobId = null;
          setHuntingUiState(false);

          if (job.status === 'completed') {
            document.getElementById('telemetryIcon').innerHTML = SVG.done;
            showToast('Hunt Complete', (job.committedCount || 0) + ' qualified leads committed to CRM.', 'success');
          } else if (job.status === 'cancelled') {
            document.getElementById('telemetryIcon').innerHTML = SVG.alertTriangle;
            showToast('Hunt Stopped', 'Cancelled cleanly. Partial leads retained below.', 'success');
          } else {
            document.getElementById('telemetryIcon').innerHTML = SVG.fail;
            showHuntError(job.error || 'Background job terminated with an error.');
          }
        }
      } catch (err) {
        pollFailures += 1;
        if (pollFailures >= 4) {
          clearInterval(pollTimer);
          pollTimer = null;
          activeJobId = null;
          setHuntingUiState(false);
          document.getElementById('telemetryIcon').innerHTML = SVG.fail;
          showHuntError('Lost connection while polling status: ' + err.message);
        }
      }
    }

    async function stopActiveHunt() {
      if (!activeJobId) return;
      document.getElementById('telemetryStage').textContent = 'Stopping active hunt wave...';
      try {
        await fetch(getAuthUrl('/scraper/hunt/cancel/' + encodeURIComponent(activeJobId)), {
          method: 'POST',
          headers: getAuthHeaders(),
        });
      } catch (_) {}
    }

    async function runSingleUrlTest() {
      const urlInput = document.getElementById('singleUrlInput');
      const rawUrl = urlInput.value.trim();
      const city = document.getElementById('huntCity').value.trim();
      const niche = document.getElementById('huntNiche').value;
      const minScore = Number(document.getElementById('huntMinScore').value || 60);
      const autoCommit = document.getElementById('singleAutoCommit').checked;

      if (!rawUrl) {
        showToast('Missing URL', 'Paste a contractor website URL first.', 'error');
        urlInput.focus();
        return;
      }

      const btn = document.getElementById('btnTestSingle');
      const lbl = document.getElementById('btnTestSingleLabel');
      btn.disabled = true;
      lbl.textContent = 'Auditing...';

      try {
        const res = await fetch(getAuthUrl('/scraper/qualify'), {
          method: 'POST',
          credentials: 'include',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ url: rawUrl, city, niche, minScore, autoCommit }),
        });
        const data = await res.json();
        if (!res.ok || !data.success || !data.lead) {
          throw new Error(data.message || data.error || 'Qualification failed');
        }

        const box = document.getElementById('singleQualCard');
        box.innerHTML = renderLeadCard(data.lead, true);
        box.classList.remove('hidden');

        if (data.committed) {
          showToast('CRM Committed', (data.lead.businessName || rawUrl) + ' passed (' + (data.qualification?.score || 0) + '/100).', 'success');
        } else {
          showToast('Audit Complete', 'Score: ' + (data.qualification?.score || 0) + '/100 (Tier ' + (data.qualification?.grade || 'C') + ')', 'success');
        }
      } catch (err) {
        showToast('Inspection Failed', err.message, 'error');
      } finally {
        btn.disabled = false;
        lbl.textContent = 'Test URL';
      }
    }

    async function forceAddLead(btn) {
      const url = btn.dataset.url;
      const forceKey = (btn.dataset.forceKey || url || '').toLowerCase();
      const city = btn.dataset.city || '';
      const niche = btn.dataset.niche || 'hvac';
      if (!url) return;

      const leadMap = window.__suregreetLeadMap || {};
      const cachedLead =
        leadMap[forceKey] ||
        leadMap[String(url).toLowerCase()] ||
        currentLeads.find((l) => l.url === url || safeUrl(l.url) === url) ||
        null;

      window.__suregreetForceSavedUrls = window.__suregreetForceSavedUrls || {};
      window.__suregreetForceSavedUrls[forceKey] = 'saving';
      btn.disabled = true;
      btn.textContent = 'Saving...';

      const findActiveTarget = () => {
        if (btn && btn.isConnected) return btn;
        const nodes = document.querySelectorAll('[data-force-key]');
        for (const el of nodes) {
          if (el.getAttribute('data-force-key') === forceKey) return el;
        }
        return btn;
      };

      try {
        const payload = {
          url,
          city: city || (cachedLead && cachedLead.city) || '',
          niche: niche || (cachedLead && cachedLead.niche) || 'hvac',
          force: true,
        };
        if (cachedLead) {
          if (cachedLead.clinicName || cachedLead.businessName) payload.clinicName = cachedLead.clinicName || cachedLead.businessName;
          if (cachedLead.doctorName || cachedLead.ownerName) payload.doctorName = cachedLead.doctorName || cachedLead.ownerName;
          if (cachedLead.email) payload.email = cachedLead.email;
          if (cachedLead.phone) payload.phone = cachedLead.phone;
          if (cachedLead.treatment) payload.treatment = cachedLead.treatment;
          if (cachedLead.specificObservation || cachedLead.hook) payload.specificObservation = cachedLead.specificObservation || cachedLead.hook;
          if (cachedLead.recommendedAngle) payload.recommendedAngle = cachedLead.recommendedAngle;
          if (cachedLead.qualification) payload.qualification = cachedLead.qualification;
        }

        const res = await fetch(getAuthUrl('/scraper/ingest'), {
          method: 'POST',
          credentials: 'include',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
          const crmBase = getAuthUrl('/outreach/prospects');
          const pid = data.prospect && data.prospect.id ? '&highlight=' + encodeURIComponent(data.prospect.id) : '';
          const crmHref = crmBase + (crmBase.includes('?') ? '&' : '?') + 't=' + Date.now() + pid;
          const badgeLabel = data.alreadyExists ? 'Synced in CRM' : 'Added to CRM';
          const leadTitle = (data.prospect && data.prospect.clinic_name) || (cachedLead && (cachedLead.clinicName || cachedLead.businessName)) || url;
          showToast(badgeLabel, leadTitle + (data.alreadyExists ? ' synced cleanly in Pipeline CRM.' : ' added to Pipeline CRM.'), 'success');
          if (cachedLead) cachedLead.dbStatus = 'saved';
          window.__suregreetForceSavedUrls[forceKey] = data.alreadyExists ? 'synced' : 'saved';
          window.__suregreetForceSavedHrefs = window.__suregreetForceSavedHrefs || {};
          window.__suregreetForceSavedHrefs[forceKey] = crmHref;
          const targetEl = findActiveTarget();
          if (targetEl) {
            targetEl.outerHTML =
              '<div data-force-key="' + esc(forceKey) + '" class="inline-flex items-center gap-1.5 flex-wrap">' +
                '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--accent-emerald-subtle)] text-[var(--accent-emerald)] border border-emerald-500/30">' + badgeLabel + '</span>' +
                '<a href="' + esc(crmHref) + '" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cyan-500/15 text-[var(--accent-cyan)] border border-cyan-500/30 hover:bg-cyan-500/25 transition">Open CRM</a>' +
              '</div>';
          }
        } else {
          throw new Error((data && (data.message || data.error)) || 'Unable to force add (HTTP ' + res.status + ')');
        }
      } catch (err) {
        if (window.__suregreetForceSavedUrls) delete window.__suregreetForceSavedUrls[forceKey];
        const targetEl = findActiveTarget();
        if (targetEl) {
          targetEl.disabled = false;
          targetEl.innerHTML = SVG.plus + '<span>Force Add to CRM</span>';
        }
        showToast('Save Failed', err.message, 'error');
      }
    }

    window.addEventListener('pageshow', (event) => {
      if (event.persisted) window.location.reload();
    });
  </script>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(
    renderSaasShell({
      title: 'Lead Hunter Studio — SureGreet AI',
      activeNav: 'scraper',
      pageHeading: 'Lead Hunter Studio',
      badgeText: '100-Pt Eye Test',
      bodyContent,
      extraScripts,
      authKeyParam: authKey,
    })
  );
});
