export function customerReminderTemplate({ attendeeName, title, startTime, endTime, meetingUrl }) {
  return `<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1.0'></head><body style='margin:0;padding:0;background-color:#f4f1ec;font-family:Georgia,serif;'>
<table role='presentation' width='100%' cellspacing='0' cellpadding='0' style='background-color:#f4f1ec;'>
  <tr>
    <td align='center' style='padding:40px 20px;'>
      <table role='presentation' width='600' cellspacing='0' cellpadding='0' style='background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);'>
        <tr>
          <td style='background:linear-gradient(135deg,#f59e0b,#d97706,#b45309);padding:48px 40px;text-align:center;'>
            <div style='width:64px;height:64px;background-color:rgba(255,255,255,0.2);border-radius:50%;margin:0 auto 20px;line-height:64px;font-size:28px;'>⏰</div>
            <h1 style='margin:0;color:#ffffff;font-size:28px;font-weight:700;'>Appointment Reminder</h1>
            <p style='margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:15px;'>Your upcoming meeting is scheduled for tomorrow</p>
          </td>
        </tr>
        <tr>
          <td style='padding:40px;'>
            <h2 style='margin:0 0 24px;color:#1a1a1a;font-size:22px;'>Hi ${attendeeName} 👋</h2>
            <p style='margin:0 0 32px;color:#555;font-size:16px;line-height:1.7;'>This is a friendly reminder that we have a meeting scheduled for <strong>tomorrow</strong>. Looking forward to speaking with you!</p>
            <table role='presentation' width='100%' cellspacing='0' cellpadding='0' style='background-color:#fffbeb;border-radius:12px;border:1px solid #fde68a;'>
              <tr>
                <td style='padding:28px;'>
                  <p style='margin:0 0 4px;color:#92400e;font-size:11px;font-weight:600;text-transform:uppercase;'>Meeting</p>
                  <p style='margin:0 0 16px;color:#1a1a1a;font-size:17px;font-weight:600;'>${title}</p>
                  <p style='margin:0 0 4px;color:#92400e;font-size:11px;font-weight:600;text-transform:uppercase;border-top:1px solid #fde68a;padding-top:16px;'>Date & Time (US Time)</p>
                  <p style='margin:0 0 16px;color:#1a1a1a;font-size:17px;font-weight:600;'>${startTime} – ${endTime}</p>
                  <p style='margin:0 0 4px;color:#92400e;font-size:11px;font-weight:600;text-transform:uppercase;border-top:1px solid #fde68a;padding-top:16px;'>Meeting Link</p>
                  <p style='margin:0;font-size:15px;'><a href='${meetingUrl}' style='color:#d97706;text-decoration:underline;font-weight:600;'>${meetingUrl}</a></p>
                </td>
              </tr>
            </table>
            <div style='background-color:#fef3c7;border-radius:10px;padding:18px 24px;border-left:4px solid #f59e0b;margin-top:24px;'>
              <p style='margin:0;color:#92400e;font-size:14px;line-height:1.6;'><strong>💡 Need to reschedule?</strong> Please let us know ahead of time or use the rescheduling link in your original booking email.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style='padding:0 40px 40px;'>
            <div style='border-top:1px solid #e5e5e5;padding-top:24px;text-align:center;'>
              <p style='margin:0 0 4px;color:#999;font-size:13px;'>Best regards,</p>
              <p style='margin:0;color:#1a1a1a;font-size:15px;font-weight:700;'>Nexflo AI</p>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table></body></html>`;
}

