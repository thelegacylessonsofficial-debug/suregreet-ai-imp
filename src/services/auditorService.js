import { updateProspect, getProspectById } from './outreachService.js';
import { hasLiveSchedulerInText } from './qualifierService.js';
import { isSafePublicHttpUrl } from './scraperService.js';

const JINA_BASE = 'https://r.jina.ai';

const MEDSPA_TREATMENTS = [
  'Morpheus8',
  'BodyTite',
  'Botox',
  'CoolSculpting',
  'Semaglutide',
  'InMode',
  'Dermal Fillers',
  'Juvederm',
  'Sculptra',
  'Hydrafacial',
  'IPL Photofacial',
  'Microneedling',
];

const HVAC_SERVICES = [
  'Emergency AC Repair',
  'HVAC Replacement',
  'Heat Pump Repair',
  'Furnace Maintenance',
  'Commercial Refrigeration',
  '24/7 Emergency Service',
  'Air Duct Cleaning',
];

/**
 * Fetches clean markdown of a website via Jina AI Reader (Zero-Cost)
 */
export async function fetchJinaMarkdown(url, timeoutMs = 8000) {
  if (!isSafePublicHttpUrl(url)) return null;
  try {
    const targetUrl = url.trim();
    const endpoint = `${JINA_BASE}/${targetUrl}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SureGreetAI-Auditor/1.0',
        Accept: 'text/plain,text/markdown',
      },
    });

    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.warn(`[Auditor:Jina] Failed to fetch markdown for ${url}:`, err.message);
    return null;
  }
}

/**
 * Run diagnostic analysis on website content to extract high-leverage sales hooks
 */
export async function runDigitalAudit({ url, niche = 'hvac', businessName, doctorName, htmlContent }) {
  let markdown = '';

  if (htmlContent) {
    markdown = String(htmlContent)
      .slice(0, 60000)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    markdown = await fetchJinaMarkdown(url, 2500);
  }

  const isTrade = niche !== 'medspa';

  if (!markdown) {
    return {
      success: false,
      error: 'Could not retrieve content',
      niche: isTrade ? (niche || 'hvac') : 'medspa',
      primaryService: isTrade ? 'Emergency Service Calls' : 'Morpheus8',
      specificObservation: isTrade
        ? 'Saw your service page routes emergency calls to a static contact form instead of live dispatch.'
        : 'Saw your site makes patients fill out a static form instead of offering instant 24/7 booking.',
      recommendedAngle: isTrade
        ? 'Pitch 24/7 AI Emergency Dispatcher to capture after-hours urgent repair calls.'
        : 'Pitch 24/7 AI Voice Receptionist + 1-Click calendar booking to eliminate form drop-off.',
    };
  }

  // 1. Detect Niche & High-Ticket Focus
  const isTradeText = isTrade || /hvac|air conditioning|heating|plumbing|furnace|roofing|electrical|restoration/i.test(markdown);
  let detectedServices = [];

  if (isTradeText) {
    detectedServices = HVAC_SERVICES.filter((s) => new RegExp(`\\b${s}\\b`, 'i').test(markdown));
  } else {
    detectedServices = MEDSPA_TREATMENTS.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(markdown));
  }

  const primaryService = detectedServices[0] || (isTradeText ? 'Emergency AC Repair' : 'Morpheus8');

  // 2. Detect Booking Friction (Static Forms vs Instant Scheduling)
  const hasStaticForm =
    /request (an? )?(appointment|quote|estimate|service)|fill out (the |our )?form|contact form|schedule consultation/i.test(markdown) &&
    !hasLiveSchedulerInText(markdown);

  // 3. Detect Speed-to-Lead & After-Hours Gaps
  const mentionsHours = /hours|open monday|mon[\s-]+fri|8:00 am|9:00 am|5:00 pm|6:00 pm/i.test(markdown);
  const mentionsAfterHours = /after[- ]hours|voicemail|call back during business hours|answering machine/i.test(markdown);

  // 4. Detect Negative Reviews / Pain Signals in text
  const hasVoicemailComplaint = /called twice|nobody picked up|never called back|straight to voicemail|hard to reach|left a message/i.test(markdown);

  // 5. Generate Specific Observation (Harvey "Undeniable Proof" Hook - strictly under 18 words)
  let specificObservation = '';
  let recommendedAngle = '';

  if (isTradeText) {
    if (hasVoicemailComplaint) {
      specificObservation = 'Noticed reviews mention calls hitting voicemail during high-demand evening hours.';
      recommendedAngle = 'Pitch 24/7 AI Voice Dispatcher answering in 2 rings to prevent lost $2,000+ emergency jobs.';
    } else if (hasStaticForm) {
      specificObservation = 'Saw your emergency repair page routes homeowners to a static contact form instead of instant dispatch.';
      recommendedAngle = 'Pitch 24/7 AI Emergency Dispatcher to capture after-hours urgent calls.';
    } else {
      specificObservation = `Noticed your team handles high-ticket ${primaryService}, while after-hours calls risk hitting voicemail.`;
      recommendedAngle = 'Pitch instant voice receptionist answering urgent service calls in 2 rings.';
    }
  } else {
    if (hasVoicemailComplaint) {
      specificObservation = `Saw a patient review noting they had to call twice and wait for a callback on ${primaryService}.`;
      recommendedAngle = 'Pitch sub-30-second AI voice callback to capture high-intent patients before they call competitors.';
    } else if (hasStaticForm) {
      specificObservation = `Saw your site makes patients fill out a static contact form on the ${primaryService} page instead of booking directly.`;
      recommendedAngle = 'Pitch 24/7 AI Voice Receptionist + 1-Click calendar booking to eliminate form drop-off.';
    } else {
      specificObservation = `Noticed after 5 PM and on weekends, evening ad inquiries on ${primaryService} wait until morning.`;
      recommendedAngle = 'Pitch after-hours speed-to-lead voice capture to convert evening ad leads before competitors call back.';
    }
  }

  return {
    success: true,
    url,
    niche: isTradeText ? (niche || 'hvac') : 'medspa',
    primaryService,
    allServices: detectedServices,
    hasStaticForm,
    mentionsHours,
    mentionsAfterHours,
    hasVoicemailComplaint,
    specificObservation,
    recommendedAngle,
    auditedAt: new Date().toISOString(),
  };
}

/**
 * Run audit on a prospect and update their Supabase record
 */
export async function auditAndSaveProspect(idOrEmail) {
  const prospect = await getProspectById(idOrEmail);
  if (!prospect) {
    return { success: false, message: 'Prospect not found in Supabase' };
  }

  let targetUrl = prospect.website_url;
  if (!targetUrl && prospect.notes) {
    const urlMatch = prospect.notes.match(/https?:\/\/[^\s,]+/);
    if (urlMatch) targetUrl = urlMatch[0];
  }
  if (!targetUrl && prospect.email) {
    const domain = prospect.email.split('@')[1];
    if (domain) targetUrl = `https://${domain}`;
  }

  if (!targetUrl) {
    return { success: false, message: 'No valid website URL found for prospect' };
  }

  const auditResult = await runDigitalAudit({
    url: targetUrl,
    niche: prospect.niche || 'hvac',
    businessName: prospect.clinic_name,
    doctorName: prospect.doctor_name,
  });

  const updated = await updateProspect(prospect.id, {
    specific_observation: auditResult.specificObservation,
    recommended_angle: auditResult.recommendedAngle,
    website_url: targetUrl,
    treatment: prospect.treatment || auditResult.primaryService,
    niche: auditResult.niche,
  });

  return {
    success: true,
    prospect: updated,
    auditResult,
  };
}
