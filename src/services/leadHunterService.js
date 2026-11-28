import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { runDigitalAudit } from './auditorService.js';
import { addProspect, getProspectById, updateProspect, getProspectDedupeIndex } from './outreachService.js';
import { scrapeClinicWebsite, normalizeUrl } from './scraperService.js';
import { qualifyLead, getQualificationBadge, DEFAULT_QUALIFY_THRESHOLD, getCityClimateProfile, isAffiliateShellDomain, isEnterpriseOrPeChain } from './qualifierService.js';
import { sendTelegram } from './telegram.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const NICHE_QUERIES = {
  hvac: [
    'Heating and Air Conditioning HVAC Company',
    'Family Owned HVAC Heating Cooling Contractor',
    'AC Replacement and Furnace Repair',
    'Emergency HVAC Repair',
  ],
  plumbing: [
    'Family Owned Plumbing Water Heater Contractor',
    '24/7 Emergency Plumbing Repair',
    'Drain Cleaning and Sewer Line Plumber',
  ],
  roofing: [
    'Local Roofing Replacement Contractor',
    'Emergency Roof Repair Tarping',
    'Storm Damage Roof Restoration',
  ],
  electrical: [
    'Residential Electrical Panel Generator Contractor',
    '24/7 Emergency Electrician Repair',
  ],
  water_damage: [
    'Water Damage Restoration Flood Cleanup',
    '24/7 Emergency Structural Drying',
  ],
};

export const TERRITORY_CASCADE = {
  pacific: {
    name: 'Pacific Timezone (PT)',
    order: 1,
    states: {
      CA: {
        name: 'California',
        topTier: ['Los Angeles, CA', 'San Diego, CA', 'San Jose, CA', 'San Francisco, CA', 'Fresno, CA'],
        secondaryTier: ['Sacramento, CA', 'Long Beach, CA', 'Oakland, CA', 'Irvine, CA', 'Anaheim, CA', 'Riverside, CA'],
      },
      WA: {
        name: 'Washington',
        topTier: ['Seattle, WA', 'Spokane, WA', 'Tacoma, WA', 'Vancouver, WA', 'Bellevue, WA'],
        secondaryTier: ['Kent, WA', 'Everett, WA', 'Renton, WA', 'Kirkland, WA', 'Bellingham, WA'],
      },
      OR: {
        name: 'Oregon',
        topTier: ['Portland, OR', 'Eugene, OR', 'Salem, OR', 'Gresham, OR', 'Hillsboro, OR'],
        secondaryTier: ['Beaverton, OR', 'Bend, OR', 'Medford, OR', 'Lake Oswego, OR'],
      },
      NV: {
        name: 'Nevada',
        topTier: ['Las Vegas, NV', 'Henderson, NV', 'North Las Vegas, NV', 'Reno, NV', 'Sparks, NV'],
        secondaryTier: ['Carson City, NV', 'Summerlin South, NV'],
      },
    },
  },
  eastern: {
    name: 'Eastern / Central Suburbs & Metros',
    order: 2,
    states: {
      FL: {
        name: 'Florida',
        topTier: ['Jacksonville, FL', 'Miami, FL', 'Tampa, FL', 'Orlando, FL', 'St. Petersburg, FL'],
        secondaryTier: ['Fort Lauderdale, FL', 'Cape Coral, FL', 'West Palm Beach, FL', 'Clearwater, FL'],
      },
      NY: {
        name: 'New York',
        topTier: ['New York City, NY', 'Buffalo, NY', 'Rochester, NY', 'Yonkers, NY', 'Syracuse, NY'],
        secondaryTier: ['Albany, NY', 'White Plains, NY'],
      },
      GA: {
        name: 'Georgia',
        topTier: ['Atlanta, GA', 'Augusta, GA', 'Columbus, GA', 'Macon, GA', 'Savannah, GA'],
        secondaryTier: ['Roswell, GA', 'Alpharetta, GA', 'Marietta, GA'],
      },
      IN: {
        name: 'Indiana',
        topTier: ['Carmel, IN', 'Zionsville, IN'],
        secondaryTier: ['Indianapolis, IN', 'Fishers, IN', 'Westfield, IN', 'Noblesville, IN'],
      },
      OH: {
        name: 'Ohio',
        topTier: ['Dublin, OH'],
        secondaryTier: ['Columbus, OH', 'Powell, OH', 'Westerville, OH', 'New Albany, OH'],
      },
      TX: {
        name: 'Texas',
        topTier: ['Prosper, TX', 'Celina, TX', 'Fulshear, TX', 'Dallas, TX', 'Austin, TX', 'Houston, TX'],
        secondaryTier: ['Frisco, TX', 'McKinney, TX', 'Allen, TX', 'Katy, TX', 'Sugar Land, TX'],
      },
      TN: {
        name: 'Tennessee',
        topTier: ['Brentwood, TN', 'Nashville, TN'],
        secondaryTier: ['Franklin, TN', 'Murfreesboro, TN', 'Nolensville, TN'],
      },
    },
  },
};