export function ownerDailySummaryTemplate({ appointmentCount, bookings }) {
  let tableRows = '';
  for (const b of bookings) {
    tableRows += `<tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;">${b.title || 'Meeting'}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;color:#555;">${b.attendeeName || 'Client'}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;color:#555;">${b.attendeeEmail || ''}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;color:#555;">${b.startTime || ''}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;"><a href="${b.meetingUrl || '#'}" style="color:#d97706;">${b.meetingUrl || 'Link'}</a></td>
    </tr>`;
  }

  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:700px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:40px;text-align:center;border-radius:12px 12px 0 0;">
      <h1 style="color:#fff;margin:0;font-size:26px;">📋 Tomorrow's US Client Schedule</h1>
      <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;">${appointmentCount} appointment(s) confirmed</p>
    </div>
    <div style="padding:32px;background:#fff;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
      <p style="color:#555;margin:0 0 24px;">Reminder emails have been sent to each attendee in their US timezone.</p>
      <table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:#fffbeb;">
            <th style="padding:14px 16px;text-align:left;color:#92400e;font-size:12px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #fde68a;">Meeting</th>
            <th style="padding:14px 16px;text-align:left;color:#92400e;font-size:12px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #fde68a;">Client</th>
            <th style="padding:14px 16px;text-align:left;color:#92400e;font-size:12px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #fde68a;">Email</th>
            <th style="padding:14px 16px;text-align:left;color:#92400e;font-size:12px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #fde68a;">Time (US)</th>
            <th style="padding:14px 16px;text-align:left;color:#92400e;font-size:12px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #fde68a;">Link</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div style="background:#fef3c7;border-radius:10px;padding:16px 20px;border-left:4px solid #f59e0b;margin-top:24px;">
        <p style="margin:0;color:#92400e;font-size:13px;"><strong>✅ Status:</strong> All ${appointmentCount} reminder email(s) sent successfully.</p>
      </div>
      <div style="text-align:center;margin-top:24px;border-top:1px solid #e5e5e5;padding-top:20px;">
        <p style="margin:0;color:#1a1a1a;font-weight:700;">Nexflo AI</p>
      </div>
    </div>
  </div>`;
}

export function ownerBookingCreatedTemplate({ customerName, customerEmail, customerPhone, eventTitle, startTime, endTime, meetingUrl, additionalNotes, bookingId }) {
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:30px;border-radius:12px 12px 0 0;">
      <h1 style="color:#fff;margin:0;font-size:24px;">🗓️ New Appointment Booked!</h1>
      <p style="color:#e8e0ff;margin:8px 0 0;font-size:14px;">A new client has just scheduled a meeting</p>
    </div>
    <div style="padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;width:140px;">👤 Client</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;font-weight:600;color:#1f2937;">${customerName}</td></tr>
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;">📧 Email</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#1f2937;">${customerEmail}</td></tr>
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;">📞 Phone</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#1f2937;">${customerPhone}</td></tr>
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;">📋 Event</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;font-weight:600;color:#1f2937;">${eventTitle}</td></tr>
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;">🕐 Start</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#1f2937;">${startTime}</td></tr>
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;">🕐 End</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#1f2937;">${endTime}</td></tr>
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;">🔗 Meeting</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#1f2937;"><a href="${meetingUrl}">${meetingUrl}</a></td></tr>
        <tr><td style="padding:12px 0;color:#6b7280;font-size:14px;">📝 Notes</td><td style="padding:12px 0;color:#1f2937;">${additionalNotes}</td></tr>
      </table>
      <div style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;border-left:4px solid #22c55e;">
        <p style="margin:0;color:#166534;font-size:14px;">✅ Booking ID: <strong>#${bookingId}</strong></p>
      </div>
    </div>
  </div>`;
}

export function customerBookingConfirmedTemplate({ customerName, eventTitle, startTime, endTime, meetingUrl, bookingId }) {
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;">✅ Appointment Confirmed!</h1>
      <p style="color:#dcfce7;margin:8px 0 0;font-size:14px;">Your booking has been successfully scheduled</p>
    </div>
    <div style="padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="color:#374151;font-size:16px;line-height:1.6;">Hi <strong>${customerName}</strong>,</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;">Thank you for booking with us! Here are your appointment details:</p>
      <div style="background:#f8fafc;border-radius:10px;padding:24px;margin:20px 0;border:1px solid #e2e8f0;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;width:120px;">📋 Event</td><td style="padding:10px 0;font-weight:600;color:#1f2937;font-size:15px;">${eventTitle}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;">📅 Date & Time</td><td style="padding:10px 0;color:#1f2937;font-size:15px;">${startTime}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;">⏱️ Ends At</td><td style="padding:10px 0;color:#1f2937;font-size:15px;">${endTime}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;">🔗 Meeting</td><td style="padding:10px 0;color:#1f2937;font-size:15px;"><a href="${meetingUrl}">${meetingUrl}</a></td></tr>
        </table>
      </div>
      <div style="margin-top:20px;padding:16px;background:#fefce8;border-radius:8px;border-left:4px solid #eab308;">
        <p style="margin:0;color:#854d0e;font-size:13px;">💡 <strong>Need to reschedule or cancel?</strong> Simply reply to this email or call us, and we'll take care of it.</p>
      </div>
      <p style="color:#6b7280;font-size:14px;margin-top:24px;">We look forward to speaking with you!</p>
      <div style="margin-top:30px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="color:#9ca3af;font-size:12px;margin:0;">Booking ID: #${bookingId}</p>
        <p style="color:#9ca3af;font-size:12px;margin:4px 0 0;">Nexflo AI — Powered by AI</p>
      </div>
    </div>
  </div>`;
}

export function ownerBookingCancelledTemplate({ customerName, customerEmail, eventTitle, startTime, cancellationReason, bookingId }) {
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:30px;border-radius:12px 12px 0 0;">
      <h1 style="color:#fff;margin:0;font-size:24px;">❌ Booking Cancelled</h1>
      <p style="color:#fecaca;margin:8px 0 0;font-size:14px;">A client has cancelled their appointment</p>
    </div>
    <div style="padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;width:140px;">👤 Client</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;font-weight:600;color:#1f2937;">${customerName}</td></tr>
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;">📧 Email</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#1f2937;">${customerEmail}</td></tr>
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;">📋 Event</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#1f2937;">${eventTitle}</td></tr>
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;">📅 Was On</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#1f2937;">${startTime}</td></tr>
        <tr><td style="padding:12px 0;color:#6b7280;">💬 Reason</td><td style="padding:12px 0;color:#1f2937;">${cancellationReason}</td></tr>
      </table>
      <div style="margin-top:24px;padding:16px;background:#fef2f2;border-radius:8px;border-left:4px solid #ef4444;">
        <p style="margin:0;color:#991b1b;font-size:14px;">Booking #${bookingId} has been cancelled</p>
      </div>
    </div>
  </div>`;
}

