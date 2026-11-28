import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter = null;
let rotationIndex = 0;

function parseDisplayAndEmail(fromStr, fallbackName = 'SureGreet AI') {
  const raw = String(fromStr || '').trim();
  const m = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) {
    return {
      name: m[1].replace(/^["']|["']$/g, '').trim() || fallbackName,
      email: m[2].trim(),
    };
  }
  return { name: fallbackName, email: raw };
}

function getConfiguredProviders() {
  return {
    resend: Boolean(process.env.RESEND_API_KEY),
    gmailBridge: Boolean(process.env.GMAIL_WEBHOOK_URL),
    brevo: Boolean(process.env.BREVO_API_KEY),
    smtp: Boolean(config.smtp?.user && config.smtp?.pass),
  };
}

function getActiveTransportName() {
  const p = getConfiguredProviders();
  if (p.resend) return 'resend';
  if (p.gmailBridge) return 'gmail_bridge';
  if (p.brevo) return 'brevo';
  if (p.smtp) return 'smtp';
  return 'none';
}

/**
 * Returns configured sending inboxes accurately based on active transport
 */
export function getSenderInboxes() {
  const rotRaw = process.env.ROTATION_FROM_EMAILS || '';
  if (rotRaw.trim()) {
    const parsed = rotRaw
      .split(/[,;]/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (parsed.length > 0) return parsed;
  }

  const p = getConfiguredProviders();
  if (p.resend) {
    const rf = process.env.RESEND_FROM || process.env.EMAIL_FROM || config.resendFrom;
    return [rf];
  }
  if (p.gmailBridge || p.brevo || p.smtp) {
    const sf = process.env.EMAIL_FROM || config.smtp?.from || config.smtp?.user || config.ownerEmail;
    return [sf];
  }
  return [process.env.EMAIL_FROM || config.ownerEmail || 'architd062@gmail.com'];
}

/**
 * Round-robin selector across registered sending inboxes
 */
export function getNextSenderInbox() {
  const inboxes = getSenderInboxes();
  const selected = inboxes[rotationIndex % inboxes.length];
  const index = rotationIndex % inboxes.length;
  rotationIndex++;
  return {
    selected,
    index,
    totalInboxes: inboxes.length,
  };
}

export function getMailerStatus() {
  const inboxes = getSenderInboxes();
  const providers = getConfiguredProviders();
  const activeTransport = getActiveTransportName();
  const port443Ready = providers.resend || providers.gmailBridge || providers.brevo;
  const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);

  const labelMap = {
    resend: 'Resend HTTP API (Port 443)',
    gmail_bridge: 'Gmail HTTPS Bridge (Port 443)',
    brevo: 'Brevo HTTP API (Port 443)',
    smtp: 'SMTP Only (Port 465/587)',
    none: 'Not Configured',
  };

  return {
    provider: labelMap[activeTransport],
    activeTransport,
    port443Ready,
    smtpBlockedWarning: isRender && activeTransport === 'smtp',
    configuredProviders: providers,
    smtpConfig: {
      host: config.smtp?.host || 'smtp.gmail.com',
      port: config.smtp?.port || 465,
      user: config.smtp?.user ? `${config.smtp.user.slice(0, 4)}***@${config.smtp.user.split('@')[1] || ''}` : null,
      passConfigured: Boolean(config.smtp?.pass),
    },
    activeInboxes: inboxes,
    inboxCount: inboxes.length,
    rotationActive: inboxes.length > 1,
    currentSender: inboxes[rotationIndex % inboxes.length],
    totalDispatches: rotationIndex,
  };
}

function getTransporter() {
  if (!transporter) {
    if (!config.smtp.user || !config.smtp.pass) {
      return null;
    }
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
    });
  }
  return transporter;
}

async function sendViaResend({ to, subject, html, text, effectiveFrom, replyTo, customHeaders }) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return null;

  const resendPayload = {
    from: effectiveFrom,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text: text || '',
  };
  if (replyTo) resendPayload.reply_to = replyTo;
  if (Object.keys(customHeaders).length > 0) resendPayload.headers = customHeaders;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
    });
    clearTimeout(timer);
    const data = await res.json();
    if (res.ok && data?.id) {
      console.log(`[Mailer:Resend] Email sent to ${to} (ID: ${data.id}, From: ${effectiveFrom})`);
      return { success: true, messageId: data.id, provider: 'resend', from: effectiveFrom };
    }
    const errMsg = data?.message || data?.error || `Resend HTTP ${res.status}`;
    console.warn('[Mailer:Resend] Rejected:', errMsg);
    return { success: false, provider: 'resend', error: errMsg };
  } catch (err) {
    return { success: false, provider: 'resend', error: err.message };
  }
}