export const ORDERED_CASCADE_CITIES = [
  ...TERRITORY_CASCADE.pacific.states.CA.topTier,
  ...TERRITORY_CASCADE.pacific.states.WA.topTier,
  ...TERRITORY_CASCADE.pacific.states.OR.topTier,
  ...TERRITORY_CASCADE.pacific.states.NV.topTier,
  ...TERRITORY_CASCADE.eastern.states.FL.topTier,
  ...TERRITORY_CASCADE.eastern.states.NY.topTier,
  ...TERRITORY_CASCADE.eastern.states.GA.topTier,
  ...TERRITORY_CASCADE.eastern.states.IN.topTier,
  ...TERRITORY_CASCADE.eastern.states.OH.topTier,
  ...TERRITORY_CASCADE.eastern.states.TX.topTier,
  ...TERRITORY_CASCADE.eastern.states.TN.topTier,
  ...TERRITORY_CASCADE.pacific.states.CA.secondaryTier,
  ...TERRITORY_CASCADE.pacific.states.WA.secondaryTier,
  ...TERRITORY_CASCADE.pacific.states.OR.secondaryTier,
  ...TERRITORY_CASCADE.pacific.states.NV.secondaryTier,
  ...TERRITORY_CASCADE.eastern.states.FL.secondaryTier,
  ...TERRITORY_CASCADE.eastern.states.NY.secondaryTier,
  ...TERRITORY_CASCADE.eastern.states.GA.secondaryTier,
  ...TERRITORY_CASCADE.eastern.states.IN.secondaryTier,
  ...TERRITORY_CASCADE.eastern.states.OH.secondaryTier,
  ...TERRITORY_CASCADE.eastern.states.TX.secondaryTier,
  ...TERRITORY_CASCADE.eastern.states.TN.secondaryTier,
];

export function getNextCascadeCity(currentCity) {
  if (!currentCity) return ORDERED_CASCADE_CITIES[0];
  const curLower = currentCity.toLowerCase().trim();
  const curName = curLower.split(',')[0].trim();
  const idx = ORDERED_CASCADE_CITIES.findIndex((c) => {
    const cLower = c.toLowerCase();
    return cLower === curLower || (curName && cLower.split(',')[0].trim() === curName);
  });
  return idx === -1 || idx === ORDERED_CASCADE_CITIES.length - 1
    ? ORDERED_CASCADE_CITIES[0]
    : ORDERED_CASCADE_CITIES[idx + 1];
}

// Verified Trade Contractor Seed Directory (strictly local 2-15 truck independent family operators — PE/enterprise excluded)
const CURATED_TARGETS = {
  hvac: {
    'los angeles': [
      { title: 'JW Plumbing Heating and Air', url: 'https://jwheatingandair.com', city: 'Los Angeles, CA' },
    ],
    'san francisco': [
      { title: 'Atlas Heating & Air Conditioning', url: 'https://atlasheating.com', city: 'San Francisco, CA' },
    ],
    'san jose': [
      { title: 'Pelle Heating & Air Conditioning', url: 'https://pellehvac.com', city: 'San Jose, CA' },
    ],
    spokane: [
      { title: 'Holiday Heating & Air Conditioning', url: 'https://holidayheating.com', city: 'Spokane, WA' },
    ],
    portland: [
      { title: 'Pyramid Heating & Cooling', url: 'https://pyramidheating.com', city: 'Portland, OR' },
    ],
    phoenix: [
      { title: 'Morehart Air Conditioning & Heating', url: 'https://morehartac.com', city: 'Phoenix, AZ' },
    ],
    dallas: [
      { title: 'Total Air & Heat', url: 'https://www.totalair.com', city: 'Dallas, TX' },
    ],
    austin: [
      { title: 'Totally Cool AC', url: 'https://www.totallycoolac.com', city: 'Austin, TX' },
    ],
    houston: [
      { title: 'Custom Comfort Air', url: 'https://customcomfortair.com', city: 'Houston, TX' },
    ],
    miami: [
      { title: 'Freezing Mechanical', url: 'https://freezingmechanical.com', city: 'Miami, FL' },
    ],
    tampa: [
      { title: 'Air Hawk Heating and Cooling', url: 'https://airhawkac.com', city: 'Tampa, FL' },
    ],
    jacksonville: [
      { title: "Von's Heating and Air", url: 'https://vonsheatingandair.com', city: 'Jacksonville, FL' },
    ],
    atlanta: [
      { title: 'PV Heating Cooling & Plumbing', url: 'https://pvhvac.com', city: 'Atlanta, GA' },
      { title: 'Anchor Heating & Air', url: 'https://www.anchorac.com', city: 'Atlanta, GA' },
    ],
    carmel: [
      { title: 'Paul Henderson Plumbing HVAC', url: 'https://paulhendersonplumbing.com', city: 'Carmel, IN' },
      { title: 'Godby Heating Plumbing Electrical', url: 'https://www.godbyhpe.com', city: 'Carmel, IN' },
    ],
    zionsville: [
      { title: 'Earl Russell Heating & Cooling', url: 'https://www.russellheatingandcooling.com', city: 'Zionsville, IN' },
      { title: 'Paul Henderson Plumbing HVAC', url: 'https://paulhendersonplumbing.com', city: 'Zionsville, IN' },
    ],
    dublin: [
      { title: 'TTM Mechanical HVAC', url: 'https://www.ttmmechanical.com', city: 'Dublin, OH' },
      { title: 'Trinity Heating & Cooling', url: 'https://trinityheatcool.com', city: 'Dublin, OH' },
      { title: 'Kendawgs Heating & Cooling', url: 'https://kdhvacair.com', city: 'Dublin, OH' },
    ],
    prosper: [
      { title: "Crow's Heat & Air", url: 'https://crowsheatandair.com', city: 'Prosper, TX' },
      { title: 'Prosper Air Heating & Cooling', url: 'https://prosperair.com', city: 'Prosper, TX' },
      { title: 'Matco Services Heating & Air', url: 'https://matcoservices.com', city: 'Prosper, TX' },
      { title: 'Airmax Air Conditioning', url: 'https://www.airmaxac.com', city: 'Prosper, TX' },
    ],
    celina: [
      { title: "Crow's Heat & Air", url: 'https://crowsheatandair.com', city: 'Celina, TX' },
      { title: 'Prosper Air Heating & Cooling', url: 'https://prosperair.com', city: 'Celina, TX' },
    ],
    fulshear: [
      { title: 'Vance Air & Heat', url: 'https://vanceairandheat.com', city: 'Fulshear, TX' },
      { title: 'AC Comfort', url: 'https://accomfort.us', city: 'Fulshear, TX' },
    ],
    brentwood: [
      { title: 'Rapid Response Heating & Cooling', url: 'https://rapidhvactn.com', city: 'Brentwood, TN' },
      { title: 'Brentwood Comfort Control', url: 'https://brentwoodcomfort.net', city: 'Brentwood, TN' },
      { title: 'Covenant Heating & Cooling', url: 'https://www.covenantheatingandcooling.com', city: 'Brentwood, TN' },
    ],
  },
};