export function customerBookingCancelledTemplate({ customerName, eventTitle, startTime }) {
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#6b7280,#4b5563);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;">Booking Cancelled</h1>
    </div>
    <div style="padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="color:#374151;font-size:16px;">Hi <strong>${customerName}</strong>,</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;">Your appointment for <strong>${eventTitle}</strong> on <strong>${startTime}</strong> has been cancelled.</p>
      <div style="margin:20px 0;padding:16px;background:#f0fdf4;border-radius:8px;border-left:4px solid #22c55e;">
        <p style="margin:0;color:#166534;font-size:14px;">🔄 <strong>Want to rebook?</strong> Feel free to call us or reply to this email to schedule a new appointment.</p>
      </div>
      <div style="text-align:center;margin-top:20px;border-top:1px solid #e5e7eb;padding-top:20px;">
        <p style="color:#9ca3af;font-size:12px;">Nexflo AI</p>
      </div>
    </div>
  </div>`;
}

export function ownerBookingRescheduledTemplate({ customerName, customerEmail, eventTitle, newStartTime, newEndTime, meetingUrl, rescheduleReason, bookingId }) {
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:30px;border-radius:12px 12px 0 0;">
      <h1 style="color:#fff;margin:0;font-size:24px;">🔄 Booking Rescheduled</h1>
      <p style="color:#fef3c7;margin:8px 0 0;font-size:14px;">A client has rescheduled their appointment</p>
    </div>
    <div style="padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;width:140px;">👤 Client</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;font-weight:600;">${customerName}</td></tr>
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;">📧 Email</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">${customerEmail}</td></tr>
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;">📋 Event</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">${eventTitle}</td></tr>
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;">📅 New Time</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;font-weight:600;color:#16a34a;">${newStartTime} — ${newEndTime}</td></tr>
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;">🔗 Meeting</td><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;"><a href="${meetingUrl}">${meetingUrl}</a></td></tr>
        <tr><td style="padding:12px 0;color:#6b7280;">💬 Reason</td><td style="padding:12px 0;">${rescheduleReason}</td></tr>
      </table>
      <div style="margin-top:24px;padding:16px;background:#fffbeb;border-radius:8px;border-left:4px solid #f59e0b;">
        <p style="margin:0;color:#92400e;font-size:14px;">Booking #${bookingId} has been rescheduled</p>
      </div>
    </div>
  </div>`;
}

