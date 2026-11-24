import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

let sheetsClient = null;

/**
 * Returns Google Sheets connection status
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
    description: mode === 'webhook_url'
      ? 'Google Apps Script Webhook (Direct HTTP POST)'
      : mode === 'service_account_env'
      ? 'Google Cloud Service Account (From Environment JSON)'
      : mode === 'service_account_file'
      ? 'Google Cloud Service Account (From Local Key File)'
      : 'Mock Mode (Ready for Webhook or Service Account)',
  };
}

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  // Option 1: Parse service account JSON directly from environment variable
  const jsonEnv = config.googleSheets.serviceAccountJson || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (jsonEnv) {
    try {
      const credentials = typeof jsonEnv === 'string' ? JSON.parse(jsonEnv) : jsonEnv;
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      sheetsClient = google.sheets({ version: 'v4', auth });
      return sheetsClient;
    } catch (err) {
      console.warn('[Google Sheets] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', err.message);
    }
  }

  // Option 2: Read key file from disk
  const keyPath = path.resolve(config.googleSheets.serviceAccountPath);
  if (fs.existsSync(keyPath)) {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      sheetsClient = google.sheets({ version: 'v4', auth });
      return sheetsClient;
    } catch (err) {
      console.error('[Google Sheets] Key file auth error:', err.message);
    }
  }

  return null;
}

/**
 * Append a verified lead to Google Sheets
 * Supports both Google Apps Script Webhook (fastest, $0 setup) and Google Sheets API v4
 */
export async function appendProspectToSheet(prospect) {
  if (!prospect) return { success: false, error: 'No prospect data provided' };

  const row = [
    new Date().toLocaleDateString('en-US'),
    prospect.clinic_name || prospect.clinicName || 'Unknown Practice',
    prospect.doctor_name || prospect.doctorName || 'Owner / DM',
    prospect.email || '',
    prospect.phone || 'N/A',
    prospect.city || '',
    (prospect.niche || 'medspa').toUpperCase(),
    prospect.treatment || 'High-Ticket Service',
    prospect.status || 'pending',
    prospect.specific_observation || prospect.specificObservation || '',
    prospect.website_url || prospect.url || '',
  ];

  // 1. Try Google Apps Script Webhook
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
        console.log(`[Google Sheets:Webhook] Synced prospect ${prospect.email} to sheet successfully.`);
        return { success: true, provider: 'webhook' };
      }
    } catch (webhookErr) {
      console.warn('[Google Sheets:Webhook] Dispatch failed:', webhookErr.message);
    }
  }

  // 2. Try Google Sheets API client
  const client = await getSheetsClient();
  if (client) {
    try {
      const range = `${config.googleSheets.leadsTabName}!A:K`;
      const response = await client.spreadsheets.values.append({
        spreadsheetId: config.googleSheets.sheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      });
      console.log(`[Google Sheets:API] Appended lead to "${config.googleSheets.leadsTabName}" successfully.`);
      return { success: true, updatedRange: response.data.updates?.updatedRange, provider: 'api' };
    } catch (err) {
      console.error('[Google Sheets:API] Append error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // 3. Fallback to mock log
  console.log('[Google Sheets Mock Lead Append]:', row);
  return { mock: true, success: true, row };
}

/**
 * Batch synchronize an array of prospects to Google Sheets
 */
export async function syncAllProspectsToSheet(prospects = []) {
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return { success: false, message: 'No prospects to synchronize' };
  }

  console.log(`[Google Sheets] Synchronizing ${prospects.length} prospects to Google Sheets...`);
  let synced = 0;
  let errors = 0;

  for (const p of prospects) {
    const res = await appendProspectToSheet(p);
    if (res.success) synced++;
    else errors++;
  }

  return {
    success: true,
    total: prospects.length,
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
    recordingUrl ? `=HYPERLINK("${recordingUrl}", "▶️ Listen")` : 'No recording',
    callId,
  ];

  // Try webhook first
  const webhookUrl = config.googleSheets.webhookUrl || process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'append_call',
          sheet: config.googleSheets.tabName,
          row,
        }),
      });
      if (res.ok) return { success: true, provider: 'webhook' };
    } catch (e) {}
  }

  // Try API client
  const client = await getSheetsClient();
  if (client) {
    try {
      const range = `${config.googleSheets.tabName}!A:H`;
      const response = await client.spreadsheets.values.append({
        spreadsheetId: config.googleSheets.sheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      });
      return { success: true, updatedRange: response.data.updates?.updatedRange, provider: 'api' };
    } catch (err) {
      console.error('[Google Sheets] Append error:', err.message);
      return { success: false, error: err.message };
    }
  }

  console.log('[Google Sheets Mock Call Log Append]:', row);
  return { mock: true, success: true };
}