async function sendViaGmailBridge({ to, subject, html, text, effectiveFrom, replyTo, inReplyTo }) {
  const bridgeUrl = process.env.GMAIL_WEBHOOK_URL;
  if (!bridgeUrl) return null;

  const senderMeta = parseDisplayAndEmail(effectiveFrom, config.senderName);
  const payload = {
    secret: process.env.GMAIL_WEBHOOK_SECRET || '',
    to: Array.isArray(to) ? to.join(',') : to,
    subject,
    text: text || '',
    html: html || '',
    name: senderMeta.name,
    replyTo: replyTo || senderMeta.email || config.ownerEmail,
    inReplyTo: inReplyTo || '',
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);
    const res = await fetch(bridgeUrl, {
      method: 'POST',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    clearTimeout(timer);

    const rawText = await res.text();
    let data = null;
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      return {
        success: false,
        provider: 'gmail_bridge',
        error: `Gmail Bridge returned non-JSON HTTP ${res.status} — verify "Who has access: Anyone" on the Apps Script Web App deployment.`,
      };
    }

    if (res.ok && data?.success) {
      console.log(`[Mailer:GmailBridge] Sent to ${payload.to} via ${data.from} (quota remaining: ${data.quotaRemaining ?? '?'})`);
      return {
        success: true,
        provider: 'gmail_bridge',
        from: data.from || effectiveFrom,
        messageId: `<gas-${Date.now()}@gmail.com>`,
        quotaRemaining: data.quotaRemaining,
      };
    }
    return { success: false, provider: 'gmail_bridge', error: data?.error || `Gmail Bridge HTTP ${res.status}` };
  } catch (err) {
    return { success: false, provider: 'gmail_bridge', error: err.message };
  }
}

async function sendViaBrevo({ to, subject, html, text, effectiveFrom, replyTo, customHeaders }) {
  const brevoKey = process.env.BREVO_API_KEY;
  if (!brevoKey) return null;

  const senderMeta = parseDisplayAndEmail(effectiveFrom, config.senderName);
  const recipients = (Array.isArray(to) ? to : [to]).map((email) => ({ email: String(email).trim() }));

  const payload = {
    sender: { name: senderMeta.name, email: senderMeta.email },
    to: recipients,
    subject,
    htmlContent: html || `<pre>${text || ''}</pre>`,
    textContent: text || '',
  };
  if (replyTo) payload.replyTo = { email: replyTo };
  if (Object.keys(customHeaders).length > 0) payload.headers = customHeaders;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'api-key': brevoKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    clearTimeout(timer);
    const data = await res.json();
    if (res.ok && data?.messageId) {
      console.log(`[Mailer:Brevo] Sent to ${to} (ID: ${data.messageId}, From: ${effectiveFrom})`);
      return { success: true, messageId: data.messageId, provider: 'brevo', from: effectiveFrom };
    }
    return { success: false, provider: 'brevo', error: data?.message || `Brevo HTTP ${res.status}` };
  } catch (err) {
    return { success: false, provider: 'brevo', error: err.message };
  }
}

/**
 * Live transport connectivity & readiness check (does NOT send a live email)
 */
export async function verifyMailerConnection() {
  const status = getMailerStatus();
  const checks = [];

  if (process.env.RESEND_API_KEY) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch('https://api.resend.com/domains', {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      clearTimeout(timer);
      const body = await res.json().catch(() => ({}));
      const verifiedDomains = Array.isArray(body?.data)
        ? body.data.filter((d) => d.status === 'verified').map((d) => d.name)
        : [];
      checks.push({
        provider: 'resend',
        reachable: res.ok,
        verifiedDomains,
        sandboxOnly: verifiedDomains.length === 0,
        note: res.ok
          ? verifiedDomains.length > 0
            ? `Resend ready with verified domain(s): ${verifiedDomains.join(', ')}`
            : 'Resend API valid, but 0 verified domains found (sandbox mode can only email your own signup address).'
          : body?.message || `HTTP ${res.status}`,
      });
    } catch (err) {
      checks.push({ provider: 'resend', reachable: false, note: err.message });
    }
  }

  if (process.env.GMAIL_WEBHOOK_URL) {
    try {
      const u = new URL(process.env.GMAIL_WEBHOOK_URL);
      if (process.env.GMAIL_WEBHOOK_SECRET) u.searchParams.set('secret', process.env.GMAIL_WEBHOOK_SECRET);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(u.toString(), { redirect: 'follow', signal: controller.signal });
      clearTimeout(timer);
      const data = await res.json().catch(() => null);
      checks.push({
        provider: 'gmail_bridge',
        reachable: Boolean(res.ok && data?.success),
        from: data?.from || null,
        quotaRemaining: data?.quotaRemaining ?? null,
        note: data?.success
          ? `Gmail HTTPS Bridge online (${data.from}, ${data.quotaRemaining} daily sends left)`
          : data?.error || `HTTP ${res.status} — ensure Web App access is "Anyone"`,
      });
    } catch (err) {
      checks.push({ provider: 'gmail_bridge', reachable: false, note: err.message });
    }
  }

  if (process.env.BREVO_API_KEY) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch('https://api.brevo.com/v3/account', {
        signal: controller.signal,
        headers: { 'api-key': process.env.BREVO_API_KEY, Accept: 'application/json' },
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      checks.push({
        provider: 'brevo',
        reachable: res.ok,
        note: res.ok ? `Brevo HTTP API connected (${data.email || 'account verified'})` : data?.message || `HTTP ${res.status}`,
      });
    } catch (err) {
      checks.push({ provider: 'brevo', reachable: false, note: err.message });
    }
  }

  const smtpClient = getTransporter();
  if (smtpClient) {
    try {
      await smtpClient.verify();
      checks.push({
        provider: 'smtp',
        reachable: true,
        note: `SMTP handshake verified on ${config.smtp.host}:${config.smtp.port}`,
      });
    } catch (err) {
      const isTimeout = /timeout|ETIMEDOUT|ECONNREFUSED|ENETUNREACH/i.test(err.message);
      checks.push({
        provider: 'smtp',
        reachable: false,
        renderFreeSmtpBlocked: isTimeout,
        note: isTimeout
          ? `SMTP blocked (${err.message}). Render Free Tier drops outbound TCP on ports 25/465/587 — connect GMAIL_WEBHOOK_URL, RESEND_API_KEY, or BREVO_API_KEY for Port 443 HTTPS.`
          : err.message,
      });
    }
  }

  const ready = checks.some((c) => c.reachable);
  return {
    ready,
    status,
    checks,
    checkedAt: new Date().toISOString(),
  };
}

