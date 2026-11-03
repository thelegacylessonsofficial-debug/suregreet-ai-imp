import { config } from '../config.js';

export function getUnsubscribeFooter(prospectEmail) {
  const unsubUrl = `https://suregreet-automation.onrender.com/outreach/unsubscribe?email=${encodeURIComponent(prospectEmail || '')}`;
  return `
    <div style="margin-top: 36px; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <p style="margin: 0;">SureGreet AI • 24/7 AI Voice & Speed-to-Lead Infrastructure for US Medical Clinics</p>
      <p style="margin: 4px 0 0;">If you prefer not to receive these patient acquisition audits, <a href="${unsubUrl}" style="color: #64748b; text-decoration: underline;">click here to permanently opt out</a>.</p>
    </div>
  `;
}

/**
 * Step 1: The 75-Second Front Desk Speed-to-Lead Audit
 */
export function outreachStep1Template({ doctorName, clinicName, city, treatment, prospectEmail }) {
  const drName = doctorName || `Dr. at ${clinicName || 'your clinic'}`;
  const treat = treatment || 'high-ticket aesthetic';
  const locationStr = city ? `in ${city}` : '';
  const unsub = getUnsubscribeFooter(prospectEmail);

  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px;">
  <p>Hey ${drName},</p>
  
  <p>I submitted an inquiry on your ${treat} campaign ${locationStr} yesterday evening around 7:45 PM.</p>

  <p>Your front desk was closed for the night, but industry data shows <strong>78% of high-intent patients book with whichever clinic calls or texts them back in under 5 minutes</strong>.</p>

  <p>I put together a 75-second video showing how SureGreet AI greets ad leads in under 30 seconds, answers consultation pricing questions, and collects booking deposits directly into your calendar 24/7:</p>

  <p style="margin: 24px 0;">
    👉 <a href="https://suregreet.ai" target="_blank" style="color: #2563eb; font-weight: bold; text-decoration: underline; font-size: 16px;">Watch the 75-Second Patient Conversion Demo Here</a>
  </p>

  <p>Open to me sending over the full audit for ${clinicName || 'your practice'}?</p>

  <p style="margin-top: 24px;">
    Best,<br>
    <strong>Archit Deshmukh</strong><br>
    Founder, SureGreet AI<br>
    <span style="color: #64748b; font-size: 13px;">AI Voice Reception & Lead Capture</span>
  </p>

  ${unsub}
</body>
</html>`;
}

/**
 * Step 2: The 30-Second Voice AI Audio Demo & Proof
 */
export function outreachStep2Template({ doctorName, clinicName, treatment, prospectEmail }) {
  const drName = doctorName || `Dr. at ${clinicName || 'your practice'}`;
  const treat = treatment || 'Morpheus8 & Botox';
  const unsub = getUnsubscribeFooter(prospectEmail);

  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px;">
  <p>Hey ${drName},</p>

  <p>Following up on my note from Tuesday regarding your ${clinicName || 'clinic'} front desk response time.</p>

  <p>Most clinic directors tell me: <em>"We don't want a robotic IVR or clunky phone tree turning patients off."</em></p>

  <p>Here is an actual 30-second audio recording of SureGreet AI answering a live patient inquiring about ${treat}. It sounds indistinguishable from a senior human receptionist, quotes accurate package pricing, and checks live schedule availability:</p>

  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0;">
    <p style="margin: 0 0 10px; font-weight: bold; color: #0f172a;">🎧 30-Second Voice Receptionist Sample:</p>
    <a href="https://suregreet.ai" target="_blank" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: bold;">
      ▶️ Listen to Live Audio Call
    </a>
  </div>

  <p>We are taking on 2 pilot clinics this month at zero upfront cost in exchange for a video testimonial.</p>

  <p>Would 10 minutes on Thursday or Friday work for a quick walkthrough?</p>

  <p style="margin-top: 24px;">
    Best,<br>
    <strong>Archit Deshmukh</strong><br>
    SureGreet AI
  </p>

  ${unsub}
</body>
</html>`;
}

/**
 * Step 3: The Economic Math ($4,500 Missed Revenue Breakdown)
 */
export function outreachStep3Template({ doctorName, clinicName, treatment, prospectEmail }) {
  const drName = doctorName || `Dr. at ${clinicName || 'your practice'}`;
  const treat = treatment || 'aesthetic procedure';
  const unsub = getUnsubscribeFooter(prospectEmail);

  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px;">
  <p>Hey ${drName},</p>

  <p>Here is the straightforward clinic math on why speed-to-lead matters so much for ${clinicName || 'your practice'}:</p>

  <div style="background-color: #f1f5f9; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; font-size: 14px;">
    <p style="margin: 0 0 8px;">• Average patient lifetime value for ${treat}: <strong>$1,500+</strong></p>
    <p style="margin: 0 0 8px;">• Average missed weekend or after-hours calls: <strong>3 to 5 per week</strong></p>
    <p style="margin: 0;">• Net revenue lost to the competitor down the street: <strong>$4,500 – $7,500 / month</strong></p>
  </div>

  <p>SureGreet AI sits in front of your phone lines 24/7/365. It never calls in sick, never leaves a patient on hold, and books consultations directly into your calendar in under 60 seconds.</p>

  <p>Let's run a 14-day risk-free pilot on your after-hours calls. If it doesn't book at least 3 extra consultations, you don't pay a dime.</p>

  <p style="margin: 20px 0;">
    👉 <a href="https://suregreet.ai" target="_blank" style="color: #2563eb; font-weight: bold; text-decoration: underline;">Pick a quick 10-minute slot on my calendar here</a>
  </p>

  <p style="margin-top: 24px;">
    Best,<br>
    <strong>Archit Deshmukh</strong><br>
    SureGreet AI
  </p>

  ${unsub}
</body>
</html>`;
}

/**
 * Step 4: Clean Breakup / Soft Opt-out Email
 */
export function outreachStep4Template({ doctorName, clinicName, prospectEmail }) {
  const drName = doctorName || `Dr. at ${clinicName || 'your practice'}`;
  const unsub = getUnsubscribeFooter(prospectEmail);

  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px;">
  <p>Hey ${drName},</p>

  <p>Assuming that capturing missed after-hours patient inquiries isn't a priority for ${clinicName || 'your clinic'} right now.</p>

  <p>I won't follow up further so I don't clutter your inbox.</p>

  <p>If you ever want to eliminate missed patient calls and speed up ad lead conversion on autopilot, you can always check out our demo at <a href="https://suregreet.ai" style="color: #2563eb; text-decoration: underline;">suregreet.ai</a>.</p>

  <p>Wishing you and the clinic team continued success this quarter!</p>

  <p style="margin-top: 24px;">
    Best regards,<br>
    <strong>Archit Deshmukh</strong><br>
    Founder, SureGreet AI
  </p>

  ${unsub}
</body>
</html>`;
}
