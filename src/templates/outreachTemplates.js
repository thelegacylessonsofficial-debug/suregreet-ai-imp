import { config } from '../config.js';
import { getCityClimateProfile } from '../services/qualifierService.js';

export function getUnsubscribeUrl(prospectEmail) {
  const base = 'https://suregreet-automation.onrender.com';
  return `${base}/outreach/unsubscribe?email=${encodeURIComponent(prospectEmail || '')}`;
}

export const BANNED_AI_PHRASES = [
  'hope this email finds you well',
  'wanted to reach out',
  'reach out to you',
  'reaching out',
  'circling back',
  'touching base',
  "in today's fast-paced world",
  'supercharge',
  'revolutionize',
  'transform',
  'skyrocket',
  'cutting-edge',
  'game-changing',
  'bespoke',
  'seamless',
  'unlock',
  'unleash your',
  "i know you're busy",
  'dive deep',
  'game changer',
  'synergy',
];

export const BANNED_TRADE_WORDS = [
  'patient',
  'patients',
  'morpheus8',
  'botox',
  'juvederm',
  'bodytite',
  'consultation',
  'medical director',
  'medspa',
];

/**
 * Deterministic Harvey Anti-AI & Deliverability Gate
 */
export function auditHarveyCopy(text, subject = '', niche = 'hvac', city = '') {
  if (!text) return { score: 0, wordCount: 0, passed: false, issues: ['Empty email text'] };
  const cleanBody = text.split('--')[0].trim();
  const lines = cleanBody.split(/\n+/).map(l => l.trim()).filter(Boolean);
  
  // Filter out standard signoffs when counting body words
  const contentLines = lines.filter(l => !/^(best|best regards|thanks|sincerely|cheers|archit|suregreet ai)\b/i.test(l));
  const words = contentLines.join(' ').split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const foundBanned = [];
  const lower = cleanBody.toLowerCase();
  for (const phrase of BANNED_AI_PHRASES) {
    if (lower.includes(phrase)) {
      foundBanned.push(phrase);
    }
  }

  const isTrade = niche !== 'medspa';
  const foundTradeBanned = [];
  if (isTrade) {
    for (const tw of BANNED_TRADE_WORDS) {
      const reg = new RegExp(`\\b${tw}\\b`, 'i');
      if (reg.test(lower)) {
        foundTradeBanned.push(tw);
      }
    }
  }

  const emDashes = (cleanBody.match(/—/g) || []).length + (cleanBody.match(/--/g) || []).length;
  const exclamations = (cleanBody.match(/!/g) || []).length;
  const questionMarks = (cleanBody.match(/\?/g) || []).length;
  const cleanSubject = subject.replace(/^re:\s*/i, '').trim();
  const subjectWords = cleanSubject.split(/\s+/).filter(Boolean).length;

  const issues = [];
  let score = 100;

  if (wordCount < 15) {
    issues.push(`Too short (${wordCount} words; minimum 15 words)`);
    score -= 20;
  } else if (wordCount > 75) {
    issues.push(`Exceeds 75-word hard mobile ceiling (${wordCount} words)`);
    score -= 30;
  } else if (wordCount > 65) {
    issues.push(`Slightly long (${wordCount} words; optimal is 45–65 words)`);
    score -= 5;
  }

  if (foundBanned.length > 0) {
    issues.push(`Contains AI clichés: "${foundBanned.join('", "')}"`);
    score -= foundBanned.length * 25;
  }

  if (foundTradeBanned.length > 0) {
    issues.push(`Contains forbidden medical terms for trade niche: "${foundTradeBanned.join('", "')}"`);
    score -= foundTradeBanned.length * 30;
  }

  if (emDashes > 0) {
    issues.push(`Contains ${emDashes} em-dashes/double-hyphens; use hyphens (-) or commas`);
    score -= emDashes * 15;
  }

  if (exclamations > 0) {
    issues.push(`Contains ${exclamations} exclamation marks; cold outreach must use zero`);
    score -= exclamations * 20;
  }

  if (questionMarks > 1) {
    issues.push(`Contains ${questionMarks} question marks; max 1 allowed (the final CTA)`);
    score -= (questionMarks - 1) * 15;
  }

  if (subjectWords < 2 || subjectWords > 5) {
    issues.push(`Subject line is ${subjectWords} words (ideal is 2–4 words)`);
    score -= 10;
  }

  const climate = getCityClimateProfile(city);
  if (climate.belt === 'hot_belt' && /\b(furnace|boiler|winter\s+freeze|frozen\s+pipe)\b/i.test(`${cleanBody} ${cleanSubject}`)) {
    issues.push(`Climate mismatch: heating/furnace pitch in hot-belt market (${city})`);
    score -= 30;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    wordCount,
    isOptimalWordCount: wordCount >= 45 && wordCount <= 65,
    isUnderHardCeiling: wordCount <= 75,
    foundBanned,
    foundTradeBanned,
    emDashes,
    exclamations,
    questionMarks,
    subjectWords,
    passed: score >= 85 && foundBanned.length === 0 && foundTradeBanned.length === 0 && wordCount <= 75 && exclamations === 0 && questionMarks <= 1 && !(climate.belt === 'hot_belt' && /\b(furnace|boiler|winter\s+freeze)\b/i.test(`${cleanBody} ${cleanSubject}`)),
    issues,
  };
}

