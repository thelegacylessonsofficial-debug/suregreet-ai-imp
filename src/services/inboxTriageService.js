import { getProspectById, updateProspect, supabaseFetch } from './outreachService.js';
import { sendTelegramHtml, sendTelegram } from './telegram.js';
import { sendEmail } from './mailer.js';
import { createOrUpdateContactFromBooking } from './hubspot.js';
import { DateTime } from 'luxon';
import { config } from '../config.js';

/**
 * 1. Sentiment & Intent Classification (4 Buckets)
 */
export function classifyReply(text) {
  const clean = (text || '').toLowerCase().trim();

  // Bucket 1: NOT_INTERESTED / Hard Unsubscribe
  const unsubscribePatterns = [
    /unsubscribe/i,
    /remove\s+me/i,
    /not\s+interested/i,
    /stop\s+emailing/i,
    /take\s+me\s+off/i,
    /do\s+not\s+contact/i,
    /don't\s+contact/i,
    /no\s+thanks/i,
    /no\s+thank\s+you/i,
    /please\s+remove/i,
    /leave\s+me\s+alone/i,
    /wrong\s+email/i,
    /not\s+for\s+us/i,
  ];
  if (unsubscribePatterns.some((pattern) => pattern.test(clean))) {
    return {
      bucket: 'NOT_INTERESTED',
      confidence: 0.98,
      subType: 'UNSUBSCRIBE',
    };
  }

  // Bucket 2: OUT_OF_OFFICE / Auto-responder
  const oooPatterns = [
    /out\s+of\s+office/i,
    /auto-reply/i,
    /automatic\s+reply/i,
    /away\s+from\s+my\s+desk/i,
    /on\s+annual\s+leave/i,
    /on\s+vacation/i,
    /maternity\s+leave/i,
    /back\s+in\s+the\s+office\s+on/i,
    /returning\s+on/i,
  ];
  if (oooPatterns.some((pattern) => pattern.test(clean))) {
    return {
      bucket: 'OUT_OF_OFFICE',
      confidence: 0.95,
      subType: 'OOO',
    };
  }

  // Bucket 3: POSITIVE_DEMO_REQUEST
  const positivePatterns = [
    /send\s+(it|the\s+link|the\s+video|the\s+demo|the\s+number|over|details)/i,
    /sure/i,
    /yeah/i,
    /yes/i,
    /sounds\s+good/i,
    /interested/i,
    /show\s+me/i,
    /let('s|\s+us)\s+see/i,
    /love\s+to\s+see/i,
    /open\s+to/i,
    /would\s+be\s+great/i,
    /free\s+(on|this|next)/i,
    /call\s+me/i,
    /let('s|\s+us)\s+chat/i,
    /tell\s+me\s+more/i,
  ];
  if (positivePatterns.some((pattern) => pattern.test(clean))) {
    return {
      bucket: 'POSITIVE_DEMO_REQUEST',
      confidence: 0.92,
      subType: 'DEMO_REQUEST',
    };
  }

  // Bucket 4: OBJECTION_OR_QUESTION (Sub-categorized by LAARC Playbook)
  let subType = 'GENERAL_QUESTION';
  if (/how\s+much|cost|pricing|price|fee|budget|expensive|rates/i.test(clean)) {
    subType = 'PRICING';
  } else if (/already\s+have|front\s+desk|receptionist|staff|in-house|team/i.test(clean)) {
    subType = 'EXISTING_STAFF';
  } else if (/robot|ai|voice|sound|robotic|automated|human|accent/i.test(clean)) {
    subType = 'ROBOT_AI';
  } else if (/servicetitan|ehr|emr|software|integration|jane|boulevard|patterson|dentrix/i.test(clean)) {
    subType = 'INTEGRATION';
  }

  return {
    bucket: 'OBJECTION_OR_QUESTION',
    confidence: 0.88,
    subType,
  };
}

/**
 * 2. Generate LAARC Response Draft according to /harvey-sales Playbook
 */
export function generateLAARCResponse(subType, prospect) {
  const doctorSalutation = prospect?.doctor_name ? (prospect.doctor_name.startsWith('Dr.') ? prospect.doctor_name : `Dr. ${prospect.doctor_name.split(' ').pop()}`) : 'there';
  const clinic = prospect?.clinic_name || 'your clinic';
  const treatment = prospect?.treatment || 'high-ticket';

  switch (subType) {
    case 'PRICING':
      return (
        `Hey ${doctorSalutation},\n\n` +
        `Happy to share: flat $1,000/month retainer with zero setup fees, and we guarantee at least 5 extra consultation bookings in your first 30 days or you don't pay.\n\n` +
        `Are you primarily looking to capture after-hours phone calls or website inquiries at ${clinic}?`
      );

    case 'EXISTING_STAFF':
      return (
        `Hey ${doctorSalutation},\n\n` +
        `Makes total sense — a great daytime front desk team is irreplaceable.\n\n` +
        `We don't replace your staff; we only sit on your lines between 5:00 PM and 8:30 AM and on weekends when your staff is home with their families.\n\n` +
        `Right now, when an inquiry calls at 8:00 PM, does it hit voicemail or book immediately?`
      );

    case 'ROBOT_AI':
      return (
        `Hey ${doctorSalutation},\n\n` +
        `Completely agree — robotic phone trees and clunky IVRs drive patients away.\n\n` +
        `Here is an actual 20-second audio clip of SureGreet AI answering ${treatment} pricing with sub-600ms latency: https://suregreet.ai#demo. Patients can't tell it from a human receptionist.\n\n` +
        `Would Thursday or Friday work to hear how it sounds on your actual practice number?`
      );

    case 'INTEGRATION':
      return (
        `Hey ${doctorSalutation},\n\n` +
        `Yes — we connect natively into your calendar and booking system via zero-latency webhooks, so deposits and appointment slots sync directly without double-booking.\n\n` +
        `Open to seeing a 2-minute walkthrough of how the EHR sync works for ${clinic}?`
      );

    default:
      return (
        `Hey ${doctorSalutation},\n\n` +
        `Appreciate the reply. We configure SureGreet AI specifically around ${clinic}'s SOPs so after-hours callers get greeted in 2 rings and booked into your calendar.\n\n` +
        `Open to a quick 5-minute walkthrough to see if it makes sense for your lines?`
      );
  }
}

/**
 * 3. Process incoming email reply end-to-end
 */
export async function processIncomingReply({ fromEmail, subject, bodyText, inReplyTo }) {
  const normalizedEmail = (fromEmail || '').toLowerCase().trim();
  console.log(`[Inbox Triage] Processing reply from: ${normalizedEmail}`);

  // Find prospect in Supabase
  let prospect = await getProspectById(normalizedEmail);
  const prospectFound = Boolean(prospect);

  // If not found in database, build placeholder prospect
  if (!prospect) {
    prospect = {
      id: 'untracked-' + Date.now(),
      email: normalizedEmail,
      doctor_name: 'Lead',
      clinic_name: 'Prospect Practice',
      treatment: 'Morpheus8',
      status: 'active',
      notes: '',
    };
  }

  // Classify Sentiment
  const classification = classifyReply(bodyText);
  const { bucket, subType } = classification;
  console.log(`[Inbox Triage] Classification for ${normalizedEmail}: ${bucket} (${subType})`);

  let actionsTaken = [];
  let suggestedReply = '';

  // Execute Bucket Actions
  if (bucket === 'POSITIVE_DEMO_REQUEST') {
    // 1. Mark as Replied in Supabase (Halts Cold Outreach)
    if (prospectFound) {
      await updateProspect(prospect.id, {
        status: 'replied',
        next_due_at: null,
        notes: `${prospect.notes || ''}\n[${new Date().toISOString()}] Reply: POSITIVE_DEMO_REQUEST - "${bodyText.slice(0, 100)}"`.trim(),
      });
      actionsTaken.push('Supabase status updated to replied (Outreach sequence frozen)');
    }

    suggestedReply =
      `Hey ${prospect.doctor_name || 'there'},\n\n` +
      `Here is the 60-second walkthrough and direct calendar link: https://suregreet.ai#booking\n\n` +
      `What is the best phone number to reach you on?\n\n` +
      `Best,\nArchit`;

    // 2. Dispatch High-Priority Telegram Alert
    const doctorPhone = prospect.phone ? `<a href="tel:${prospect.phone}">${prospect.phone}</a>` : 'Not on file';
    const tgMsg =
      `🔥 <b>HOT LEAD REPLY DETECTED! (Positive Demo Request)</b>\n\n` +
      `🏢 <b>Clinic:</b> ${prospect.clinic_name || 'N/A'}\n` +
      `👤 <b>Doctor:</b> ${prospect.doctor_name || 'N/A'}\n` +
      `✉️ <b>Email:</b> <a href="mailto:${prospect.email}">${prospect.email}</a>\n` +
      `📞 <b>Phone:</b> ${doctorPhone}\n` +
      `💬 <b>Reply:</b> <i>"${bodyText.slice(0, 250)}"</i>\n\n` +
      `⚡ <b>Immediate Action:</b> Calendar link ready. <b>CALL THIS DOCTOR NOW ON THEIR PHONE!</b>\n\n` +
      `📝 <b>Suggested Reply:</b>\n<code>${suggestedReply}</code>`;

    await sendTelegramHtml(tgMsg);
    actionsTaken.push('VIP Telegram push sent to Archit with direct phone/email links');

    // 3. Sync to HubSpot
    try {
      await createOrUpdateContactFromBooking({
        customerName: prospect.doctor_name,
        customerEmail: prospect.email,
        customerPhone: prospect.phone,
        companyName: prospect.clinic_name,
        bottleneckNotes: `Inbound Reply: ${bodyText.slice(0, 150)}`,
      });
      actionsTaken.push('HubSpot contact updated with positive intent');
    } catch (crmErr) {
      console.warn('[Inbox Triage] HubSpot sync warning:', crmErr.message);
    }
  } else if (bucket === 'NOT_INTERESTED') {
    // 1. Mark as Unsubscribed in Supabase (Halts Sequence Permanently)
    if (prospectFound) {
      await updateProspect(prospect.id, {
        status: 'unsubscribed',
        next_due_at: null,
        notes: `${prospect.notes || ''}\n[${new Date().toISOString()}] Unsubscribed: "${bodyText.slice(0, 100)}"`.trim(),
      });
      actionsTaken.push('Supabase status updated to unsubscribed (DO_NOT_CONTACT)');
    }

    suggestedReply = `Done, you are removed from all future emails. Best of luck with the clinic.`;

    // 2. Alert Archit
    await sendTelegramHtml(
      `🚫 <b>Prospect Unsubscribed (DO_NOT_CONTACT)</b>\n\n` +
      `👤 <b>Doctor:</b> ${prospect.doctor_name || 'Lead'}\n` +
      `🏢 <b>Clinic:</b> ${prospect.clinic_name || 'N/A'}\n` +
      `✉️ <b>Email:</b> <code>${prospect.email}</code>\n` +
      `💬 <b>Message:</b> "${bodyText.slice(0, 150)}"\n` +
      `⚡ <i>All automated follow-ups permanently cancelled.</i>`
    );
    actionsTaken.push('Telegram alert logged. Outreach cancelled.');
  } else if (bucket === 'OBJECTION_OR_QUESTION') {
    // 1. Mark status to replied so automated follow-ups don't collide
    if (prospectFound) {
      await updateProspect(prospect.id, {
        status: 'replied',
        next_due_at: null,
        notes: `${prospect.notes || ''}\n[${new Date().toISOString()}] Question/Objection (${subType}): "${bodyText.slice(0, 100)}"`.trim(),
      });
      actionsTaken.push(`Supabase sequence paused for objection triage (${subType})`);
    }

    // 2. Formulate LAARC Response
    suggestedReply = generateLAARCResponse(subType, prospect);

    // 3. Dispatch Telegram Alert with 1-Click LAARC Reply
    const tgMsg =
      `💬 <b>NEW PROSPECT QUESTION / OBJECTION (${subType})</b>\n\n` +
      `🏢 <b>Clinic:</b> ${prospect.clinic_name || 'N/A'}\n` +
      `👤 <b>Doctor:</b> ${prospect.doctor_name || 'N/A'}\n` +
      `✉️ <b>Email:</b> <a href="mailto:${prospect.email}">${prospect.email}</a>\n` +
      `💬 <b>Prospect Said:</b> <i>"${bodyText.slice(0, 250)}"</i>\n\n` +
      `💡 <b>Recommended LAARC Response (/harvey-sales):</b>\n` +
      `<code>${suggestedReply}</code>`;

    await sendTelegramHtml(tgMsg);
    actionsTaken.push('Telegram push with LAARC response script dispatched');
  } else if (bucket === 'OUT_OF_OFFICE') {
    // Postpone next due at by 7 days
    if (prospectFound && prospect.current_step > 0 && prospect.current_step < 4) {
      const nextDue = DateTime.now().setZone(config.timezone).plus({ days: 7 }).toUTC().toISO();
      await updateProspect(prospect.id, {
        next_due_at: nextDue,
        notes: `${prospect.notes || ''}\n[${new Date().toISOString()}] OOO detected. Delayed +7 days.`.trim(),
      });
      actionsTaken.push('Sequence delayed by 7 days for Out of Office');
    }

    await sendTelegram(
      `🏖️ OOO Notice from ${prospect.doctor_name || prospect.email} (${prospect.clinic_name || 'Clinic'}). Follow-up postponed 7 days.`
    );
    actionsTaken.push('OOO logged');
  }

  return {
    success: true,
    email: normalizedEmail,
    prospectId: prospect.id,
    classification: {
      bucket,
      subType,
      confidence: classification.confidence,
    },
    actionsTaken,
    suggestedReply,
  };
}