export function customerBookingRescheduledTemplate({ customerName, eventTitle, newStartTime, newEndTime, meetingUrl }) {
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;">📅 Appointment Rescheduled</h1>
    </div>
    <div style="padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="color:#374151;font-size:16px;">Hi <strong>${customerName}</strong>,</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;">Your appointment has been rescheduled. Here are your updated details:</p>
      <div style="background:#f0fdf4;border-radius:10px;padding:24px;margin:20px 0;border:2px solid #22c55e;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 0;color:#6b7280;width:120px;">📋 Event</td><td style="padding:10px 0;font-weight:600;color:#1f2937;">${eventTitle}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;">📅 New Date</td><td style="padding:10px 0;font-weight:600;color:#16a34a;">${newStartTime}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;">⏱️ Ends At</td><td style="padding:10px 0;color:#1f2937;">${newEndTime}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;">🔗 Meeting</td><td style="padding:10px 0;"><a href="${meetingUrl}">${meetingUrl}</a></td></tr>
        </table>
      </div>
      <p style="color:#6b7280;font-size:14px;margin-top:24px;">We look forward to seeing you at the new time!</p>
      <div style="text-align:center;margin-top:20px;border-top:1px solid #e5e7eb;padding-top:20px;">
        <p style="color:#9ca3af;font-size:12px;">Nexflo AI</p>
      </div>
    </div>
  </div>`;
}

export function ownerCallSummaryTemplate({ callerPhone, duration, sentiment, callOutcome, callDate, callSummary, recordingUrl, isNewLead, transcript }) {
  const badgeHtml = isNewLead
    ? `<div style="background: rgba(245, 158, 11, 0.15); border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin-bottom: 18px;">
        <p style="margin: 0; color: #fbbf24; font-size: 13px; font-weight: 600;">⚡ New Contact auto-created in HubSpot CRM with status: IN_PROGRESS.</p>
       </div>`
    : '';

  const transcriptSection = transcript
    ? `<div style="background: #161c28; border-radius: 8px; padding: 18px; margin-top: 18px; border: 1px solid #283347;">
        <h3 style="margin: 0 0 10px; color: #38bdf8; font-size: 14px;">💬 Transcript Preview</h3>
        <p style="margin: 0; color: #94a3b8; font-size: 13px; line-height: 1.6; font-style: italic;">${transcript.substring(0, 500)}...</p>
       </div>`
    : '';

  return `<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #0b0f17; color: #f8fafc; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
    <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px 28px; border-bottom: 1px solid #334155; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.5px;">📞 SureGreet AI Call Report</h1>
      <p style="color: #94a3b8; margin: 8px 0 0; font-size: 13px;">Real-time caller qualification & audio capture</p>
    </div>
    <div style="padding: 28px;">
      ${badgeHtml}
      <table style="width: 100%; border-collapse: collapse; background: #161c28; border-radius: 8px; overflow: hidden; border: 1px solid #283347;">
        <tr style="border-bottom: 1px solid #283347;"><td style="padding: 12px 18px; font-weight: 600; color: #94a3b8; width: 130px;">Caller</td><td style="padding: 12px 18px; color: #ffffff; font-weight: bold;">${callerPhone}</td></tr>
        <tr style="border-bottom: 1px solid #283347; background: #1a2232;"><td style="padding: 12px 18px; font-weight: 600; color: #94a3b8;">Duration</td><td style="padding: 12px 18px; color: #ffffff;">${duration} minutes</td></tr>
        <tr style="border-bottom: 1px solid #283347;"><td style="padding: 12px 18px; font-weight: 600; color: #94a3b8;">Outcome</td><td style="padding: 12px 18px; color: #10b981; font-weight: bold;">${callOutcome}</td></tr>
        <tr style="border-bottom: 1px solid #283347; background: #1a2232;"><td style="padding: 12px 18px; font-weight: 600; color: #94a3b8;">Sentiment</td><td style="padding: 12px 18px; color: #ffffff;">${sentiment}</td></tr>
        <tr><td style="padding: 12px 18px; font-weight: 600; color: #94a3b8;">Call Time (EST)</td><td style="padding: 12px 18px; color: #ffffff;">${callDate}</td></tr>
      </table>
      <div style="background: #161c28; border-radius: 8px; padding: 18px; margin-top: 18px; border: 1px solid #283347;">
        <h3 style="margin: 0 0 10px; color: #38bdf8; font-size: 14px;">📋 AI Executive Summary</h3>
        <p style="margin: 0; color: #e2e8f0; line-height: 1.6; font-size: 13px;">${callSummary}</p>
      </div>
      ${transcriptSection}
      <div style="text-align: center; margin-top: 24px;">
        <a href="${recordingUrl}" style="display: inline-block; background: #10b981; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: bold; font-size: 14px;">▶️ Listen to Call Recording</a>
      </div>
      <p style="text-align: center; color: #64748b; font-size: 11px; margin-top: 28px;">SureGreet AI • 24/7 Voice Receptionist for Home Service Pros</p>
    </div>
  </div>`;
}