/**
 * Helper to clean legal entities from clinic name to get natural business name
 */
export function getShortBusinessName(clinicName) {
  if (!clinicName) return '';
  return clinicName
    .replace(/,\s*(LLC|Inc\.?|Corp\.?|P\.?C\.?|P\.?A\.?|PLLC|Co\.?)$/i, '')
    .replace(/\s+(LLC|Inc\.?|Corp\.?|P\.?C\.?|P\.?A\.?|PLLC|Co\.?)$/i, '')
    .trim();
}

/**
 * Format Salutation:
 * - If doctor/owner name is found: use natural human name (e.g. Dr. LastName or FirstName)
 * - If owner name is not found: fallback cleanly to "team at [Short Business Name]" (e.g. "team at Med Aesthetics Miami")
 * - If no name or clinic: fallback to "there" ("Hey there,")
 */
export function formatSalutation(doctorName, clinicName, niche = 'hvac') {
  const shortClinic = getShortBusinessName(clinicName);
  const isTrade = niche !== 'medspa';

  // Check if doctorName is missing, empty, or a generic placeholder title
  const isPlaceholder =
    !doctorName ||
    !doctorName.trim() ||
    /^(doctor|owner|founder|director|medical director|operations lead|operations manager|manager|admin|team|info)\b/i.test(doctorName.trim()) ||
    doctorName.includes('Medical Director') ||
    doctorName.includes('Operations Lead') ||
    doctorName.includes('Operations Manager') ||
    doctorName.toLowerCase().startsWith('owner');

  if (isPlaceholder) {
    return shortClinic ? `team at ${shortClinic}` : 'there';
  }

  let clean = doctorName.trim();
  if (isTrade) {
    // For trade niches, strip any "Dr." prefixes and extract clean first name
    clean = clean.replace(/^dr\.?\s+/i, '');
    const firstName = clean.split(/\s+/)[0];
    return firstName;
  }

  // MedSpa legacy fallback
  if (/^dr\.?\s+/i.test(clean)) {
    return clean;
  }
  const parts = clean.split(/\s+/);
  if (parts.length > 1) {
    const lastName = parts[parts.length - 1];
    return `Dr. ${lastName}`;
  }
  return `Dr. ${clean}`;
}

/**
 * Updated Harvey Copywriting Suite: Multiple Frameworks & Signal Hooks
 */
