import axios from 'axios';
import { config } from '../config.js';

/**
 * Dispatch an outbound Retell AI phone call for a validated callback lead.
 * Always returns a structured result object rather than swallowing errors into null.
 */
export async function dispatchRetellCall({
  toNumber,
  customerName,
  companyName,
  industry,
  bottleneckNotes,
} = {}) {
  const cleanNumber = String(toNumber || '').trim();
  if (!cleanNumber) {
    return { ok: false, dispatched: false, mock: false, callId: null, error: 'Missing destination phone number' };
  }

  if (!config.retell.apiKey || !config.retell.agentId) {
    const mockId = `mock_retell_call_${Date.now()}`;
    console.warn('[Retell AI] RETELL_API_KEY or RETELL_AGENT_ID is not set. Simulating call dispatch.');
    return {
      ok: true,
      dispatched: false,
      mock: true,
      callId: mockId,
      call_id: mockId,
      data: { call_id: mockId, simulated: true },
      error: null,
    };
  }

  const fromNumber = String(config.retell.fromNumber || '').trim();
  if (!fromNumber || fromNumber === '+1XXXXXXXXXX') {
    const errMsg = 'RETELL_FROM_NUMBER not configured (placeholder +1XXXXXXXXXX)';
    console.error(`[Retell AI] ${errMsg}`);
    return {
      ok: false,
      dispatched: false,
      mock: false,
      callId: null,
      call_id: null,
      data: null,
      error: errMsg,
    };
  }

  try {
    const res = await axios.post(
      'https://api.retellai.com/v2/create-phone-call',
      {
        from_number: fromNumber,
        to_number: cleanNumber,
        override_agent_id: config.retell.agentId,
        // Anti-Limit Burn Protection: Hard-cap call duration at 180 seconds (3 mins)
        max_call_duration_ms: 180000,
        retell_llm_dynamic_variables: {
          customer_name: customerName || 'Valued Homeowner',
          company_name: companyName || 'SureGreet AI',
          industry: industry || 'Home Services',
          bottleneck_notes: bottleneckNotes || 'None specified',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.retell.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      }
    );

    const callId = res.data?.call_id || null;
    console.log(`[Retell AI] Call dispatched successfully! Call ID: ${callId}`);
    return {
      ok: Boolean(callId),
      dispatched: Boolean(callId),
      mock: false,
      callId,
      call_id: callId,
      data: res.data,
      error: callId ? null : 'Retell API returned no call_id',
    };
  } catch (err) {
    const errMsg =
      (err.response?.data && (err.response.data.message || JSON.stringify(err.response.data))) ||
      err.message ||
      'Retell call request failed';
    console.error('[Retell AI] Error dispatching call:', errMsg);
    return {
      ok: false,
      dispatched: false,
      mock: false,
      callId: null,
      call_id: null,
      data: err.response?.data || null,
      error: errMsg,
    };
  }
}

export async function sendSlackAlert({ text }) {
  if (!config.slackWebhookUrl) {
    return { ok: false, skipped: true, error: 'SLACK_WEBHOOK_URL not configured' };
  }
  try {
    await axios.post(config.slackWebhookUrl, { text }, { timeout: 4000 });
    console.log('[Slack] Alert dispatched.');
    return { ok: true, skipped: false, error: null };
  } catch (err) {
    console.error('[Slack] Error dispatching alert:', err.message);
    return { ok: false, skipped: false, error: err.message };
  }
}
