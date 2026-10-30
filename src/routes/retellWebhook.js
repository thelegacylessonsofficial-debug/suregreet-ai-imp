import { Router } from 'express';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { sendEmail } from '../services/mailer.js';
import {
  searchContactByPhone,
  createContactFromCall,
  createNoteAndAssociate,
} from '../services/hubspot.js';
import { appendCallLogToSheet } from '../services/googleSheets.js';
import { ownerCallSummaryTemplate } from '../templates/emailTemplates.js';

export const retellRouter = Router();

retellRouter.post('/', async (req, res) => {
  const body = req.body || {};
  const event = body.event;
  const call = body.call || {};

  console.log(`[Retell Webhook] Received event: ${event}`);

  if (event !== 'call_ended') {
    return res.status(200).json({ status: 'ignored', message: 'Event is not call_ended' });
  }

  const callId = call.call_id || 'unknown';
  const callerPhone = call.from_number || 'Unknown';
  const duration = Math.round(((call.duration_ms || 0) / 1000 / 60) * 10) / 10;
  const recordingUrl = call.recording_url || '';
  const transcript = call.transcript || 'No transcript available';
  const callAnalysis = call.call_analysis || {};
  const callSummary = callAnalysis.call_summary || 'No summary available';
  const sentiment = callAnalysis.user_sentiment || 'Neutral';
  const callSuccessful = Boolean(callAnalysis.call_successful);

  // Exact outcome logic from n8n
  const summaryLower = callSummary.toLowerCase();
  let callOutcome = 'Inquiry';
  if (summaryLower.includes('transfer')) {
    callOutcome = 'Transferred';
  } else if (
    callSuccessful ||
    summaryLower.includes('book') ||
    summaryLower.includes('schedul') ||
    summaryLower.includes('appointment')
  ) {
    callOutcome = 'Booked';
  } else if (summaryLower.includes('spam') || summaryLower.includes('robocall')) {
    callOutcome = 'Spam';
  }

  const startMillis = call.start_timestamp ? Number(call.start_timestamp) : Date.now();
  const callDate = DateTime.fromMillis(startMillis).setZone(config.timezone).toFormat('yyyy-MM-dd hh:mm a');

  console.log(`[Retell Webhook] Call ${callId} ended for ${callerPhone}. Outcome: ${callOutcome}`);

  // Instant response to Retell AI so webhook never times out
  res.status(200).json({
    status: 'success',
    call_id: callId,
    call_outcome: callOutcome,
  });

  // Background Processing (Sheets, HubSpot, Email)
  (async () => {
    // 1. Google Sheets Append
    try {
      await appendCallLogToSheet({
        callDate,
        callerPhone,
        duration,
        callOutcome,
        sentiment,
        callSummary,
        recordingUrl,
        callId,
      });
    } catch (sheetErr) {
      console.error('[Retell Webhook] Google Sheets error:', sheetErr.message);
    }

    // 2. HubSpot Contact & Note Sync
    let contactId = null;
    let isNewLead = false;

    try {
      const noteHtml = `<div style='border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; background-color: #f8fafc; font-family: sans-serif;'>
        <h3 style='margin-top: 0; color: #0f172a;'>📞 SureGreet AI Voice Call Log</h3>
        <table style='width: 100%; border-collapse: collapse; font-size: 14px;'>
          <tr><td style='padding: 6px 0; color: #64748b;'><strong>Date:</strong></td><td>${callDate}</td></tr>
          <tr><td style='padding: 6px 0; color: #64748b;'><strong>Duration:</strong></td><td>${duration} min</td></tr>
          <tr><td style='padding: 6px 0; color: #64748b;'><strong>Sentiment:</strong></td><td>${sentiment}</td></tr>
          <tr><td style='padding: 6px 0; color: #64748b;'><strong>Outcome:</strong></td><td>${callOutcome}</td></tr>
        </table>
        <div style='margin-top: 12px; padding: 10px; background: #ffffff; border-radius: 6px; border: 1px solid #e2e8f0;'>
          <strong style='color: #334155;'>AI Summary:</strong>
          <p style='margin: 6px 0 0; color: #1e293b;'>${callSummary}</p>
        </div>
        <div style='margin-top: 12px;'>
          <a href='${recordingUrl}' target='_blank' style='background: #0f172a; color: #ffffff; padding: 8px 14px; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 13px; font-weight: bold;'>🎧 Listen to Audio Recording</a>
        </div>
      </div>`;

      const existingContact = await searchContactByPhone(callerPhone);
      if (existingContact) {
        contactId = existingContact.id;
      } else {
        isNewLead = true;
        const newContact = await createContactFromCall(callerPhone);
        contactId = newContact?.id;
      }

      if (contactId) {
        await createNoteAndAssociate({ contactId, noteHtml });
      }
    } catch (crmErr) {
      console.error('[Retell Webhook] HubSpot CRM error:', crmErr.message);
    }

    // 3. Email Notification to Owner
    try {
      const emailSubject = isNewLead
        ? `📞 New Lead Call: ${callerPhone} — [${callOutcome}]`
        : `📞 Call Summary: ${callerPhone} — [${callOutcome}]`;

      await sendEmail({
        to: config.ownerEmail,
        subject: emailSubject,
        html: ownerCallSummaryTemplate({
          callerPhone,
          duration,
          sentiment,
          callOutcome,
          callDate,
          callSummary,
          recordingUrl,
          isNewLead,
          transcript,
        }),
      });
    } catch (mailErr) {
      console.error('[Retell Webhook] Email error:', mailErr.message);
    }
  })().catch((err) => {
    console.error('[Retell Webhook] Background task error:', err);
  });
});
