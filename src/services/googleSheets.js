import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

let sheetsClient = null;

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const keyPath = path.resolve(config.googleSheets.serviceAccountPath);
  if (!fs.existsSync(keyPath)) {
    console.warn(`[Google Sheets] Warning: Service account file not found at ${keyPath}. Sheet appends will be logged to console.`);
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheetsClient = google.sheets({ version: 'v4', auth });
    return sheetsClient;
  } catch (err) {
    console.error('[Google Sheets] Auth error:', err.message);
    return null;
  }
}

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
  const client = await getSheetsClient();
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

  if (!client) {
    console.log('[Google Sheets Mock Append]:', row);
    return { mock: true, success: true };
  }

  try {
    const range = `${config.googleSheets.tabName}!A:H`;
    const response = await client.spreadsheets.values.append({
      spreadsheetId: config.googleSheets.sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [row],
      },
    });
    console.log(`[Google Sheets] Appended row to "${config.googleSheets.tabName}" successfully.`);
    return { success: true, updatedRange: response.data.updates?.updatedRange };
  } catch (err) {
    console.error('[Google Sheets] Append error:', err.response?.data || err.message);
    return { success: false, error: err.message };
  }
}
