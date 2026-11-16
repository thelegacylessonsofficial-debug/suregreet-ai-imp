import * as cheerio from 'cheerio';
import { fetchJinaMarkdown, runDigitalAudit } from './auditorService.js';
import { addProspect, getProspectById, updateProspect, getProspects } from './outreachService.js';
import { scrapeClinicWebsite, normalizeUrl } from './scraperService.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * High-Ticket Search Queries per Niche
 */
const NICHE_QUERIES = {
  medspa: [
    'MedSpa Morpheus8',
    'BodyTite Plastic Surgery',
    'Medical Aesthetics Botox',
    'CoolSculpting Med Spa',
  ],
  hvac: [
    'Emergency HVAC Repair',
    '24/7 AC Repair Commercial Heating',
    'Emergency Plumbing and HVAC',
    'Air Conditioning Repair Replacement',
  ],
};

/**
 * Fallback Curated High-Ticket Target Domains per Metro (Used if search engine blocks cloud datacenter IP)
 */
const CURATED_TARGETS = {
  medspa: {
    miami: [
      { title: 'Monaco MedSpa Midtown Miami', url: 'https://www.monacomedspa.com', city: 'Miami, FL' },
      { title: 'Aglow Medical & MedSpa Miami Lakes', url: 'https://aglowmiami.com', city: 'Miami, FL' },
      { title: 'Miami Center for Dermatology & Medspa', url: 'https://microneedlingmiamicenter.com', city: 'Miami, FL' },
      { title: 'Flamingo Beauty MedSpa Miami', url: 'https://www.flamingobeautymiami.com', city: 'Miami, FL' },
      { title: 'Hochstein Medspa Miami Beach', url: 'https://www.lhochsteinmd.com', city: 'Miami, FL' },
    ],
    dallas: [
      { title: 'Vitalyc Medspa Dallas', url: 'https://www.vitalyc.com', city: 'Dallas, TX' },
      { title: 'Innovative Dermatology & Medspa Dallas', url: 'https://www.innovativederm.com', city: 'Dallas, TX' },
      { title: 'EpiCentre Skin Care & Laser Dallas', url: 'https://www.epicentreskincare.com', city: 'Dallas, TX' },
    ],
    scottsdale: [
      { title: 'Sens Aesthetics Scottsdale', url: 'https://www.sensaesthetics.com', city: 'Scottsdale, AZ' },
      { title: 'Clean Slate Laser MedSpa Scottsdale', url: 'https://www.cleanslateaz.com', city: 'Scottsdale, AZ' },
    ],
  },
  hvac: {
    miami: [
      { title: 'Direct Air Conditioning & Emergency HVAC Miami', url: 'https://www.directairfl.com', city: 'Miami, FL' },
      { title: 'Air Around the Clock 24/7 HVAC South Florida', url: 'https://www.airaroundtheclock.com', city: 'Miami, FL' },
    ],
    dallas: [
      { title: 'Lex Air Conditioning & Heating 24/7 Emergency Dallas', url: 'https://www.lexairconditioning.com', city: 'Dallas, TX' },
    ],
  },
};

/**
 * Query search engines (DuckDuckGo HTML -> DuckDuckGo Lite -> Curated Fallbacks)
 */
