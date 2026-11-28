import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { formatSalutation } from '../templates/outreachTemplates.js';

let cachedAuthClient = null;

/**
 * Returns Google Sheets connection status (zero heavy googleapis import at boot)
 */
export function getSheetsStatus() {
  const hasWebhook = Boolean(config.googleSheets.webhookUrl || process.env.GOOGLE_SHEETS_WEBHOOK_URL);
  const hasJsonEnv = Boolean(config.googleSheets.serviceAccountJson || process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const hasFile = fs.existsSync(path.resolve(config.googleSheets.serviceAccountPath));

  let mode = 'mock';
  if (hasWebhook) mode = 'webhook_url';
  else if (hasJsonEnv) mode = 'service_account_env';
  else if (hasFile) mode = 'service_account_file';

  return {
    mode,
    sheetId: config.googleSheets.sheetId,
    leadsTab: config.googleSheets.leadsTabName,
    callLogsTab: config.googleSheets.tabName,
    connected: mode !== 'mock',
    description:
      mode === 'webhook_url'
        ? 'Google Apps Script Webhook (Direct HTTP POST)'
        : mode === 'service_account_env'
        ? 'Google Cloud Service Account (From Environment JSON)'
        : mode === 'service_account_file'
        ? 'Google Cloud Service Account (From Local Key File)'
        : 'Mock Mode (Ready for Webhook or Service Account)',
  };
}

/**
 * Lazy-load google-auth-library ONLY if Service Account auth is actually configured (~2MB vs 78MB googleapis)
 */
async function getAccessToken() {
  const jsonEnv = config.googleSheets.serviceAccountJson || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const keyPath = path.resolve(config.googleSheets.serviceAccountPath);

  if (!jsonEnv && !fs.existsSync(keyPath)) return null;

  try {
    if (!cachedAuthClient) {
      const { GoogleAuth } = await import('google-auth-library');
      const authOpts = jsonEnv
        ? {
            credentials: typeof jsonEnv === 'string' ? JSON.parse(jsonEnv) : jsonEnv,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          }
        : {
            keyFile: keyPath,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          };
      const auth = new GoogleAuth(authOpts);
      cachedAuthClient = await auth.getClient();
    }
    const tokenRes = await cachedAuthClient.getAccessToken();
    return tokenRes?.token || null;
  } catch (err) {
    console.warn('[Google Sheets] Auth error:', err.message);
    return null;
  }
}

/**
 * Direct REST append to Google Sheets v4 API without loading heavy googleapis bundle
 */
async function appendValuesRest(range, values) {
  const token = await getAccessToken();
  if (!token) return null;

  const sheetId = config.googleSheets.sheetId;
  const encodedRange = encodeURIComponent(range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Sheets REST ${res.status}: ${errText.slice(0, 200)}`);
  }
  return await res.json();
}

/**
 * Append a verified lead to Google Sheets
 * Columns: [Company | Owner | Phone | City | Full Harvey Email | Email | Website | Date | Qual Score]
 */
export async function appendProspectToSheet(prospect) {
  if (!prospect) return { success: false, error: 'No prospect data provided' };

  const company = prospect.clinic_name || prospect.clinicName || 'Trade Business';
  const owner = formatSalutation(prospect.doctor_name || prospect.doctorName, company, prospect.niche || 'hvac');
  const phone = prospect.phone || 'N/A';
  const city = prospect.city || '';
  const fullHarveyEmail = prospect.harvey_draft || prospect.email_body || '';
  const email = prospect.email || '';
  const website = prospect.website_url || prospect.url || '';
  const dateAdded = new Date().toLocaleDateString('en-US');
  const qualScore =
    prospect.qual_score !== undefined && prospect.qual_score !== null
      ? `${prospect.qual_score}/100 (${prospect.qual_grade || ''})`
      : 'Legacy';

  const row = [company, owner, phone, city, fullHarveyEmail, email, website, dateAdded, qualScore];

  const webhookUrl = config.googleSheets.webhookUrl || process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'append_lead',
          sheet: config.googleSheets.leadsTabName,
          row,
          lead: prospect,
        }),
      });
      if (res.ok) {
        return { success: true, provider: 'webhook' };
      }
    } catch (webhookErr) {
      console.warn('[Google Sheets:Webhook] Dispatch failed:', webhookErr.message);
    }
  }

  try {
    const restRes = await appendValuesRest(`${config.googleSheets.leadsTabName}!A:I`, [row]);
    if (restRes) {
      return { success: true, updatedRange: restRes.updates?.updatedRange, provider: 'api_rest' };
    }
  } catch (err) {
    console.error('[Google Sheets:REST] Append error:', err.message);
    return { success: false, error: err.message };
  }

  return { mock: true, success: true, row };
}

/**
 * Format prospects for direct clipboard paste into Google Sheets (TSV format)
 */
export function formatProspectsTsv(prospects = []) {
  const header = ['Company', 'Owner', 'Phone', 'City', 'Full Harvey Email'].join('\t');
  const rows = prospects.map((p) => {
    const company = (p.clinic_name || p.clinicName || '').replace(/[\t\n\r]/g, ' ');
    const owner = formatSalutation(p.doctor_name || p.doctorName, company, p.niche || 'hvac').replace(/[\t\n\r]/g, ' ');
    const phone = (p.phone || 'N/A').replace(/[\t\n\r]/g, ' ');
    const city = (p.city || '').replace(/[\t\n\r]/g, ' ');
    const emailDraft = (p.harvey_draft || p.email_body || '').replace(/[\t\r]/g, ' ').replace(/\n/g, ' ');
    return [company, owner, phone, city, `"${emailDraft.replace(/"/g, '""')}"`].join('\t');
  });
  return [header, ...rows].join('\n');
}

