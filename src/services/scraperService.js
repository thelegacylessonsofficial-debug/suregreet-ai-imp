import * as cheerio from 'cheerio';
import { addProspect, getProspectById, updateProspect } from './outreachService.js';
import { qualifyLead, getQualificationBadge } from './qualifierService.js';
import { getShortBusinessName, formatSalutation } from '../templates/outreachTemplates.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const AESTHETIC_TREATMENTS = [
  'Morpheus8',
  'Botox',
  'Semaglutide',
  'BodyTite',
  'CoolSculpting',
  'InMode',
  'Dermal Fillers',
  'Juvederm',
  'Restylane',
  'Sculptra',
  'Emsculpt',
  'Kybella',
  'Microneedling',
  'Hydrafacial',
  'Laser Skin Resurfacing',
  'PRP Hair Restoration',
  'IPL Photofacial',
];

const TRADE_SERVICES = [
  'Emergency AC Repair',
  '24/7 HVAC Service',
  'AC Replacement & Installation',
  'HVAC System Replacement',
  'Heat Pump Repair',
  'Furnace Maintenance',
  'Furnace Installation',
  'Ductless Mini-Split Systems',
  'Commercial Refrigeration',
  'Air Duct Cleaning',
  'Emergency Heating Repair',
  'Emergency Plumbing Repair',
  'Drain Cleaning & Sewer Line',
  'Water Heater Replacement',
  'Roof Repair & Replacement',
  'Storm Damage Restoration',
  'Emergency Roof Tarping',
  '24/7 Emergency Electrician',
  'Electrical Panel Upgrade',
  'Backup Generator Installation',
  'Emergency Water Damage Restoration',
  'Flood Extraction & Drying',
];

const JUNK_EMAIL_DOMAINS = [
  'sentry.io',
  'wixpress.com',
  'squarespace.com',
  'wordpress.org',
  'wordpress.com',
  'schema.org',
  'example.com',
  'domain.com',
  'gravatar.com',
  'cloudflare.com',
  'w3.org',
  'googleapis.com',
  'gstatic.com',
  'godaddy.com',
  'secureserver.net',
];

const GENERIC_EMAIL_LOCALS = new Set([
  'info',
  'service',
  'services',
  'sales',
  'office',
  'support',
  'contact',
  'admin',
  'help',
  'hello',
  'dispatch',
  'billing',
  'jobs',
  'careers',
  'team',
  'general',
  'mail',
  'enquiries',
  'inquiry',
  'inquiries',
  'appointment',
  'appointments',
  'estimating',
  'webmaster',
  'noreply',
  'no-reply',
  'customerservice',
  'customercare',
  'marketing',
  'privacy',
  'hvac',
  'plumbing',
  'roofing',
  'electrical',
  'schedule',
  'quotes',
  'quote',
  'estimates',
  'estimate',
  'frontdesk',
  'reception',
]);

// Known national PE mega-chains & franchises (Eye Test #2 filters these out automatically)
const PE_CHAIN_PATTERNS = [
  /\bars\.com\b/i,
  /\bars\s*\/?\s*rescue\s*rooter\b/i,
  /\bserviceexperts\.com\b/i,
  /\bservice\s+experts\b/i,
  /\brotorooter\.com\b/i,
  /\broto-rooter\b/i,
  /\bhappyhiller\.com\b/i,
  /\bhiller\s+plumbing\b/i,
  /\bleecompany\.com\b/i,
  /\blee\s+company\b/i,
  /\bonehourheatandair\.com\b/i,
  /\bone\s+hour\s+heating\b/i,
  /\bbenjaminfranklinplumbing\b/i,
  /\bmistersparky\b/i,
  /\bmrrooter\b/i,
  /\baireserv\.com\b/i,
  /\baire\s+serv\b/i,
  /\bhorizonservices\b/i,
  /\bgoettl\.com\b/i,
  /\bturnpoint\b/i,
  /\bwrenchgroup\b/i,
  /\bapexservicepartners\b/i,
  /\bpremierishere\.com\b/i,
  /\bsummersphc\.com\b/i,
  /\bfourseasonsheatingcooling\.com\b/i,
  /\bmorrisjenkins\.com\b/i,
  /\bberkeys\.com\b/i,
  /\bbakerbrothersplumbing\.com\b/i,
  /\bgeorgebrazilhvac\.com\b/i,
  /\bchampionair\.com\b/i,
];

