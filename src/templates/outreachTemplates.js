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
 * Step 2: 30-Second Audio Proof (Threaded Re: - Strictly 45 to 65 words)
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
  const treat = treatment ? treatment.trim() : niche === 'hvac' ? 'emergency service' : 'Morpheus8';
  const isHvac = niche === 'hvac';
  const unsubUrl = getUnsubscribeUrl(prospectEmail);
  const cleanSubject = (originalSubject || `quick question - ${clinic} inquiries`).replace(/^Re:\s*/i, '');
  const subject = `Re: ${cleanSubject}`;

  const demoSnippet = isHvac
    ? `Recorded a 30-second live audio clip of our AI dispatcher collecting emergency AC details and booking the tech:`
    : `Recorded a 30-second live audio clip of our AI receptionist answering ${treat} pricing and booking a consult:`;

  const text = `Hey ${salutation},

Quick follow-up on my note from Tuesday.

${demoSnippet}
https://suregreet.ai#demo

Taking on 2 pilot ${isHvac ? 'contractors' : 'clinics'} at zero upfront cost to prove out the booking lift.

Would 10 minutes Thursday work to hear how it sounds?

Best,
Archit

--
Opt out: ${unsubUrl}`;

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 520px;">
  <p style="margin: 0 0 12px 0;">Hey ${salutation},</p>
  <p style="margin: 0 0 12px 0;">Quick follow-up on my note from Tuesday.</p>
  <p style="margin: 0 0 12px 0;">${demoSnippet}<br><a href="https://suregreet.ai#demo" style="color: #2563eb; text-decoration: underline;">https://suregreet.ai#demo</a></p>
  <p style="margin: 0 0 12px 0;">Taking on 2 pilot ${isHvac ? 'contractors' : 'clinics'} at zero upfront cost to prove out the booking lift.</p>
  <p style="margin: 0 0 12px 0;">Would 10 minutes Thursday work to hear how it sounds?</p>
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
 * Step 4: The Clean Breakup (Threaded Re: - Under 55 words)
 */
export function outreachStep4Template({
  doctorName,
  clinicName,
  prospectEmail,
  originalSubject,
  niche = 'medspa',
}) {
  const salutation = formatSalutation(doctorName, clinicName, niche);
  const clinic = clinicName ? clinicName.trim() : 'your business';
  const unsubUrl = getUnsubscribeUrl(prospectEmail);
  const cleanSubject = (originalSubject || `quick question - ${clinic} inquiries`).replace(/^Re:\s*/i, '');
  const subject = `Re: ${cleanSubject}`;

  const text = `Hey ${salutation},

Assuming after-hours speed-to-lead isn't a priority for ${clinic} right now — totally understand.

I will close your file so I don't clutter your inbox.

If you ever want to capture after-hours inquiries automatically, feel free to reach back out anytime.

Best,
Archit

--
Opt out: ${unsubUrl}`;

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 520px;">
  <p style="margin: 0 0 12px 0;">Hey ${salutation},</p>
  <p style="margin: 0 0 12px 0;">Assuming after-hours speed-to-lead isn't a priority for ${clinic} right now — totally understand.</p>
  <p style="margin: 0 0 12px 0;">I will close your file so I don't clutter your inbox.</p>
  <p style="margin: 0 0 12px 0;">If you ever want to capture after-hours inquiries automatically, feel free to reach back out anytime.</p>
  <p style="margin: 0 0 2px 0;">Best,</p>
  <p style="margin: 0 0 16px 0;"><strong>Archit</strong></p>
  <p style="margin: 16px 0 0 0; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px;">Opt out: <a href="${unsubUrl}" style="color: #9ca3af;">unsubscribe</a></p>
</div>`;

  return { subject, text, html };
}
