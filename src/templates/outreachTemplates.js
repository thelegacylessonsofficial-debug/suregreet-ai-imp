import { config } from '../config.js';

export function getUnsubscribeUrl(prospectEmail) {
  const base = 'https://suregreet-automation.onrender.com';
  return `${base}/outreach/unsubscribe?email=${encodeURIComponent(prospectEmail || '')}`;
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
 * Step 1: Controlled Imperfection Micro-Audit (Strictly 45 to 65 words)
 * Harvey Rules: Zero AI fluff, lowercase after dash, mid-thought pivot, 0 pitch in email 1.
 */
export function outreachStep1Template({
  doctorName,
  clinicName,
  city,
  treatment,
  prospectEmail,
  specificObservation,
  niche = 'medspa',
}) {
  const salutation = formatSalutation(doctorName, clinicName, niche);
  const clinic = clinicName ? clinicName.trim() : 'your team';
  const treat = treatment ? treatment.trim() : niche === 'hvac' ? 'emergency repair' : 'Morpheus8';
  const isHvac = niche === 'hvac';
  const unsubUrl = getUnsubscribeUrl(prospectEmail);

  const subject = isHvac ? `quick question - ${clinic} calls` : `quick question - ${clinic} inquiries`;

  let hook = specificObservation;
  if (!hook) {
    hook = isHvac
      ? `Saw your repair page routes emergency calls to a static form instead of live dispatch.`
      : `Saw your site makes patients fill out a static form for ${treat} instead of booking directly.`;
  } else {
    // If hook is long, tighten it
    hook = hook.replace(/\s+into your calendar/i, '');
  }

  const pivotQuestion = isHvac
    ? `Quick question — when an AC breaks after 7 PM, does someone answer live or do they hit voicemail?`
    : `Quick question — when an inquiry comes in after 6 PM, does someone call in 2 minutes, or wait until morning?`;

  const assetPitch = isHvac
    ? `Put together a 60-second demo of our AI voice dispatcher answering in 2 rings.`
    : `Put together a 60-second demo showing our AI receptionist booking consults 24/7.`;

  const text = `Hey ${salutation},

${hook}

${pivotQuestion}

${assetPitch}

Worth a quick look?

Best,
Archit

--
Opt out: ${unsubUrl}`;

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 520px;">
  <p style="margin: 0 0 12px 0;">Hey ${salutation},</p>
  <p style="margin: 0 0 12px 0;">${hook}</p>
  <p style="margin: 0 0 12px 0;">${pivotQuestion}</p>
  <p style="margin: 0 0 12px 0;">${assetPitch}</p>
  <p style="margin: 0 0 12px 0;">Worth a quick look?</p>
  <p style="margin: 0 0 2px 0;">Best,</p>
  <p style="margin: 0 0 16px 0;"><strong>Archit</strong></p>
  <p style="margin: 16px 0 0 0; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px;">Opt out: <a href="${unsubUrl}" style="color: #9ca3af;">unsubscribe</a></p>
</div>`;

  return { subject, text, html };
}

/**
 * Step 2: Day 3 Thread Bump (Threaded Re: - 1 Sentence, 24 words)
 * Harvey Rule: Ultra-short mid-week floating bump.
 */
export function outreachStep2Template({
  doctorName,
  clinicName,
  treatment,
  prospectEmail,
  originalSubject,
  niche = 'medspa',
}) {
  const salutation = formatSalutation(doctorName, clinicName, niche);
  const clinic = clinicName ? clinicName.trim() : 'your team';
  const unsubUrl = getUnsubscribeUrl(prospectEmail);
  const cleanSubject = (originalSubject || `quick question - ${clinic} inquiries`).replace(/^Re:\s*/i, '');
  const subject = `Re: ${cleanSubject}`;

  const text = `hey ${salutation},

just floating this back up — still happy to send over that test line if you want to hear how it handles after-hours callers.

Best,
Archit

--
Opt out: ${unsubUrl}`;

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 520px;">
  <p style="margin: 0 0 12px 0;">hey ${salutation},</p>
  <p style="margin: 0 0 12px 0;">just floating this back up — still happy to send over that test line if you want to hear how it handles after-hours callers.</p>
  <p style="margin: 0 0 2px 0;">Best,</p>
  <p style="margin: 0 0 16px 0;"><strong>Archit</strong></p>
  <p style="margin: 16px 0 0 0; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px;">Opt out: <a href="${unsubUrl}" style="color: #9ca3af;">unsubscribe</a></p>
</div>`;

  return { subject, text, html };
}

/**
 * Step 3: Economic Math (Threaded Re: - Strictly 45 to 65 words)
 */
export function outreachStep3Template({
  doctorName,
  clinicName,
  treatment,
  prospectEmail,
  originalSubject,
  niche = 'medspa',
}) {
  const salutation = formatSalutation(doctorName, clinicName, niche);
  const clinic = clinicName ? clinicName.trim() : 'your team';
  const treat = treatment ? treatment.trim() : niche === 'hvac' ? 'emergency HVAC' : 'Morpheus8';
  const isHvac = niche === 'hvac';
  const unsubUrl = getUnsubscribeUrl(prospectEmail);
  const cleanSubject = (originalSubject || `quick question - ${clinic} inquiries`).replace(/^Re:\s*/i, '');
  const subject = `Re: ${cleanSubject}`;

  const mathBody = isHvac
    ? `Quick napkin math — average emergency HVAC repair is $2,500+. If only 2 after-hours callers a month hit voicemail and call a competitor, that is $5,000+ in leaked revenue.`
    : `Quick napkin math — average ${treat} package is $1,500+. If only 2 evening ad leads a week drop off on a form and call a competitor, that is $12,000/mo in lost patient revenue.`;

  const text = `Hey ${salutation},

${mathBody}

Happy to plug our voice agent into your lines for 14 days to capture those calls at zero upfront cost.

Worth a quick 5-minute chat?

Best,
Archit

--
Opt out: ${unsubUrl}`;

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 520px;">
  <p style="margin: 0 0 12px 0;">Hey ${salutation},</p>
  <p style="margin: 0 0 12px 0;">${mathBody}</p>
  <p style="margin: 0 0 12px 0;">Happy to plug our voice agent into your lines for 14 days to capture those calls at zero upfront cost.</p>
  <p style="margin: 0 0 12px 0;">Worth a quick 5-minute chat?</p>
  <p style="margin: 0 0 2px 0;">Best,</p>
  <p style="margin: 0 0 16px 0;"><strong>Archit</strong></p>
  <p style="margin: 16px 0 0 0; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px;">Opt out: <a href="${unsubUrl}" style="color: #9ca3af;">unsubscribe</a></p>
</div>`;

  return { subject, text, html };
}

/**
 * Step 4: Day 7 Value/Breakup (Threaded Re: - 1 Sentence, 28 words)
 */
export function outreachStep4Template({
  doctorName,
  clinicName,
  prospectEmail,
  originalSubject,
  niche = 'medspa',
}) {
  const salutation = formatSalutation(doctorName, clinicName, niche);
  const unsubUrl = getUnsubscribeUrl(prospectEmail);
  const cleanSubject = (originalSubject || `quick question`).replace(/^Re:\s*/i, '');
  const subject = `Re: ${cleanSubject}`;

  const text = `hey ${salutation},

assuming you're all set on call handling for now — i'll get out of your hair. if missed after-hours calls ever become a headache, just reply here.

Best,
Archit

--
Opt out: ${unsubUrl}`;

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 520px;">
  <p style="margin: 0 0 12px 0;">hey ${salutation},</p>
  <p style="margin: 0 0 12px 0;">assuming you're all set on call handling for now — i'll get out of your hair. if missed after-hours calls ever become a headache, just reply here.</p>
  <p style="margin: 0 0 2px 0;">Best,</p>
  <p style="margin: 0 0 16px 0;"><strong>Archit</strong></p>
  <p style="margin: 16px 0 0 0; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px;">Opt out: <a href="${unsubUrl}" style="color: #9ca3af;">unsubscribe</a></p>
</div>`;

  return { subject, text, html };
}
