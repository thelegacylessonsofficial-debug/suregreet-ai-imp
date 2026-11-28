import * as cheerio from 'cheerio';
import { addProspect, getProspectById } from './outreachService.js';
import { qualifyLead, HARD_BLOCKED_CHAIN_PATTERNS, getCityClimateProfile } from './qualifierService.js';
import { getShortBusinessName, formatSalutation } from '../templates/outreachTemplates.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const MAX_HTML_BYTES = 380_000;
const MAX_SUB_HTML_BYTES = 220_000;
const MAX_VISIBLE_CHARS = 42_000;

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

const AESTHETIC_TREATMENTS = [
  'Morpheus8',
  'Botox',
  'Semaglutide',
  'BodyTite',
  'CoolSculpting',
  'InMode',
  'Dermal Fillers',
  'Juvederm',
  'Hydrafacial',
  'Microneedling',
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
  'info', 'service', 'services', 'sales', 'office', 'support', 'contact', 'admin',
  'help', 'hello', 'dispatch', 'billing', 'jobs', 'careers', 'team', 'general',
  'mail', 'enquiries', 'inquiry', 'inquiries', 'appointment', 'appointments',
  'estimating', 'webmaster', 'noreply', 'no-reply', 'customerservice', 'customercare',
  'marketing', 'privacy', 'hvac', 'plumbing', 'roofing', 'electrical', 'schedule',
  'quotes', 'quote', 'estimates', 'estimate', 'frontdesk', 'reception',
]);

// National PE mega-chains & franchises filtered by the Ownership Gate (shared with qualifierService)
const PE_CHAIN_PATTERNS = HARD_BLOCKED_CHAIN_PATTERNS;

/**
 * Stream HTTP body up to `maxBytes` so bloated CMS pages cannot OOM the worker heap.
 */
async function readBodyCapped(res, maxBytes) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    const text = await res.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let totalBytes = 0;
  let out = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        out += decoder.decode(value, { stream: true });
        if (totalBytes >= maxBytes) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
    }
    out += decoder.decode();
  } catch (e) {
    await reader.cancel().catch(() => {});
  }
  return out;
}

async function fetchHtml(url, timeoutMs = 4500, maxBytes = MAX_HTML_BYTES) {
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
    if (res.ok) return await readBodyCapped(res, maxBytes);
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
  return null;
}

async function fetchJinaFallback(url, timeoutMs = 6000) {
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
      const txt = await readBodyCapped(res, MAX_SUB_HTML_BYTES);
      return txt && txt.length > 120 ? txt : null;
    }
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
  return null;
}

export function normalizeUrl(inputUrl) {
  if (!inputUrl) return '';
  let url = inputUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch (e) {
    return url;
  }
}

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
    .replace(/&#8217;|&rsquo;|&#039;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_VISIBLE_CHARS);
}

const ASSET_EXTENSION_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|tiff?|heic|mp4|mov|webm|css|js|mjs|map|json|xml|woff2?|ttf|otf|eot|pdf)$/i;

function sanitizeEmail(email) {
  if (!email) return null;
  const clean = email.trim().toLowerCase().replace(/[^\w.@+-]/g, '');
  if (!clean.includes('@') || !clean.includes('.') || clean.length > 80) return null;
  if (ASSET_EXTENSION_RE.test(clean)) return null;
  const [local, domain] = clean.split('@');
  if (!local || !domain || domain.length < 4) return null;
  // Block retina asset filenames such as hero@2x.avif or sprite@3x.png
  if (/^[1-4]x\./i.test(domain) || /^\d+x\d+$/i.test(local)) return null;
  const tld = domain.split('.').pop() || '';
  if (!/^[a-z]{2,12}$/.test(tld)) return null;
  if (JUNK_EMAIL_DOMAINS.some((d) => domain.includes(d))) return null;
  return clean;
}

function pickBestEmail(emailSet) {
  const arr = Array.from(emailSet);
  if (arr.length === 0) return null;
  return arr.find((e) => !GENERIC_EMAIL_LOCALS.has(e.split('@')[0])) || arr[0];
}

function cleanPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return null;
  if (!/^[2-9][0-9]{2}[2-9][0-9]{6}$/.test(ten)) return null;
  if (ten.slice(3, 6) === '555' || /^(\d)\1{9}$/.test(ten)) return null;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

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
    if (Array.isArray(node['@graph'])) inspectNode(node['@graph']);

    if (!result.name && typeof node.name === 'string' && /LocalBusiness|HVAC|Plumb|Roof|Electr|Contractor|Organization/i.test(String(node['@type'] || ''))) {
      result.name = node.name.trim();
    }
    if (!result.telephone && typeof node.telephone === 'string') result.telephone = cleanPhone(node.telephone);
    if (!result.email && typeof node.email === 'string') result.email = sanitizeEmail(node.email.replace(/^mailto:/i, ''));
    if (!result.founderName && node.founder) {
      const fName = typeof node.founder === 'string' ? node.founder : node.founder.name;
      if (fName && typeof fName === 'string' && fName.length < 40) result.founderName = fName.trim();
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
      if (raw && raw.length < 50_000) inspectNode(JSON.parse(raw));
    } catch (e) {}
  });
  return result;
}

function extractTradeOwnerName(visibleText, primaryEmail, jsonLdFounder = null) {
  if (jsonLdFounder) return `${jsonLdFounder} (Founder)`;

  if (visibleText) {
    const stopWords = /^(of|the|our|and|company|business|service|services|team|board|group|management|homes|homeowners|rapid|family|operated|operators|operator|owned|owner|founder|today|since|local|customers|clients|warranty|repair|hvac|heating|cooling|air|plumbing|roofing|electric|electrical|mechanical|veteran|staff|technicians|precision|quality|comfort|premier|elite|north|south|east|west|central)$/i;
    const patterns = [
      /\b(?:Owner|President|Founder|CEO|Founded\s+by|Owned\s+(?:and\s+operated\s+)?by|Operated\s+by|Started\s+by)\s*(?:[:\-–,]|\bis\b)?\s*([A-Z][a-z]{2,15}(?:\s+[A-Z][a-z]{2,15})?)\b/g,
      /\b([A-Z][a-z]{2,15}\s+[A-Z][a-z]{2,15})\s*,\s*(?:Owner|Founder|President|Co-Founder|Master\s+(?:Plumber|Electrician|Technician))\b/g,
    ];
    for (const reg of patterns) {
      let m;
      while ((m = reg.exec(visibleText)) !== null) {
        const candidate = m[1].trim();
        if (!candidate.split(/\s+/).some((w) => stopWords.test(w)) && candidate.length >= 3) {
          return `${candidate} (Owner)`;
        }
      }
    }
  }

  if (primaryEmail) {
    const local = primaryEmail.split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
    if (local.length >= 3 && local.length <= 16 && !GENERIC_EMAIL_LOCALS.has(local)) {
      if (visibleText) {
        const prefix = local.slice(0, Math.min(local.length, 6));
        const nameMatch = visibleText.match(new RegExp(`\\b(${prefix}[a-z]{0,10})\\s+([A-Z][a-z]{2,15})\\b`, 'i'));
        if (nameMatch && /^[A-Z]/.test(nameMatch[2])) {
          const fn = nameMatch[1][0].toUpperCase() + nameMatch[1].slice(1).toLowerCase();
          return `${fn} ${nameMatch[2]} (Owner)`;
        }
      }
      return `${local[0].toUpperCase() + local.slice(1)} (Owner Contact)`;
    }
  }
  return null;
}

function extractDoctorName(visibleText) {
  if (!visibleText) return null;
  const drRegex = /\bDr\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  let match;
  while ((match = drRegex.exec(visibleText)) !== null) {
    const candidate = match[0].trim();
    if (!/recommended|approved|tested|designed|formulated/i.test(candidate)) return candidate;
  }
  const mdMatch = visibleText.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+),\s*(?:MD|M\.D\.|DO|D\.O\.|FACS)\b/);
  return mdMatch ? `Dr. ${mdMatch[1]}` : null;
}