/**
 * Fetches page HTML with browser headers and timeout
 */
async function fetchHtml(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (res.ok) return await res.text();
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
  return null;
}

/**
 * Fetches markdown fallback via Jina AI Reader when direct HTTP is blocked (403/Cloudflare)
 */
async function fetchJinaFallback(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SureGreetAI-Scraper/2.0',
        Accept: 'text/plain,text/markdown',
      },
    });
    if (res.ok) {
      const txt = await res.text();
      return txt && txt.length > 120 ? txt : null;
    }
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
  return null;
}

/**
 * Normalizes input URL into a valid HTTPS format
 */
export function normalizeUrl(inputUrl) {
  if (!inputUrl) return '';
  let url = inputUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch (e) {
    return url;
  }
}

/**
 * Strip script/style/svg tags so regex matches ONLY visible copy, never timestamps or CSS!
 */
export function extractVisibleText(html) {
  if (!html) return '';
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8217;|&rsquo;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean and filter email addresses
 */
function sanitizeEmail(email) {
  if (!email) return null;
  const clean = email.trim().toLowerCase().replace(/[^\w.@+-]/g, '');
  if (!clean.includes('@') || !clean.includes('.')) return null;
  if (clean.length > 80) return null;

  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|woff|woff2|pdf)$/i.test(clean)) return null;

  const [local, domain] = clean.split('@');
  if (!local || !domain || domain.length < 4) return null;
  if (JUNK_EMAIL_DOMAINS.some((d) => domain.includes(d))) return null;
  if (/^\d+x\d+$/i.test(local)) return null;

  return clean;
}

/**
 * Prioritize founder/direct emails over generic mailboxes
 */
function pickBestEmail(emailSet) {
  const arr = Array.from(emailSet);
  if (arr.length === 0) return null;
  const personal = arr.find((e) => {
    const local = e.split('@')[0];
    return !GENERIC_EMAIL_LOCALS.has(local);
  });
  return personal || arr[0];
}

/**
 * Validate US phone numbers (rejects 555 fake numbers & epoch timestamps)
 */
function cleanPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  let ten = digits;
  if (digits.length === 11 && digits.startsWith('1')) {
    ten = digits.slice(1);
  }
  if (ten.length !== 10) return null;
  // US NPA/NXX rules + reject 555-xxxx test numbers and repeating patterns
  if (!/^[2-9][0-9]{2}[2-9][0-9]{6}$/.test(ten)) return null;
  if (ten.slice(3, 6) === '555') return null;
  if (/^(\d)\1{9}$/.test(ten)) return null;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/**
 * Parse Schema.org JSON-LD blocks for ratings, review counts, hours, phone, founder
 */
function extractJsonLdSignals($) {
  const result = {
    reviewCount: null,
    ratingValue: null,
    telephone: null,
    email: null,
    founderName: null,
    openingHours: [],
    name: null,
  };
  if (!$) return result;

  const inspectNode = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(inspectNode);
      return;
    }
    if (Array.isArray(node['@graph'])) {
      inspectNode(node['@graph']);
    }

    if (!result.name && typeof node.name === 'string' && /LocalBusiness|HVAC|Plumb|Roof|Electr|Contractor|Organization/i.test(String(node['@type'] || ''))) {
      result.name = node.name.trim();
    }
    if (!result.telephone && typeof node.telephone === 'string') {
      result.telephone = cleanPhone(node.telephone);
    }
    if (!result.email && typeof node.email === 'string') {
      result.email = sanitizeEmail(node.email.replace(/^mailto:/i, ''));
    }
    if (!result.founderName && node.founder) {
      const fName = typeof node.founder === 'string' ? node.founder : node.founder.name;
      if (fName && typeof fName === 'string' && fName.length < 40) {
        result.founderName = fName.trim();
      }
    }
    if (node.aggregateRating && typeof node.aggregateRating === 'object') {
      const rc = parseInt(String(node.aggregateRating.reviewCount || node.aggregateRating.ratingCount || '').replace(/,/g, ''), 10);
      const rv = parseFloat(String(node.aggregateRating.ratingValue || ''));
      if (rc > 0 && !result.reviewCount) result.reviewCount = rc;
      if (rv >= 1 && rv <= 5 && !result.ratingValue) result.ratingValue = Number(rv.toFixed(1));
    }
    if (node.openingHours) {
      const hrs = Array.isArray(node.openingHours) ? node.openingHours : [node.openingHours];
      result.openingHours.push(...hrs.map(String));
    }
    if (Array.isArray(node.openingHoursSpecification)) {
      for (const spec of node.openingHoursSpecification) {
        if (spec && (spec.opens || spec.closes)) {
          const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek.join(',') : (spec.dayOfWeek || '');
          result.openingHours.push(`${days} ${spec.opens || ''}-${spec.closes || ''}`.trim());
        }
      }
    }
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (raw) inspectNode(JSON.parse(raw));
    } catch (e) {}
  });

  return result;
}

