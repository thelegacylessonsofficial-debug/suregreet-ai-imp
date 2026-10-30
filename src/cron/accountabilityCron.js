import cron from 'node-cron';
import { sendTelegram } from '../services/telegram.js';

export function initAccountabilityCron() {
  const istTimezone = 'Asia/Kolkata';

  // 1. 07:30 AM IST — Morning Kickoff
  cron.schedule(
    '30 7 * * *',
    async () => {
      console.log('[Accountability Cron] Firing Morning Kickoff (07:30 AM IST)...');
      await sendTelegram(
        '🌅 *Good Morning Archit!*\n' +
        '⏰ 07:30 AM IST — School kickoff. Keep your head high. Afternoon study block starts at 2:30 PM.'
      );
    },
    { timezone: istTimezone }
  );

  // 2. 02:30 PM IST — 12th Board Study Block
  cron.schedule(
    '30 14 * * *',
    async () => {
      console.log('[Accountability Cron] Firing 12th Board Study Block (02:30 PM IST)...');
      await sendTelegram(
        '📚 *12th Board Study Block (02:30 PM IST)*\n' +
        'Close agency tabs. Pure 3 hours of academic focus until 5:30 PM!'
      );
    },
    { timezone: istTimezone }
  );

  // 3. 06:30 PM IST — US Outreach Launch
  cron.schedule(
    '30 18 * * *',
    async () => {
      console.log('[Accountability Cron] Firing US Outreach Launch (06:30 PM IST)...');
      await sendTelegram(
        '🚀 *SUREGREET AI US SHIFT (06:30 PM IST / 09:00 AM EST)*\n' +
        'US MedSpas are open! Time for outreach & client acquisition.'
      );
    },
    { timezone: istTimezone }
  );

  console.log('[Cron] Initialized 3 daily Telegram accountability alarms (07:30 AM, 02:30 PM, 06:30 PM IST).');
}
