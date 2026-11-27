import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { formatSalutation } from '../templates/outreachTemplates.js';

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
 * Exact Row Format: [Company | Owner | Phone | City | Full Harvey Email]
 * Supports both Google Apps Script Webhook and Google Sheets API v4
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
  const qualScore = prospect.qual_score !== undefined && prospect.qual_score !== null ? `${prospect.qual_score}/100 (${prospect.qual_grade || ''})` : 'Legacy';

  // Exact 5 columns requested by Archit: [Company | Owner | Phone | City | Full Harvey Email]
  // followed by contact email, website, date added, and qualification rate score
  const row = [
    company,
    owner,
    phone,
    city,
    fullHarveyEmail,
    email,
    website,
    dateAdded,
    qualScore,
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
        console.log(`[Google Sheets:Webhook] Synced prospect ${prospect.email || company} to sheet successfully.`);
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
      const range = `${config.googleSheets.leadsTabName}!A:I`;
      const response = await client.spreadsheets.values.append({
        spreadsheetId: config.googleSheets.sheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      });
      console.log(`[Google Sheets:API] Appended lead "${company}" to "${config.googleSheets.leadsTabName}" successfully.`);
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
 * Format prospects for direct 1-click clipboard paste into Google Sheets (TSV format)
 * Columns: [Company | Owner | Phone | City | Full Harvey Email]
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
  const header = ['Company', 'Owner', 'Phone', 'City', 'Full Harvey Email', 'Email', 'Website', 'Date Added', 'Qual Score', 'Reviews'].map(escapeCsv).join(',');
  const rows = prospects.map((p) => {
    const company = p.clinic_name || p.clinicName || '';
    const owner = formatSalutation(p.doctor_name || p.doctorName, company, p.niche || 'hvac');
    const phone = p.phone || 'N/A';
    const city = p.city || '';
    const emailDraft = p.harvey_draft || p.email_body || '';
    const email = p.email || '';
    const website = p.website_url || p.url || '';
    const dateAdded = new Date().toLocaleDateString('en-US');
    const qualScore = p.qual_score !== undefined && p.qual_score !== null ? `${p.qual_score}/100 (${p.qual_grade || ''})` : 'Legacy';
    const reviews = p.review_count ? `${p.review_count}${p.google_rating ? ` (${p.google_rating}★)` : ''}` : '';
    return [company, owner, phone, city, emailDraft, email, website, dateAdded, qualScore, reviews].map(escapeCsv).join(',');
  });
  return [header, ...rows].join('\n');
}

/**
 * Batch synchronize an array of prospects to Google Sheets
 */
export async function syncAllProspectsToSheet(prospects = []) {
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return { success: false, message: 'No prospects to synchronize' };
  }

  // Filter to trade contractor prospects
  const tradeProspects = prospects.filter((p) => p.niche !== 'medspa');
  const targetList = tradeProspects.length > 0 ? tradeProspects : prospects;

  console.log(`[Google Sheets] Synchronizing ${targetList.length} prospects to Google Sheets...`);
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
