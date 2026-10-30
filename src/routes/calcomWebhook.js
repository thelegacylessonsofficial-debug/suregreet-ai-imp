import { Router } from 'express';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { sendEmail } from '../services/mailer.js';
import { createOrUpdateContactFromBooking } from '../services/hubspot.js';
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
  const customerPhone = attendee.phone || 'Not provided';
  const eventTitle = payload.title || payload.eventType?.title || 'Discovery Call';
  const bookingId = payload.bookingId || payload.id;
  const meetingUrl = payload.metadata?.videoCallUrl || payload.location || 'Video Call Link will be provided';

  const formatDateTime = (iso) => (iso ? DateTime.fromISO(iso).toFormat('dd MMM yyyy, hh:mm a') : '');

  try {
    if (triggerEvent === 'BOOKING_CREATED') {
      const startTime = formatDateTime(payload.startTime || payload.start);
      const endTime = formatDateTime(payload.endTime || payload.end);
      const additionalNotes = payload.additionalNotes || 'None';

      // 1. Email Owner
      await sendEmail({
        to: config.ownerEmail,
        subject: `🗓️ New Booking: ${customerName} — ${eventTitle}`,
        html: ownerBookingCreatedTemplate({
          customerName,
          customerEmail,
          customerPhone,
          eventTitle,
          startTime,
          endTime,
          meetingUrl,
          additionalNotes,
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
          }),
        });
      }

      // 3. Sync with HubSpot CRM
      await createOrUpdateContactFromBooking({
        customerName,
        customerEmail,
        customerPhone,
      });

      return res.status(200).json({ status: 'success', action: 'booking_created' });
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
          }),
        });
      }

      return res.status(200).json({ status: 'success', action: 'booking_rescheduled' });
    }

    return res.status(200).json({ status: 'ignored', message: `Unhandled event: ${triggerEvent}` });
  } catch (err) {
    console.error('[Cal.com Webhook] Error processing webhook:', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
});
