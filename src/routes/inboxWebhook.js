import { Router } from 'express';
import { processIncomingReply, classifyReply, generateLAARCResponse } from '../services/inboxTriageService.js';
import { sendEmail } from '../services/mailer.js';
import { config } from '../config.js';

export const inboxRouter = Router();

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// In-memory buffer of recent triage activities for live inspection
const recentTriageEvents = [];

/**
 * Webhook endpoint for incoming email replies (from n8n, SendGrid Inbound Parse, Mailgun, or Gmail)
 */
inboxRouter.post(['/', '/reply'], async (req, res) => {
  const body = req.body || {};
  console.log('[Inbox Webhook] Received payload:', body);

  const fromEmail = body.from || body.fromEmail || body.email || body.sender || '';
  const subject = body.subject || '';
  const bodyText = body.text || body.body || body.message || body.strippedText || body.plain || '';
  const inReplyTo = body.inReplyTo || body['in-reply-to'] || '';

  if (!fromEmail || !bodyText) {
    return res.status(400).json({
      status: 'error',
      message: 'Both "from" email and "text" message body are required.',
    });
  }

  try {
    const result = await processIncomingReply({
      fromEmail,
      subject,
      bodyText,
      inReplyTo,
    });

    recentTriageEvents.unshift({
      timestamp: new Date().toISOString(),
      fromEmail,
      subject,
      bodyPreview: bodyText.slice(0, 120),
      classification: result.classification,
      actionsTaken: result.actionsTaken,
      suggestedReply: result.suggestedReply,
    });
    if (recentTriageEvents.length > 30) recentTriageEvents.pop();

    return res.status(200).json({
      status: 'success',
      ...result,
    });
  } catch (err) {
    console.error('[Inbox Webhook] Error processing reply:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * Fast testing endpoint for simulating inbox sentiment classification
 */
inboxRouter.post('/test-triage', async (req, res) => {
  const { email, text } = req.body || {};
  if (!email || !text) {
    return res.status(400).json({ status: 'error', message: 'Fields "email" and "text" are required.' });
  }

  try {
    const result = await processIncomingReply({
      fromEmail: email,
      subject: 'Re: quick question',
      bodyText: text,
    });

    recentTriageEvents.unshift({
      timestamp: new Date().toISOString(),
      fromEmail: email,
      subject: 'Re: quick question',
      bodyPreview: text.slice(0, 120),
      classification: result.classification,
      actionsTaken: result.actionsTaken,
      suggestedReply: result.suggestedReply,
    });
    if (recentTriageEvents.length > 30) recentTriageEvents.pop();

    return res.json({ status: 'success', ...result });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * 1-Click Send Reply Endpoint (Live via Resend or Safe Demo to Archit)
 */
inboxRouter.post('/send-reply', async (req, res) => {
  const { to, subject, text, isTest } = req.body || {};
  if (!to || !text) {
    return res.status(400).json({ status: 'error', message: 'Fields "to" and "text" are required.' });
  }

  const recipient = isTest ? (config.ownerEmail || 'architd062@gmail.com') : to;
  const subj = isTest ? `[TEST LAARC REPLY] ${subject || 'Re: quick question'}` : (subject || 'Re: quick question');

  try {
    const result = await sendEmail({
      to: recipient,
      subject: subj,
      text,
      html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 540px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
        <div style="font-size: 11px; font-weight: bold; color: #f59e0b; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
          ⚡ SureGreet AI • LAARC Objection Closer Reply
        </div>
        <div style="white-space: pre-line; color: #0f172a; margin-bottom: 12px;">
          ${escapeHtml(text)}
        </div>
        <div style="font-size: 11px; color: #94a3b8; border-top: 1px solid #e5e7eb; padding-top: 8px;">
          ${isTest ? `Sent in TEST DEMO mode to Archit (${recipient})` : `Dispatched directly to prospect (${recipient})`}
        </div>
      </div>`,
    });

    return res.json({ status: result.success ? 'success' : 'error', recipient, ...result });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * Visual Inbox Triage & Closer Dashboard (Streamlined — redirects to CRM)
 */
inboxRouter.get('/dashboard', (req, res) => {
  const key = req.query.key ? `?key=${encodeURIComponent(req.query.key)}` : '';
  res.redirect(`/outreach/prospects${key}`);
});
