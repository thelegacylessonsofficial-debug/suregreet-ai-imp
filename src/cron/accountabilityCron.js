import cron from 'node-cron';
import { sendTelegram } from '../services/telegram.js';
import { sendAutomationAlert } from '../services/alertService.js';

export function initAccountabilityCron() {
  const istTimezone = 'Asia/Kolkata';

  // 1. 07:30 AM IST — Morning Kickoff
  cron.schedule(
    '30 7 * * *',
    async () => {
      try {
        console.log('[Accountability Cron] Firing Morning Kickoff (07:30 AM IST)...');
        await sendTelegram(
          '🌅 *Good Morning Archit!*\n' +
          '⏰ 07:30 AM IST — School kickoff. Keep your head high. Afternoon study block starts at 2:30 PM.'
        );
      } catch (err) {
        console.error('[Accountability Cron] Morning Kickoff failed:', err.message);
        await sendAutomationAlert({
          automationName: 'Telegram Morning Kickoff Alarm',
          action: 'morning_kickoff_0730_IST',
          error: err,
          severity: 'MEDIUM',
        });
      }
    },
    { timezone: istTimezone }
  );

  // 2. 02:30 PM IST — Afternoon Agency Sprint
  cron.schedule(
    '30 14 * * *',
    async () => {
      try {
        console.log('[Accountability Cron] Firing Afternoon Agency Sprint (02:30 PM IST)...');
        await sendTelegram(
          '⚡ *SureGreet AI Afternoon Sprint (02:30 PM IST)*\n\n' +
          'Time to execute: Profile launch, lead finder testing, and Skool pilot post!\n' +
          'Type `/tasks` on Telegram to see your full daily checklist.'
        );
      } catch (err) {
        console.error('[Accountability Cron] Afternoon Sprint failed:', err.message);
        await sendAutomationAlert({
          automationName: 'Telegram Afternoon Sprint Alarm',
          action: 'afternoon_sprint_1430_IST',
          error: err,
          severity: 'MEDIUM',
        });
      }
    },
    { timezone: istTimezone }
  );

  // 3. 06:30 PM IST — US Outreach Launch
  cron.schedule(
    '30 18 * * *',
    async () => {
      try {
        console.log('[Accountability Cron] Firing US Outreach Launch (06:30 PM IST)...');
        await sendTelegram(
          '🚀 *SUREGREET AI US SHIFT (06:30 PM IST / 09:00 AM EST)*\n' +
          'US MedSpas are open! Time for outreach & client acquisition.'
        );
      } catch (err) {
        console.error('[Accountability Cron] Outreach Launch failed:', err.message);
        await sendAutomationAlert({
          automationName: 'Telegram US Outreach Alarm',
          action: 'outreach_launch_1830_IST',
          error: err,
          severity: 'MEDIUM',
        });
      }
    },
    { timezone: istTimezone }
  );

  // 4. Hourly #imp Daily Tasks Accountability Reminder (07:00 AM - 11:00 PM IST)
  cron.schedule(
    '0 7-23 * * *',
    async () => {
      try {
        console.log('[Accountability Cron] Firing Hourly #imp Daily Task Reminder...');
        const hour = new Date().toLocaleTimeString('en-US', { timeZone: istTimezone, hour: '2-digit', minute: '2-digit', hour12: true });
        await sendTelegram(
          `🔔 *HOURLY #IMP DAILY TASK CHECK (${hour} IST)*\n\n` +
          `Archit, Co-Founder here. Status check on your 5 critical priorities:\n` +
          `1. 🎙️ Fix Retell Voice check & production-ready\n` +
          `2. 🌐 SureGreet website production-ready\n` +
          `3. 💡 Ideas for demo video & organic content\n` +
          `4. 🏥 Demo MedSpa website build\n` +
          `5. 📚 Learn sales for min 4 hours\n\n` +
          `Type your progress or /tasks right now!`
        );
      } catch (err) {
        console.error('[Accountability Cron] Hourly check failed:', err.message);
      }
    },
    { timezone: istTimezone }
  );

  console.log('[Cron] Initialized daily + hourly Telegram accountability alarms.');
}
