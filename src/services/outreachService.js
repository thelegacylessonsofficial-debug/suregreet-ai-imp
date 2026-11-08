import { DateTime } from 'luxon';
import { config } from '../config.js';
import { sendEmail } from './mailer.js';
import { sendTelegram } from './telegram.js';
import {
  outreachStep1Template,
  outreachStep2Template,
  outreachStep3Template,
  outreachStep4Template,
} from '../templates/outreachTemplates.js';

const SUPABASE_URL = config.supabase.url;
const SUPABASE_KEY = config.supabase.anonKey;

/**
 * Helper to call Supabase PostgREST API with authorization headers
 */
async function supabaseFetch(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${endpoint}`;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return { ok: response.ok, status: response.status, data };
}

/**
 * Calculates the next due timestamp for subsequent outreach steps.
 * Skips weekends (Saturday & Sunday) and sets the time in US Eastern Time.
 */
export function calculateNextDueAt(currentStep, baseDate = new Date()) {
  if (currentStep >= 4) {
    return null; // Sequence complete
  }

  // Business days delay:
  // Step 1 -> Step 2: 2 business days
  // Step 2 -> Step 3: 3 business days
  // Step 3 -> Step 4: 3 business days
  const daysToAdd = currentStep === 1 ? 2 : 3;

  let dt = DateTime.fromJSDate(baseDate).setZone(config.timezone);
  let added = 0;

  while (added < daysToAdd) {
    dt = dt.plus({ days: 1 });
    // Luxon weekday: 1 is Monday, 5 is Friday, 6 is Saturday, 7 is Sunday
    if (dt.weekday <= 5) {
      added++;
    }
  }

  // Randomize sending hour between 10:00 AM and 11:30 AM EST
  const randomMinutes = Math.floor(Math.random() * 90);
  dt = dt.set({ hour: 10, minute: 0, second: 0, millisecond: 0 }).plus({ minutes: randomMinutes });

  return dt.toUTC().toISO();
}

/**
 * Fetch all prospects from Supabase
 */
export async function getProspects({ status, limit = 100 } = {}) {
  let query = '/prospects?select=*&order=created_at.desc';
  if (status) {
    query += `&status=eq.${encodeURIComponent(status)}`;
  }
  if (limit) {
    query += `&limit=${Number(limit)}`;
  }

  const res = await supabaseFetch(query);
  if (!res.ok) {
    console.error('[OutreachService] Failed to fetch prospects:', res.data);
    return [];
  }
  return res.data || [];
}

/**
 * Fetch a single prospect by ID or Email
 */
export async function getProspectById(idOrEmail) {
  if (!idOrEmail) return null;
  const target = String(idOrEmail).trim();
  const query = `/prospects?select=*&or=(id.eq.${encodeURIComponent(target)},email.eq.${encodeURIComponent(target.toLowerCase())})&limit=1`;
  
  const res = await supabaseFetch(query);
  if (!res.ok || !res.data || res.data.length === 0) {
    return null;
  }
  return res.data[0];
}

/**
 * Add a new clinic prospect to Supabase
 */
export async function addProspect({ doctorName, clinicName, email, city, treatment, notes }) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return { success: false, message: 'Valid email is required' };
  }

  // Check if exists
  const existing = await getProspectById(normalizedEmail);
  if (existing) {
    return { success: false, message: 'Prospect with this email already exists', prospect: existing };
  }

  const payload = {
    doctor_name: (doctorName || '').trim() || null,
    clinic_name: (clinicName || '').trim() || null,
    email: normalizedEmail,
    city: (city || '').trim() || null,
    treatment: (treatment || 'Morpheus8').trim(),
    status: 'pending',
    current_step: 0,
    notes: (notes || '').trim() || null,
  };

  const res = await supabaseFetch('/prospects', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.data || res.data.length === 0) {
    console.error('[OutreachService] Failed to insert prospect:', res.data);
    return { success: false, error: res.data?.message || 'Database insert failed' };
  }

  console.log(`[OutreachService] Successfully created prospect ${normalizedEmail} (ID: ${res.data[0].id})`);
  return { success: true, prospect: res.data[0] };
}

/**
 * Update prospect record
 */
export async function updateProspect(id, updates) {
  const res = await supabaseFetch(`/prospects?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });

  if (!res.ok || !res.data || res.data.length === 0) {
    console.error(`[OutreachService] Failed to update prospect ${id}:`, res.data);
    return null;
  }
  return res.data[0];
}

/**
 * Fetch all active prospects due for their next follow-up
 */
export async function getDueProspects(limit = 10) {
  const nowISO = new Date().toISOString();
  const query = `/prospects?select=*&status=eq.active&next_due_at=lte.${encodeURIComponent(nowISO)}&current_step=lt.4&order=next_due_at.asc&limit=${Number(limit)}`;
  const res = await supabaseFetch(query);
  if (!res.ok) {
    console.error('[OutreachService] Failed to fetch due prospects:', res.data);
    return [];
  }
  return res.data || [];
}

