/**
 * Standalone Autonomous Harvey Batch Engine for Trade Contractors
 * - Queries Supabase CRM for trade leads 1 by 1
 * - Runs Harvey Sales Engine (Sub-75 Words . 0 Clichés . $2,000 Ticket Math)
 * - Enforces Pre-Send Quality Gate
 * - Updates Supabase CRM state
 * - Appends to Google Sheets format: [Company | Owner | Phone | City | Full Harvey Email]
 * - Exports local TSV & CSV copies for 1-click clipboard paste
 */

import fs from 'fs';
import path from 'path';
import { runHarveyAutonomousPipeline } from '../src/services/harveyService.js';
import { getProspects, updateProspect } from '../src/services/outreachService.js';
import { appendProspectToSheet, formatProspectsTsv, formatProspectsCsv } from '../src/services/googleSheets.js';

async function main() {
  console.log('====================================================');
  console.log('🚀 SureGreet AI — Autonomous Harvey Trade Lead Engine');
  console.log('====================================================\n');

  // 1. Fetch all prospects
  const allProspects = await getProspects({ limit: 500 });
  const tradeProspects = allProspects.filter((p) => p.niche !== 'medspa');

  console.log(`Found ${tradeProspects.length} trade contractor leads in Supabase CRM.\n`);

  const processed = [];
  let passedCount = 0;

  for (let i = 0; i < tradeProspects.length; i++) {
    const p = tradeProspects[i];
    console.log(`[${i + 1}/${tradeProspects.length}] Processing: ${p.clinic_name} (${p.city || 'US'}) [${p.niche || 'trade'}]...`);

    try {
      const res = await runHarveyAutonomousPipeline({ prospectId: p.id, niche: p.niche });
      const passed = res.passed;
      if (passed) passedCount++;

      console.log(`   -> Quality Gate Score: ${res.audit?.score}/100 (Passed: ${passed})`);
      console.log(`   -> Subject: "${res.draft?.subject}"`);
      console.log(`   -> Word Count: ${res.audit?.wordCount} words`);

      // Sync to Google Sheets format
      const updated = res.prospect || p;
      await appendProspectToSheet(updated);
      processed.push(updated);
    } catch (err) {
      console.error(`   -> Error processing ${p.clinic_name}:`, err.message);
    }
  }

  console.log('\n====================================================');
  console.log(`✅ Completed ${processed.length} trade leads!`);
  console.log(`   Passed Pre-Send Quality Gate: ${passedCount}/${processed.length}`);
  console.log('====================================================\n');

  // 2. Export local TSV and CSV files
  const tsvData = formatProspectsTsv(processed);
  const csvData = formatProspectsCsv(processed);

  const tsvPath = path.resolve('./harvey_trade_leads_google_sheets.tsv');
  const csvPath = path.resolve('./harvey_trade_leads_google_sheets.csv');

  fs.writeFileSync(tsvPath, tsvData, 'utf-8');
  fs.writeFileSync(csvPath, csvData, 'utf-8');

  console.log(`📄 Saved TSV for Google Sheets: ${tsvPath}`);
  console.log(`📄 Saved CSV for Google Sheets: ${csvPath}\n`);

  // Print first 3 rows as preview
  console.log('Preview of Google Sheets rows:');
  console.log('----------------------------------------------------');
  const lines = tsvData.split('\n');
  lines.slice(0, 4).forEach((l) => console.log(l));
  console.log('----------------------------------------------------');
}

main().catch((err) => {
  console.error('Fatal batch error:', err);
  process.exit(1);
});