/**
 * Extract doctor name (MedSpa niche)
 */
function extractDoctorName(visibleText) {
  if (!visibleText) return null;
  const drRegex = /\bDr\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  let match;
  while ((match = drRegex.exec(visibleText)) !== null) {
    const candidate = match[0].trim();
    if (!/recommended|approved|tested|designed|formulated/i.test(candidate)) {
      return candidate;
    }
  }

  const mdRegex = /\b([A-Z][a-z]+\s+[A-Z][a-z]+),\s*(?:MD|M\.D\.|DO|D\.O\.|FACS)\b/;
  const mdMatch = visibleText.match(mdRegex);
  if (mdMatch) return `Dr. ${mdMatch[1]}`;

  return null;
}

/**
 * Extract real founder / owner name for trade contractors
 */
function extractTradeOwnerName(visibleText, primaryEmail, jsonLdFounder = null) {
  if (jsonLdFounder) return `${jsonLdFounder} (Founder)`;

  if (visibleText) {
    const stopWords = /^(of|the|our|and|company|business|service|services|team|board|group|management|homes|homeowners|rapid|family|operated|operators|operator|owned|owner|founder|today|since|local|customers|clients|warranty|repair|hvac|heating|cooling|air|plumbing|roofing|electric|electrical|mechanical|veteran|staff|technicians|precision|quality|comfort|premier|elite)$/i;

    // 1. Strict labeled format: "Owner: John Smith" / "Founder - Mike Jones"
    const labeled = /\b(?:Owner|President|Founder|CEO|Founded\s+by|Owned\s+(?:and\s+operated\s+)?by|Operated\s+by|Started\s+by)\s*(?:[:\-–,]|\bis\b)?\s*([A-Z][a-z]{2,15}(?:\s+[A-Z][a-z]{2,15})?)\b/g;
    let m;
    while ((m = labeled.exec(visibleText)) !== null) {
      const candidate = m[1].trim();
      const words = candidate.split(/\s+/);
      if (!words.some((w) => stopWords.test(w)) && candidate.length >= 3) {
        return `${candidate} (Owner)`;
      }
    }
  }

  // 2. Named email fallback (e.g. jack@rapidhvactn.com or randy@vanceac.com -> look up full name in text or use FirstName)
  if (primaryEmail) {
    const local = primaryEmail.split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
    if (local.length >= 3 && local.length <= 16 && !GENERIC_EMAIL_LOCALS.has(local)) {
      if (visibleText) {
        const firstPart = local.slice(0, Math.min(local.length, 6));
        const nameMatch = visibleText.match(new RegExp(`\\b(${firstPart}[a-z]{0,10})\\s+([A-Z][a-z]{2,15})\\b`, 'i'));
        if (nameMatch && /^[A-Z]/.test(nameMatch[2])) {
          const fn = nameMatch[1][0].toUpperCase() + nameMatch[1].slice(1).toLowerCase();
          return `${fn} ${nameMatch[2]} (Owner)`;
        }
      }
      const cap = local[0].toUpperCase() + local.slice(1);
      return `${cap} (Owner Contact)`;
    }
  }

  return null;
}

