import cron from 'node-cron';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { getCalAcceptedBookings } from '../services/calcom.js';
import { sendEmail } from '../services/mailer.js';
import { sendAutomationAlert } from '../services/alertService.js';
import {
  customerReminderTemplate,
  ownerDailySummaryTemplate,
  customerOneHourReminderTemplate,
} from '../templates/emailTemplates.js';

// Cache to prevent duplicate 1-hour reminders
const sentOneHourCache = new Set();

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
        startTimeISO: rawStart,
        endTimeISO: rawEnd,
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

export async function runHourlyOneHourReminders() {
  console.log('[Cron] Running Hourly 1h Urgent Reminders check...');
  const now = DateTime.utc();

  const bookings = await getCalAcceptedBookings();
  let sentCount = 0;

  for (const b of bookings) {
    if (!b || (!b.startTime && !b.start)) continue;

    const rawStart = b.startTime || b.start;
    const bookingStart = DateTime.fromISO(rawStart).toUTC();
    const minutesUntilStart = bookingStart.diff(now, 'minutes').minutes;

    const bookingId = String(b.id || b.bookingId);

    // Target meetings starting between 45 and 75 minutes from now
    if (minutesUntilStart >= 45 && minutesUntilStart <= 75) {
      if (sentOneHourCache.has(bookingId)) {
        continue;
      }

      const attendee = b.attendees?.[0] || {};
      const attendeeEmail = attendee.email || '';
      const attendeeName = attendee.name || 'Client';
      const title = b.title || b.eventType?.title || 'Discovery Call';
      const meetingUrl = b.metadata?.videoCallUrl || b.location || 'Video Call Link will be provided';
      const formattedTime = DateTime.fromISO(rawStart).setZone(config.timezone).toFormat('hh:mm a') + ' EST';

      if (attendeeEmail) {
        await sendEmail({
          to: attendeeEmail,
          subject: `🔔 Starting in 60 Minutes: ${title}`,
          html: customerOneHourReminderTemplate({
            attendeeName,
            title,
            meetingUrl,
            startTime: formattedTime,
          }),
        });

        sentOneHourCache.add(bookingId);
        sentCount++;
        console.log(`[Cron:1h] Dispatched 60-min reminder to ${attendeeEmail} for booking #${bookingId}`);
      }
    }
  }

  return { checked: bookings.length, sentCount };
}

export function initReminderCron() {
  // 1. Daily 24h Reminder Cron at 09:00 AM EST every day
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

  // 2. Hourly 1h Urgent Reminder Cron at minute 15 of every hour
  cron.schedule(
    '15 * * * *',
    async () => {
      try {
        await runHourlyOneHourReminders();
      } catch (err) {
        console.error('[Cron] Error during 1h reminder job:', err);
        await sendAutomationAlert({
          automationName: 'Cal.com 1h Urgent Reminders Cron',
          action: 'runHourlyOneHourReminders',
          error: err,
          severity: 'MEDIUM',
        });
      }
    }
  );

  console.log(`[Cron] Initialized 24h reminders (09:00 AM EST) and 1h reminders (every hour :15).`);
}