export function generateHarveyScript({
  framework = 'pas',
  signalHook = 'after_hours',
  doctorName = 'Owner',
  clinicName = 'Summit Heating & Cooling',
  city = 'Phoenix, AZ',
  treatment = 'Emergency AC & Heating Repair',
  niche = 'hvac',
  specificObservation = '',
  prospectEmail = '',
}) {
  const isTrade = niche !== 'medspa';
  const salutation = formatSalutation(doctorName, clinicName, isTrade ? 'hvac' : 'medspa');
  const clinic = getShortBusinessName(clinicName) || (clinicName ? clinicName.trim() : 'your business');
  const treat = treatment ? treatment.trim() : (isTrade ? 'emergency service calls' : 'Morpheus8');
  const unsubUrl = getUnsubscribeUrl(prospectEmail);

  // 1. Determine Signal Hook Text
  let hookText = '';
  if (specificObservation && specificObservation.trim()) {
    hookText = specificObservation.trim();
  } else if (signalHook === 'meta_ads') {
    hookText = isTrade
      ? `Saw your emergency repair ads running across ${city} yesterday.`
      : `Saw your ${treat} campaign running in ${city} yesterday evening.`;
  } else if (signalHook === 'after_hours') {
    hookText = isTrade
      ? `Called your emergency line yesterday after 7 PM and hit voicemail.`
      : `Called your office yesterday around 7:15 PM and hit the after-hours voicemail.`;
  } else if (signalHook === 'hiring') {
    hookText = isTrade
      ? `Saw you are hiring customer service reps for ${clinic}. While onboarding staff, after-hours emergency calls still leak.`
      : `Saw you are hiring a receptionist for ${clinic}. While onboarding staff, after-hours calls still leak.`;
  } else {
    // Default: static form friction
    hookText = isTrade
      ? `Saw your repair page routes emergency calls to a static form instead of live dispatch.`
      : `Saw your site makes patients fill out a static form for ${treat} instead of booking directly.`;
  }

  // 2. Build Framework Body & Subject
  let subject = '';
  let bodyParagraphs = [];

  if (framework === 'pas') {
    // Framework A: PAS (Problem - Agitation - Solution / Micro-Audit)
    subject = isTrade ? `quick question - ${clinic} calls` : `quick question - ${clinic} inquiries`;
    const pivot = isTrade
      ? `Quick question - when an emergency call comes in after 7 PM, does someone answer live or do they hit voicemail?`
      : `Quick question - when an inquiry comes in after 6 PM, does someone call in 2 minutes, or wait until morning?`;
    const solution = isTrade
      ? `Put together a 60-second demo of our AI voice dispatcher answering in 2 rings and booking service calls.`
      : `Put together a 60-second demo showing our AI receptionist booking consults 24/7.`;

    bodyParagraphs = [
      `Hey ${salutation},`,
      hookText,
      pivot,
      solution,
      `Worth a quick look?`,
      `Best,\nArchit`,
    ];
  } else if (framework === 'qvc') {
    // Framework B: QVC (Question - Value - CTA / Speed & Volume Bottleneck)
    subject = isTrade ? `after-hours calls at ${clinic}` : `after-hours inquiries at ${clinic}`;
    const question = isTrade
      ? `How does ${clinic} handle service calls between 5 PM and 8 AM?`
      : `How does ${clinic} handle patient inquiries between 5 PM and 8 AM?`;
    const value = isTrade
      ? `Most shops lose 3 to 5 emergency replacements every weekend to voicemail. SureGreet AI acts as your 24/7 voice dispatcher, booking calls directly on your schedule.`
      : `Most clinics lose 3 to 5 consults every weekend because callers dislike voicemails. SureGreet AI acts as your 24/7 receptionist, answering procedure pricing and booking consults automatically.`;

    bodyParagraphs = [
      `Hey ${salutation},`,
      question,
      value,
      `Worth a 3-minute walkthrough to see if it makes sense for your lines?`,
      `Best,\nArchit`,
    ];
  } else if (framework === 'bab') {
    // Framework C: BAB (Before - After - Bridge / Economic Napkin Math)
    subject = isTrade ? `missed calls - ${clinic}` : `missed inquiries - ${clinic}`;
    const math = isTrade
      ? `Quick napkin math - average emergency ticket is $2,000+. Missing just 2 after-hours calls a month to voicemail is $4,000+ in leaked revenue.`
      : `Quick napkin math - average ${treat} is $1,500+. Missing just 2 evening leads a week to voicemail is $12,000/mo in lost bookings.`;

    bodyParagraphs = [
      `Hey ${salutation},`,
      hookText,
      math,
      `We can plug our 24/7 AI voice dispatcher into your lines for 14 days to capture those calls at zero risk.`,
      `Worth a 5-minute look?`,
      `Best,\nArchit`,
    ];
  } else if (framework === 'bump') {
    // Threaded Bump (Step 2)
    subject = isTrade ? `Re: quick question - ${clinic} calls` : `Re: quick question - ${clinic} inquiries`;
    bodyParagraphs = [
      `hey ${salutation},`,
      `just floating this back up - still happy to send over that test line if you want to hear how it handles after-hours callers.`,
      `Best,\nArchit`,
    ];
  } else if (framework === 'breakup') {
    // Threaded Breakup (Step 4)
    subject = isTrade ? `Re: quick question - ${clinic} calls` : `Re: quick question - ${clinic} inquiries`;
    bodyParagraphs = [
      `hey ${salutation},`,
      `assuming you're all set on front desk coverage for now - i'll get out of your hair. if missed after-hours calls ever become a headache, just reply here.`,
      `Best,\nArchit`,
    ];
  }

  const text = `${bodyParagraphs.join('\n\n')}\n\n--\nOpt out: ${unsubUrl}`;

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 520px;">
  ${bodyParagraphs.map((p) => `<p style="margin: 0 0 12px 0;">${p.replace(/\n/g, '<br>')}</p>`).join('\n  ')}
  <p style="margin: 16px 0 0 0; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px;">Opt out: <a href="${unsubUrl}" style="color: #9ca3af;">unsubscribe</a></p>
</div>`;

  const audit = auditHarveyCopy(text, subject);

  return {
    subject,
    text,
    html,
    audit,
    framework,
    signalHook,
  };
}

/**
 * Generate full 4-step automated outreach sequence
 */
export function generateFullSequence(params = {}) {
  const step1 = generateHarveyScript({ ...params, framework: params.framework || 'pas' });
  const step2 = generateHarveyScript({ ...params, framework: 'bump' });
  const step3 = generateHarveyScript({ ...params, framework: 'bab' });
  const step4 = generateHarveyScript({ ...params, framework: 'breakup' });

  return [
    {
      step: 1,
      name: 'Cold Hook (Micro-Audit)',
      timing: 'Day 1',
      desc: 'Initial touch highlighting booking friction or after-hours gap',
      ...step1,
    },
    {
      step: 2,
      name: 'Proof & 30s Voice Demo',
      timing: '+2 Biz Days',
      desc: 'Threaded Re: follow-up offering a 30-second live test line',
      ...step2,
    },
    {
      step: 3,
      name: 'Revenue Leak Automation',
      timing: '+3 Biz Days',
      desc: 'Economic napkin math ($12k/mo lost consults) & 14-day zero-risk trial',
      ...step3,
    },
    {
      step: 4,
      name: 'Clean Breakup',
      timing: '+3 Biz Days',
      desc: 'Threaded Re: polite closure leaving the door open',
      ...step4,
    },
  ];
}

/**
 * Legacy wrappers for sequence worker compatibility (Steps 1 to 4)
 */
export function outreachStep1Template(params) {
  const result = generateHarveyScript({ ...params, framework: 'pas' });
  return { subject: result.subject, text: result.text, html: result.html };
}

export function outreachStep2Template(params) {
  const result = generateHarveyScript({ ...params, framework: 'bump' });
  return { subject: result.subject, text: result.text, html: result.html };
}

export function outreachStep3Template(params) {
  const result = generateHarveyScript({ ...params, framework: 'bab' });
  return { subject: result.subject, text: result.text, html: result.html };
}

export function outreachStep4Template(params) {
  const result = generateHarveyScript({ ...params, framework: 'breakup' });
  return { subject: result.subject, text: result.text, html: result.html };
}