export async function searchLocalBusinesses({ query, city = 'Miami, FL', niche = 'medspa', limit = 5 }) {
  const fullQuery = `${query || NICHE_QUERIES[niche]?.[0] || 'MedSpa'} ${city}`.trim();
  console.log(`[LeadHunter] Searching local businesses: "${fullQuery}" (Limit: ${limit})...`);

  const rawResults = [];

  // Strategy 1: Standard DuckDuckGo HTML
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(fullQuery)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    clearTimeout(timer);
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

      $('.result').each((i, el) => {
        if (rawResults.length >= limit * 2) return;

        const title = $(el).find('.result__title a').text().trim();
        let rawHref = $(el).find('.result__title a').attr('href') || '';
        const snippet = $(el).find('.result__snippet').text().trim();

        if (rawHref.includes('uddg=')) {
          try {
            const match = rawHref.match(/uddg=([^&]+)/);
            if (match) rawHref = decodeURIComponent(match[1]);
          } catch (e) {}
        }

        if (!rawHref.startsWith('http')) return;

        const isDirectory = /(yelp\.com|groupon\.com|healthgrades\.com|yellowpages\.com|angi\.com|mapquest\.com|bbb\.org|facebook\.com|instagram\.com|tripadvisor\.com|expertise\.com|thumbtack\.com|indeed\.com|duckduckgo\.com)/i.test(rawHref);
        if (isDirectory) return;

        const normalized = normalizeUrl(rawHref);
        if (!normalized) return;

        if (!rawResults.some((r) => r.url === normalized)) {
          rawResults.push({ title, url: normalized, snippet, city, niche });
        }
      });
    }
  } catch (err) {
    console.warn('[LeadHunter] DDG standard search warning:', err.message);
  }

  // Strategy 2: DuckDuckGo Lite Fallback if standard HTML was blocked
  if (rawResults.length === 0) {
    console.log('[LeadHunter] DDG standard returned 0. Trying DuckDuckGo Lite fallback...');
    try {
      const liteRes = await fetch('https://lite.duckduckgo.com/lite/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          Accept: 'text/html',
        },
        body: `q=${encodeURIComponent(fullQuery)}`,
      });

      if (liteRes.ok) {
        const liteHtml = await liteRes.text();
        const $lite = cheerio.load(liteHtml);

        $lite('.result-link').each((i, el) => {
          if (rawResults.length >= limit * 2) return;
          let href = $lite(el).attr('href') || '';
          const title = $lite(el).text().trim();

          if (href.includes('uddg=')) {
            const m = href.match(/uddg=([^&]+)/);
            if (m) href = decodeURIComponent(m[1]);
          }

          if (!href.startsWith('http')) return;

          const isDir = /(yelp\.com|groupon\.com|healthgrades\.com|yellowpages\.com|angi\.com|mapquest\.com|bbb\.org|facebook\.com|instagram\.com|tripadvisor\.com|expertise\.com|thumbtack\.com|indeed\.com|duckduckgo\.com|bing\.com)/i.test(href);
          if (isDir) return;

          const norm = normalizeUrl(href);
          if (norm && !rawResults.some((r) => r.url === norm)) {
            rawResults.push({ title, url: norm, snippet: title, city, niche });
          }
        });
      }
    } catch (err) {
      console.warn('[LeadHunter] DDG Lite warning:', err.message);
    }
  }

  // Strategy 3: Curated Geographic High-Ticket Targets if cloud datacenter IP was blocked
  if (rawResults.length === 0) {
    console.log('[LeadHunter] Search engines blocked datacenter IP. Using curated regional target clinics...');
    const cityKey = (city.toLowerCase().split(',')[0] || '').trim();
    const curatedList =
      CURATED_TARGETS[niche]?.[cityKey] ||
      CURATED_TARGETS[niche]?.miami ||
      CURATED_TARGETS.medspa.miami;

    for (const c of curatedList) {
      rawResults.push({
        title: c.title,
        url: c.url,
        snippet: `${c.title} - High-Ticket Service Center in ${c.city}`,
        city: c.city,
        niche,
      });
    }
  }

  console.log(`[LeadHunter] Found ${rawResults.length} prospective domains.`);
  return rawResults.slice(0, limit);
}

/**
 * Enrich a raw scraped lead with decision-maker name, direct email, phone, and run digital audit
 */
export async function huntAndEnrichLead({ url, city, niche = 'medspa', doctorOverride, treatmentOverride }) {
  console.log(`[LeadHunter] Enriching & Auditing: ${url} (${niche})...`);

  // 1. Scrape domain for decision maker, emails, phones, and ad tracking pixels
  const scraped = await scrapeClinicWebsite(url);
  if (!scraped.success) {
    return { success: false, url, error: scraped.error };
  }

  // 2. Decision Maker fallback extraction
  let decisionMaker = doctorOverride || scraped.doctorName;
  if (!decisionMaker || decisionMaker === 'Doctor') {
    if (niche === 'hvac') {
      decisionMaker = 'Owner / Operations Lead';
    } else {
      decisionMaker = `Medical Director at ${scraped.clinicName || 'Clinic'}`;
    }
  }

  // 3. Run The Auditor (Speed-to-lead & Friction Diagnostics via Jina Reader)
  const audit = await runDigitalAudit({
    url,
    niche,
    businessName: scraped.clinicName,
    doctorName: decisionMaker,
  });

  const primaryTreatment = treatmentOverride || audit.primaryService || scraped.treatment;

  return {
    success: true,
    url: scraped.url,
    clinicName: scraped.clinicName,
    doctorName: decisionMaker,
    email: scraped.email,
    allEmails: scraped.allEmails,
    phone: scraped.phone,
    city: city || scraped.city,
    treatment: primaryTreatment,
    niche,
    adSignals: scraped.adSignals,
    specificObservation: audit.specificObservation,
    recommendedAngle: audit.recommendedAngle,
    hasStaticForm: audit.hasStaticForm,
  };
}