/**
 * Detect active ad tracking pixels & marketing stack (LSA / Google Ads / CallRail / Meta / GTM)
 */
function detectAdPixels(rawHtml, visibleText = '') {
  const html = rawHtml || '';
  const combined = html + ' ' + visibleText;

  const hasLsa =
    /google\s+screened/i.test(combined) ||
    /google\s+guaranteed/i.test(combined) ||
    /local\s+services?\s+ads?/i.test(combined) ||
    /localservices\.google\.com/i.test(html);

  const hasConfirmedGoogleAds =
    /AW-\d{6,}/i.test(html) ||
    html.includes('googleadservices.com') ||
    html.includes('doubleclick.net') ||
    html.includes('callrail.com') ||
    html.includes('whatconverts.com') ||
    html.includes('calltrackingmetrics') ||
    html.includes('gclid');

  const hasGtmOrGtag =
    html.includes('googletagmanager.com/gtag') ||
    html.includes('googletagmanager.com/gtm.js') ||
    html.includes('gtag(');

  const hasMetaPixel =
    html.includes('fbevents.js') ||
    html.includes('connect.facebook.net') ||
    html.includes('fbq(') ||
    html.includes('_fbq');

  const hasTikTokPixel =
    html.includes('analytics.tiktok.com') ||
    html.includes('ttq.load');

  return {
    hasPaidAds: hasLsa || hasConfirmedGoogleAds || hasMetaPixel || hasTikTokPixel || hasGtmOrGtag,
    lsaVerified: hasLsa,
    confirmedGoogleAds: hasConfirmedGoogleAds,
    googleAds: hasLsa || hasConfirmedGoogleAds || hasGtmOrGtag,
    metaPixel: hasMetaPixel,
    tikTokPixel: hasTikTokPixel,
    gtmOrGtag: hasGtmOrGtag,
  };
}

/**
 * Detect if a business is a multi-location PE chain/franchise vs family-owned 1–2 location shop
 */
export function detectMultiLocation(htmlOrText, $, url = '', companyName = '') {
  const lower = (htmlOrText || '').toLowerCase();
  const targetStr = `${url} ${companyName}`.toLowerCase();

  for (const pat of PE_CHAIN_PATTERNS) {
    if (pat.test(targetStr) || pat.test(lower.slice(0, 4000))) {
      return {
        isMultiLocation: true,
        isFamilyOwned: false,
        reason: `Matched PE / multi-state chain pattern (${pat.source})`,
      };
    }
  }

  const multiLocationPhrases = [
    'our locations',
    'all locations',
    'multiple locations',
    'find a location',
    'view locations',
    'select a location',
    'choose a location',
    'see all locations',
    'franchise opportunities',
    'franchise information',
    'corporate headquarters',
    'find your nearest',
  ];

  for (const phrase of multiLocationPhrases) {
    if (lower.includes(phrase)) {
      return {
        isMultiLocation: true,
        isFamilyOwned: false,
        reason: `Matched chain indicator: "${phrase}"`,
      };
    }
  }

  if ($) {
    const locLinks = $('a[href*="/locations/"], a[href*="/our-locations"], a[href*="/branches/"], a[href*="/offices/"]');
    if (locLinks.length >= 3) {
      return {
        isMultiLocation: true,
        isFamilyOwned: false,
        reason: `Found ${locLinks.length} branch/location directory links`,
      };
    }
  }

  const hasFamilySignal = /family[- ]owned|family[- ]operated|locally owned|veteran[- ]owned|father and son|generations/i.test(lower);

  return {
    isMultiLocation: false,
    isFamilyOwned: hasFamilySignal,
    reason: hasFamilySignal ? 'Family-owned local operator' : 'Single-location independent operator',
  };
}

/**
 * Detect presence of Google My Business (GMB), Instagram & Facebook organic profiles
 */
