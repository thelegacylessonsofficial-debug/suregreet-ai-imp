import cron from 'node-cron';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { getDueProspects, sendOutreachStep } from '../services/outreachService.js';
import { sendAutomationAlert } from '../services/alertService.js';
import { sendTelegram } from '../services/telegram.js';

let isQueueProcessing = false;

/**
 * Checks whether the current time in US Eastern Time is within safe B2B sending hours:
 * Monday through Friday, 9:00 AM – 4:30 PM EST
 */
export function isWithinSendingWindow() {
  const now = DateTime.now().setZone(config.timezone);
  const weekday = now.weekday; // 1 = Monday, 5 = Friday, 6 = Saturday, 7 = Sunday
  const hour = now.hour;
  const minute = now.minute;

  // Weekdays only
  if (weekday < 1 || weekday > 5) {
    return false;
  }

  // 9:00 AM (09:00) to 4:30 PM (16:30)
  if (hour < 9) return false;
  if (hour > 16) return false;
  if (hour === 16 && minute > 30) return false;

  return true;
}

/**
 * Process due prospects in the outreach queue with randomized jitter
 */
export async function runOutreachQueueWorker({ force = false } = {}) {
  if (isQueueProcessing) {
    console.log('[Outreach Worker] Another worker instance is currently running. Skipping.');
    return { status: 'already_running' };
  }

  const nowEST = DateTime.now().setZone(config.timezone);

  if (!force && !isWithinSendingWindow()) {
    console.log(
      `[Outreach Worker] Outside US business sending window (Mon-Fri 9:00 AM - 4:30 PM EST). Current time: ${nowEST.toFormat(
        'ccc, LLL dd, hh:mm a'
      )} EST. Sleeping.`
    );
    return { status: 'outside_window', currentEST: nowEST.toISO() };
  }

  isQueueProcessing = true;
  console.log(`[Outreach Worker] Active sending window verified (${nowEST.toFormat('ccc, hh:mm a')} EST). Querying due prospects...`);

  try {
    // Process up to 5 prospects per tick to protect email domain health
    const dueProspects = await getDueProspects(5);

    if (dueProspects.length === 0) {
      console.log('[Outreach Worker] No prospects currently due for follow-up.');
      isQueueProcessing = false;
      return { status: 'no_prospects_due', processedCount: 0 };
    }

    console.log(`[Outreach Worker] Found ${dueProspects.length} prospect(s) due. Beginning sequential send with jitter...`);

    let processedCount = 0;
    const results = [];

    for (let i = 0; i < dueProspects.length; i++) {
      const prospect = dueProspects[i];
      const nextStep = (prospect.current_step || 0) + 1;

      if (nextStep > 4) {
        continue;
      }

      // Apply randomized sending jitter (30 to 90 seconds in production, 2s if forced in testing)
      if (i > 0) {
        const jitterSeconds = force ? 2 : Math.floor(Math.random() * (90 - 30 + 1) + 30);
        console.log(`[Outreach Worker] Jitter wait of ${jitterSeconds}s before sending to ${prospect.email}...`);
        await new Promise((resolve) => setTimeout(resolve, jitterSeconds * 1000));
      }

      console.log(`[Outreach Worker] Dispatching Step ${nextStep} to ${prospect.email} (${prospect.clinic_name || 'Clinic'})...`);

      const dispatchResult = await sendOutreachStep({
        prospectId: prospect.id,
        stepNumber: nextStep,
      });

      if (dispatchResult.success) {
        processedCount++;
        results.push({
          id: prospect.id,
          email: prospect.email,
          step: nextStep,
          status: 'dispatched',
          nextDueAt: dispatchResult.prospect?.next_due_at,
        });

        // Notify Telegram of automated follow-up dispatch
        await sendTelegram(
          `📤 <b>Outreach Dispatched (Step ${nextStep}/4)</b>\n\nClinic: <b>${prospect.clinic_name || 'N/A'}</b>\nDoctor: ${prospect.doctor_name || 'N/A'}\nEmail: <code>${prospect.email}</code>\nNext Due: ${dispatchResult.prospect?.next_due_at ? DateTime.fromISO(dispatchResult.prospect.next_due_at).setZone(config.timezone).toFormat('LLL dd, hh:mm a') + ' EST' : 'Completed'}`
        );
      } else {
        console.error(`[Outreach Worker] Failed dispatching to ${prospect.email}:`, dispatchResult.error);
        results.push({
          id: prospect.id,
          email: prospect.email,
          step: nextStep,
          status: 'failed',
          error: dispatchResult.error,
        });
      }
    }

    console.log(`[Outreach Worker] Queue batch finished. Sent ${processedCount} email(s).`);
    isQueueProcessing = false;
    return { status: 'completed', processedCount, results };
  } catch (err) {
    isQueueProcessing = false;
    console.error('[Outreach Worker] Fatal error in queue processor:', err);
    await sendAutomationAlert({
      automationName: 'Outreach Automated Queue Worker',
      action: 'runOutreachQueueWorker',
      error: err,
      severity: 'HIGH',
    });
    return { status: 'error', message: err.message };
  }
}

/**
 * Initialize 15-minute Cron Queue Worker
 */
export function initOutreachCron() {
  // Run every 15 minutes
  cron.schedule(
    '*/15 * * * *',
    async () => {
      try {
        await runOutreachQueueWorker({ force: false });
      } catch (err) {
        console.error('[Outreach Cron] Error in cron execution:', err);
      }
    },
    {
      timezone: config.timezone,
    }
  );

  console.log(`[Cron] Initialized Outreach Queue Worker (Runs every 15 mins, Mon-Fri 9:00 AM - 4:30 PM EST).`);
}