/**
 * Deduplicate against Supabase and save enriched lead as RAW_LEAD (pending)
 */
export async function commitLeadToSupabase(enrichedLead) {
  if (!enrichedLead || !enrichedLead.email) {
    return {
      success: false,
      message: 'Cannot commit to Supabase: No direct email found.',
      lead: enrichedLead,
    };
  }

  const normalizedEmail = enrichedLead.email.toLowerCase().trim();

  // Deduplication check: Check by email
  const existing = await getProspectById(normalizedEmail);
  if (existing) {
    // If it exists, update specific_observation and recommended_angle if missing
    if (!existing.specific_observation && enrichedLead.specificObservation) {
      await updateProspect(existing.id, {
        specific_observation: enrichedLead.specificObservation,
        recommended_angle: enrichedLead.recommendedAngle,
        website_url: enrichedLead.url,
        phone: enrichedLead.phone,
        niche: enrichedLead.niche,
      });
    }

    return {
      success: false,
      alreadyExists: true,
      message: `Prospect ${normalizedEmail} already exists in Supabase.`,
      prospect: existing,
    };
  }

  // Insert into Supabase public.prospects
  const notes = `Hunter Auto-Ingest: ${enrichedLead.url} | Ad Spend: ${enrichedLead.adSignals?.hasPaidAds ? 'ACTIVE' : 'Organic'} | Phone: ${enrichedLead.phone || 'N/A'}`;

  const addResult = await addProspect({
    doctorName: enrichedLead.doctorName,
    clinicName: enrichedLead.clinicName,
    email: normalizedEmail,
    city: enrichedLead.city,
    treatment: enrichedLead.treatment,
    notes,
  });

  if (!addResult.success) {
    return { success: false, error: addResult.error || 'Failed to insert lead' };
  }

  // Update additional diagnostic columns (specific_observation, recommended_angle, website_url, phone, niche)
  const prospectId = addResult.prospect.id;
  const updatedProspect = await updateProspect(prospectId, {
    specific_observation: enrichedLead.specificObservation,
    recommended_angle: enrichedLead.recommendedAngle,
    website_url: enrichedLead.url,
    phone: enrichedLead.phone,
    niche: enrichedLead.niche || 'medspa',
  });

  return {
    success: true,
    prospect: updatedProspect || addResult.prospect,
  };
}

/**
 * Full Autonomous Lead Hunter Execution: Search -> Enrich -> Audit -> Deduplicate -> Commit
 */
export async function runAutonomousHunt({ city = 'Miami, FL', niche = 'medspa', query, limit = 5 }) {
  console.log(`[LeadHunter] Starting Autonomous Hunt for ${niche} in ${city}...`);

  // Step 1: Search
  const businesses = await searchLocalBusinesses({ query, city, niche, limit });
  if (!businesses || businesses.length === 0) {
    return {
      success: false,
      message: `No eligible non-directory domains found for ${city} query.`,
      city,
      niche,
      leads: [],
    };
  }

  // Step 2 & 3: Enrich, Audit & Commit
  const enrichedLeads = [];
  let committedCount = 0;

  for (let i = 0; i < businesses.length; i++) {
    const item = businesses[i];
    try {
      const enriched = await huntAndEnrichLead({
        url: item.url,
        city: item.city,
        niche: item.niche,
      });

      if (enriched.success) {
        // Commit with deduplication
        const commitRes = await commitLeadToSupabase(enriched);
        enriched.savedToDb = commitRes.success;
        enriched.dbStatus = commitRes.alreadyExists ? 'duplicate' : commitRes.success ? 'saved' : 'no_email';
        if (commitRes.success) committedCount++;
        enrichedLeads.push(enriched);
      }
    } catch (err) {
      console.warn(`[LeadHunter] Failed to process ${item.url}:`, err.message);
    }

    // Rate-limiting delay between deep crawls
    if (i < businesses.length - 1) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  return {
    success: true,
    city,
    niche,
    totalSearched: businesses.length,
    committedCount,
    leads: enrichedLeads,
  };
}
