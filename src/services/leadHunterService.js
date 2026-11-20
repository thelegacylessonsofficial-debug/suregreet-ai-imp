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
      { title: 'Med Aesthetics Miami', url: 'https://www.medaestheticsmiami.com', city: 'Miami, FL' },
      { title: 'Aglow Medical & MedSpa Miami Lakes', url: 'https://aglowmiami.com', city: 'Miami, FL' },
      { title: 'Microneedling & Morpheus8 Miami Center', url: 'https://microneedlingmiamicenter.com', city: 'Miami, FL' },
      { title: 'Hochstein Medspa Miami Beach', url: 'https://www.lhochsteinmd.com', city: 'Miami, FL' },
      { title: 'DermaCare Brickell Laser & MedSpa', url: 'https://dermacarebrickell.com', city: 'Miami, FL' },
    ],
    dallas: [
      { title: 'Vitalyc Medspa Dallas', url: 'https://www.vitalyc.com', city: 'Dallas, TX' },
      { title: 'Rejuve Med-Spa Dallas', url: 'https://www.rejuvemedspa.com', city: 'Dallas, TX' },
      { title: 'EpiCentre Skin Care & Laser Dallas', url: 'https://www.epicentreskincare.com', city: 'Dallas, TX' },
      { title: 'Lumea Med Spa Dallas', url: 'https://lumeamedspa.com', city: 'Dallas, TX' },
      { title: 'Dallas Plastic Surgery Institute MedSpa', url: 'https://dpsi.org', city: 'Dallas, TX' },
    ],
    phoenix: [
      { title: 'Vibrant Skin Bar Phoenix', url: 'https://vibrantskinbar.com', city: 'Phoenix, AZ' },
      { title: 'Scottsdale Skin & Holistic MedSpa', url: 'https://scottsdalemedspa.com', city: 'Phoenix, AZ' },
      { title: 'Skin Science Institute Phoenix', url: 'https://skinscienceinstitute.com', city: 'Phoenix, AZ' },
      { title: 'Sculpted Contours MedSpa Phoenix', url: 'https://sculptedcontours.com', city: 'Phoenix, AZ' },
      { title: 'Beverly Hills Rejuvenation Center Scottsdale', url: 'https://bhrcenter.com', city: 'Phoenix, AZ' },
      { title: 'Skin Cabinet MedSpa Phoenix', url: 'https://skincabinet.com', city: 'Phoenix, AZ' },
    ],
    scottsdale: [
      { title: 'Vibrant Skin Bar Scottsdale', url: 'https://vibrantskinbar.com', city: 'Scottsdale, AZ' },
      { title: 'Scottsdale Skin & Holistic MedSpa', url: 'https://scottsdalemedspa.com', city: 'Scottsdale, AZ' },
      { title: 'Beverly Hills Rejuvenation Center Scottsdale', url: 'https://bhrcenter.com', city: 'Scottsdale, AZ' },
      { title: 'Skin Cabinet MedSpa Scottsdale', url: 'https://skincabinet.com', city: 'Scottsdale, AZ' },
    ],
    austin: [
      { title: 'Elevate Body & Face Medspa Austin', url: 'https://www.elevatemedspa.com', city: 'Austin, TX' },
      { title: 'Viva Day Spa + Med Spa Austin', url: 'https://www.vivadayspa.com', city: 'Austin, TX' },
      { title: 'Beleza Surgery & Medspa Austin', url: 'https://belezasurgery.com', city: 'Austin, TX' },
      { title: 'Austin Medspa', url: 'https://austinmedspa.com', city: 'Austin, TX' },
      { title: 'Restoration MedSpa Austin', url: 'https://restorationmedspa.com', city: 'Austin, TX' },
    ],
    atlanta: [
      { title: 'ELLEMES Medical Spa Atlanta', url: 'https://www.ellemesmedspa.com', city: 'Atlanta, GA' },
      { title: 'Atlanta Skin & Beauty Clinic', url: 'https://www.atlantaskinwellnesscenter.com', city: 'Atlanta, GA' },
      { title: 'Skin IQ Medspa Atlanta', url: 'https://skiniqmedspa.com', city: 'Atlanta, GA' },
      { title: 'Aya Medical Spa Atlanta', url: 'https://ayaskincare.com', city: 'Atlanta, GA' },
    ],
    houston: [
      { title: 'SkinCeuticals SkinLab Houston', url: 'https://skinlabhouston.com', city: 'Houston, TX' },
      { title: 'Clinic 45 Medical Spa Houston', url: 'https://clinic45.com', city: 'Houston, TX' },
      { title: 'Heights Med Spa Houston', url: 'https://heightsmedspa.com', city: 'Houston, TX' },
      { title: 'DermaTouch RN MedSpa Houston', url: 'https://dermatouchrn.com', city: 'Houston, TX' },
    ],
    'los angeles': [
      { title: 'Beverly Hills Rejuvenation Center LA', url: 'https://bhrcenter.com', city: 'Los Angeles, CA' },
      { title: 'Westside Aesthetics Los Angeles', url: 'https://westsideaesthetics.com', city: 'Los Angeles, CA' },
      { title: 'Motykie Med Spa Beverly Hills', url: 'https://motykiemedspa.com', city: 'Los Angeles, CA' },
    ],
    orlando: [
      { title: 'LightTouch Med Spa Orlando', url: 'https://lighttouchmedspa.com', city: 'Orlando, FL' },
      { title: 'Fiala Aesthetics Medical Spa Orlando', url: 'https://medspaorlando.com', city: 'Orlando, FL' },
      { title: 'Winter Park Laser & MedSpa Orlando', url: 'https://winterparklaser.com', city: 'Orlando, FL' },
    ],
    tampa: [
      { title: 'Tampa Bay Body Sculpting MedSpa', url: 'https://tampabaybodysculpting.com', city: 'Tampa, FL' },
      { title: 'Academic Alliance Medspa Tampa', url: 'https://academicaesthetics.com', city: 'Tampa, FL' },
    ],
    denver: [
      { title: 'Atagi Plastic Surgery & Skin Denver', url: 'https://atagimd.com', city: 'Denver, CO' },
      { title: 'The Med Spa at Cherry Creek Denver', url: 'https://cherrycreekmedspa.com', city: 'Denver, CO' },
    ],
    chicago: [
      { title: 'Gold Coast Plastic Surgery & Medspa Chicago', url: 'https://goldcoastplasticsurgery.com', city: 'Chicago, IL' },
      { title: 'Whole Beauty Medical Spa Chicago', url: 'https://wholebeauty.com', city: 'Chicago, IL' },
    ],
    'new york': [
      { title: 'Tribeca MedSpa NYC', url: 'https://tribecamedspa.com', city: 'New York, NY' },
      { title: 'Skin Spa New York', url: 'https://skinspanewyork.com', city: 'New York, NY' },
    ],
    'san diego': [
      { title: 'San Diego Cosmetic Laser Clinic', url: 'https://sandiegolaserclinic.com', city: 'San Diego, CA' },
      { title: 'Siti Med Spa San Diego', url: 'https://sitimedspa.com', city: 'San Diego, CA' },
      { title: 'Laser Clinique San Diego', url: 'https://laser-clinique.com', city: 'San Diego, CA' },
      { title: 'SD Body Contouring & Medspa', url: 'https://sdbody.com', city: 'San Diego, CA' },
    ],
    'san francisco': [
      { title: 'Epi Center MedSpa San Francisco', url: 'https://epicenter.com', city: 'San Francisco, CA' },
      { title: 'SkinSpirit San Francisco', url: 'https://skinspirit.com', city: 'San Francisco, CA' },
      { title: 'Uptown Medical Aesthetics SF', url: 'https://uptownmedicalaesthetics.com', city: 'San Francisco, CA' },
    ],
    'las vegas': [
      { title: 'Chic La Vie Med Spa Las Vegas', url: 'https://chiclavie.com', city: 'Las Vegas, NV' },
      { title: 'Nuance Aesthetics & MedSpa Las Vegas', url: 'https://nuancemedspa.com', city: 'Las Vegas, NV' },
    ],
    seattle: [
      { title: 'Vida Aesthetic Medicine Seattle', url: 'https://thinkvida.com', city: 'Seattle, WA' },
      { title: 'Penelope and the Beauty Bar Seattle', url: 'https://penelopeandthebeautybar.com', city: 'Seattle, WA' },
    ],
    nashville: [
      { title: 'Kaya Med Spa Nashville', url: 'https://kayamedspa.com', city: 'Nashville, TN' },
      { title: 'The Lotus Room Medspa Nashville', url: 'https://thelotusroomnashville.com', city: 'Nashville, TN' },
    ],
    charlotte: [
      { title: 'Carolina Facial Plastics MedSpa Charlotte', url: 'https://carolinafacialplasticsurgery.com', city: 'Charlotte, NC' },
    ],
    boston: [
      { title: 'Luminosity Medspa Boston', url: 'https://luminositymedspa.com', city: 'Boston, MA' },
      { title: 'Skin Spa New York Boston', url: 'https://skinspanewyork.com', city: 'Boston, MA' },
      { title: 'Boston Medical Aesthetics', url: 'https://bostonmedicalaesthetics.com', city: 'Boston, MA' },
    ],
    philadelphia: [
      { title: 'Ringpfeil Advanced Dermatology Medspa Philly', url: 'https://ringpfeildermatology.com', city: 'Philadelphia, PA' },
      { title: 'Subbio Plastic Surgery & MedSpa Philly', url: 'https://drsubbio.com', city: 'Philadelphia, PA' },
      { title: 'About Face Skin Care Philadelphia', url: 'https://aboutfaceskincare.com', city: 'Philadelphia, PA' },
    ],
    'washington dc': [
      { title: 'Bruno Plastic Surgery & MedSpa Washington DC', url: 'https://brunoplasticsurgery.com', city: 'Washington, DC' },
    ],
  },
  hvac: {
    phoenix: [
      { title: 'Champion Air 24/7 Emergency AC Phoenix', url: 'https://www.championair.com', city: 'Phoenix, AZ' },
      { title: 'George Brazil HVAC Phoenix', url: 'https://georgebrazilhvac.com', city: 'Phoenix, AZ' },
      { title: 'Morehart Air Conditioning & Heating Phoenix', url: 'https://morehartac.com', city: 'Phoenix, AZ' },
      { title: 'Compass Air Conditioning & Furnace Repair', url: 'https://azcompassair.com', city: 'Phoenix, AZ' },
    ],
    dallas: [
      { title: 'Lex Air Conditioning & Heating 24/7 Emergency Dallas', url: 'https://www.lexairconditioning.com', city: 'Dallas, TX' },
      { title: 'Total Air & Heat 24/7 Emergency Dallas', url: 'https://www.totalair.com', city: 'Dallas, TX' },
      { title: 'Berkeys Air Conditioning & Plumbing', url: 'https://www.berkeys.com', city: 'Dallas, TX' },
      { title: 'Baker Brothers Plumbing & HVAC Dallas', url: 'https://www.bakerbrothersplumbing.com', city: 'Dallas, TX' },
    ],
    miami: [
      { title: 'Direct Air Conditioning & Emergency HVAC Miami', url: 'https://www.directairfl.com', city: 'Miami, FL' },
      { title: 'Air Around the Clock 24/7 HVAC South Florida', url: 'https://www.airaroundtheclock.com', city: 'Miami, FL' },
      { title: 'Freezing Mechanical Air Conditioning Miami', url: 'https://freezingmechanical.com', city: 'Miami, FL' },
      { title: 'All Year Cooling & Heating South Florida', url: 'https://allyearcooling.com', city: 'Miami, FL' },
    ],
    austin: [
      { title: 'Fox Service Company 24/7 HVAC Austin', url: 'https://foxservice.com', city: 'Austin, TX' },
      { title: 'Totally Cool AC 24/7 Emergency Austin', url: 'https://www.totallycoolac.com', city: 'Austin, TX' },
      { title: 'McCullough Heating & Air Austin', url: 'https://www.mcculloughair.com', city: 'Austin, TX' },
    ],
    atlanta: [
      { title: 'PV Heating, Cooling & Plumbing Atlanta', url: 'https://pvhvac.com', city: 'Atlanta, GA' },
      { title: 'Anchor Heating & Air 24/7 Emergency Atlanta', url: 'https://www.anchorac.com', city: 'Atlanta, GA' },
      { title: 'Reliable Heating & Air Atlanta', url: 'https://reliableair.com', city: 'Atlanta, GA' },
    ],
    tampa: [
      { title: 'Cornerstone Pros Air Conditioning Tampa', url: 'https://cornerstonepros.com', city: 'Tampa, FL' },
      { title: 'Air Hawk Heating and Cooling Tampa', url: 'https://airhawkac.com', city: 'Tampa, FL' },
    ],
    houston: [
      { title: 'Airteam HVAC Houston', url: 'https://airteam.com', city: 'Houston, TX' },
      { title: 'Custom Comfort Air Houston', url: 'https://customcomfortair.com', city: 'Houston, TX' },
    ],
    'san diego': [
      { title: 'Anderson Plumbing Heating & Air San Diego', url: 'https://andersonpha.com', city: 'San Diego, CA' },
    ],
    'las vegas': [
      { title: 'Sierra Air Conditioning & Plumbing Las Vegas', url: 'https://sierraairconditioning.com', city: 'Las Vegas, NV' },
    ],
    seattle: [
      { title: 'Bob\'s Heating & Air Conditioning Seattle', url: 'https://bobsheating.com', city: 'Seattle, WA' },
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
    const timer = setTimeout(() => controller.abort(), 1200);

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
      const controllerLite = new AbortController();
      const timerLite = setTimeout(() => controllerLite.abort(), 1200);
      const liteRes = await fetch('https://lite.duckduckgo.com/lite/', {
        signal: controllerLite.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          Accept: 'text/html',
        },
        body: `q=${encodeURIComponent(fullQuery)}`,
      });
      clearTimeout(timerLite);

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

  // Strategy 3: Curated Geographic High-Ticket Targets (Used if search engine blocks cloud IP or to guarantee batch size up to 20)
  if (rawResults.length < limit) {
    console.log(`[LeadHunter] Pooling regional targets to fulfill batch requirement of ${limit} leads...`);
    let cityKey = (city.toLowerCase().split(',')[0] || '').trim();
    if (cityKey === 'nyc' || cityKey === 'manhattan') cityKey = 'new york';
    if (cityKey === 'la') cityKey = 'los angeles';
    if (cityKey === 'dfw' || cityKey === 'fort worth') cityKey = 'dallas';
    if (cityKey === 'scottsdale') cityKey = 'phoenix';
    if (cityKey === 'sf' || cityKey === 'bay area') cityKey = 'san francisco';
    if (cityKey === 'philly') cityKey = 'philadelphia';
    if (cityKey === 'dc' || cityKey === 'washington') cityKey = 'washington dc';
    if (cityKey === 'vegas') cityKey = 'las vegas';

    const primaryList = CURATED_TARGETS[niche]?.[cityKey] || [];
    const pool = [...primaryList];

    // If limit exceeds the targets of the primary city, pool sister cities from the same niche
    if (pool.length < limit) {
      const allKeys = Object.keys(CURATED_TARGETS[niche] || {});
      for (const k of allKeys) {
        if (pool.length >= limit) break;
        if (k === cityKey) continue;
        const extra = CURATED_TARGETS[niche][k] || [];
        for (const item of extra) {
          if (!pool.some((p) => p.url === item.url)) {
            pool.push(item);
            if (pool.length >= limit) break;
          }
        }
      }
    }

    for (const c of pool) {
      if (rawResults.length >= limit) break;
      const norm = normalizeUrl(c.url);
      if (norm && !rawResults.some((r) => r.url === norm)) {
        rawResults.push({
          title: c.title,
          url: norm,
          snippet: `${c.title} - High-Ticket Service Center in ${c.city}`,
          city: c.city,
          niche,
        });
      }
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
  if (!decisionMaker || decisionMaker === 'Doctor' || (niche === 'hvac' && decisionMaker.includes('Medical Director'))) {
    if (niche === 'hvac') {
      decisionMaker = `Owner / Operations Lead at ${scraped.clinicName || 'Company'}`;
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

  // 4. Construct direct email or fallback domain email so clinics with verified phones are never discarded
  let finalEmail = scraped.email;
  if (!finalEmail && scraped.url) {
    try {
      const hostname = new URL(scraped.url).hostname.replace(/^www\./, '');
      finalEmail = `info@${hostname}`;
    } catch (e) {}
  }

  return {
    success: true,
    url: scraped.url,
    clinicName: scraped.clinicName,
    doctorName: decisionMaker,
    email: finalEmail,
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

  // Step 2 & 3: Concurrently Enrich, Audit & Commit in parallel with chunked concurrency (batches of 6)
  // This guarantees all 20 leads qualify fast (under 12s) without network socket congestion!
  const enrichedLeads = [];
  let committedCount = 0;
  const chunkSize = 6;

  for (let i = 0; i < businesses.length; i += chunkSize) {
    const chunk = businesses.slice(i, i + chunkSize);
    const chunkPromises = chunk.map(async (item) => {
      try {
        const enriched = await huntAndEnrichLead({
          url: item.url,
          city: item.city,
          niche: item.niche,
        });

        if (enriched && enriched.success) {
          // Commit with deduplication
          const commitRes = await commitLeadToSupabase(enriched);
          enriched.savedToDb = commitRes.success;
          enriched.dbStatus = commitRes.alreadyExists ? 'duplicate' : commitRes.success ? 'saved' : 'no_email';
          return { success: true, lead: enriched, committed: commitRes.success };
        }
      } catch (err) {
        console.warn(`[LeadHunter] Failed to process ${item.url}:`, err.message);
      }
      return { success: false, url: item.url };
    });

    const settled = await Promise.allSettled(chunkPromises);
    for (const res of settled) {
      if (res.status === 'fulfilled' && res.value?.success && res.value.lead) {
        enrichedLeads.push(res.value.lead);
        if (res.value.committed) committedCount++;
      }
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