/**
 * Render email content and subject based on step number
 */
export function renderStepContent(stepNumber, prospect) {
  const data = {
    doctorName: prospect.doctor_name,
    clinicName: prospect.clinic_name,
    city: prospect.city,
    treatment: prospect.treatment,
    prospectEmail: prospect.email,
    originalSubject: prospect.original_subject,
    specificObservation: prospect.specific_observation,
    niche: prospect.niche || 'medspa',
  };

  switch (Number(stepNumber)) {
    case 1:
      return outreachStep1Template(data);
    case 2:
      return outreachStep2Template(data);
    case 3:
      return outreachStep3Template(data);
    case 4:
      return outreachStep4Template(data);
    default:
      throw new Error(`Invalid step number: ${stepNumber}. Must be 1, 2, 3, or 4.`);
  }
}

/**
 * Dispatch an outreach email step with RFC 2822 / 5322 MIME threading
 */
export async function sendOutreachStep({ prospectId, stepNumber }) {
  const prospect = await getProspectById(prospectId);
  if (!prospect) {
    return { success: false, error: 'Prospect not found in Supabase' };
  }

  // Safety protection against emailing unsubscriptions or replied doctors
  if (prospect.status === 'unsubscribed') {
    return { success: false, error: 'Prospect is unsubscribed. Aborting.' };
  }
  if (prospect.status === 'replied') {
    return { success: false, error: 'Prospect has already replied. Sequence paused.' };
  }

  const step = Number(stepNumber);
  const rendered = renderStepContent(step, prospect);

  // RFC 5322 Message-ID construction
  const messageId = `<sg-${prospect.id}-step${step}-${Date.now()}@suregreet.ai>`;

  let inReplyTo = null;
  let references = null;

  if (step > 1) {
    inReplyTo = prospect.last_message_id || prospect.initial_message_id;
    const initialId = prospect.initial_message_id || inReplyTo;
    references = initialId === inReplyTo ? initialId : `${initialId} ${inReplyTo}`;
  }

  console.log(`[Outreach MIME] Dispatching Step ${step} to ${prospect.email}`);
  if (inReplyTo) {
    console.log(`[Outreach MIME Threading] In-Reply-To: ${inReplyTo} | References: ${references}`);
  }

  const emailRes = await sendEmail({
    to: prospect.email,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    messageId,
    inReplyTo,
    references,
  });

  if (!emailRes?.success) {
    return { success: false, error: emailRes?.error || 'Email dispatch failed' };
  }

  // Calculate schedule for next step
  const nextDueAt = calculateNextDueAt(step, new Date());
  const finalStatus = step >= 4 ? 'completed' : 'active';

  const updates = {
    status: finalStatus,
    current_step: step,
    last_sent_at: new Date().toISOString(),
    next_due_at: nextDueAt,
    last_message_id: messageId,
    initial_message_id: prospect.initial_message_id || messageId,
    original_subject: prospect.original_subject || rendered.subject,
  };

  const updatedProspect = await updateProspect(prospect.id, updates);

  return {
    success: true,
    step,
    prospect: updatedProspect,
    messageId,
    emailResult: emailRes,
  };
}

/**
 * Mark prospect as replied (stops any future follow-up)
 */
export async function markProspectReplied(idOrEmail) {
  const prospect = await getProspectById(idOrEmail);
  if (!prospect) {
    return { success: false, error: 'Prospect not found' };
  }

  const updated = await updateProspect(prospect.id, {
    status: 'replied',
    next_due_at: null,
  });

  const msg = `🎯 <b>PROSPECT REPLIED!</b>\n\nClinic: <b>${prospect.clinic_name || 'N/A'}</b>\nDoctor: ${prospect.doctor_name || 'N/A'}\nEmail: <code>${prospect.email}</code>\nStatus: Sequence stopped. Ready for discovery call booking!`;
  await sendTelegram(msg);

  return { success: true, prospect: updated };
}

/**
 * CAN-SPAM Unsubscribe Handler
 */
export async function unsubscribeProspect(email) {
  const prospect = await getProspectById(email);
  if (!prospect) {
    return { success: false, error: 'Prospect not found' };
  }

  const updated = await updateProspect(prospect.id, {
    status: 'unsubscribed',
    next_due_at: null,
  });

  console.log(`[Outreach] Unsubscribed prospect ${prospect.email}`);
  return { success: true, prospect: updated };
}

/**
 * Activate a prospect: sends Step 1 immediately and schedules Step 2
 */
export async function activateProspect(idOrEmail) {
  const prospect = await getProspectById(idOrEmail);
  if (!prospect) {
    return { success: false, error: 'Prospect not found' };
  }

  return await sendOutreachStep({ prospectId: prospect.id, stepNumber: 1 });
}
