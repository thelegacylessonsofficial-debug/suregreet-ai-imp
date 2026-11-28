import { Router } from 'express';
import { dispatchRetellCall, sendSlackAlert } from '../services/retell.js';
import { createLeadFromCallback } from '../services/hubspot.js';
import { sendAutomationAlert } from '../services/alertService.js';
import { sendTelegramHtml } from '../services/telegram.js';
import { supabaseFetch } from '../services/outreachService.js';

const DEDUPE_TTL_MS = 60 * 1000;
const recentCallbacks = new Map();

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Normalize and validate an incoming phone string as strict E.164 (`+[1-9][0-9]{7,14}`).
 */
export function normalizeE164Phone(raw) {
  const cleaned = String(raw || '').trim().replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

/**
 * Parse and sanitize inbound callback intake payloads across supported webhook shapes.
 */
export function parseLeadCallbackPayload(body) {
  const raw = body && typeof body === 'object' ? (body.body && typeof body.body === 'object' ? body.body : body) : {};
  const honeypot = String(raw.company_website_fax || '').trim();
  const phoneE164 = normalizeE164Phone(raw.phone_e164 || raw.phone || '');
  const fullName = String(raw.full_name || raw.fullName || raw.name || 'New Lead').trim() || 'New Lead';
  const companyName = String(raw.company_name || raw.companyName || raw.clinic_name || '').trim();
  const rawEmail = String(raw.email || '').trim().toLowerCase();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : '';
  const industry = String(raw.industry || 'Home Services').trim() || 'Home Services';
  const bottleneckNotes = String(raw.bottleneck_notes || raw.bottleneckNotes || raw.notes || '').trim();

  return {
    honeypot,
    phoneE164,
    fullName,
    companyName,
    email,
    rawEmail,
    industry,
    bottleneckNotes,
  };
}

function pruneDedupeMap(store, nowMs) {
  for (const [key, ts] of store.entries()) {
    if (nowMs - ts > DEDUPE_TTL_MS) {
      store.delete(key);
    }
  }
}

/**
 * Factory for the Lead Callback Dispatch webhook handler (enables deterministic unit tests).
 */
export function createLeadCallbackHandler(deps = {}) {
  const dispatchCall = deps.dispatchRetellCall || dispatchRetellCall;
  const syncHubspotLead = deps.createLeadFromCallback || createLeadFromCallback;
  const notifySlack = deps.sendSlackAlert || sendSlackAlert;
  const notifyTelegram = deps.sendTelegramHtml || sendTelegramHtml;
  const alertFailure = deps.sendAutomationAlert || sendAutomationAlert;
  const dbFetch = deps.supabaseFetch || supabaseFetch;
  const dedupeStore = deps.dedupeStore || recentCallbacks;

  return async function handleLeadCallback(req, res) {
    const parsed = parseLeadCallbackPayload(req.body);

    // 1. Security policy: honeypot & strict E.164 phone gate
    if (parsed.honeypot !== '' || !parsed.phoneE164) {
      console.warn(`[Lead Intake] Bot or invalid E.164 phone rejected (honeypot=${Boolean(parsed.honeypot)})`);
      return res.status(400).json({
        status: 'ignored',
        message: 'Submission rejected: valid E.164 phone number required.',
      });
    }

    // 2. Short-window idempotency protection against duplicate submits
    const nowMs = Date.now();
    pruneDedupeMap(dedupeStore, nowMs);
    if (dedupeStore.has(parsed.phoneE164)) {
      return res.status(200).json({
        status: 'duplicate_suppressed',
        call_dispatched: false,
        lead_name: parsed.fullName,
        phone_e164: parsed.phoneE164,
        timestamp: new Date(nowMs).toISOString(),
      });
    }
    dedupeStore.set(parsed.phoneE164, nowMs);

    try {
      console.log(`[Lead Intake] Processing callback dispatch for ${parsed.fullName} (${parsed.phoneE164})`);

      // 3. Dispatch Retell AI outbound call + surface structured errors cleanly
      const retellResult = await dispatchCall({
        toNumber: parsed.phoneE164,
        customerName: parsed.fullName,
        companyName: parsed.companyName,
        industry: parsed.industry,
        bottleneckNotes: parsed.bottleneckNotes,
      });

      const callId = retellResult?.callId || retellResult?.call_id || '';
      const isLiveCall = Boolean(retellResult?.ok && retellResult?.dispatched && !retellResult?.mock);
      const isMockCall = Boolean(retellResult?.mock);

      if (!retellResult || !retellResult.ok) {
        await alertFailure({
          automationName: 'Retell AI Outbound Dispatch (Lead Callback)',
          action: 'dispatchRetellCall',
          error: new Error(retellResult?.error || 'Retell call dispatch returned failure'),
          payload: { fullName: parsed.fullName, phoneE164: parsed.phoneE164, industry: parsed.industry },
          severity: 'HIGH',
        });
      }

      // 4. Persist callback intake record to Supabase public.leads
      let supabaseLogged = false;
      try {
        const sbRes = await dbFetch('/leads', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            full_name: parsed.fullName,
            email: parsed.email || null,
            phone: parsed.phoneE164,
            industry: parsed.companyName ? `${parsed.companyName} (${parsed.industry})` : parsed.industry,
            bottleneck_notes: parsed.bottleneckNotes || null,
            status: isLiveCall ? 'dispatched' : isMockCall ? 'simulated' : 'fallback_cal',
            hubspot_synced: false,
            metadata: {
              callId: callId || null,
              dispatchMode: isLiveCall ? 'live' : isMockCall ? 'mock' : 'fallback',
              source: 'lead_callback_webhook',
            },
          }),
        });
        supabaseLogged = Boolean(sbRes?.ok);
        if (!supabaseLogged) {
          console.warn('[Lead Intake] Supabase public.leads insert warning:', sbRes?.data);
        }
      } catch (sbErr) {
        console.warn('[Lead Intake] Supabase write warning:', sbErr.message);
      }

      // 5. Sync lead to HubSpot CRM
      const crmResult = await syncHubspotLead({
        fullName: parsed.fullName,
        companyName: parsed.companyName,
        email: parsed.email,
        phoneE164: parsed.phoneE164,
        industry: parsed.industry,
        bottleneckNotes: parsed.bottleneckNotes,
      });
      const crmSynced = Boolean(crmResult && (crmResult.ok === true || crmResult.id));

      if (crmResult && !crmResult.ok && !crmResult.skipped) {
        await alertFailure({
          automationName: 'HubSpot Lead Creation (Lead Callback)',
          action: 'createLeadFromCallback',
          error: new Error(crmResult.error || 'HubSpot callback sync failed'),
          payload: { fullName: parsed.fullName, email: parsed.email, phoneE164: parsed.phoneE164 },
          severity: 'HIGH',
        });
      }

      // 6. Real-time Founder Notifications (Telegram HTML + optional Slack)
      const modeBadge = isLiveCall
        ? `Live Call Dispatched (ID: <code>${escapeHtml(callId)}</code>)`
        : isMockCall
          ? `Simulated (Set RETELL_API_KEY + RETELL_AGENT_ID for live voice)`
          : `Fallback Required (${escapeHtml(retellResult?.error || 'Retell unavailable')})`;

      const tgHtml =
        `🚨 <b>LEAD CALLBACK DISPATCH</b>\n\n` +
        `👤 <b>Lead:</b> ${escapeHtml(parsed.fullName)}${parsed.companyName ? ` (${escapeHtml(parsed.companyName)})` : ''}\n` +
        `🏭 <b>Trade:</b> ${escapeHtml(parsed.industry)}\n` +
        `📞 <b>Phone:</b> <code>${escapeHtml(parsed.phoneE164)}</code>\n` +
        (parsed.email ? `✉️ <b>Email:</b> <code>${escapeHtml(parsed.email)}</code>\n` : '') +
        `🎯 <b>Bottleneck:</b> ${escapeHtml(parsed.bottleneckNotes || 'None noted')}\n` +
        `🎙️ <b>Call Status:</b> ${modeBadge}\n` +
        `📊 <b>Sync:</b> HubSpot ${crmSynced ? 'OK' : 'Skipped/Failed'} | Supabase ${supabaseLogged ? 'Logged' : 'Pending'}`;

      let telegramNotified = false;
      try {
        const tgRes = await notifyTelegram(tgHtml);
        telegramNotified = Boolean(tgRes?.ok);
      } catch (tgErr) {
        console.warn('[Lead Intake] Telegram notification warning:', tgErr.message);
      }

      const slackText = `🚨 *New Callback Lead:* ${parsed.fullName} (${parsed.industry}) at \`${parsed.phoneE164}\` | Status: ${isLiveCall ? `Dispatched (${callId})` : isMockCall ? 'Simulated' : 'Fallback'}`;
      await notifySlack({ text: slackText });

      return res.status(200).json({
        status: isLiveCall ? 'ok' : isMockCall ? 'simulated' : 'fallback_cal',
        dispatch_mode: isLiveCall ? 'live' : isMockCall ? 'mock' : 'fallback',
        call_dispatched: isLiveCall,
        crm_synced: crmSynced,
        hubspot_contact_id: crmResult?.id || null,
        supabase_logged: supabaseLogged,
        telegram_notified: telegramNotified,
        lead_name: parsed.fullName,
        call_id: callId,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      dedupeStore.delete(parsed.phoneE164);
      console.error('[Lead Intake] Critical error handling callback request:', err);
      await alertFailure({
        automationName: 'SureGreet Lead Intake Webhook',
        action: 'processLeadSubmission',
        error: err,
        payload: { fullName: parsed.fullName, phoneE164: parsed.phoneE164, industry: parsed.industry },
        severity: 'CRITICAL',
      });
      return res.status(500).json({ status: 'error', error: err.message });
    }
  };
}

export const leadCallbackRouter = Router();
leadCallbackRouter.post('/', createLeadCallbackHandler());
