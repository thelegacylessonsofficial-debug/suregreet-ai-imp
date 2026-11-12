import { Router } from 'express';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { sendEmail } from '../services/mailer.js';
import { sendTelegramHtml } from '../services/telegram.js';
import { createOrUpdateContactFromBooking, createDealForBooking } from '../services/hubspot.js';
import { autoFreezeBookedProspect, recordSupabaseBooking } from '../services/outreachService.js';
import { sendAutomationAlert } from '../services/alertService.js';
import {
  ownerBookingCreatedTemplate,
  customerBookingConfirmedTemplate,
  ownerBookingCancelledTemplate,
  customerBookingCancelledTemplate,
  ownerBookingRescheduledTemplate,
  customerBookingRescheduledTemplate,
} from '../templates/emailTemplates.js';

export const calcomRouter = Router();

calcomRouter.post('/', async (req, res) => {
  const body = req.body || {};
  const triggerEvent = body.triggerEvent || body.event;
  const payload = body.payload || body;

  console.log(`[Cal.com Webhook] Received event: ${triggerEvent}`);

  if (!payload || !payload.attendees) {
    return res.status(200).json({ status: 'ignored', message: 'No attendee payload found' });
  }

  const attendee = payload.attendees?.[0] || {};
  const customerName = attendee.name || 'Client';
  const customerEmail = attendee.email || '';
  const responses = payload.responses || payload.customInputs || {};
  const companyName = responses.company_name || responses['Company Name'] || responses['Clinic Name'] || responses.clinic || '';
  const bottleneckNotes = responses.bottleneck || responses['What is your primary bottleneck?'] || responses.notes || payload.additionalNotes || 'None noted';
  const customerPhone = attendee.phone || responses.phone || 'Not provided';
  const eventTitle = payload.title || payload.eventType?.title || '15-Min Strategy Session';
  const bookingId = payload.bookingId || payload.id;
  const meetingUrl = payload.metadata?.videoCallUrl || payload.location || 'https://meet.google.com/sg-vip-' + Date.now().toString(36);

  const formatDateTime = (iso) => (iso ? DateTime.fromISO(iso).toFormat('dd MMM yyyy, hh:mm a') : '');

  try {
    if (triggerEvent === 'BOOKING_CREATED') {
      const startTime = formatDateTime(payload.startTime || payload.start);
      const endTime = formatDateTime(payload.endTime || payload.end);
      const additionalNotes = bottleneckNotes || payload.additionalNotes || 'None';

      // 1. Email Owner
      await sendEmail({
        to: config.ownerEmail,
        subject: `🗓️ New Booking: ${customerName} (${companyName || 'Lead'}) — ${eventTitle}`,
        html: ownerBookingCreatedTemplate({
          customerName,
          customerEmail,
          customerPhone,
          eventTitle,
          startTime,
          endTime,
          meetingUrl,
          additionalNotes: `Company: ${companyName || 'N/A'} | Bottleneck: ${additionalNotes}`,
          bookingId,
        }),
      });

      // 2. Email Customer
      if (customerEmail) {
        await sendEmail({
          to: customerEmail,
          subject: `✅ Your Appointment is Confirmed — ${eventTitle}`,
          html: customerBookingConfirmedTemplate({
            customerName,
            eventTitle,
            startTime,
            endTime,
            meetingUrl,
            bookingId,
            startTimeISO: payload.startTime || payload.start,
            endTimeISO: payload.endTime || payload.end,
          }),
        });
      }

      // 3. Instant VIP Telegram Push Notification
      try {
        const tgMsg =
          `🗓️ <b>NEW DISCOVERY CALL BOOKED!</b> (Cal.com Calendar-First)\n\n` +
          `🏢 <b>Clinic / Business:</b> ${companyName || 'Not specified'}\n` +
          `👤 <b>Doctor / Lead:</b> ${customerName}\n` +
          `📅 <b>Scheduled Slot:</b> ${startTime} (US EST)\n` +
          `📞 <b>Phone:</b> <code>${customerPhone}</code>\n` +
          `✉️ <b>Email:</b> <code>${customerEmail}</code>\n` +
          `🎯 <b>Bottleneck:</b> ${bottleneckNotes}\n` +
          `🔗 <b>Meeting Link:</b> ${meetingUrl}\n\n` +
          `⚡ <i>Automations: Supabase recorded, cold outreach auto-frozen & CRM deal synced!</i>`;
        await sendTelegramHtml(tgMsg);
      } catch (tgErr) {
        console.warn('[Cal.com Webhook] Telegram push warning:', tgErr.message);
      }

      // 4. Auto-freeze Cold Outreach in Supabase public.prospects
      if (customerEmail) {
        try {
          await autoFreezeBookedProspect(customerEmail, `${eventTitle} on ${startTime}`);
        } catch (freezeErr) {
          console.warn('[Cal.com Webhook] Auto-freeze warning:', freezeErr.message);
        }
      }

      // 5. Record Booking in Supabase public.bookings
      try {
        await recordSupabaseBooking({
          calBookingId: bookingId,
          eventType: eventTitle,
          startTime,
          endTime,
          attendeeName: customerName,
          attendeeEmail: customerEmail,
          attendeePhone: customerPhone,
          status: 'confirmed',
          notes: `Company: ${companyName} | Bottleneck: ${bottleneckNotes}`,
          metadata: { bookingId, eventTitle, meetingUrl, triggerEvent },
        });
      } catch (dbErr) {
        console.warn('[Cal.com Webhook] Supabase booking record warning:', dbErr.message);
      }

      // 6. Sync with HubSpot CRM (Contact + $1,000 Retainer Deal)
      try {
        const contactRes = await createOrUpdateContactFromBooking({
          customerName,
          customerEmail,
          customerPhone,
          companyName,
          bottleneckNotes,
        });

        if (contactRes?.id) {
          await createDealForBooking({
            contactId: contactRes.id,
            customerName,
            companyName,
            bookingTime: startTime,
            amount: 1000,
          });
        }
      } catch (crmErr) {
        console.error('[Cal.com] HubSpot Sync Error:', crmErr.message);
        await sendAutomationAlert({
          automationName: 'HubSpot CRM Sync (Cal.com Booking)',
          action: 'createOrUpdateContactFromBooking',
          error: crmErr,
          payload: { customerName, customerEmail, customerPhone, bookingId, eventTitle },
          severity: 'HIGH',
        });
      }

      return res.status(200).json({ status: 'success', action: 'booking_created', bookingId });
    }

    if (triggerEvent === 'BOOKING_CANCELLED') {
      const startTime = formatDateTime(payload.startTime || payload.start);
      const cancellationReason = payload.cancellationReason || 'No reason provided';

      // 1. Email Owner
      await sendEmail({
        to: config.ownerEmail,
        subject: `❌ Booking Cancelled: ${customerName} — ${eventTitle}`,
        html: ownerBookingCancelledTemplate({
          customerName,
          customerEmail,
          eventTitle,
          startTime,
          cancellationReason,
          bookingId,
        }),
      });

      // 2. Email Customer
      if (customerEmail) {
        await sendEmail({
          to: customerEmail,
          subject: `Booking Cancelled — ${eventTitle}`,
          html: customerBookingCancelledTemplate({
            customerName,
            eventTitle,
            startTime,
          }),
        });
      }

      // 3. Telegram Alert to Founder
      try {
        const cancelMsg =
          `❌ <b>BOOKING CANCELLED</b> (Cal.com)\n\n` +
          `👤 <b>Client:</b> ${customerName} (${customerEmail})\n` +
          `📅 <b>Original Slot:</b> ${startTime}\n` +
          `💬 <b>Reason:</b> ${cancellationReason}\n` +
          `🆔 <b>Booking ID:</b> #${bookingId}`;
        await sendTelegramHtml(cancelMsg);
      } catch (tgErr) {}

      return res.status(200).json({ status: 'success', action: 'booking_cancelled' });
    }

    if (triggerEvent === 'BOOKING_RESCHEDULED') {
      const newStartTime = formatDateTime(payload.startTime || payload.start);
      const newEndTime = formatDateTime(payload.endTime || payload.end);
      const rescheduleReason = payload.rescheduleReason || 'No reason provided';

      // 1. Email Owner
      await sendEmail({
        to: config.ownerEmail,
        subject: `🔄 Booking Rescheduled: ${customerName} — ${eventTitle}`,
        html: ownerBookingRescheduledTemplate({
          customerName,
          customerEmail,
          eventTitle,
          newStartTime,
          newEndTime,
          meetingUrl,
          rescheduleReason,
          bookingId,
        }),
      });

      // 2. Email Customer
      if (customerEmail) {
        await sendEmail({
          to: customerEmail,
          subject: `Your Appointment Has Been Rescheduled — ${eventTitle}`,
          html: customerBookingRescheduledTemplate({
            customerName,
            eventTitle,
            newStartTime,
            newEndTime,
            meetingUrl,
            startTimeISO: payload.startTime || payload.start,
            endTimeISO: payload.endTime || payload.end,
          }),
        });
      }

      // 3. Telegram Alert to Founder
      try {
        const reschedMsg =
          `🔄 <b>BOOKING RESCHEDULED</b> (Cal.com)\n\n` +
          `👤 <b>Client:</b> ${customerName} (${customerEmail})\n` +
          `📅 <b>New Slot:</b> ${newStartTime} — ${newEndTime}\n` +
          `💬 <b>Reason:</b> ${rescheduleReason}\n` +
          `🔗 <b>Meeting Link:</b> ${meetingUrl}`;
        await sendTelegramHtml(reschedMsg);
      } catch (tgErr) {}

      return res.status(200).json({ status: 'success', action: 'booking_rescheduled' });
    }

    return res.status(200).json({ status: 'ignored', message: `Unhandled event: ${triggerEvent}` });
  } catch (err) {
    console.error('[Cal.com Webhook] Error processing webhook:', err);
    await sendAutomationAlert({
      automationName: 'Cal.com Booking Webhook',
      action: triggerEvent || 'UNKNOWN_TRIGGER',
      error: err,
      payload: { bookingId, customerName, customerEmail, triggerEvent },
      severity: 'CRITICAL',
    });
    return res.status(500).json({ status: 'error', error: err.message });
  }
});
