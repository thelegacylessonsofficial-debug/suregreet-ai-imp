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

/**
 * Normalize Cal.com v1/v2 booking fields safely for reminders.
 */
export function normalizeCalBooking(b, usZone = config.timezone) {
  if (!b) return null;
  const rawStart = b.start || b.startTime;
  if (!rawStart) return null;

  const startDT = DateTime.fromISO(rawStart);
  if (!startDT.isValid) return null;

  const rawEnd = b.end || b.endTime;
  const endDT = rawEnd ? DateTime.fromISO(rawEnd) : startDT.plus({ minutes: 15 });
  const bookingStartUS = startDT.setZone(usZone);
  const bookingEndUS = (endDT.isValid ? endDT : startDT.plus({ minutes: 15 })).setZone(usZone);
  const attendee = b.attendees?.[0] || {};

  return {
    bookingId: b.id || b.bookingId || b.uid,
    title: b.title || b.eventType?.title || 'Discovery Call',
    rawStart,
    rawEnd: rawEnd || endDT.toISO(),
    startUTC: startDT.toUTC(),
    bookingStartUS,
    startTime: bookingStartUS.toFormat('dd LLL yyyy, hh:mm a') + ' EST/EDT',
    endTime: bookingEndUS.toFormat('hh:mm a') + ' EST/EDT',
    shortStartTime: bookingStartUS.toFormat('hh:mm a') + ' EST/EDT',
    attendeeName: attendee.name || 'Client',
    attendeeEmail: attendee.email || '',
    meetingUrl: b.meetingUrl || b.metadata?.videoCallUrl || b.location || 'Video Call Link will be provided',
  };
}

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
    const norm = normalizeCalBooking(b, usZone);
    if (!norm) continue;

    if (norm.bookingStartUS.toFormat('yyyy-MM-dd') === tomorrowDateStr) {
      tomorrowBookings.push({
        bookingId: norm.bookingId,
        title: norm.title,
        startTime: norm.startTime,
        endTime: norm.endTime,
        attendeeName: norm.attendeeName,
        attendeeEmail: norm.attendeeEmail,
        meetingUrl: norm.meetingUrl,
        startTimeISO: norm.rawStart,
        endTimeISO: norm.rawEnd,
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
      const cRes = await sendEmail({
        to: item.attendeeEmail,
        subject: `⏰ Reminder: Your appointment tomorrow — ${item.title}`,
        html: customerReminderTemplate(item),
      });
      if (!cRes?.success) {
        console.warn(`[Cron:24h] Failed sending reminder to ${item.attendeeEmail}:`, cRes?.error);
      }
    }
  }

  // 2. Send agenda summary email to owner
  const ownerRes = await sendEmail({
    to: config.ownerEmail,
    subject: `📋 Tomorrow's Schedule (US Clients) — ${tomorrowBookings.length} appointment(s)`,
    html: ownerDailySummaryTemplate({
      appointmentCount: tomorrowBookings.length,
      bookings: tomorrowBookings,
    }),
  });
  if (!ownerRes?.success) {
    console.warn('[Cron:24h] Failed sending owner summary email:', ownerRes?.error);
  }

  console.log(`[Cron] Sent ${tomorrowBookings.length} client reminder(s) and owner summary email.`);
  return { count: tomorrowBookings.length };
}

export async function runHourlyOneHourReminders() {
  console.log('[Cron] Running Hourly 1h Urgent Reminders check...');
  const now = DateTime.utc();

  const bookings = await getCalAcceptedBookings();
  let sentCount = 0;

  for (const b of bookings) {
    const norm = normalizeCalBooking(b, config.timezone);
    if (!norm) continue;

    const minutesUntilStart = norm.startUTC.diff(now, 'minutes').minutes;
    const bookingId = String(norm.bookingId);

    // Target meetings starting between 45 and 75 minutes from now
    if (minutesUntilStart >= 45 && minutesUntilStart <= 75) {
      if (sentOneHourCache.has(bookingId)) {
        continue;
      }

      if (norm.attendeeEmail) {
        const mailRes = await sendEmail({
          to: norm.attendeeEmail,
          subject: `🔔 Starting in 60 Minutes: ${norm.title}`,
          html: customerOneHourReminderTemplate({
            attendeeName: norm.attendeeName,
            title: norm.title,
            meetingUrl: norm.meetingUrl,
            startTime: norm.shortStartTime,
          }),
        });

        if (mailRes?.success) {
          sentOneHourCache.add(bookingId);
          sentCount++;
          console.log(`[Cron:1h] Dispatched 60-min reminder to ${norm.attendeeEmail} for booking #${bookingId}`);
        } else {
          console.warn(`[Cron:1h] Failed 60-min reminder to ${norm.attendeeEmail}:`, mailRes?.error);
        }
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
