import * as cheerio from 'cheerio';
import { addProspect, getProspectById } from './outreachService.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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

const JUNK_EMAIL_DOMAINS = [
  'sentry.io',
  'wixpress.com',
  'squarespace.com',
  'wordpress.org',
  'schema.org',
  'example.com',
  'domain.com',
  'gravatar.com',
  'cloudflare.com',
];

/**
 * Fetches page HTML with standard browser headers and timeout
 */
async function fetchHtml(url, timeoutMs = 8000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    return null;
  }
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
 * Clean and filter email addresses
 */
function sanitizeEmail(email) {
  if (!email) return null;
  const clean = email.trim().toLowerCase().replace(/[^\w.@+-]/g, '');
  if (!clean.includes('@') || !clean.includes('.')) return null;

  // Filter out image extensions erroneously captured
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(clean)) return null;

  const domain = clean.split('@')[1];
  if (!domain || JUNK_EMAIL_DOMAINS.some((d) => domain.includes(d))) return null;

  return clean;
}

/**
 * Extract doctor or provider name
 */
function extractDoctorName(text, $) {
  // 1. Look for Dr. [First] [Last]
  const drRegex = /\bDr\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  let match;
  while ((match = drRegex.exec(text)) !== null) {
    const candidate = match[0].trim();
    // Exclude generic phrases like "Dr. Recommended" or "Dr. Approved"
    if (!/recommended|approved|tested|designed|formulated/i.test(candidate)) {
      return candidate;
    }
  }

  // 2. Look for [Name], MD or [Name], DO
  const mdRegex = /\b([A-Z][a-z]+\s+[A-Z][a-z]+),\s*(?:MD|M\.D\.|DO|D\.O\.|FACS)\b/;
  const mdMatch = text.match(mdRegex);
  if (mdMatch) {
    return `Dr. ${mdMatch[1]}`;
  }

  return null;
}

/**
 * Detect active ad tracking pixels (Meta Ads / Google Ads / TikTok)
 */
function detectAdPixels(html) {
  const hasMetaPixel =
    html.includes('fbevents.js') ||
    html.includes('connect.facebook.net') ||
    html.includes('fbq(') ||
    html.includes('_fbq');

  const hasGoogleAds =
    html.includes('googletagmanager.com/gtag') ||
    html.includes('gtag(\'config\', \'AW-') ||
    html.includes('googleadservices.com');

  const hasTikTokPixel =
    html.includes('analytics.tiktok.com') ||
    html.includes('ttq.load');

  return {
    hasPaidAds: hasMetaPixel || hasGoogleAds || hasTikTokPixel,
    metaPixel: hasMetaPixel,
    googleAds: hasGoogleAds,
    tikTokPixel: hasTikTokPixel,
  };
}

/**
 * Scrape a clinic website and extract doctor name, email, phone, treatments, and ad signals
 */
