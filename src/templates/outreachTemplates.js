import { config } from '../config.js';

export function getUnsubscribeUrl(prospectEmail) {
  const base = 'https://suregreet-automation.onrender.com';
  return `${base}/outreach/unsubscribe?email=${encodeURIComponent(prospectEmail || '')}`;
}

export function formatSalutation(doctorName, clinicName) {
  if (!doctorName || !doctorName.trim()) {
    return clinicName ? `Dr. at ${clinicName}` : 'Doctor';
  }
  let clean = doctorName.trim();
  // If already starts with Dr. or Doctor, keep it
  if (/^dr\.?\s+/i.test(clean)) {
    return clean;
  }
  // If "First Last", extract "Dr. Last"
  const parts = clean.split(/\s+/);
  if (parts.length > 1) {
    const lastName = parts[parts.length - 1];
    return `Dr. ${lastName}`;
  }
  return `Dr. ${clean}`;
}

/**
 * Step 1: The 75-Second Front Desk Speed-to-Lead Audit
 */
export function outreachStep1Template({ doctorName, clinicName, city, treatment, prospectEmail }) {
  const salutation = formatSalutation(doctorName, clinicName);
  const clinic = clinicName ? clinicName.trim() : 'your clinic';
  const treat = treatment ? treatment.trim() : 'aesthetic';
  const locationStr = city ? ` in ${city.trim()}` : '';
  const unsubUrl = getUnsubscribeUrl(prospectEmail);
  const subject = `quick question - ${clinic} inquiries`;

  const text = `Hey ${salutation},

I submitted a test inquiry on your ${treat} page${locationStr} yesterday evening after hours.

Your front desk was closed for the night, but industry data shows 78% of high-intent aesthetic patients book with whichever clinic calls or texts them back in under 5 minutes.

I recorded a 75-second video showing how SureGreet AI calls back after-hours ad leads in under 30 seconds, answers pricing questions, and collects booking deposits directly into your calendar:

https://suregreet.ai

Open to me sending over the full speed-to-lead audit for ${clinic}?

Best,
Archit
Founder, SureGreet AI
https://suregreet.ai

--
If you'd rather not receive these clinic audits, opt out here:
${unsubUrl}`;

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 580px;">
  <p style="margin: 0 0 16px 0;">Hey ${salutation},</p>
  <p style="margin: 0 0 16px 0;">I submitted a test inquiry on your ${treat} page${locationStr} yesterday evening after hours.</p>
  <p style="margin: 0 0 16px 0;">Your front desk was closed for the night, but industry data shows 78% of high-intent aesthetic patients book with whichever clinic calls or texts them back in under 5 minutes.</p>
  <p style="margin: 0 0 16px 0;">I recorded a 75-second video showing how SureGreet AI calls back after-hours ad leads in under 30 seconds, answers pricing questions, and collects booking deposits directly into your calendar:</p>
  <p style="margin: 0 0 16px 0;"><a href="https://suregreet.ai" style="color: #2563eb; text-decoration: underline;">https://suregreet.ai</a></p>
  <p style="margin: 0 0 16px 0;">Open to me sending over the full speed-to-lead audit for ${clinic}?</p>
  <p style="margin: 0 0 4px 0;">Best,</p>
  <p style="margin: 0 0 4px 0;"><strong>Archit</strong></p>
  <p style="margin: 0 0 24px 0; color: #4b5563;">Founder, SureGreet AI<br><a href="https://suregreet.ai" style="color: #4b5563;">https://suregreet.ai</a></p>
  <p style="margin: 24px 0 0 0; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px;">If you'd rather not receive these clinic audits, <a href="${unsubUrl}" style="color: #9ca3af; text-decoration: underline;">opt out here</a>.</p>
</div>`;

  return { subject, text, html };
}

/**
 * Step 2: The 30-Second Voice AI Audio Demo & Proof (Threaded Re:)
 */
export function outreachStep2Template({ doctorName, clinicName, treatment, prospectEmail, originalSubject }) {
  const salutation = formatSalutation(doctorName, clinicName);
  const clinic = clinicName ? clinicName.trim() : 'your clinic';
  const treat = treatment ? treatment.trim() : 'Morpheus8 & injectables';
  const unsubUrl = getUnsubscribeUrl(prospectEmail);
  const cleanSubject = (originalSubject || `quick question - ${clinic} inquiries`).replace(/^Re:\s*/i, '');
  const subject = `Re: ${cleanSubject}`;

  const text = `Hey ${salutation},

Following up on my note from earlier this week regarding your front desk response time at ${clinic}.

Most clinic owners tell me they don't want a robotic phone tree turning high-ticket patients away.

Here is an actual 30-second live audio recording of SureGreet AI answering a patient asking about ${treat} pricing and scheduling directly into the clinic's calendar:

https://suregreet.ai#demo

We are taking on 2 pilot clinics this month at zero upfront cost to prove out the patient acquisition lift in exchange for a video testimonial.

Would 10 minutes on Thursday or Friday work for a quick walkthrough?

Best,
Archit
SureGreet AI
https://suregreet.ai

--
Opt out:
${unsubUrl}`;

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 580px;">
  <p style="margin: 0 0 16px 0;">Hey ${salutation},</p>
  <p style="margin: 0 0 16px 0;">Following up on my note from earlier this week regarding your front desk response time at ${clinic}.</p>
  <p style="margin: 0 0 16px 0;">Most clinic owners tell me they don't want a robotic phone tree turning high-ticket patients away.</p>
  <p style="margin: 0 0 16px 0;">Here is an actual 30-second live audio recording of SureGreet AI answering a patient asking about ${treat} pricing and scheduling directly into the clinic's calendar:</p>
  <p style="margin: 0 0 16px 0;"><a href="https://suregreet.ai#demo" style="color: #2563eb; text-decoration: underline;">https://suregreet.ai#demo</a></p>
  <p style="margin: 0 0 16px 0;">We are taking on 2 pilot clinics this month at zero upfront cost to prove out the patient acquisition lift in exchange for a video testimonial.</p>
  <p style="margin: 0 0 16px 0;">Would 10 minutes on Thursday or Friday work for a quick walkthrough?</p>
  <p style="margin: 0 0 4px 0;">Best,</p>
  <p style="margin: 0 0 4px 0;"><strong>Archit</strong></p>
  <p style="margin: 0 0 24px 0; color: #4b5563;">SureGreet AI</p>
  <p style="margin: 24px 0 0 0; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px;">Opt out: <a href="${unsubUrl}" style="color: #9ca3af; text-decoration: underline;">click here</a>.</p>
</div>`;

  return { subject, text, html };
}

