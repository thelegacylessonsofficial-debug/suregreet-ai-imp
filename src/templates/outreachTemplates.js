import { config } from '../config.js';

export function getUnsubscribeUrl(prospectEmail) {
  const base = 'https://suregreet-automation.onrender.com';
  return `${base}/outreach/unsubscribe?email=${encodeURIComponent(prospectEmail || '')}`;
}

export const BANNED_AI_PHRASES = [
  'hope this email finds you well',
  'wanted to reach out',
  'reach out to you',
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
];

/**
 * Deterministic Harvey Anti-AI & Deliverability Gate
 */
export function auditHarveyCopy(text, subject = '') {
  if (!text) return { score: 0, wordCount: 0, passed: false, issues: ['Empty email text'] };
  const cleanBody = text.split('--')[0].trim();
  const words = cleanBody.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const foundBanned = [];
  const lower = cleanBody.toLowerCase();
  for (const phrase of BANNED_AI_PHRASES) {
    if (lower.includes(phrase)) {
      foundBanned.push(phrase);
    }
  }

  const emDashes = (cleanBody.match(/—/g) || []).length;
  const exclamations = (cleanBody.match(/!/g) || []).length;
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

  if (emDashes > 0) {
    issues.push(`Contains ${emDashes} em-dashes (—); use hyphens (-) or commas`);
    score -= emDashes * 10;
  }

  if (exclamations > 0) {
    issues.push(`Contains ${exclamations} exclamation marks; cold outreach must use zero`);
    score -= exclamations * 15;
  }

  if (subjectWords < 2 || subjectWords > 6) {
    issues.push(`Subject line is ${subjectWords} words (ideal is 2–5 words)`);
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    wordCount,
    isOptimalWordCount: wordCount >= 45 && wordCount <= 65,
    isUnderHardCeiling: wordCount <= 75,
    foundBanned,
    emDashes,
    exclamations,
    subjectWords,
    passed: score >= 85 && foundBanned.length === 0 && wordCount <= 75,
    issues,
  };
}

export function formatSalutation(doctorName, clinicName, niche = 'medspa') {
  if (!doctorName || !doctorName.trim()) {
    if (niche === 'hvac') {
      return clinicName ? `Operations Lead at ${clinicName}` : 'there';
    }
    return clinicName ? `Medical Director at ${clinicName}` : 'Doctor';
  }
  let clean = doctorName.trim();
  if (/^dr\.?\s+/i.test(clean)) {
    return clean;
  }
  if (niche === 'hvac') {
    return clean.split(/\s+/)[0];
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
  signalHook = 'form_friction',
  doctorName = 'Dr. Carlos Riveros',
  clinicName = 'Med Aesthetics Miami',
  city = 'Miami, FL',
  treatment = 'Morpheus8',
  niche = 'medspa',
  specificObservation = '',
  prospectEmail = '',
}) {
  const salutation = formatSalutation(doctorName, clinicName, niche);
  const clinic = clinicName ? clinicName.trim() : 'your clinic';
  const treat = treatment ? treatment.trim() : niche === 'hvac' ? 'emergency HVAC repair' : 'Morpheus8';
  const isHvac = niche === 'hvac';
  const unsubUrl = getUnsubscribeUrl(prospectEmail);

  // 1. Determine Signal Hook Text
  let hookText = '';
  if (specificObservation && specificObservation.trim()) {
    hookText = specificObservation.trim();
  } else if (signalHook === 'meta_ads') {
    hookText = isHvac
      ? `Saw your emergency repair ads running across ${city} yesterday.`
      : `Saw your ${treat} campaign running in ${city} yesterday evening.`;
  } else if (signalHook === 'after_hours') {
    hookText = isHvac
      ? `Called your emergency line yesterday after 7 PM and hit voicemail.`
      : `Called your office yesterday around 7:15 PM and hit the after-hours voicemail.`;
  } else if (signalHook === 'hiring') {
    hookText = isHvac
      ? `Saw you are hiring customer service reps for ${clinic}. While onboarding staff, after-hours emergency calls still leak.`
      : `Saw you are hiring a receptionist for ${clinic}. While onboarding staff, after-hours calls still leak.`;
  } else {
    // Default: static form friction
    hookText = isHvac
      ? `Saw your repair page routes emergency calls to a static form instead of live dispatch.`
      : `Saw your site makes patients fill out a static form for ${treat} instead of booking directly.`;
  }

  // 2. Build Framework Body & Subject
  let subject = '';
  let bodyParagraphs = [];

  if (framework === 'pas') {
    // Framework A: PAS (Problem - Agitation - Solution / Micro-Audit)
    subject = isHvac ? `quick question - ${clinic} calls` : `quick question - ${clinic} inquiries`;
    const pivot = isHvac
      ? `Quick question - when an emergency AC call comes in after 7 PM, does someone answer live or do they hit voicemail?`
      : `Quick question - when an inquiry comes in after 6 PM, does someone call in 2 minutes, or wait until morning?`;
    const solution = isHvac
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
    subject = isHvac ? `after-hours calls at ${clinic}` : `after-hours inquiries at ${clinic}`;
    const question = isHvac
      ? `How does ${clinic} handle service calls between 5 PM and 8 AM?`
      : `How does ${clinic} handle patient inquiries between 5 PM and 8 AM?`;
    const value = isHvac
      ? `Most HVAC shops lose 3 to 5 emergency replacements every weekend to voicemail. SureGreet AI acts as your 24/7 voice dispatcher, booking calls directly on your calendar.`
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
    subject = isHvac ? `missed calls - ${clinic}` : `missed inquiries - ${clinic}`;
    const math = isHvac
      ? `Quick napkin math - average emergency ticket is $2,000+. Missing just 2 after-hours callers a month to voicemail is $4,000+ in leaked revenue.`
      : `Quick napkin math - average ${treat} is $1,500+. Missing just 2 evening leads a week to voicemail is $12,000/mo in lost bookings.`;

    bodyParagraphs = [
      `Hey ${salutation},`,
      hookText,
      math,
      `We can plug our 24/7 AI voice receptionist into your lines for 14 days to capture those bookings at zero risk.`,
      `Worth a 5-minute look?`,
      `Best,\nArchit`,
    ];
  } else if (framework === 'bump') {
    // Threaded Bump (Step 2)
    subject = `Re: quick question - ${clinic} inquiries`;
    bodyParagraphs = [
      `hey ${salutation},`,
      `just floating this back up - still happy to send over that test line if you want to hear how it handles after-hours callers.`,
      `Best,\nArchit`,
    ];
  } else if (framework === 'breakup') {
    // Threaded Breakup (Step 4)
    subject = `Re: quick question - ${clinic} inquiries`;
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