export async function scrapeClinicWebsite(inputUrl) {
  const baseUrl = normalizeUrl(inputUrl);
  if (!baseUrl) {
    return { success: false, error: 'Invalid URL provided' };
  }

  console.log(`[Lead Scraper] Crawling domain: ${baseUrl}...`);
  const homepageHtml = await fetchHtml(baseUrl);
  if (!homepageHtml) {
    return { success: false, error: `Failed to retrieve content from ${baseUrl}` };
  }

  const $home = cheerio.load(homepageHtml);

  // 1. Extract Clinic Name
  let clinicName =
    $home('meta[property="og:site_name"]').attr('content') ||
    $home('title').text().split(/[-|•–]/)[0]?.trim() ||
    $home('h1').first().text()?.trim() ||
    new URL(baseUrl).hostname.replace(/^www\./, '').split('.')[0];

  clinicName = clinicName.replace(/\s+/g, ' ').trim();

  // 2. Extract Ad Tracking Pixels (Evidence of active paid ad spend)
  const adSignals = detectAdPixels(homepageHtml);

  // 3. Extract Treatments
  const detectedTreatments = [];
  for (const t of AESTHETIC_TREATMENTS) {
    if (new RegExp(`\\b${t}\\b`, 'i').test(homepageHtml)) {
      detectedTreatments.push(t);
    }
  }
  const primaryTreatment = detectedTreatments[0] || 'Morpheus8 & Injectables';

  // 4. Extract Phone & Emails from Homepage
  const rawEmails = new Set();
  const rawPhones = new Set();

  $home('a[href^="mailto:"]').each((_, el) => {
    const raw = $home(el).attr('href')?.replace(/^mailto:/i, '').split('?')[0];
    const cleaned = sanitizeEmail(raw);
    if (cleaned) rawEmails.add(cleaned);
  });

  $home('a[href^="tel:"]').each((_, el) => {
    const raw = $home(el).attr('href')?.replace(/^tel:/i, '').replace(/[^\d+]/g, '');
    if (raw && raw.length >= 10) rawPhones.add(raw);
  });

  // Regex phone search
  const phoneMatches = homepageHtml.match(/(?:\+?1[-.\s]?)?\(?([2-9][0-8][0-9])\)?[-.\s]?([2-9][0-9]{2})[-.\s]?([0-9]{4})/g);
  if (phoneMatches) {
    for (const p of phoneMatches.slice(0, 3)) {
      rawPhones.add(p.trim());
    }
  }

  // Regex email search in text
  const emailMatches = homepageHtml.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (emailMatches) {
    for (const em of emailMatches) {
      const cleaned = sanitizeEmail(em);
      if (cleaned) rawEmails.add(cleaned);
    }
  }

  // 5. Extract Doctor Name from Homepage
  let doctorName = extractDoctorName(homepageHtml, $home);

  // 6. Deep Crawl Sub-pages (/about, /team, /contact) if doctor or email is missing
  const subLinks = new Set();
  $home('a[href]').each((_, el) => {
    const href = $home(el).attr('href');
    if (!href) return;
    if (/(about|team|provider|doctor|contact|physician|staff)/i.test(href)) {
      try {
        const fullUrl = new URL(href, baseUrl).href;
        if (fullUrl.startsWith(baseUrl)) {
          subLinks.add(fullUrl);
        }
      } catch (e) {}
    }
  });

  const candidateSubUrls = Array.from(subLinks).slice(0, 3);
  for (const subUrl of candidateSubUrls) {
    if (doctorName && rawEmails.size > 0) break; // We already have enough high-value data

    console.log(`[Lead Scraper] Deep crawling sub-page: ${subUrl}`);
    const subHtml = await fetchHtml(subUrl, 5000);
    if (!subHtml) continue;

    const $sub = cheerio.load(subHtml);

    if (!doctorName) {
      doctorName = extractDoctorName(subHtml, $sub);
    }

    $sub('a[href^="mailto:"]').each((_, el) => {
      const raw = $sub(el).attr('href')?.replace(/^mailto:/i, '').split('?')[0];
      const cleaned = sanitizeEmail(raw);
      if (cleaned) rawEmails.add(cleaned);
    });

    const subEmailMatches = subHtml.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (subEmailMatches) {
      for (const em of subEmailMatches) {
        const cleaned = sanitizeEmail(em);
        if (cleaned) rawEmails.add(cleaned);
      }
    }
  }

  // 7. Extract City / State
  let city = null;
  const locationMatch = homepageHtml.match(/\b([A-Z][a-zA-Z\s]{2,20}),\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/);
  if (locationMatch) {
    city = `${locationMatch[1].trim()}, ${locationMatch[2]}`;
  }

  const primaryEmail = Array.from(rawEmails)[0] || null;
  const primaryPhone = Array.from(rawPhones)[0] || null;

  return {
    success: true,
    url: baseUrl,
    clinicName,
    doctorName: doctorName || (clinicName ? `Medical Director at ${clinicName}` : 'Doctor'),
    email: primaryEmail,
    allEmails: Array.from(rawEmails),
    phone: primaryPhone,
    city: city || 'US',
    treatment: primaryTreatment,
    allTreatments: detectedTreatments,
    adSignals,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Scrape a clinic website and automatically push into Supabase `public.prospects`
 */
export async function scrapeAndIngestLead({ url, cityOverride, treatmentOverride, doctorOverride }) {
  const result = await scrapeClinicWebsite(url);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  if (!result.email) {
    return {
      success: false,
      message: 'Scraped successfully, but no direct email address found on the clinic site. Manual verification needed.',
      data: result,
    };
  }

  // Check if already in Supabase
  const existing = await getProspectById(result.email);
  if (existing) {
    return {
      success: false,
      message: `Prospect ${result.email} already exists in database.`,
      prospect: existing,
      scrapedData: result,
    };
  }

  // Push to Supabase public.prospects
  const addRes = await addProspect({
    doctorName: doctorOverride || result.doctorName,
    clinicName: result.clinicName,
    email: result.email,
    city: cityOverride || result.city,
    treatment: treatmentOverride || result.treatment,
    notes: `Scraped from ${result.url}. Ad Spend: ${result.adSignals.hasPaidAds ? 'ACTIVE (Meta/Google)' : 'Organic'}. Phone: ${result.phone || 'N/A'}`,
  });

  return {
    success: true,
    prospect: addRes.prospect,
    scrapedData: result,
  };
}

/**
 * Bulk scrape a list of URLs with rate limiting
 */
export async function scrapeBulkLeads(urlList) {
  const results = [];
  console.log(`[Lead Scraper] Starting bulk scrape for ${urlList.length} domains...`);

  for (let i = 0; i < urlList.length; i++) {
    const rawUrl = urlList[i];
    if (!rawUrl || !rawUrl.trim()) continue;

    console.log(`[Lead Scraper] Processing ${i + 1}/${urlList.length}: ${rawUrl}`);
    const res = await scrapeAndIngestLead({ url: rawUrl });
    results.push({ url: rawUrl, ...res });

    // 1-second delay between domain crawls to protect our IP
    if (i < urlList.length - 1) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  return {
    total: urlList.length,
    ingestedCount: results.filter((r) => r.success).length,
    results,
  };
}
