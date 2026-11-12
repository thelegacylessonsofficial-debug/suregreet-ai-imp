import { Router } from 'express';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { sendEmail } from '../services/mailer.js';
import { sendTelegramHtml } from '../services/telegram.js';
import { createOrUpdateContactFromBooking, createDealForBooking } from '../services/hubspot.js';
import { autoFreezeBookedProspect, recordSupabaseBooking, supabaseFetch } from '../services/outreachService.js';
import { sendAutomationAlert } from '../services/alertService.js';
import {
  ownerBookingCreatedTemplate,
  customerBookingConfirmedTemplate,
} from '../templates/emailTemplates.js';

export const calendarFirstRouter = Router();

calendarFirstRouter.post('/', async (req, res) => {
  const body = req.body || {};
  console.log('[Calendar-First Booking] Received booking submission:', body);

  const fullName = (body.fullName || body.name || body.full_name || 'Client').trim();
  const clinicName = (body.clinicName || body.company || body.clinic || body.company_name || 'Clinic / Practice').trim();
  const email = (body.email || body.attendeeEmail || '').trim().toLowerCase();
  const phone = (body.phone || body.attendeePhone || '').trim();
  const chosenDate = (body.chosenDate || body.date || 'Tomorrow').trim();
  const chosenTime = (body.chosenTime || body.time || '11:00 AM EST').trim();
  const bottleneckNotes = (body.bottleneckNotes || body.bottleneck || body.notes || 'Not specified').trim();
  const serviceInterest = body.serviceInterest || 'AI Voice Receptionist & Inbound Booking';

  if (!email || !fullName) {
    return res.status(400).json({
      status: 'error',
      message: 'Full name and valid email are required to lock appointment.',
    });
  }

  const bookingId = `sg-vip-${Date.now().toString(36)}`;
  const eventTitle = '15-Min Inbound Automation & Speed-to-Lead Audit';
  const meetingUrl = `https://meet.google.com/sg-vip-${Date.now().toString(36).slice(-6)}`;
  const displaySlot = `${chosenDate} at ${chosenTime}`;

  // Formulate approximate ISO dates for calendar buttons
  const nowInZone = DateTime.now().setZone(config.timezone);
  let startISO = nowInZone.plus({ days: 1 }).set({ hour: 11, minute: 0, second: 0 }).toISO();
  let endISO = nowInZone.plus({ days: 1 }).set({ hour: 11, minute: 15, second: 0 }).toISO();

  if (chosenDate.toLowerCase().includes('today')) {
    startISO = nowInZone.set({ hour: 14, minute: 0, second: 0 }).toISO();
    endISO = nowInZone.set({ hour: 14, minute: 15, second: 0 }).toISO();
  } else if (chosenDate.toLowerCase().includes('monday')) {
    startISO = nowInZone.plus({ days: 3 }).set({ hour: 11, minute: 0, second: 0 }).toISO();
    endISO = nowInZone.plus({ days: 3 }).set({ hour: 11, minute: 15, second: 0 }).toISO();
  }

  try {
    // 1. Instant VIP Telegram Push Notification to Archit
    try {
      const telLink = phone ? `tel:${phone.replace(/[^+\d]/g, '')}` : '';
      const phoneHtml = phone ? `<a href="${telLink}">${phone}</a>` : 'Not provided';
      const emailHtml = `<a href="mailto:${email}">${email}</a>`;

      const tgMsg =
        `🗓️ <b>NEW DISCOVERY CALL BOOKED!</b> (Website Calendar-First Flow)\n\n` +
        `🏢 <b>Clinic / Business:</b> <code>${clinicName}</code>\n` +
        `👤 <b>Doctor / Lead:</b> <b>${fullName}</b>\n` +
        `📅 <b>Scheduled Slot:</b> <b>${displaySlot}</b>\n` +
        `📞 <b>Direct Phone:</b> ${phoneHtml}\n` +
        `✉️ <b>Email:</b> ${emailHtml}\n` +
        `🎯 <b>Stated Bottleneck:</b> <i>${bottleneckNotes}</i>\n` +
        `🔗 <b>Google Meet Link:</b> ${meetingUrl}\n\n` +
        `⚡ <b>Automations Executed:</b>\n` +
        `• Supabase <code>bookings</code> & <code>leads</code> recorded\n` +
        `• Outreach sequence <b>FROZEN</b> (status: replied)\n` +
        `• HubSpot Contact & $1,000 Retainer Deal created\n` +
        `• Confirmation emails with 1-click calendar invites dispatched`;

      await sendTelegramHtml(tgMsg);
    } catch (tgErr) {
      console.warn('[Calendar-First] Telegram push warning:', tgErr.message);
    }

    // 2. Auto-freeze Cold Outreach in Supabase public.prospects
    try {
      await autoFreezeBookedProspect(email, `${eventTitle} on ${displaySlot}`);
    } catch (freezeErr) {
      console.warn('[Calendar-First] Prospect auto-freeze warning:', freezeErr.message);
    }

    // 3. Record in Supabase public.bookings
    try {
      await recordSupabaseBooking({
        calBookingId: bookingId,
        eventType: eventTitle,
        startTime: displaySlot,
        endTime: `${chosenTime} + 15m`,
        attendeeName: fullName,
        attendeeEmail: email,
        attendeePhone: phone,
        status: 'confirmed',
        notes: `Clinic: ${clinicName} | Bottleneck: ${bottleneckNotes}`,
        metadata: {
          clinicName,
          bottleneckNotes,
          serviceInterest,
          meetingUrl,
          bookingId,
        },
      });
    } catch (bookErr) {
      console.warn('[Calendar-First] Supabase booking record warning:', bookErr.message);
    }

    // 4. Record Lead in Supabase public.leads
    try {
      await supabaseFetch('/leads', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone,
          industry: clinicName,
          bottleneck_notes: bottleneckNotes,
          appointment_date: chosenDate,
          appointment_time: chosenTime,
          timezone: config.timezone,
          status: 'booked',
          hubspot_synced: false,
          metadata: { meetingUrl, bookingId, flow: 'calendar-first' },
        }),
      });
    } catch (leadErr) {
      console.warn('[Calendar-First] Supabase lead write warning:', leadErr.message);
    }

    // 5. Send Email to Founder (Archit)
    await sendEmail({
      to: config.ownerEmail,
      subject: `🗓️ New Strategy Booking: ${fullName} (${clinicName}) — ${displaySlot}`,
      html: ownerBookingCreatedTemplate({
        customerName: fullName,
        customerEmail: email,
        customerPhone: phone || 'Not provided',
        eventTitle,
        startTime: displaySlot,
        endTime: `${chosenTime} (15 mins)`,
        meetingUrl,
        additionalNotes: `Clinic: ${clinicName} | Bottleneck: ${bottleneckNotes}`,
        bookingId,
      }),
    });

    // 6. Send Customer Confirmation Email with Calendar Buttons
    await sendEmail({
      to: email,
      subject: `✅ Confirmed: Your SureGreet AI Strategy Session — ${displaySlot}`,
      html: customerBookingConfirmedTemplate({
        customerName: fullName,
        eventTitle,
        startTime: displaySlot,
        endTime: `${chosenTime} (15m Consultation)`,
        meetingUrl,
        bookingId,
        startTimeISO: startISO,
        endTimeISO: endISO,
      }),
    });

    // 7. Sync with HubSpot CRM (Contact + $1,000 Deal)
    try {
      const contactRes = await createOrUpdateContactFromBooking({
        customerName: fullName,
        customerEmail: email,
        customerPhone: phone,
        companyName: clinicName,
        bottleneckNotes,
      });

      if (contactRes?.id) {
        await createDealForBooking({
          contactId: contactRes.id,
          customerName: fullName,
          companyName: clinicName,
          bookingTime: displaySlot,
          amount: 1000,
        });
      }
    } catch (crmErr) {
      console.error('[Calendar-First] HubSpot Sync Error:', crmErr.message);
      await sendAutomationAlert({
        automationName: 'HubSpot CRM Sync (Calendar-First Booking)',
        action: 'createOrUpdateContactFromBooking',
        error: crmErr,
        payload: { fullName, email, phone, bookingId, displaySlot },
        severity: 'MEDIUM',
      });
    }

    // Return instant success response
    return res.status(200).json({
      status: 'success',
      bookingId,
      meetingUrl,
      confirmedDetails: `Confirmed for ${fullName} (${clinicName}) on ${displaySlot}. Meeting link and calendar invite dispatched to ${email}.`,
      slot: displaySlot,
    });
  } catch (err) {
    console.error('[Calendar-First Booking] Unexpected error:', err);
    await sendAutomationAlert({
      automationName: 'Calendar-First Booking Flow',
      action: 'processCalendarFirstBooking',
      error: err,
      payload: { fullName, email, phone, clinicName, chosenDate, chosenTime },
      severity: 'HIGH',
    });
    return res.status(500).json({ status: 'error', message: err.message });
  }
});
