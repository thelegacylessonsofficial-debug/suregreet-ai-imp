import { DateTime } from 'luxon';
import { config } from '../config.js';
import { sendEmail } from './mailer.js';
import { sendTelegramHtml } from './telegram.js';
import { automationErrorAlertTemplate } from '../templates/emailTemplates.js';

// In-memory ring buffer holding the last 50 alert records
const alertHistory = [];
const MAX_HISTORY = 50;

/**
 * Intelligent diagnostic helper to derive exact suggested action
 */
export function deriveSuggestedFix(automationName, error) {
  const msg = (error?.message || String(error || '')).toLowerCase();
  const status = error?.response?.status || error?.status;

  if (msg.includes('missing_scopes') || msg.includes('crm.objects') || status === 403 && automationName.toLowerCase().includes('hubspot')) {
    return 'HubSpot Private App is missing required CRM scopes. Go to HubSpot Settings → Integrations → Private Apps → SureGreet AI → Scopes, and check "crm.objects.contacts.write" and "crm.objects.contacts.read". Then click Save.';
  }

  if (msg.includes('cal_live') || msg.includes('cal.com') || status === 401 && automationName.toLowerCase().includes('cal')) {
    return 'Cal.com API Authentication failed. Verify that CAL_API_KEY in Render environment variables is valid and not expired.';
  }

  if (msg.includes('retell') && (status === 401 || status === 403)) {
    return 'Retell AI API Key or Agent ID is invalid. Verify RETELL_API_KEY and RETELL_AGENT_ID in Render environment variables.';
  }

  if (msg.includes('google') || msg.includes('sheet') || msg.includes('permission') || msg.includes('403')) {
    return 'Google Sheets permission error. Ensure your Google Sheet (1Ev8UJfc8kvBE2C6o6eJRr2aJfNKflAKWGiRgVg7svXM) is shared with Editor access to your service account email, or check GOOGLE_SERVICE_ACCOUNT credentials.';
  }

  if (msg.includes('etimedout') || msg.includes('econnrefused') || msg.includes('socket hang up')) {
    return 'External network connection timed out. The 3rd party API server is either experiencing rate-limiting, downtime, or cloud firewall egress delay. The request should be retried automatically.';
  }

  if (msg.includes('honeypot') || msg.includes('e.164')) {
    return 'Bot or invalid phone number submission caught by security policy. No action needed; malicious submission was safely rejected.';
  }

  return `Investigate the failure payload and stack trace. Check service credentials and ensure the incoming webhook schema has not changed.`;
}

/**
 * Dispatches real-time multi-channel incident notifications (Email + Telegram)
 */
export async function sendAutomationAlert({
  automationName = 'General Automation Service',
  action = 'Webhook/Cron Execution',
  error = new Error('Unknown automation error'),
  payload = {},
  severity = 'HIGH',
  suggestedFix = null,
}) {
  const alertId = `alt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = DateTime.now();
  const timeIST = now.setZone('Asia/Kolkata').toFormat('dd LLL yyyy, hh:mm:ss a') + ' IST';
  const timeEST = now.setZone('America/New_York').toFormat('hh:mm:ss a') + ' EST';
  const timestampStr = `${timeIST} (${timeEST})`;

  const errorMsg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
  const errorCode = error?.response?.status || error?.code || error?.status || null;
  const errorStack = error?.stack || null;
  const resolvedFix = suggestedFix || deriveSuggestedFix(automationName, error);

  console.error(`\n🚨 [SENTINEL ALERT] [${severity}] ${automationName} -> ${action}`);
  console.error(`   Error: ${errorMsg}`);
  console.error(`   Fix: ${resolvedFix}\n`);

  // Record in memory buffer
  const alertRecord = {
    id: alertId,
    timestamp: timestampStr,
    automationName,
    action,
    severity,
    errorMsg,
    errorCode,
    payload,
    suggestedFix: resolvedFix,
  };
  alertHistory.unshift(alertRecord);
  if (alertHistory.length > MAX_HISTORY) {
    alertHistory.pop();
  }

  // 1. Deliver to Telegram (Instant, never blocked by cloud firewall)
  let telegramResult = null;
  try {
    const tgHtml = `🚨 <b>[SUREGREET AI ALERT] ${automationName}</b>
━━━━━━━━━━━━━━━━━━━━
⚠️ <b>Status:</b> FAILED (${severity} Severity)
⚙️ <b>Action:</b> <code>${action}</code>
🕒 <b>Time:</b> ${timeIST}

❌ <b>Reason:</b>
<code>${errorMsg.substring(0, 400)}</code>

💡 <b>Recommended Fix:</b>
${resolvedFix}

📋 <b>Payload Context:</b>
<pre>${JSON.stringify(payload, null, 2).substring(0, 350)}</pre>
━━━━━━━━━━━━━━━━━━━━
📧 <i>Full diagnostic report dispatched to architd062@gmail.com</i>`;

    telegramResult = await sendTelegramHtml(tgHtml);
  } catch (tgErr) {
    console.error('[AlertService] Failed to dispatch Telegram alert:', tgErr.message);
  }

  // 2. Deliver to Email (Full HTML Breakdown & Stack Trace)
  let emailResult = null;
  try {
    const emailHtml = automationErrorAlertTemplate({
      automationName,
      action,
      errorMsg,
      errorCode,
      errorStack,
      payloadSummary: payload,
      suggestedFix: resolvedFix,
      timestamp: timestampStr,
      severity,
    });

    emailResult = await sendEmail({
      to: config.ownerEmail,
      subject: `🚨 [Automation Alert] ${automationName} Failed: ${errorMsg.substring(0, 60)}`,
      html: emailHtml,
      text: `Automation Failure: ${automationName}\nAction: ${action}\nError: ${errorMsg}\nFix: ${resolvedFix}\nTime: ${timestampStr}`,
    });
  } catch (mailErr) {
    console.error('[AlertService] Failed to dispatch Email alert:', mailErr.message);
  }

  return {
    alertId,
    telegramSent: Boolean(telegramResult?.ok),
    emailSent: Boolean(emailResult?.success),
    timestamp: timestampStr,
  };
}

/**
 * Retrieve recent automation failures
 */
export function getRecentAlerts() {
  return alertHistory;
}