/**
 * Step 3: The Economic Math ($4,500 Missed Revenue Breakdown, Threaded Re:)
 */
export function outreachStep3Template({ doctorName, clinicName, treatment, prospectEmail, originalSubject }) {
  const salutation = formatSalutation(doctorName, clinicName);
  const clinic = clinicName ? clinicName.trim() : 'your clinic';
  const treat = treatment ? treatment.trim() : 'aesthetic procedure';
  const unsubUrl = getUnsubscribeUrl(prospectEmail);
  const cleanSubject = (originalSubject || `quick question - ${clinic} inquiries`).replace(/^Re:\s*/i, '');
  const subject = `Re: ${cleanSubject}`;

  const text = `Hey ${salutation},

Wanted to share the quick math on why after-hours speed-to-lead makes or breaks medspa ad ROI for ${clinic}:

• Average patient lifetime value for ${treat}: $1,500+
• Average missed after-hours or weekend inquiries: 3 to 5 per week
• Net revenue lost to competing clinics: $4,500 – $7,500 / month

SureGreet AI sits in front of your phone lines 24/7/365. It never calls in sick, answers in under 2 seconds, and collects booking deposits directly into your system.

Let's run a 14-day risk-free pilot on your after-hours calls. If it doesn't capture at least 3 extra consultations, you don't pay a dime.

Open to seeing how it works on your actual phone line?

Best,
Archit
SureGreet AI
https://suregreet.ai

--
Opt out:
${unsubUrl}`;

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 580px;">
  <p style="margin: 0 0 16px 0;">Hey ${salutation},</p>
  <p style="margin: 0 0 16px 0;">Wanted to share the quick math on why after-hours speed-to-lead makes or breaks medspa ad ROI for ${clinic}:</p>
  <p style="margin: 0 0 8px 16px;">• Average patient lifetime value for ${treat}: $1,500+</p>
  <p style="margin: 0 0 8px 16px;">• Average missed after-hours or weekend inquiries: 3 to 5 per week</p>
  <p style="margin: 0 0 16px 16px;">• Net revenue lost to competing clinics: $4,500 – $7,500 / month</p>
  <p style="margin: 0 0 16px 0;">SureGreet AI sits in front of your phone lines 24/7/365. It never calls in sick, answers in under 2 seconds, and collects booking deposits directly into your system.</p>
  <p style="margin: 0 0 16px 0;">Let's run a 14-day risk-free pilot on your after-hours calls. If it doesn't capture at least 3 extra consultations, you don't pay a dime.</p>
  <p style="margin: 0 0 16px 0;">Open to seeing how it works on your actual phone line?</p>
  <p style="margin: 0 0 4px 0;">Best,</p>
  <p style="margin: 0 0 4px 0;"><strong>Archit</strong></p>
  <p style="margin: 0 0 24px 0; color: #4b5563;">SureGreet AI</p>
  <p style="margin: 24px 0 0 0; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px;">Opt out: <a href="${unsubUrl}" style="color: #9ca3af; text-decoration: underline;">click here</a>.</p>
</div>`;

  return { subject, text, html };
}

/**
 * Step 4: Clean Breakup Email (Threaded Re:)
 */
export function outreachStep4Template({ doctorName, clinicName, prospectEmail, originalSubject }) {
  const salutation = formatSalutation(doctorName, clinicName);
  const clinic = clinicName ? clinicName.trim() : 'your clinic';
  const unsubUrl = getUnsubscribeUrl(prospectEmail);
  const cleanSubject = (originalSubject || `quick question - ${clinic} inquiries`).replace(/^Re:\s*/i, '');
  const subject = `Re: ${cleanSubject}`;

  const text = `Hey ${salutation},

Assuming that capturing missed after-hours patient inquiries isn't a priority for ${clinic} right now.

I won't follow up further so I don't clutter your inbox.

If you ever want to eliminate missed patient calls and speed up ad lead conversion on autopilot, you can always test our live voice reception demo here: https://suregreet.ai.

Wishing you and the clinic team continued success this quarter.

Best regards,
Archit Deshmukh
Founder, SureGreet AI
https://suregreet.ai

--
Opt out:
${unsubUrl}`;

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 580px;">
  <p style="margin: 0 0 16px 0;">Hey ${salutation},</p>
  <p style="margin: 0 0 16px 0;">Assuming that capturing missed after-hours patient inquiries isn't a priority for ${clinic} right now.</p>
  <p style="margin: 0 0 16px 0;">I won't follow up further so I don't clutter your inbox.</p>
  <p style="margin: 0 0 16px 0;">If you ever want to eliminate missed patient calls and speed up ad lead conversion on autopilot, you can always test our live voice reception demo here: <a href="https://suregreet.ai" style="color: #2563eb; text-decoration: underline;">https://suregreet.ai</a>.</p>
  <p style="margin: 0 0 16px 0;">Wishing you and the clinic team continued success this quarter.</p>
  <p style="margin: 0 0 4px 0;">Best regards,</p>
  <p style="margin: 0 0 4px 0;"><strong>Archit Deshmukh</strong></p>
  <p style="margin: 0 0 24px 0; color: #4b5563;">Founder, SureGreet AI<br><a href="https://suregreet.ai" style="color: #4b5563;">https://suregreet.ai</a></p>
  <p style="margin: 24px 0 0 0; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px;">Opt out: <a href="${unsubUrl}" style="color: #9ca3af; text-decoration: underline;">click here</a>.</p>
</div>`;

  return { subject, text, html };
}