const DIRECTORY_OR_SPAM_DOMAINS =
  /(yelp\.com|groupon\.com|healthgrades\.com|yellowpages\.com|angi\.com|angieslist\.com|mapquest\.com|bbb\.org|facebook\.com|instagram\.com|tripadvisor\.com|expertise\.com|thumbtack\.com|indeed\.com|duckduckgo\.com|bing\.com|homeadvisor\.com|networx\.com|bark\.com|porch\.com|modernize\.com|threebestrated\.com|houzz\.com|nextdoor\.com|emergency-[a-z0-9-]+\.|[a-z0-9-]+-pros\.|airconditioneremergency\.com|emergencyhvacservices\.com|emergency-hvac-repair\.com|hvacacrepair\.org|zaptheory\.com|topchoiceheatingairconditioningusa\.com|ama-hvac\.com|brentwoodhvacrepair\.com|near-me)/i;

const US_STATE_ABBR = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca',
  colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga',
  hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia',
  kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms', missouri: 'mo',
  montana: 'mt', nebraska: 'ne', nevada: 'nv', 'new hampshire': 'nh', 'new jersey': 'nj',
  'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd',
  ohio: 'oh', oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri',
  'south carolina': 'sc', 'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut',
  vermont: 'vt', virginia: 'va', washington: 'wa', 'west virginia': 'wv',
  wisconsin: 'wi', wyoming: 'wy', dc: 'dc', 'district of columbia': 'dc',
};

const CITY_DEFAULT_STATES = {
  'los angeles': 'ca', 'san diego': 'ca', 'san jose': 'ca', 'san francisco': 'ca',
  sacramento: 'ca', fresno: 'ca', irvine: 'ca', oakland: 'ca', anaheim: 'ca', riverside: 'ca',
  seattle: 'wa', spokane: 'wa', tacoma: 'wa', vancouver: 'wa', bellevue: 'wa',
  portland: 'or', eugene: 'or', salem: 'or', beaverton: 'or', hillsboro: 'or',
  'las vegas': 'nv', henderson: 'nv', reno: 'nv',
  phoenix: 'az', scottsdale: 'az', mesa: 'az', chandler: 'az', tucson: 'az',
  dallas: 'tx', austin: 'tx', houston: 'tx', 'san antonio': 'tx', 'fort worth': 'tx',
  frisco: 'tx', mckinney: 'tx', plano: 'tx', prosper: 'tx', celina: 'tx',
  allen: 'tx', fulshear: 'tx', katy: 'tx', 'sugar land': 'tx',
  miami: 'fl', tampa: 'fl', orlando: 'fl', jacksonville: 'fl', 'st petersburg': 'fl',
  'fort lauderdale': 'fl', clearwater: 'fl',
  atlanta: 'ga', marietta: 'ga', alpharetta: 'ga', roswell: 'ga', savannah: 'ga',
  'new york': 'ny', 'new york city': 'ny', buffalo: 'ny', rochester: 'ny', albany: 'ny',
  carmel: 'in', zionsville: 'in', indianapolis: 'in', fishers: 'in', westfield: 'in', noblesville: 'in',
  dublin: 'oh', columbus: 'oh', cleveland: 'oh', cincinnati: 'oh', powell: 'oh', westerville: 'oh',
  brentwood: 'tn', nashville: 'tn', franklin: 'tn', murfreesboro: 'tn',
  chicago: 'il', denver: 'co', charlotte: 'nc', raleigh: 'nc', boston: 'ma',
  philadelphia: 'pa', pittsburgh: 'pa', detroit: 'mi', minneapolis: 'mn',
  'salt lake city': 'ut', boise: 'id', omaha: 'ne', 'kansas city': 'mo', 'st louis': 'mo',
};