function detectAdPixels(rawHtml, visibleText = '') {
  const html = rawHtml || '';
  const combined = html + ' ' + visibleText;
  const lsaVerified = /google\s+screened|google\s+guaranteed|local\s+services?\s+ads?|localservices\.google\.com/i.test(combined);
  const confirmedGoogleAds = /AW-\d{6,}|googleadservices\.com|doubleclick\.net|gclid|callrail\.com|whatconverts\.com|calltrackingmetrics|marchex|invoca/i.test(html);
  const gtmOrGtag = html.includes('googletagmanager.com/gtag') || html.includes('googletagmanager.com/gtm.js') || html.includes('gtag(');
  const metaPixel = html.includes('fbevents.js') || html.includes('connect.facebook.net') || html.includes('fbq(') || html.includes('_fbq');
  const tikTokPixel = html.includes('analytics.tiktok.com') || html.includes('ttq.load');

  return {
    hasPaidAds: lsaVerified || confirmedGoogleAds || metaPixel || tikTokPixel || gtmOrGtag,
    lsaVerified,
    confirmedGoogleAds,
    googleAds: lsaVerified || confirmedGoogleAds || gtmOrGtag,
    metaPixel,
    tikTokPixel,
    gtmOrGtag,
  };
}

export function detectMultiLocation(textOrHtml, locLinkCount = 0, url = '', companyName = '') {
  const lower = (textOrHtml || '').toLowerCase();
  const targetStr = `${url} ${companyName}`.toLowerCase();

  for (const pat of PE_CHAIN_PATTERNS) {
    if (pat.test(targetStr) || pat.test(lower.slice(0, 4000))) {
      return { isMultiLocation: true, isFamilyOwned: false, reason: 'Matched national PE / franchise chain' };
    }
  }

  const chainPhrases = [
    'our locations', 'all locations', 'multiple locations', 'find a location',
    'view locations', 'select a location', 'choose a location', 'see all locations',
    'franchise opportunities', 'franchise information', 'corporate headquarters', 'find your nearest',
  ];
  for (const phrase of chainPhrases) {
    if (lower.includes(phrase)) {
      return { isMultiLocation: true, isFamilyOwned: false, reason: `Multi-location indicator: "${phrase}"` };
    }
  }

  if (locLinkCount >= 3) {
    return { isMultiLocation: true, isFamilyOwned: false, reason: `Found ${locLinkCount} branch directory links` };
  }

  const isFamilyOwned = /family[- ]owned|family[- ]operated|locally owned|veteran[- ]owned|father and son|generations/i.test(lower);
  return {
    isMultiLocation: false,
    isFamilyOwned,
    reason: isFamilyOwned ? 'Family-owned local operator' : 'Single-location independent operator',
  };
}

/**
 * Extract all signals inside a tightly scoped function so the Cheerio DOM tree is GC'd immediately!
 */
