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
 * Query search engines (DuckDuckGo HTML / Bing) for target business domains (Zero-Cost API)
 */
export async function searchLocalBusinesses({ query, city = 'Miami, FL', niche = 'medspa', limit = 5 }) {
  const fullQuery = `${query || NICHE_QUERIES[niche]?.[0] || 'MedSpa'} ${city}`.trim();
  console.log(`[LeadHunter] Searching local businesses: "${fullQuery}" (Limit: ${limit})...`);

  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(fullQuery)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    const res = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[LeadHunter] DuckDuckGo returned status ${res.status}`);
      return [];
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const rawResults = [];
    $('.result').each((i, el) => {
      if (rawResults.length >= limit * 2) return;

      const title = $(el).find('.result__title a').text().trim();
      let rawHref = $(el).find('.result__title a').attr('href') || '';
      const snippet = $(el).find('.result__snippet').text().trim();

      // DuckDuckGo redirects through /l/?uddg=...
      if (rawHref.includes('uddg=')) {
        try {
          const match = rawHref.match(/uddg=([^&]+)/);
          if (match) {
            rawHref = decodeURIComponent(match[1]);
          }
        } catch (e) {}
      }

      if (!rawHref.startsWith('http')) return;

      // Filter out directory spam (Yelp, Groupon, Healthgrades, YellowPages, Angi, etc.)
      const isDirectory = /(yelp\.com|groupon\.com|healthgrades\.com|yellowpages\.com|angi\.com|mapquest\.com|bbb\.org|facebook\.com|instagram\.com|tripadvisor\.com|expertise\.com|thumbtack\.com|indeed\.com)/i.test(rawHref);
      if (isDirectory) return;

      const normalized = normalizeUrl(rawHref);
      if (!normalized) return;

      // Deduplicate inside search batch
      if (!rawResults.some((r) => r.url === normalized)) {
        rawResults.push({
          title,
          url: normalized,
          snippet,
          city,
          niche,
        });
      }
    });

    console.log(`[LeadHunter] Found ${rawResults.length} raw prospective domains.`);
    return rawResults.slice(0, limit);
  } catch (err) {
    console.error('[LeadHunter] Search error:', err.message);
    return [];
  }
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