const SAME_METRO_FALLBACKS = {
  carmel: ['carmel', 'indianapolis'],
  zionsville: ['zionsville', 'carmel', 'indianapolis'],
  westfield: ['westfield', 'carmel', 'indianapolis'],
  fishers: ['fishers', 'carmel', 'indianapolis'],
  noblesville: ['noblesville', 'carmel', 'indianapolis'],
  dublin: ['dublin', 'columbus'],
  powell: ['powell', 'dublin', 'columbus'],
  westerville: ['westerville', 'columbus'],
  'new albany': ['new albany', 'columbus'],
  prosper: ['prosper', 'frisco', 'mckinney', 'plano', 'dallas'],
  celina: ['celina', 'frisco', 'mckinney', 'dallas'],
  allen: ['allen', 'plano', 'mckinney', 'dallas'],
  frisco: ['frisco', 'plano', 'dallas'],
  mckinney: ['mckinney', 'plano', 'dallas'],
  fulshear: ['fulshear', 'katy', 'sugar-land', 'houston'],
  katy: ['katy', 'houston'],
  'sugar land': ['sugar-land', 'houston'],
  brentwood: ['brentwood', 'franklin', 'nashville'],
  franklin: ['franklin', 'nashville'],
  nolensville: ['nolensville', 'franklin', 'nashville'],
  murfreesboro: ['murfreesboro', 'nashville'],
  scottsdale: ['scottsdale', 'phoenix'],
  summerlin: ['las-vegas', 'henderson'],
  'summerlin south': ['las-vegas', 'henderson'],
  'north las vegas': ['north-las-vegas', 'las-vegas'],
  'carson city': ['reno'],
  henderson: ['henderson', 'las-vegas'],
  beaverton: ['beaverton', 'portland'],
  hillsboro: ['hillsboro', 'portland'],
  gresham: ['gresham', 'portland'],
  'lake oswego': ['lake-oswego', 'portland'],
  bellevue: ['bellevue', 'seattle'],
  kent: ['kent', 'seattle'],
  everett: ['everett', 'seattle'],
  renton: ['renton', 'seattle'],
  kirkland: ['kirkland', 'seattle'],
  clearwater: ['clearwater', 'tampa', 'st-petersburg'],
  irvine: ['irvine', 'anaheim', 'los-angeles'],
  'long beach': ['long-beach', 'los-angeles'],
  roswell: ['roswell', 'marietta', 'atlanta'],
  alpharetta: ['alpharetta', 'marietta', 'atlanta'],
  marietta: ['marietta', 'atlanta'],
  atlanta: ['atlanta', 'marietta', 'roswell', 'alpharetta'],
  dallas: ['dallas', 'plano', 'frisco', 'mckinney'],
  austin: ['austin', 'round-rock'],
  houston: ['houston', 'katy', 'sugar-land'],
  phoenix: ['phoenix', 'scottsdale', 'mesa', 'chandler'],
  tampa: ['tampa', 'clearwater', 'st-petersburg'],
  miami: ['miami', 'fort-lauderdale'],
  seattle: ['seattle', 'bellevue', 'tacoma'],
  portland: ['portland', 'beaverton', 'hillsboro'],
  indianapolis: ['indianapolis', 'carmel', 'fishers'],
  columbus: ['columbus', 'dublin', 'westerville'],
  nashville: ['nashville', 'brentwood', 'franklin'],
  'white plains': ['new-york'],
  'new york city': ['new-york'],
};

const EXPERTISE_NICHE_SLUGS = {
  hvac: 'hvac',
  plumbing: 'plumbing',
  roofing: 'roofing',
  electrical: 'electricians',
  water_damage: 'water-damage',
};

