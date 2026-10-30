import axios from 'axios';
import { config } from '../config.js';

export async function dispatchRetellCall({ toNumber, customerName, industry, bottleneckNotes }) {
  if (!config.retell.apiKey) {
    console.warn('[Retell AI] RETELL_API_KEY is not set. Simulating call dispatch.');
    return { call_id: 'mock_retell_call_' + Date.now() };
  }

  try {
    const res = await axios.post(
      'https://api.retellai.com/v2/create-phone-call',
      {
        from_number: config.retell.fromNumber || '+1XXXXXXXXXX',
        to_number: toNumber,
        override_agent_id: config.retell.agentId,
        retell_llm_dynamic_variables: {
          customer_name: customerName || 'Valued Client',
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

    console.log(`[Retell AI] Call dispatched successfully! Call ID: ${res.data?.call_id}`);
    return res.data;
  } catch (err) {
    console.error('[Retell AI] Error dispatching call:', err.response?.data || err.message);
    return null;
  }
}

export async function sendSlackAlert({ text }) {
  if (!config.slackWebhookUrl) return;
  try {
    await axios.post(config.slackWebhookUrl, { text }, { timeout: 4000 });
    console.log('[Slack] Alert dispatched.');
  } catch (err) {
    console.error('[Slack] Error dispatching alert:', err.message);
  }
}