export function detectSocialAndGmb(html, $) {
  let hasGmb = false;
  let hasInstagram = false;
  let hasFacebook = false;
  let gmbUrl = null;
  let igUrl = null;
  let fbUrl = null;

  if ($) {
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (!hasGmb && /(maps\.google\.com|google\.com\/maps|goo\.gl\/maps|g\.page\/|search\.google\.com\/local)/i.test(href)) {
        hasGmb = true;
        gmbUrl = href;
      }
      if (!hasInstagram && /instagram\.com\/[a-zA-Z0-9._-]+/i.test(href) && !/instagram\.com\/(p\/|explore|share)/i.test(href)) {
        hasInstagram = true;
        igUrl = href;
      }
      if (!hasFacebook && /facebook\.com\/[a-zA-Z0-9._-]+/i.test(href) && !/(sharer|tr\?|facebook\.com\/share)/i.test(href)) {
        hasFacebook = true;
        fbUrl = href;
      }
    });
  } else if (html) {
    const gmbM = html.match(/https?:\/\/(?:www\.)?(?:maps\.google\.com|google\.com\/maps|g\.page|goo\.gl\/maps)[^\s)"']+/i);
    if (gmbM) { hasGmb = true; gmbUrl = gmbM[0]; }
    const igM = html.match(/https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._-]+/i);
    if (igM) { hasInstagram = true; igUrl = igM[0]; }
    const fbM = html.match(/https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+/i);
    if (fbM) { hasFacebook = true; fbUrl = fbM[0]; }
  }

  return {
    hasGmb,
    gmbUrl,
    hasInstagram,
    igUrl,
    hasFacebook,
    fbUrl,
    summary: hasGmb ? 'GMB Verified' : hasInstagram || hasFacebook ? 'Social Active' : 'Organic Direct',
  };
}

/**
 * Scrape a contractor/clinic website:
 * 1) Tries direct HTTP (+ auto-swaps www/bare domain if DNS fails)
 * 2) Falls back cleanly to Jina AI Reader if blocked by Cloudflare/403
 * 3) Optionally crawls /about or /contact concurrently to capture founder, email, fleet & reviews
 */