function decodeHtmlEntities(str = '') {
  return String(str)
    .replace(/&amp;/gi, '&')
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveCityKey(city = '') {
  let key = (city.toLowerCase().split(',')[0] || '').trim().replace(/\./g, '');
  const aliases = {
    nyc: 'new york',
    'new york city': 'new york',
    manhattan: 'new york',
    la: 'los angeles',
    dfw: 'dallas',
    'fort worth': 'fort worth',
    sf: 'san francisco',
    vegas: 'las vegas',
    'carmel & zionsville': 'carmel',
    'prosper & celina': 'prosper',
    'st louis': 'st louis',
    'st petersburg': 'st petersburg',
  };
  return aliases[key] || key;
}

function parseCityAndState(cityInput = '') {
  const cleaned = String(cityInput || '').trim();
  const parts = cleaned.split(',').map((s) => s.trim()).filter(Boolean);
  const rawCity = resolveCityKey(parts[0] || '');
  let stateCode = '';

  if (parts.length > 1) {
    const rawState = parts.slice(1).join(' ').replace(/[^a-zA-Z\s]/g, '').trim().toLowerCase();
    if (rawState.length === 2) {
      stateCode = rawState;
    } else if (US_STATE_ABBR[rawState]) {
      stateCode = US_STATE_ABBR[rawState];
    } else {
      const token = rawState.split(/\s+/)[0];
      if (token && token.length === 2) stateCode = token;
      else if (US_STATE_ABBR[token]) stateCode = US_STATE_ABBR[token];
    }
  }

  if (!stateCode && rawCity) {
    stateCode = CITY_DEFAULT_STATES[rawCity] || '';
  }

  const citySlug = rawCity.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const displayCity = parts[0]
    ? `${parts[0].trim()}${stateCode ? ', ' + stateCode.toUpperCase() : ''}`
    : cleaned || 'Carmel, IN';

  return { cityKey: rawCity, citySlug, stateCode, displayCity };
}

async function fetchExpertiseDirectory({ stateCode, citySlug, cityLabel, niche, maxResults = 25 }) {
  if (!stateCode || !citySlug) return [];
  const verticalSlug = EXPERTISE_NICHE_SLUGS[niche] || 'hvac';
  const targetUrl = `https://www.expertise.com/${stateCode}/${citySlug}/${verticalSlug}`;
  const out = [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return [];

    // Cap buffered HTML cleanly to keep memory well under Render's 384MB heap ceiling
    const rawHtml = (await res.text()).slice(0, 1_100_000);
    const ldRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = ldRegex.exec(rawHtml)) !== null) {
      if (out.length >= maxResults) break;
      const rawJson = (m[1] || '').trim();
      if (!rawJson || !rawJson.includes('LocalBusiness')) continue;
      try {
        const parsed = JSON.parse(rawJson);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (!item || item['@type'] !== 'LocalBusiness' || !item.url) continue;
          const norm = normalizeUrl(item.url);
          const title = decodeHtmlEntities(item.name || '');
          if (!norm || DIRECTORY_OR_SPAM_DOMAINS.test(norm)) continue;
          if (isAffiliateShellDomain(norm, title).isAffiliate || isEnterpriseOrPeChain(norm, title).matched) continue;
          if (out.some((x) => x.url === norm)) continue;

          const addr = item.address || {};
          const itemCity = addr.addressLocality && addr.addressRegion
            ? `${decodeHtmlEntities(addr.addressLocality)}, ${decodeHtmlEntities(addr.addressRegion)}`
            : cityLabel;

          out.push({
            title: title || norm,
            url: norm,
            phone: item.telephone ? String(item.telephone).trim() : null,
            snippet: decodeHtmlEntities(item.description || `Local ${niche} contractor in ${itemCity}`).slice(0, 420),
            city: itemCity,
            niche,
          });
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn(`[LeadHunter] Expertise directory lookup (${targetUrl}):`, err.message);
  }

  return out;
}

export async function searchLocalBusinesses({ query, city = 'Carmel, IN', niche = 'hvac', limit = 10 }) {
  const defaultQuery = NICHE_QUERIES[niche]?.[0] || NICHE_QUERIES.hvac[0];
  const fullQuery = `${query || defaultQuery} ${city}`.trim();
  const rawResults = [];
  const parsed = parseCityAndState(city);
  const { cityKey, citySlug, stateCode, displayCity } = parsed;

  const pushUnique = (item) => {
    if (!item || !item.url || rawResults.length >= limit) return;
    const norm = normalizeUrl(item.url);
    if (!norm || rawResults.some((r) => r.url === norm)) return;
    if (DIRECTORY_OR_SPAM_DOMAINS.test(norm)) return;
    if (isAffiliateShellDomain(norm, item.title || '').isAffiliate || isEnterpriseOrPeChain(norm, item.title || '').matched) return;
    rawResults.push({ ...item, url: norm });
  };

  // 1. Live city-accurate local contractor directory discovery (Exact City first)
  if (stateCode && citySlug) {
    const primaryExp = await fetchExpertiseDirectory({
      stateCode,
      citySlug,
      cityLabel: displayCity,
      niche,
      maxResults: limit,
    });
    for (const item of primaryExp) pushUnique(item);
  }

  // 2. City-exact curated seeds (ONLY for exact cityKey AND exact vertical)
  const nicheSeeds = CURATED_TARGETS[niche] || {};
  for (const c of nicheSeeds[cityKey] || []) {
    pushUnique({
      title: c.title.trim(),
      url: c.url,
      snippet: `Local contractor in ${c.city}`,
      city: c.city,
      niche,
    });
  }

  // 3. Same-metro local expansion ONLY inside the same metro/state (never random out-of-state cities)
  if (rawResults.length < limit && stateCode) {
    const metroFallbacks = SAME_METRO_FALLBACKS[cityKey] || [];
    for (const subSlug of metroFallbacks) {
      if (rawResults.length >= limit) break;
      const subClean = subSlug.replace(/-/g, ' ');
      if (subSlug !== citySlug) {
        const subCityTitle = subClean.replace(/\b\w/g, (ch) => ch.toUpperCase()) + ', ' + stateCode.toUpperCase();
        const metroExp = await fetchExpertiseDirectory({
          stateCode,
          citySlug: subSlug,
          cityLabel: subCityTitle,
          niche,
          maxResults: limit - rawResults.length,
        });
        for (const item of metroExp) pushUnique(item);
      }
      for (const c of nicheSeeds[subClean] || []) {
        pushUnique({
          title: c.title.trim(),
          url: c.url,
          snippet: `Same-metro contractor in ${c.city}`,
          city: c.city,
          niche,
        });
      }
    }
  }

  // 4. Optional live DuckDuckGo HTML fallback strictly for the requested city if still under limit
  if (rawResults.length < limit) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(fullQuery)}`, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      });
      clearTimeout(timer);
      if (res.ok && res.status === 200) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $('.result').each((_, el) => {
          if (rawResults.length >= limit) return;
          const title = $(el).find('.result__title a').text().trim();
          let rawHref = $(el).find('.result__title a').attr('href') || '';
          if (rawHref.includes('uddg=')) {
            const match = rawHref.match(/uddg=([^&]+)/);
            if (match) rawHref = decodeURIComponent(match[1]);
          }
          if (!rawHref.startsWith('http') || DIRECTORY_OR_SPAM_DOMAINS.test(rawHref)) return;
          pushUnique({ title, url: rawHref, snippet: title, city: displayCity, niche });
        });
      }
    } catch (err) {
      console.warn('[LeadHunter] DDG search warning:', err.message);
    }
  }

  return rawResults.slice(0, limit);
}

function detectFallbackChain(url = '', name = '') {
  const hit = /(ars\.com|rescue rooter|serviceexperts|rotorooter|roto-rooter|happyhiller|leecompany|onehour|benjaminfranklin|mistersparky|mrrooter|aireserv|goettl|fourseasonsheatingcooling|morrisjenkins|summersphc|premierishere)/i.test(
    `${url} ${name}`.toLowerCase()
  );
  return { isMultiLocation: hit, reason: hit ? 'National / PE chain domain' : 'Unverified domain' };
}

export async function huntAndEnrichLead({
  url,
  city,
  niche = 'hvac',
  doctorOverride,
  treatmentOverride,
  businessNameOverride,
  phoneOverride,
  descriptionOverride,
  fast = false,
  minScore = DEFAULT_QUALIFY_THRESHOLD,
}) {
  let scraped = null;
  try {
    scraped = await scrapeClinicWebsite(url, { fast, niche, city });
  } catch (err) {
    scraped = null;
  }

  if (!scraped || !scraped.success) {
    let fallbackName = businessNameOverride;
    if (!fallbackName) {
      try {
        fallbackName = new URL(url).hostname.replace(/^www\./, '').split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      } catch (e) {
        fallbackName = 'Local Service Center';
      }
    }
    fallbackName = fallbackName.split(/[-|•–]/)[0].trim();
    const isTrade = niche !== 'medspa';
    let fallbackEmail = '';
    try {
      fallbackEmail = `info@${new URL(url).hostname.replace(/^www\./, '')}`;
    } catch (e) {}

    scraped = {
      success: true,
      url,
      dataSource: 'unreachable',
      clinicName: fallbackName,
      doctorName: doctorOverride || (isTrade ? `Owner / Operations Lead at ${fallbackName}` : `Medical Director at ${fallbackName}`),
      email: fallbackEmail,
      allEmails: fallbackEmail ? [fallbackEmail] : [],
      phone: phoneOverride || null,
      city: city || 'US',
      treatment: treatmentOverride || (isTrade ? 'Emergency AC & Heating Repair' : 'Morpheus8'),
      allTreatments: [],
      adSignals: { hasPaidAds: false, metaPixel: false, googleAds: false, tikTokPixel: false },
      multiLocation: detectFallbackChain(url, fallbackName),
      socialSignals: { hasGmb: false, hasInstagram: false, hasFacebook: false, summary: 'Unreachable' },
      visibleText: descriptionOverride || '',
      hasHtmlForm: false,
      hasLiveScheduler: false,
      jsonLd: null,
    };
  }

  const effectivePhone = scraped.phone || phoneOverride || null;
  const effectiveVisibleText = [scraped.visibleText || '', descriptionOverride || ''].filter(Boolean).join('\n');

  let decisionMaker = doctorOverride || scraped.doctorName;
  const isTradeSite = niche !== 'medspa';
  if (!decisionMaker || decisionMaker === 'Doctor' || (isTradeSite && (decisionMaker.includes('Medical Director') || decisionMaker.includes('Doctor')))) {
    decisionMaker = isTradeSite ? `Owner / Operations Lead at ${scraped.clinicName || 'Company'}` : `Medical Director at ${scraped.clinicName || 'Clinic'}`;
  }

  const audit = await runDigitalAudit({
    url,
    niche,
    businessName: scraped.clinicName,
    doctorName: decisionMaker,
    htmlContent: effectiveVisibleText || null,
  });

  const resolvedCity = city && !city.toLowerCase().includes('undefined') ? city : scraped.city;
  const climate = getCityClimateProfile(resolvedCity);

  let primaryTreatment = treatmentOverride || audit.primaryService || scraped.treatment;
  if (isTradeSite && (!primaryTreatment || /morpheus8|botox|juvederm/i.test(primaryTreatment))) {
    primaryTreatment =
      niche === 'plumbing' ? 'Emergency Plumbing & Water Heater Repair'
        : niche === 'roofing' ? 'Emergency Roof Repair & Replacement'
        : niche === 'electrical' ? '24/7 Emergency Electrical Service'
        : niche === 'water_damage' ? 'Emergency Water Damage Restoration'
        : 'Emergency AC & Heating Repair';
  }
  if (isTradeSite && climate.belt === 'hot_belt' && /\b(furnace|boiler)\b/i.test(primaryTreatment)) {
    primaryTreatment = 'Emergency AC Repair';
  }

  let finalEmail = scraped.email;
  if (!finalEmail && effectivePhone && scraped.url) {
    try {
      finalEmail = `info@${new URL(scraped.url).hostname.replace(/^www\./, '')}`;
    } catch (e) {}
  }

  const qualification = qualifyLead(
    {
      url: scraped.url,
      dataSource: scraped.dataSource,
      clinicName: scraped.clinicName,
      doctorName: decisionMaker,
      phone: effectivePhone,
      email: finalEmail,
      city: resolvedCity,
      treatment: primaryTreatment,
      allTreatments: scraped.allTreatments || [],
      adSignals: scraped.adSignals,
      stackText: scraped.stackText || '',
      multiLocation: scraped.multiLocation || { isMultiLocation: false },
      jsonLd: scraped.jsonLd || null,
      hasHtmlForm: scraped.hasHtmlForm,
      hasLiveScheduler: scraped.hasLiveScheduler,
      visibleText: effectiveVisibleText,
    },
    {
      hasStaticForm: audit.hasStaticForm || (scraped.hasHtmlForm && !scraped.hasLiveScheduler),
      hasVoicemailComplaint: audit.hasVoicemailComplaint,
      mentionsAfterHours: audit.mentionsAfterHours,
    },
    minScore
  );

  console.log(`[Qualifier] ${scraped.clinicName} (${scraped.url}): ${getQualificationBadge(qualification)}`);

  return {
    success: true,
    url: scraped.url,
    dataSource: scraped.dataSource,
    clinicName: scraped.clinicName,
    doctorName: decisionMaker,
    salutation: scraped.salutation || null,
    email: finalEmail,
    allEmails: scraped.allEmails,
    phone: effectivePhone,
    city: resolvedCity,
    treatment: primaryTreatment,
    niche,
    adSignals: scraped.adSignals,
    schedulingStack: qualification.schedulingStack,
    multiLocation: scraped.multiLocation || { isMultiLocation: false, reason: 'Single location' },
    socialSignals: scraped.socialSignals || { hasGmb: false, hasInstagram: false, hasFacebook: false, summary: 'Direct' },
    specificObservation: audit.specificObservation,
    recommendedAngle: audit.recommendedAngle,
    hasStaticForm: audit.hasStaticForm || scraped.hasHtmlForm,
    qualification,
  };
}

export async function commitLeadToSupabase(enrichedLead, existingProspectsMap) {
  const qual = enrichedLead?.qualification;
  const rawEmail = String(enrichedLead?.email || '').trim().toLowerCase();
  const cleanEmailMatch = rawEmail.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  const normalizedEmail = cleanEmailMatch ? cleanEmailMatch[0] : '';

  let existing = null;
  if (existingProspectsMap) {
    if (normalizedEmail) existing = existingProspectsMap.get(normalizedEmail) || null;
    if (!existing && enrichedLead?.url) {
      let targetHost = '';
      try {
        targetHost = new URL(enrichedLead.url).hostname.replace(/^www\./i, '').toLowerCase();
      } catch (_) {}
      if (targetHost) {
        for (const p of existingProspectsMap.values()) {
          if (!p?.website_url) continue;
          try {
            const h = new URL(p.website_url).hostname.replace(/^www\./i, '').toLowerCase();
            if (h && h === targetHost) {
              existing = p;
              break;
            }
          } catch (_) {}
        }
      }
    }
  } else if (normalizedEmail) {
    existing = await getProspectById(normalizedEmail);
  }

  if (existing) {
    const patch = {};
    if (!existing.specific_observation && enrichedLead.specificObservation) {
      patch.specific_observation = enrichedLead.specificObservation;
      patch.recommended_angle = enrichedLead.recommendedAngle;
    }
    if (!existing.phone && enrichedLead.phone) patch.phone = enrichedLead.phone;
    if (!existing.website_url && enrichedLead.url) patch.website_url = enrichedLead.url;
    if (qual && (existing.qual_score === null || existing.qual_score === undefined)) {
      patch.qual_score = qual.score;
      patch.qual_grade = qual.grade;
      patch.qual_status = qual.qualified ? 'qualified' : 'manual_override';
      patch.qual_breakdown = qual;
      patch.review_count = qual.reviewCount;
      patch.google_rating = qual.googleRating;
      patch.fleet_size = qual.fleetSize;
    }
    if (Object.keys(patch).length > 0) await updateProspect(existing.id, patch);

    return {
      success: false,
      alreadyExists: true,
      disqualified: !qual || !qual.qualified,
      message: `Prospect ${existing.email || normalizedEmail} already exists in CRM.`,
      prospect: existing,
    };
  }

  if (!qual || !qual.qualified) {
    return {
      success: false,
      disqualified: true,
      score: qual?.score ?? 0,
      grade: qual?.grade ?? 'F',
      message: `Lead rejected (${qual?.score ?? 0}/100 — ${qual?.grade ?? 'F'}): ${(qual?.disqualifyReasons || ['Failed gate']).join('; ')}`,
      lead: enrichedLead,
    };
  }

  if (!normalizedEmail) {
    return { success: false, message: 'No email found to store in CRM.', lead: enrichedLead };
  }

  const chainTag = qual.isFamilyOwned ? 'Family-Owned' : 'Single-Location';
  const revTag = qual.reviewCount ? `${qual.reviewCount} revs${qual.googleRating ? ` (${qual.googleRating}*)` : ''}` : 'Revs:N/A';
  const notes = `Hunter: ${chainTag} | ${revTag} | Ads: ${qual.breakdown?.adSpend?.pass ? 'ACTIVE' : 'Organic'} | Phone: ${enrichedLead.phone || 'N/A'} | Qual:${qual.score}/100(${qual.grade})`;

  const addResult = await addProspect({
    doctorName: enrichedLead.doctorName,
    clinicName: enrichedLead.clinicName,
    email: normalizedEmail,
    city: enrichedLead.city,
    treatment: enrichedLead.treatment,
    notes,
    phone: enrichedLead.phone,
    specific_observation: enrichedLead.specificObservation,
    recommended_angle: enrichedLead.recommendedAngle,
    website_url: enrichedLead.url,
    niche: enrichedLead.niche || 'hvac',
    qual_score: qual.score,
    qual_grade: qual.grade,
    qual_status: 'qualified',
    qual_breakdown: qual,
    review_count: qual.reviewCount,
    google_rating: qual.googleRating,
    fleet_size: qual.fleetSize,
  });

  if (!addResult.success) return { success: false, error: addResult.error || 'Insert failed' };
  if (existingProspectsMap) existingProspectsMap.set(normalizedEmail, addResult.prospect);
  return { success: true, prospect: addResult.prospect };
}

// ─── Async Streaming Hunt Job Store (Prevents HTTP 502 Timeouts & OOM) ──────

const huntJobs = new Map();
const MAX_ACTIVE_JOBS = 10;
const JOB_TTL_MS = 15 * 60 * 1000;

function pruneOldJobs() {
  const now = Date.now();
  for (const [id, job] of huntJobs.entries()) {
    if (now - job.updatedAt > JOB_TTL_MS && job.status !== 'running') {
      huntJobs.delete(id);
    }
  }
  while (huntJobs.size > MAX_ACTIVE_JOBS) {
    const oldestKey = huntJobs.keys().next().value;
    huntJobs.delete(oldestKey);
  }
}

export function getHuntJob(jobId) {
  return huntJobs.get(jobId) || null;
}

export function cancelHuntJob(jobId) {
  const job = huntJobs.get(jobId);
  if (job && job.status === 'running') {
    job.cancelled = true;
    job.status = 'cancelled';
    job.updatedAt = Date.now();
    return true;
  }
  return false;
}

async function executeHuntPipeline({ city, niche, query, limit, minScore, notifyTelegram, job = null }) {
  const targetLimit = Math.min(Math.max(Number(limit) || 5, 1), 40);
  const threshold = Math.min(Math.max(Number(minScore) ?? DEFAULT_QUALIFY_THRESHOLD, 0), 100);
  const candidateLimit = Math.min(Math.max(targetLimit * 2 + 4, 8), 36);

  const businesses = await searchLocalBusinesses({ query, city, niche, limit: candidateLimit });
  if (job) {
    job.totalCandidates = businesses.length;
    job.stage = businesses.length ? `Evaluating ${businesses.length} verified candidate domains...` : 'No eligible candidate domains found.';
    job.updatedAt = Date.now();
  }

  if (!businesses || businesses.length === 0) {
    const empty = {
      success: false,
      message: `No eligible contractor domains found for ${city}.`,
      city,
      niche,
      minScore: threshold,
      totalSearched: 0,
      evaluatedCount: 0,
      committedCount: 0,
      disqualifiedCount: 0,
      duplicateCount: 0,
      leads: [],
    };
    if (job) Object.assign(job, { ...empty, status: 'completed', stage: empty.message, updatedAt: Date.now() });
    return empty;
  }

  let existingEmailMap = null;
  try {
    existingEmailMap = await getProspectDedupeIndex(1000);
  } catch (e) {
    console.warn('[LeadHunter] Dedupe preload warning:', e.message);
  }

  const enrichedLeads = [];
  let committedCount = 0;
  let disqualifiedCount = 0;
  let duplicateCount = 0;
  let evaluatedCount = 0;

  // Bounded waves of 3 concurrent scrapes to stay well below Render 256-384MB heap ceiling
  const WAVE_SIZE = 3;
  for (let i = 0; i < businesses.length; i += WAVE_SIZE) {
    if (committedCount >= targetLimit) break;
    if (job?.cancelled) break;

    const wave = businesses.slice(i, i + WAVE_SIZE);
    if (job) {
      job.stage = `Crawling & scoring candidates ${i + 1}–${Math.min(i + WAVE_SIZE, businesses.length)} of ${businesses.length}...`;
      job.updatedAt = Date.now();
    }

    const settled = await Promise.allSettled(
      wave.map(async (item) => {
        const enriched = await Promise.race([
          huntAndEnrichLead({
            url: item.url,
            city: item.city,
            niche: item.niche,
            businessNameOverride: item.title,
            phoneOverride: item.phone || null,
            descriptionOverride: item.snippet || null,
            fast: targetLimit > 10,
            minScore: threshold,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Domain timeout (10s)')), 10000)),
        ]);

        if (enriched && enriched.success) {
          const commitRes = await commitLeadToSupabase(enriched, existingEmailMap);
          enriched.savedToDb = commitRes.success;
          enriched.dbStatus = commitRes.alreadyExists
            ? 'duplicate'
            : commitRes.disqualified
            ? 'disqualified'
            : commitRes.success
            ? 'saved'
            : 'no_email';
          return {
            success: true,
            lead: enriched,
            committed: commitRes.success,
            disqualified: !!commitRes.disqualified,
            duplicate: !!commitRes.alreadyExists,
          };
        }
        return { success: false };
      })
    );

    for (const r of settled) {
      evaluatedCount++;
      if (r.status === 'fulfilled' && r.value?.success && r.value.lead) {
        enrichedLeads.push(r.value.lead);
        if (r.value.committed) committedCount++;
        if (r.value.disqualified) disqualifiedCount++;
        if (r.value.duplicate) duplicateCount++;
      }
    }

    if (job) {
      job.evaluatedCount = evaluatedCount;
      job.committedCount = committedCount;
      job.disqualifiedCount = disqualifiedCount;
      job.duplicateCount = duplicateCount;
      job.leads = enrichedLeads;
      job.updatedAt = Date.now();
    }
  }

  if (committedCount > 0 && notifyTelegram) {
    const qualifiedList = enrichedLeads.filter((l) => l.savedToDb);
    const avgScore = Math.round(qualifiedList.reduce((acc, l) => acc + (l.qualification?.score || 0), 0) / Math.max(qualifiedList.length, 1));
    const topLines = qualifiedList.slice(0, 5).map((l) => `• *${l.clinicName}* — ${l.qualification?.score}/100 (${l.qualification?.grade})`).join('\n');
    sendTelegram(
      `🎯 *Lead Hunter Batch (${city})*\n\nCommitted to CRM: *${committedCount}* (Avg ${avgScore}/100)\nRejected: ${disqualifiedCount} | Duplicates: ${duplicateCount}\n\n${topLines}`
    ).catch(() => {});
  }

  const finalResult = {
    success: true,
    city,
    niche,
    minScore: threshold,
    totalSearched: businesses.length,
    evaluatedCount,
    committedCount,
    disqualifiedCount,
    duplicateCount,
    leads: enrichedLeads,
  };

  if (job) {
    Object.assign(job, {
      ...finalResult,
      status: job.cancelled ? 'cancelled' : 'completed',
      stage: job.cancelled ? 'Hunt cancelled by user.' : `Completed: ${committedCount} qualified leads added to CRM.`,
      updatedAt: Date.now(),
    });
  }
  return finalResult;
}

/**
 * Starts a non-blocking background hunt job and returns jobId immediately (<50ms)
 */
export function startHuntJob({ city = 'Los Angeles, CA', niche = 'hvac', query, limit = 5, minScore = DEFAULT_QUALIFY_THRESHOLD, notifyTelegram = true }) {
  pruneOldJobs();
  const jobId = crypto.randomBytes(8).toString('hex');
  const job = {
    jobId,
    status: 'running',
    cancelled: false,
    city,
    niche,
    minScore: Number(minScore) ?? DEFAULT_QUALIFY_THRESHOLD,
    targetLimit: Math.min(Math.max(Number(limit) || 5, 1), 40),
    totalCandidates: 0,
    evaluatedCount: 0,
    committedCount: 0,
    disqualifiedCount: 0,
    duplicateCount: 0,
    leads: [],
    stage: `Discovering local ${niche} contractors in ${city}...`,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  huntJobs.set(jobId, job);

  executeHuntPipeline({ city, niche, query, limit, minScore, notifyTelegram, job }).catch((err) => {
    console.error(`[LeadHunter Job ${jobId}] Failed:`, err);
    job.status = 'failed';
    job.error = err.message || 'Unknown error during hunt';
    job.stage = `Failed: ${job.error}`;
    job.updatedAt = Date.now();
  });

  return job;
}

/**
 * Synchronous API runner (safely bounded to max 10 leads so direct API callers never hit Render proxy timeout)
 */
export async function runAutonomousHunt({ city = 'Los Angeles, CA', niche = 'hvac', query, limit = 5, minScore = DEFAULT_QUALIFY_THRESHOLD, notifyTelegram = true }) {
  const safeSyncLimit = Math.min(Math.max(Number(limit) || 5, 1), 10);
  return await executeHuntPipeline({ city, niche, query, limit: safeSyncLimit, minScore, notifyTelegram });
}
