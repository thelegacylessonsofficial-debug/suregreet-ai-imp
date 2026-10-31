import { Router } from 'express';
import { dispatchRetellCall, sendSlackAlert } from '../services/retell.js';
import { createLeadFromCallback } from '../services/hubspot.js';
import { sendAutomationAlert } from '../services/alertService.js';

export const leadCallbackRouter = Router();

leadCallbackRouter.post('/', async (req, res) => {
  const body = req.body || {};
  const data = body.body || body;

  const honeypot = data.company_website_fax || '';
  const phoneE164 = (data.phone_e164 || '').trim();
  const fullName = (data.full_name || 'New Lead').trim();
  const email = (data.email || '').trim();
  const industry = data.industry || 'Home Services';
  const bottleneckNotes = data.bottleneck_notes || '';

  // 1. Honeypot & Phone E.164 Validation
  const isValidPhone = phoneE164.startsWith('+') && phoneE164.length >= 8;
  const isBot = honeypot !== '' || !isValidPhone;

  if (isBot) {
    console.warn(`[Lead Intake] Bot or invalid phone rejected: phone="${phoneE164}", honeypot="${honeypot}"`);
    return res.status(400).json({
      status: 'ignored',
      message: 'Submission rejected by security policy.',
    });
  }

  try {
    console.log(`[Lead Intake] Valid lead submission for ${fullName} (${phoneE164})`);

    // 2. Dispatch Retell AI Call
    let callId = '';
    try {
      const retellResult = await dispatchRetellCall({
        toNumber: phoneE164,
        customerName: fullName,
        industry,
        bottleneckNotes,
      });
      callId = retellResult?.call_id || '';
    } catch (retellErr) {
      console.error('[Lead Intake] Retell call dispatch failed:', retellErr.message);
      await sendAutomationAlert({
        automationName: 'Retell AI Outbound Dispatch (Lead Callback)',
        action: 'dispatchRetellCall',
        error: retellErr,
        payload: { fullName, phoneE164, industry },
        severity: 'HIGH',
      });
    }

    // 3. Create Lead in HubSpot CRM
    try {
      await createLeadFromCallback({
        fullName,
        email,
        phoneE164,
        industry,
        bottleneckNotes,
      });
    } catch (crmErr) {
      console.error('[Lead Intake] HubSpot lead creation failed:', crmErr.message);
      await sendAutomationAlert({
        automationName: 'HubSpot Lead Creation (Lead Callback)',
        action: 'createLeadFromCallback',
        error: crmErr,
        payload: { fullName, email, phoneE164, industry },
        severity: 'HIGH',
      });
    }

    // 4. Send Slack / Telegram Alert
    const slackText = `🚨 *New Demo Triggered:* ${fullName} (${industry}) just requested an AI callback at \`${phoneE164}\`!\n*Bottleneck:* ${bottleneckNotes || 'None noted'}\n*Call Dispatched:* ${callId ? `✅ Yes (ID: ${callId})` : '⚠️ Retell fallback activated'}`;
    await sendSlackAlert({ text: slackText });

    // 5. Respond to Webhook Instant Ack
    return res.status(200).json({
      status: callId ? 'ok' : 'fallback_cal',
      call_dispatched: Boolean(callId),
      lead_name: fullName,
      call_id: callId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Lead Intake] Error handling callback request:', err);
    await sendAutomationAlert({
      automationName: 'SureGreet Lead Intake Webhook',
      action: 'processLeadSubmission',
      error: err,
      payload: { fullName, phoneE164, email, industry },
      severity: 'CRITICAL',
    });
    return res.status(500).json({ status: 'error', error: err.message });
  }
});
