import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendEmail } from './mailer.js';
import {
  outreachStep1Template,
  outreachStep2Template,
  outreachStep3Template,
  outreachStep4Template,
} from '../templates/outreachTemplates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const PROSPECTS_FILE = path.join(DATA_DIR, 'prospects.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROSPECTS_FILE)) {
    fs.writeFileSync(PROSPECTS_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

export function getProspects() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(PROSPECTS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveProspects(prospects) {
  ensureDataFile();
  fs.writeFileSync(PROSPECTS_FILE, JSON.stringify(prospects, null, 2), 'utf8');
}

export function addProspect({ doctorName, clinicName, email, city, treatment, adUrl, phone }) {
  const prospects = getProspects();
  const normalizedEmail = (email || '').trim().toLowerCase();

  const existing = prospects.find((p) => p.email.toLowerCase() === normalizedEmail);
  if (existing) {
    return { success: false, message: 'Prospect with this email already exists', prospect: existing };
  }

  const newProspect = {
    id: `prp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    doctorName: (doctorName || '').trim(),
    clinicName: (clinicName || '').trim(),
    email: normalizedEmail,
    city: (city || '').trim(),
    treatment: (treatment || 'Morpheus8').trim(),
    adUrl: (adUrl || '').trim(),
    phone: (phone || '').trim(),
    status: 'active', // active, replied, converted, unsubscribed
    currentStep: 0,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  prospects.push(newProspect);
  saveProspects(prospects);
  return { success: true, prospect: newProspect };
}

export function getProspectById(id) {
  const prospects = getProspects();
  return prospects.find((p) => p.id === id || p.email === id.toLowerCase());
}

export function renderStepHtml(stepNumber, prospect) {
  const data = {
    doctorName: prospect.doctorName,
    clinicName: prospect.clinicName,
    city: prospect.city,
    treatment: prospect.treatment,
    prospectEmail: prospect.email,
  };

  switch (Number(stepNumber)) {
    case 1:
      return {
        subject: `Quick question regarding your ${prospect.city ? prospect.city + ' ' : ''}ad inquiries`,
        html: outreachStep1Template(data),
      };
    case 2:
      return {
        subject: `30-sec audio proof: SureGreet AI for ${prospect.clinicName || 'your clinic'}`,
        html: outreachStep2Template(data),
      };
    case 3:
      return {
        subject: `Clinic economics: The $4,500/mo cost of missed calls at ${prospect.clinicName || 'your practice'}`,
        html: outreachStep3Template(data),
      };
    case 4:
      return {
        subject: `Closing your file / quick update for ${prospect.clinicName || 'your clinic'}`,
        html: outreachStep4Template(data),
      };
    default:
      throw new Error(`Invalid step number: ${stepNumber}. Must be 1, 2, 3, or 4.`);
  }
}

export async function sendOutreachStep({ prospectId, stepNumber }) {
  const prospects = getProspects();
  const prospect = prospects.find((p) => p.id === prospectId || p.email === prospectId.toLowerCase());

  if (!prospect) {
    return { success: false, error: 'Prospect not found' };
  }

  if (prospect.status === 'unsubscribed') {
    return { success: false, error: 'Prospect has opted out of communication' };
  }

  const { subject, html } = renderStepHtml(stepNumber, prospect);

  const emailRes = await sendEmail({
    to: prospect.email,
    subject,
    html,
  });

  if (emailRes?.success) {
    prospect.currentStep = Number(stepNumber);
    prospect.updatedAt = new Date().toISOString();
    prospect.history.push({
      step: Number(stepNumber),
      subject,
      sentAt: new Date().toISOString(),
      provider: emailRes.provider || 'default',
    });
    saveProspects(prospects);

    console.log(`[Outreach Engine] Dispatched Step ${stepNumber} to ${prospect.email}`);
    return { success: true, prospect, emailResult: emailRes };
  } else {
    return { success: false, error: emailRes?.error || 'Email dispatch failed' };
  }
}

export function unsubscribeProspect(email) {
  const prospects = getProspects();
  const normalized = (email || '').trim().toLowerCase();
  let updated = false;

  for (const p of prospects) {
    if (p.email === normalized) {
      p.status = 'unsubscribed';
      p.updatedAt = new Date().toISOString();
      updated = true;
    }
  }

  if (updated) {
    saveProspects(prospects);
  }
  return { success: updated, email: normalized };
}