function parseDomSnapshot(html, activeUrl) {
  const $ = cheerio.load(html);
  const jsonLd = extractJsonLdSignals($);
  const ogSiteName = $('meta[property="og:site_name"]').attr('content') || '';
  const titleText = $('title').text() || '';
  const h1Text = $('h1').first().text() || '';

  const emails = [];
  const phones = [];
  $('a[href^="mailto:"]').each((_, el) => {
    const c = sanitizeEmail($(el).attr('href')?.replace(/^mailto:/i, '').split('?')[0]);
    if (c) emails.push(c);
  });
  $('a[href^="tel:"]').each((_, el) => {
    const c = cleanPhone($(el).attr('href')?.replace(/^tel:/i, ''));
    if (c) phones.push(c);
  });

  let hasGmb = false;
  let hasInstagram = false;
  let hasFacebook = false;
  let gmbUrl = null;
  let igUrl = null;
  let fbUrl = null;
  const subUrls = new Set();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href) return;
    if (!hasGmb && /(maps\.google\.com|google\.com\/maps|goo\.gl\/maps|g\.page\/|search\.google\.com\/local)/i.test(href)) {
      hasGmb = true;
      gmbUrl = href;
    } else if (!hasInstagram && /instagram\.com\/[a-zA-Z0-9._-]+/i.test(href) && !/instagram\.com\/(p\/|explore|share)/i.test(href)) {
      hasInstagram = true;
      igUrl = href;
    } else if (!hasFacebook && /facebook\.com\/[a-zA-Z0-9._-]+/i.test(href) && !/(sharer|tr\?|facebook\.com\/share)/i.test(href)) {
      hasFacebook = true;
      fbUrl = href;
    }
    if (subUrls.size < 4 && /\b(about|about-us|our-team|team|leadership|contact|contact-us)\b/i.test(href)) {
      try {
        const fullUrl = new URL(href, activeUrl).href;
        if (fullUrl.startsWith(activeUrl) && fullUrl !== activeUrl && fullUrl !== `${activeUrl}/`) {
          subUrls.add(fullUrl);
        }
      } catch (e) {}
    }
  });

  const locLinkCount = $('a[href*="/locations/"], a[href*="/our-locations"], a[href*="/branches/"], a[href*="/offices/"]').length;
  const hasHtmlFormTag = $('form').length > 0;

  return {
    jsonLd,
    ogSiteName,
    titleText,
    h1Text,
    emails,
    phones,
    social: {
      hasGmb, gmbUrl, hasInstagram, igUrl, hasFacebook, fbUrl,
      summary: hasGmb ? 'GMB Verified' : hasInstagram || hasFacebook ? 'Social Active' : 'Organic Direct',
    },
    locLinkCount,
    hasHtmlFormTag,
    subUrls: Array.from(subUrls),
  };
}