export async function sendEmail({ to, subject, html, text, from, replyTo, headers = {}, inReplyTo, references, messageId }) {
  const customHeaders = { ...headers };
  if (inReplyTo) customHeaders['In-Reply-To'] = inReplyTo;
  if (references) customHeaders['References'] = references;

  const { selected: selectedFrom } = getNextSenderInbox();
  const effectiveFrom = from || selectedFrom;
  const errors = [];

  // 1. Port 443 HTTPS transports first (never blocked by Render firewall)
  const resendRes = await sendViaResend({ to, subject, html, text, effectiveFrom, replyTo, customHeaders });
  if (resendRes) {
    if (resendRes.success) return resendRes;
    errors.push(`Resend: ${resendRes.error}`);
  }

  const gmailRes = await sendViaGmailBridge({ to, subject, html, text, effectiveFrom, replyTo, inReplyTo });
  if (gmailRes) {
    if (gmailRes.success) return gmailRes;
    errors.push(`GmailBridge: ${gmailRes.error}`);
  }

  const brevoRes = await sendViaBrevo({ to, subject, html, text, effectiveFrom, replyTo, customHeaders });
  if (brevoRes) {
    if (brevoRes.success) return brevoRes;
    errors.push(`Brevo: ${brevoRes.error}`);
  }

  // 2. Fallback to Nodemailer SMTP (only works on paid Render / local dev / VPS)
  const mailClient = getTransporter();
  if (mailClient) {
    try {
      const smtpFrom = from || process.env.EMAIL_FROM || config.smtp?.from || effectiveFrom;
      const mailOptions = {
        from: smtpFrom,
        to,
        subject,
        html,
        text: text || '',
        headers: customHeaders,
      };
      if (replyTo) mailOptions.replyTo = replyTo;
      if (inReplyTo) mailOptions.inReplyTo = inReplyTo;
      if (references) mailOptions.references = references;
      if (messageId) mailOptions.messageId = messageId;

      const info = await mailClient.sendMail(mailOptions);
      console.log(`[Mailer:SMTP] Sent to ${to} (MessageId: ${info.messageId}, From: ${smtpFrom})`);
      return { success: true, messageId: info.messageId, provider: 'smtp', from: smtpFrom };
    } catch (err) {
      const hint = /timeout|ETIMEDOUT|ECONNREFUSED/i.test(err.message)
        ? ' (Render Free Tier blocks SMTP ports 25/465/587 — set GMAIL_WEBHOOK_URL, RESEND_API_KEY, or BREVO_API_KEY for Port 443 HTTPS)'
        : '';
      console.error(`[Mailer:SMTP] Error sending email to ${to}:`, err.message);
      errors.push(`SMTP: ${err.message}${hint}`);
    }
  }

  // Explicit opt-in dev mock mode only (never fake sent status in production)
  if (process.env.MOCK_EMAIL === 'true') {
    console.log(`[Mailer Mock] Email to: ${to} | Subject: "${subject}" | From: ${effectiveFrom}`);
    return { mock: true, success: true, messageId: messageId || `<mock-${Date.now()}@suregreet.ai>`, from: effectiveFrom };
  }

  return {
    success: false,
    error: errors.length > 0
      ? errors.join(' | ')
      : 'No email transport configured (set GMAIL_WEBHOOK_URL, RESEND_API_KEY, or BREVO_API_KEY on Render)',
  };
}