/**
 * Format prospects as CSV for direct download
 */
export function formatProspectsCsv(prospects = []) {
  const escapeCsv = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
  const header = ['Company', 'Owner', 'Phone', 'City', 'Full Harvey Email', 'Email', 'Website', 'Date Added', 'Qual Score', 'Reviews']
    .map(escapeCsv)
    .join(',');
  const rows = prospects.map((p) => {
    const company = p.clinic_name || p.clinicName || '';
    const owner = formatSalutation(p.doctor_name || p.doctorName, company, p.niche || 'hvac');
    const phone = p.phone || 'N/A';
    const city = p.city || '';
    const emailDraft = p.harvey_draft || p.email_body || '';
    const email = p.email || '';
    const website = p.website_url || p.url || '';
    const dateAdded = new Date().toLocaleDateString('en-US');
    const qualScore =
      p.qual_score !== undefined && p.qual_score !== null ? `${p.qual_score}/100 (${p.qual_grade || ''})` : 'Legacy';
    const reviews = p.review_count ? `${p.review_count}${p.google_rating ? ` (${p.google_rating}★)` : ''}` : '';
    return [company, owner, phone, city, emailDraft, email, website, dateAdded, qualScore, reviews].map(escapeCsv).join(',');
  });
  return [header, ...rows].join('\n');
}

/**
 * Batch synchronize prospects to Google Sheets
 */
export async function syncAllProspectsToSheet(prospects = []) {
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return { success: false, message: 'No prospects to synchronize' };
  }

  const tradeProspects = prospects.filter((p) => p.niche !== 'medspa');
  const targetList = tradeProspects.length > 0 ? tradeProspects : prospects;

  let synced = 0;
  let errors = 0;
  for (const p of targetList) {
    const res = await appendProspectToSheet(p);
    if (res.success) synced++;
    else errors++;
  }

  return {
    success: true,
    total: targetList.length,
    synced,
    errors,
    status: getSheetsStatus(),
  };
}

/**
 * Append voice dispatcher / call log to Google Sheets
 */
export async function appendCallLogToSheet({
  callDate,
  callerPhone,
  duration,
  callOutcome,
  sentiment,
  callSummary,
  recordingUrl,
  callId,
}) {
  const row = [
    callDate,
    callerPhone,
    duration,
    callOutcome,
    sentiment,
    callSummary,
    recordingUrl ? `=HYPERLINK("${recordingUrl}", "Listen")` : 'No recording',
    callId,
  ];

  const webhookUrl = config.googleSheets.webhookUrl || process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'append_call_log',
          sheet: config.googleSheets.tabName,
          row,
          callData: { callDate, callerPhone, duration, callOutcome, sentiment, callSummary, recordingUrl, callId },
        }),
      });
      if (res.ok) return { success: true, provider: 'webhook' };
    } catch (webhookErr) {
      console.warn('[Google Sheets:Webhook] Call log dispatch failed:', webhookErr.message);
    }
  }

  try {
    const restRes = await appendValuesRest(`${config.googleSheets.tabName}!A:H`, [row]);
    if (restRes) {
      return { success: true, updatedRange: restRes.updates?.updatedRange, provider: 'api_rest' };
    }
  } catch (err) {
    console.error('[Google Sheets:REST] Call log append error:', err.message);
    return { success: false, error: err.message };
  }

  return { mock: true, success: true, row };
}
