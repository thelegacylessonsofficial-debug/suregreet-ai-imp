import cron from 'node-cron';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { getCalAcceptedBookings } from '../services/calcom.js';
import { sendEmail } from '../services/mailer.js';
import { sendAutomationAlert } from '../services/alertService.js';
import { customerReminderTemplate, ownerDailySummaryTemplate } from '../templates/emailTemplates.js';

export async function runDailyReminders() {
  console.log('[Cron] Running Daily 24h Reminders check...');
  const usZone = config.timezone;
  const nowUS = DateTime.now().setZone(usZone);
  const tomorrowUS = nowUS.plus({ days: 1 });
  const tomorrowDateStr = tomorrowUS.toFormat('yyyy-MM-dd');

  console.log(`[Cron] Target tomorrow date (${usZone}): ${tomorrowDateStr}`);

  const bookings = await getCalAcceptedBookings();
  const tomorrowBookings = [];

  for (const b of bookings) {
    if (!b || (!b.startTime && !b.start)) continue;

    const rawStart = b.startTime || b.start;
    const rawEnd = b.endTime || b.end;
    const bookingStartUS = DateTime.fromISO(rawStart).setZone(usZone);
    const bookingEndUS = DateTime.fromISO(rawEnd).setZone(usZone);

    if (bookingStartUS.toFormat('yyyy-MM-dd') === tomorrowDateStr) {
      const attendee = b.attendees?.[0] || {};
      tomorrowBookings.push({
        bookingId: b.id || b.bookingId,
        title: b.title || b.eventType?.title || 'Discovery Call',
        startTime: bookingStartUS.toFormat('dd LLL yyyy, hh:mm a') + ' EST/EDT',
        endTime: bookingEndUS.toFormat('hh:mm a') + ' EST/EDT',
        attendeeName: attendee.name || 'Client',
        attendeeEmail: attendee.email || '',
        meetingUrl: b.metadata?.videoCallUrl || b.location || 'Video Call Link will be provided',
      });
    }
  }

  console.log(`[Cron] Found ${tomorrowBookings.length} booking(s) for tomorrow.`);

  if (tomorrowBookings.length === 0) {
    console.log('[Cron] No appointments scheduled for tomorrow. No emails needed.');
    return { count: 0 };
  }

  // 1. Send individual reminders to clients
  for (const item of tomorrowBookings) {
    if (item.attendeeEmail) {
      await sendEmail({
        to: item.attendeeEmail,
        subject: `⏰ Reminder: Your appointment tomorrow — ${item.title}`,
        html: customerReminderTemplate(item),
      });
    }
  }

  // 2. Send agenda summary email to owner
  await sendEmail({
    to: config.ownerEmail,
    subject: `📋 Tomorrow's Schedule (US Clients) — ${tomorrowBookings.length} appointment(s)`,
    html: ownerDailySummaryTemplate({
      appointmentCount: tomorrowBookings.length,
      bookings: tomorrowBookings,
    }),
  });

  console.log(`[Cron] Sent ${tomorrowBookings.length} client reminder(s) and owner summary email.`);
  return { count: tomorrowBookings.length };
}

export function initReminderCron() {
  // Cron schedule: 9:00 AM every day
  // Syntax: minute (0) hour (9) day-of-month (*) month (*) day-of-week (*)
  cron.schedule(
    '0 9 * * *',
    async () => {
      try {
        await runDailyReminders();
      } catch (err) {
        console.error('[Cron] Error during daily reminders job:', err);
        await sendAutomationAlert({
          automationName: 'Cal.com 24h Daily Reminders Cron',
          action: 'runDailyReminders',
          error: err,
          payload: { cronSchedule: '0 9 * * *', timezone: config.timezone },
          severity: 'HIGH',
        });
      }
    },
    {
      timezone: config.timezone,
    }
  );

  console.log(`[Cron] Scheduled 24h Daily Reminders for 09:00 AM (${config.timezone}) every day.`);
}