export async function scrapeClinicWebsite(inputUrl, options = {}) {
  const baseUrl = normalizeUrl(inputUrl);
  if (!baseUrl) {
    return { success: false, error: 'Invalid URL provided' };
  }

  console.log(`[Lead Scraper] Crawling domain: ${baseUrl}...`);
  let activeUrl = baseUrl;
  let homepageHtml = await fetchHtml(baseUrl, 5500);
  let dataSource = 'direct_html';

  // Auto-retry swapping www. prefix if initial fetch failed (fixes www.accomfort.us vs accomfort.us)
  if (!homepageHtml) {
    try {
      const u = new URL(baseUrl);
      const altHost = u.hostname.startsWith('www.') ? u.hostname.replace(/^www\./, '') : `www.${u.hostname}`;
      const altUrl = `${u.protocol}//${altHost}`;
      const altHtml = await fetchHtml(altUrl, 4500);
      if (altHtml) {
        homepageHtml = altHtml;
        activeUrl = altUrl;
      }
    } catch (e) {}
  }

  // Fallback to Jina AI Reader if blocked by Cloudflare/403
  let jinaMarkdown = null;
  if (!homepageHtml) {
    console.log(`[Lead Scraper] Direct HTTP blocked/failed on ${baseUrl}, using Jina AI fallback...`);
    jinaMarkdown = await fetchJinaFallback(baseUrl, 6500);
    if (jinaMarkdown) {
      dataSource = 'jina_fallback';
    }
  }

  if (!homepageHtml && !jinaMarkdown) {
    return { success: false, error: `Failed to retrieve content from ${baseUrl}` };
  }

  const $home = homepageHtml ? cheerio.load(homepageHtml) : null;
  const visibleHomeText = homepageHtml ? extractVisibleText(homepageHtml) : jinaMarkdown;
  const jsonLd = extractJsonLdSignals($home);

  // 1. Extract Business Name & decode HTML entities cleanly
  let clinicName = '';
  const pickTitleBrand = (rawTitle) => {
    if (!rawTitle) return '';
    const parts = rawTitle.split(/[-|•–]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1 && /^(home|welcome|heating,\s*air\s*conditioning|air\s*conditioning,\s*heating|hvac\s*services|services)\b/i.test(parts[0])) {
      return parts[1];
    }
    return parts[0] || '';
  };

  if ($home) {
    clinicName =
      jsonLd.name ||
      $home('meta[property="og:site_name"]').attr('content') ||
      pickTitleBrand($home('title').text()) ||
      $home('h1').first().text()?.trim() ||
      '';
  } else if (jinaMarkdown) {
    const titleLine = jinaMarkdown.match(/^Title:\s*(.+)$/m);
    if (titleLine) clinicName = pickTitleBrand(titleLine[1]);
  }
  if (!clinicName) {
    try {
      clinicName = new URL(activeUrl).hostname.replace(/^www\./, '').split('.')[0];
    } catch (e) {
      clinicName = 'Local Service Business';
    }
  }
  clinicName = clinicName
    .replace(/&amp;/gi, '&')
    .replace(/&#039;|&#8217;|&rsquo;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. Ad Spend & Booking Friction Signals
  const adSignals = detectAdPixels(homepageHtml || '', visibleHomeText);

  const niche = options.niche || 'hvac';
  const isTradeSite =
    niche !== 'medspa' ||
    /hvac|air conditioning|heating|plumbing|furnace|duct|refrigeration|roofing|electrician|electrical|contractor|restoration/i.test(
      visibleHomeText + ' ' + clinicName
    );

  // 3. Extract Services
  const detectedTreatments = [];
  const searchPool = isTradeSite ? TRADE_SERVICES : AESTHETIC_TREATMENTS;
  for (const s of searchPool) {
    if (new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(visibleHomeText)) {
      detectedTreatments.push(s);
    }
  }
  const primaryTreatment = detectedTreatments[0] || (isTradeSite ? 'Emergency AC & Heating Repair' : 'Morpheus8 & Injectables');

  // 4. Extract Clean Emails & Phones (Strict Priority: mailto/tel -> JSON-LD -> separated visible-text regex)
  const rawEmails = new Set();
  const rawPhones = new Set();

  if (jsonLd.email) rawEmails.add(jsonLd.email);
  if (jsonLd.telephone) rawPhones.add(jsonLd.telephone);

  if ($home) {
    $home('a[href^="mailto:"]').each((_, el) => {
      const raw = $home(el).attr('href')?.replace(/^mailto:/i, '').split('?')[0];
      const cleaned = sanitizeEmail(raw);
      if (cleaned) rawEmails.add(cleaned);
    });

    $home('a[href^="tel:"]').each((_, el) => {
      const c = cleanPhone($home(el).attr('href')?.replace(/^tel:/i, ''));
      if (c) rawPhones.add(c);
    });
  }

  // Extract formatted phones from visible text (REQUIRES separators so raw timestamps never match)
  const visiblePhones = visibleHomeText.match(/(?:\+?1[-.\s])?\(?[2-9][0-9]{2}\)?[-.\s][2-9][0-9]{2}[-.\s][0-9]{4}\b/g);
  if (visiblePhones) {
    for (const p of visiblePhones.slice(0, 4)) {
      const c = cleanPhone(p);
      if (c) rawPhones.add(c);
    }
  }

  const emailSourceText = (homepageHtml || '') + ' ' + visibleHomeText;
  const emailMatches = emailSourceText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (emailMatches) {
    for (const em of emailMatches) {
      const cleaned = sanitizeEmail(em);
      if (cleaned) rawEmails.add(cleaned);
    }
  }

  // 5. Crawl /about or /contact subpage concurrently when helpful (owner, email, fleet, reviews)
  let subVisibleText = '';
  let subRawHtml = '';
  const candidateSubUrls = new Set();

  if ($home) {
    $home('a[href]').each((_, el) => {
      const href = $home(el).attr('href');
      if (!href) return;
      if (/\b(about|about-us|our-team|team|leadership|contact|contact-us)\b/i.test(href)) {
        try {
          const fullUrl = new URL(href, activeUrl).href;
          if (fullUrl.startsWith(activeUrl) && fullUrl !== activeUrl && fullUrl !== `${activeUrl}/`) {
            candidateSubUrls.add(fullUrl);
          }
        } catch (e) {}
      }
    });
  }
  // Always probe /about/ or /contact/ fallback if nav wasn't found cleanly
  if (candidateSubUrls.size === 0 && dataSource === 'direct_html') {
    candidateSubUrls.add(`${activeUrl}/about/`);
    candidateSubUrls.add(`${activeUrl}/contact/`);
  }

  const needSubCrawl = rawEmails.size === 0 || !jsonLd.founderName || !jsonLd.reviewCount;
  if (needSubCrawl && candidateSubUrls.size > 0 && !options.skipSubCrawl) {
    const subTargets = Array.from(candidateSubUrls).slice(0, 2);
    const subResults = await Promise.all(
      subTargets.map((su) => fetchHtml(su, 3000))
    );
    for (const subHtml of subResults) {
      if (!subHtml) continue;
      subRawHtml += ' ' + subHtml;
      const $sub = cheerio.load(subHtml);
      const subText = extractVisibleText(subHtml);
      subVisibleText += ' ' + subText;

      $sub('a[href^="mailto:"]').each((_, el) => {
        const cleaned = sanitizeEmail($sub(el).attr('href')?.replace(/^mailto:/i, '').split('?')[0]);
        if (cleaned) rawEmails.add(cleaned);
      });
      $sub('a[href^="tel:"]').each((_, el) => {
        const c = cleanPhone($sub(el).attr('href')?.replace(/^tel:/i, ''));
        if (c) rawPhones.add(c);
      });
      const subEm = subHtml.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (subEm) {
        subEm.forEach((em) => {
          const cleaned = sanitizeEmail(em);
          if (cleaned) rawEmails.add(cleaned);
        });
      }
      const subJson = extractJsonLdSignals($sub);
      if (subJson.reviewCount && !jsonLd.reviewCount) jsonLd.reviewCount = subJson.reviewCount;
      if (subJson.ratingValue && !jsonLd.ratingValue) jsonLd.ratingValue = subJson.ratingValue;
      if (subJson.founderName && !jsonLd.founderName) jsonLd.founderName = subJson.founderName;
    }
  }

  const combinedVisibleText = `${visibleHomeText} ${subVisibleText}`.trim();
  const combinedRawHtml = `${homepageHtml || ''} ${subRawHtml}`.trim();

  const primaryEmail = pickBestEmail(rawEmails);
  const primaryPhone = Array.from(rawPhones)[0] || null;

  // 6. Decision Maker Extraction (fixed isTradeSite!)
  let doctorName = null;
  if (isTradeSite) {
    doctorName =
      extractTradeOwnerName(combinedVisibleText, primaryEmail, jsonLd.founderName) ||
      (clinicName ? `Owner / Operations Lead at ${clinicName}` : 'Owner / Operations Lead');
  } else {
    doctorName = extractDoctorName(combinedVisibleText);
  }

  // 7. Extract City / State
  let city = null;
  const locationMatch = combinedVisibleText.match(
    /\b([A-Z][a-zA-Z\s]{2,20}),\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/
  );
  if (locationMatch) {
    city = `${locationMatch[1].trim()}, ${locationMatch[2]}`;
  }

  const multiLocation = detectMultiLocation(combinedRawHtml || combinedVisibleText, $home, activeUrl, clinicName);
  const socialSignals = detectSocialAndGmb(combinedRawHtml || combinedVisibleText, $home);
  const shortClinic = getShortBusinessName(clinicName);

  // Detect HTML <form> tags vs live calendar scheduling
  const hasLiveScheduler = /calendly\.com|acuityscheduling\.com|cal\.com|scheduleengine|servicetitan\.com\/web|housecallpro\.com\/book|jobber\.com/i.test(
    combinedRawHtml + ' ' + combinedVisibleText
  );
  const hasHtmlForm = /<form\b|wpcf7|wpforms|gform|gravityforms|elementor-form|hubspot-form/i.test(combinedRawHtml);

  return {
    success: true,
    url: activeUrl,
    dataSource,
    clinicName,
    shortClinicName: shortClinic,
    doctorName: doctorName || null,
    salutation: formatSalutation(doctorName, clinicName, isTradeSite ? 'hvac' : 'medspa'),
    email: primaryEmail,
    allEmails: Array.from(rawEmails),
    phone: primaryPhone,
    city: city || 'US',
    treatment: primaryTreatment,
    allTreatments: detectedTreatments,
    adSignals,
    multiLocation,
    socialSignals,
    jsonLd,
    hasHtmlForm,
    hasLiveScheduler,
    visibleText: combinedVisibleText,
    rawHtml: combinedRawHtml || null,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Scrape a single website, run the 100-pt Qualifier Gate, and push qualified leads into Supabase
 */
export async function scrapeAndIngestLead({
  url,
  cityOverride,
  treatmentOverride,
  doctorOverride,
  nicheOverride,
  minScore = 60,
  force = false,
}) {
  const result = await scrapeClinicWebsite(url, { niche: nicheOverride || 'hvac' });
  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Ensure email fallback only if phone or email exists
  let finalEmail = result.email;
  if (!finalEmail && result.phone && result.url) {
    try {
      const hostname = new URL(result.url).hostname.replace(/^www\./, '');
      finalEmail = `info@${hostname}`;
    } catch (e) {}
  }

  if (!finalEmail) {
    return {
      success: false,
      message: 'Scraped successfully, but no direct email or phone found on site.',
      data: result,
    };
  }

  // Run Qualifier Gate
  const qualification = qualifyLead(
    {
      ...result,
      email: finalEmail,
      doctorName: doctorOverride || result.doctorName,
    },
    {
      hasStaticForm: result.hasHtmlForm && !result.hasLiveScheduler,
    },
    Number(minScore) || 60
  );

  if (!qualification.qualified && !force) {
    return {
      success: false,
      disqualified: true,
      message: `Lead REJECTED (${qualification.score}/100 ${qualification.grade}): ${qualification.disqualifyReasons.join('; ')}`,
      qualification,
      scrapedData: result,
    };
  }

  // Check if already in Supabase
  const existing = await getProspectById(finalEmail);
  if (existing) {
    return {
      success: false,
      alreadyExists: true,
      message: `Prospect ${finalEmail} already exists in CRM (${qualification.score}/100 ${qualification.grade}).`,
      prospect: existing,
      qualification,
      scrapedData: result,
    };
  }

  // Push to Supabase public.prospects with full qualification telemetry
  const addRes = await addProspect({
    doctorName: doctorOverride || result.doctorName,
    clinicName: result.clinicName,
    email: finalEmail,
    city: cityOverride || result.city,
    treatment: treatmentOverride || result.treatment,
    phone: result.phone,
    website_url: result.url,
    niche: nicheOverride || 'hvac',
    notes: `Scraped from ${result.url} | Qual: ${qualification.score}/100 (${qualification.grade}) | Eye Test: ${qualification.eyePassCount}/4 | Ads: ${
      result.adSignals.hasPaidAds ? 'ACTIVE' : 'Organic'
    } | Phone: ${result.phone || 'N/A'}`,
    qual_score: qualification.score,
    qual_grade: qualification.grade,
    qual_status: qualification.qualified ? 'qualified' : 'manual_override',
    qual_breakdown: qualification,
    review_count: qualification.reviewCount,
    google_rating: qualification.googleRating,
    fleet_size: qualification.fleetSize,
  });

  return {
    success: true,
    prospect: addRes.prospect,
    qualification,
    scrapedData: result,
  };
}

/**
 * Bulk scrape a list of URLs with qualification gate and rate limiting
 */
export async function scrapeBulkLeads(urlList, options = {}) {
  const results = [];
  console.log(`[Lead Scraper] Starting qualified bulk scrape for ${urlList.length} domains...`);

  for (let i = 0; i < urlList.length; i++) {
    const rawUrl = urlList[i];
    if (!rawUrl || !rawUrl.trim()) continue;

    console.log(`[Lead Scraper] Processing ${i + 1}/${urlList.length}: ${rawUrl}`);
    const res = await scrapeAndIngestLead({ url: rawUrl, ...options });
    results.push({ url: rawUrl, ...res });

    if (i < urlList.length - 1) {
      await new Promise((r) => setTimeout(r, 900));
    }
  }

  return {
    total: urlList.length,
    ingestedCount: results.filter((r) => r.success).length,
    disqualifiedCount: results.filter((r) => r.disqualified).length,
    results,
  };
}