function isValidBusinessName(raw) {
  const s = String(raw || '')
    .replace(/&amp;/gi, '&')
    .replace(/&#039;|&#8217;|&rsquo;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length < 3 || s.length > 85) return false;
  if (/^(default|home|homepage|welcome|index|untitled|wordpress|website|main|blog|about|contact|menu|search)$/i.test(s)) {
    return false;
  }
  // Reject City, ST [ZIP] or pure street-number addresses mistaken for company names
  if (/^[A-Za-z\s.'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(s)) return false;
  if (/^\d{1,6}\s+[A-Za-z0-9\s.'-]+$/.test(s) && !/(24|365|1st|24\/7|air|hvac|plumb|roof|electric|heat|cool)/i.test(s)) {
    return false;
  }
  return true;
}

function pickTitleBrand(rawTitle) {
  if (!rawTitle) return '';
  const parts = rawTitle.split(/[-|•–]/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (/^(home|welcome|heating,\s*air\s*conditioning|air\s*conditioning,\s*heating|hvac\s*services|services|about\s*us|contact\s*us)$/i.test(part)) {
      continue;
    }
    if (isValidBusinessName(part)) return part;
  }
  return '';
}

/**
 * Lean, memory-bounded scraper:
 * 1) Fetches capped homepage HTML (auto-tries www/bare host swap) -> falls back to Jina Reader on 403
 * 2) Extracts DOM snapshot synchronously so Cheerio AST is freed immediately
 * 3) Optionally crawls up to 1 /about or /contact subpage only when key fields are missing
 */
export async function scrapeClinicWebsite(inputUrl, options = {}) {
  const baseUrl = normalizeUrl(inputUrl);
  if (!baseUrl) return { success: false, error: 'Invalid URL provided' };

  let activeUrl = baseUrl;
  let homepageHtml = await fetchHtml(baseUrl, 4500, MAX_HTML_BYTES);
  let dataSource = 'direct_html';

  if (!homepageHtml) {
    try {
      const u = new URL(baseUrl);
      const altHost = u.hostname.startsWith('www.') ? u.hostname.replace(/^www\./, '') : `www.${u.hostname}`;
      const altUrl = `${u.protocol}//${altHost}`;
      const altHtml = await fetchHtml(altUrl, 4000, MAX_HTML_BYTES);
      if (altHtml) {
        homepageHtml = altHtml;
        activeUrl = altUrl;
      }
    } catch (e) {}
  }

  let jinaMarkdown = null;
  if (!homepageHtml) {
    jinaMarkdown = await fetchJinaFallback(baseUrl, 6000);
    if (jinaMarkdown) dataSource = 'jina_fallback';
  }

  if (!homepageHtml && !jinaMarkdown) {
    return { success: false, error: `Unreachable domain: ${baseUrl}` };
  }

  const snap = homepageHtml ? parseDomSnapshot(homepageHtml, activeUrl) : null;
  const visibleHomeText = homepageHtml ? extractVisibleText(homepageHtml) : jinaMarkdown.slice(0, MAX_VISIBLE_CHARS);
  const jsonLd = snap ? snap.jsonLd : { reviewCount: null, ratingValue: null, telephone: null, email: null, founderName: null, openingHours: [], name: null };

  // Business name (filter CMS defaults like "default" and street addresses like "Delaware, OH 43015")
  let clinicName = '';
  if (snap) {
    const candidates = [jsonLd.name, snap.ogSiteName, pickTitleBrand(snap.titleText), snap.h1Text];
    clinicName = candidates.find((c) => isValidBusinessName(c)) || '';
  } else if (jinaMarkdown) {
    const titleLine = jinaMarkdown.match(/^Title:\s*(.+)$/m);
    if (titleLine) clinicName = pickTitleBrand(titleLine[1]);
  }
  if (!clinicName) {
    try {
      const rawHost = new URL(activeUrl).hostname.replace(/^www\./, '').split('.')[0];
      clinicName = rawHost ? rawHost.charAt(0).toUpperCase() + rawHost.slice(1) : 'Local Service Contractor';
    } catch (e) {
      clinicName = 'Local Service Contractor';
    }
  }
  clinicName = clinicName
    .replace(/&amp;/gi, '&')
    .replace(/&#039;|&#8217;|&rsquo;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();

  // Ad pixels, scheduling stack & form detection BEFORE freeing homepageHtml
  const rawHomeLower = (homepageHtml || '').toLowerCase();
  const stackMatches = (rawHomeLower + ' ' + visibleHomeText.toLowerCase()).match(
    /(housecallpro\.com|getjobber\.com|clienthub\.getjobber|leadconnectorhq\.com|msgsndr\.com|gohighlevel|servicetitan\.com|scheduleengine|calendly\.com|cal\.com|calendar\.google\.com|outlook\.office365\.com|bookings\.microsoft\.com|avoca\.ai|smith\.ai|ruby\s+receptionists?)/g
  );
  const stackText = stackMatches ? Array.from(new Set(stackMatches)).join(' ') : '';
  const adSignals = detectAdPixels(homepageHtml || '', visibleHomeText);
  const hasHtmlForm = Boolean(snap?.hasHtmlFormTag) || /wpcf7|wpforms|gform|gravityforms|elementor-form|hubspot-form|<form\b/i.test(homepageHtml || '');
  const hasLiveSchedulerHome = /calendly\.com|acuityscheduling\.com|cal\.com|scheduleengine|servicetitan\.com\/web|housecallpro\.com\/book|jobber\.com/i.test(
    (homepageHtml || '') + ' ' + visibleHomeText
  );

  const rawEmails = new Set(snap?.emails || []);
  const rawPhones = new Set(snap?.phones || []);
  if (jsonLd.email) rawEmails.add(jsonLd.email);
  if (jsonLd.telephone) rawPhones.add(jsonLd.telephone);

  const visiblePhones = visibleHomeText.match(/(?:\+?1[-.\s])?\(?[2-9][0-9]{2}\)?[-.\s][2-9][0-9]{2}[-.\s][0-9]{4}\b/g);
  if (visiblePhones) {
    for (const p of visiblePhones.slice(0, 4)) {
      const c = cleanPhone(p);
      if (c) rawPhones.add(c);
    }
  }

  const emailMatches = ((homepageHtml || '') + ' ' + visibleHomeText).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (emailMatches) {
    for (const em of emailMatches) {
      const c = sanitizeEmail(em);
      if (c) rawEmails.add(c);
    }
  }

  const locLinkCount = snap?.locLinkCount || 0;
  const chainMatchHomepage = /our locations|all locations|multiple locations|find a location|franchise/i.test(homepageHtml || '');
  const socialSignals = snap
    ? snap.social
    : {
        hasGmb: /maps\.google\.com|google\.com\/maps|g\.page/i.test(jinaMarkdown || ''),
        hasInstagram: /instagram\.com\/[a-zA-Z0-9._-]+/i.test(jinaMarkdown || ''),
        hasFacebook: /facebook\.com\/[a-zA-Z0-9._-]+/i.test(jinaMarkdown || ''),
        summary: 'Proxy Verified',
      };

  const subTargets = (snap?.subUrls?.length ? snap.subUrls : [`${activeUrl}/about/`]).slice(0, options.fast ? 1 : 2);
  homepageHtml = null; // Explicitly release large homepage string for GC!

  // Subpage crawl ONLY if founder/email/reviews still missing
  let subVisibleText = '';
  const needSubCrawl = (rawEmails.size === 0 || !jsonLd.founderName || !jsonLd.reviewCount) && dataSource === 'direct_html';
  if (needSubCrawl && !options.skipSubCrawl && subTargets.length > 0) {
    const subResults = await Promise.all(subTargets.map((su) => fetchHtml(su, 2800, MAX_SUB_HTML_BYTES)));
    for (const subHtml of subResults) {
      if (!subHtml) continue;
      const subSnap = parseDomSnapshot(subHtml, activeUrl);
      subSnap.emails.forEach((e) => rawEmails.add(e));
      subSnap.phones.forEach((p) => rawPhones.add(p));
      if (subSnap.jsonLd.reviewCount && !jsonLd.reviewCount) jsonLd.reviewCount = subSnap.jsonLd.reviewCount;
      if (subSnap.jsonLd.ratingValue && !jsonLd.ratingValue) jsonLd.ratingValue = subSnap.jsonLd.ratingValue;
      if (subSnap.jsonLd.founderName && !jsonLd.founderName) jsonLd.founderName = subSnap.jsonLd.founderName;
      const subEm = subHtml.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (subEm) subEm.forEach((em) => { const c = sanitizeEmail(em); if (c) rawEmails.add(c); });
      subVisibleText += ' ' + extractVisibleText(subHtml).slice(0, 12_000);
    }
  }

  const visibleText = `${visibleHomeText} ${subVisibleText}`.trim().slice(0, MAX_VISIBLE_CHARS);
  const niche = options.niche || 'hvac';
  const isTradeSite =
    niche !== 'medspa' ||
    /hvac|air conditioning|heating|plumbing|furnace|duct|roofing|electrician|electrical|contractor|restoration/i.test(
      visibleText + ' ' + clinicName
    );

  const searchPool = isTradeSite ? TRADE_SERVICES : AESTHETIC_TREATMENTS;
  const detectedTreatments = searchPool.filter((s) =>
    new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(visibleText)
  );
  let primaryTreatment = detectedTreatments[0] || (isTradeSite ? 'Emergency AC & Heating Repair' : 'Morpheus8');

  const primaryEmail = pickBestEmail(rawEmails);
  const primaryPhone = Array.from(rawPhones)[0] || null;
  const doctorName = isTradeSite
    ? extractTradeOwnerName(visibleText, primaryEmail, jsonLd.founderName) || `Owner / Operations Lead at ${clinicName}`
    : extractDoctorName(visibleText);

  let city = null;
  const locationMatch = visibleText.match(
    /\b([A-Z][a-zA-Z\s]{2,20}),\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/
  );
  if (locationMatch) city = `${locationMatch[1].trim()}, ${locationMatch[2]}`;

  const effectiveCity = options.city || city || 'US';
  const climate = getCityClimateProfile(effectiveCity);
  if (isTradeSite && climate.belt === 'hot_belt' && /\b(furnace|boiler)\b/i.test(primaryTreatment)) {
    primaryTreatment =
      detectedTreatments.find((t) => !/\b(furnace|boiler)\b/i.test(t)) || 'Emergency AC Repair';
  }

  const multiLocation = detectMultiLocation(chainMatchHomepage ? 'our locations ' + visibleText : visibleText, locLinkCount, activeUrl, clinicName);
  const hasLiveScheduler = hasLiveSchedulerHome || /calendly|acuityscheduling|cal\.com|servicetitan|housecallpro|jobber/i.test(visibleText);

  return {
    success: true,
    url: activeUrl,
    dataSource,
    clinicName,
    shortClinicName: getShortBusinessName(clinicName),
    doctorName: doctorName || null,
    salutation: formatSalutation(doctorName, clinicName, isTradeSite ? 'hvac' : 'medspa'),
    email: primaryEmail,
    allEmails: Array.from(rawEmails).slice(0, 6),
    phone: primaryPhone,
    city: city || 'US',
    treatment: primaryTreatment,
    allTreatments: detectedTreatments,
    adSignals,
    stackText,
    multiLocation,
    socialSignals,
    jsonLd,
    hasHtmlForm,
    hasLiveScheduler,
    visibleText,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Scrape a single website, run Qualifier Gate, and push qualified leads to Pipeline CRM
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
  const result = await scrapeClinicWebsite(url, { niche: nicheOverride || 'hvac', city: cityOverride });
  if (!result.success) return { success: false, error: result.error };

  let finalEmail = result.email;
  if (!finalEmail && result.phone && result.url) {
    try {
      finalEmail = `info@${new URL(result.url).hostname.replace(/^www\./, '')}`;
    } catch (e) {}
  }

  if (!finalEmail) {
    return {
      success: false,
      message: 'Scraped successfully, but no direct email or phone found on site.',
      data: result,
    };
  }

  const qualification = qualifyLead(
    {
      ...result,
      email: finalEmail,
      city: cityOverride || result.city,
      treatment: treatmentOverride || result.treatment,
      doctorName: doctorOverride || result.doctorName,
    },
    { hasStaticForm: result.hasHtmlForm && !result.hasLiveScheduler },
    Number(minScore) || 60
  );

  if (!qualification.qualified && !force) {
    return {
      success: false,
      disqualified: true,
      message: `Lead rejected (${qualification.score}/100 ${qualification.grade}): ${qualification.disqualifyReasons.join('; ')}`,
      qualification,
      scrapedData: result,
    };
  }

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

  const addRes = await addProspect({
    doctorName: doctorOverride || result.doctorName,
    clinicName: result.clinicName,
    email: finalEmail,
    city: cityOverride || result.city,
    treatment: treatmentOverride || result.treatment,
    phone: result.phone,
    website_url: result.url,
    niche: nicheOverride || 'hvac',
    notes: `Hunter: ${result.url} | Qual: ${qualification.score}/100 (${qualification.grade}) | Eye Test: ${qualification.eyePassCount}/4 | Ads: ${
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

export async function scrapeBulkLeads(urlList, options = {}) {
  const results = [];
  for (let i = 0; i < urlList.length; i++) {
    const rawUrl = urlList[i];
    if (!rawUrl || !rawUrl.trim()) continue;
    const res = await scrapeAndIngestLead({ url: rawUrl, ...options });
    results.push({ url: rawUrl, ...res });
    if (i < urlList.length - 1) await new Promise((r) => setTimeout(r, 700));
  }
  return {
    total: urlList.length,
    ingestedCount: results.filter((r) => r.success).length,
    disqualifiedCount: results.filter((r) => r.disqualified).length,
    results,
  };
}
