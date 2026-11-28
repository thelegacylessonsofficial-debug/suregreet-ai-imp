import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter = null;
let rotationIndex = 0;

function parseDisplayAndEmail(fromStr, fallbackName = 'Archit Deshmukh') {
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

/**
 * Parses Hostinger Business Mail accounts from env:
 * - HOSTINGER_MAIL_ACCOUNTS JSON array: [{"email":"archit@suregreet.com","mailboxId":"AC...","displayName":"Archit Deshmukh","token":"..."}]
 * - Or single-mailbox fallback: HOSTINGER_MAIL_TOKEN + HOSTINGER_MAILBOX_ID (+ HOSTINGER_MAIL_FROM)
 */
export function getHostingerMailAccounts() {
  const accounts = [];
  const rawJson = process.env.HOSTINGER_MAIL_ACCOUNTS;
  if (rawJson && rawJson.trim()) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.token && item.mailboxId && item.email) {
            accounts.push({
              email: String(item.email).trim(),
              mailboxId: String(item.mailboxId).trim(),
              displayName: String(item.displayName || config.senderName || 'Archit Deshmukh').trim(),
              token: String(item.token).trim(),
            });
          }
        }
      }
    } catch (err) {
      console.warn('[Mailer:Hostinger] Invalid HOSTINGER_MAIL_ACCOUNTS JSON:', err.message);
    }
  }

  if (accounts.length === 0 && process.env.HOSTINGER_MAIL_TOKEN && process.env.HOSTINGER_MAILBOX_ID) {
    accounts.push({
      email: (process.env.HOSTINGER_MAIL_FROM || process.env.BUSINESS_EMAIL || config.businessEmail || 'archit@suregreet.com').trim(),
      mailboxId: process.env.HOSTINGER_MAILBOX_ID.trim(),
      displayName: (process.env.HOSTINGER_DISPLAY_NAME || config.senderName || 'Archit Deshmukh').trim(),
      token: process.env.HOSTINGER_MAIL_TOKEN.trim(),
    });
  }

  return accounts;
}

function getConfiguredProviders() {
  const hostingerAccounts = getHostingerMailAccounts();
  return {
    hostinger: hostingerAccounts.length > 0,
    resend: Boolean(process.env.RESEND_API_KEY),
    gmailBridge: Boolean(process.env.GMAIL_WEBHOOK_URL),
    brevo: Boolean(process.env.BREVO_API_KEY),
    smtp: Boolean(config.smtp?.user && config.smtp?.pass),
  };
}

function getActiveTransportName() {
  const p = getConfiguredProviders();
  if (p.hostinger) return 'hostinger';
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
  const hostingerAccounts = getHostingerMailAccounts();
  if (hostingerAccounts.length > 0) {
    return hostingerAccounts.map((a) => `${a.displayName} <${a.email}>`);
  }

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
  return [process.env.EMAIL_FROM || config.ownerEmail || 'archit@suregreet.com'];
}

/**
 * Round-robin selector across registered sending inboxes
 */
export function getNextSenderInbox() {
  const hostingerAccounts = getHostingerMailAccounts();
  if (hostingerAccounts.length > 0) {
    const index = rotationIndex % hostingerAccounts.length;
    const acc = hostingerAccounts[index];
    rotationIndex++;
    return {
      selected: `${acc.displayName} <${acc.email}>`,
      index,
      totalInboxes: hostingerAccounts.length,
      hostingerAccount: acc,
    };
  }

  const inboxes = getSenderInboxes();
  const index = rotationIndex % inboxes.length;
  const selected = inboxes[index];
  rotationIndex++;
  return {
    selected,
    index,
    totalInboxes: inboxes.length,
    hostingerAccount: null,
  };
}

export function getMailerStatus() {
  const inboxes = getSenderInboxes();
  const providers = getConfiguredProviders();
  const activeTransport = getActiveTransportName();
  const port443Ready = providers.hostinger || providers.resend || providers.gmailBridge || providers.brevo;
  const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);

  const labelMap = {
    hostinger: 'Hostinger Mail API (Port 443)',
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

async function sendViaHostingerMail({ account, to, subject, html, text, inReplyTo }) {
  if (!account || !account.token || !account.mailboxId) return null;

  const baseUrl = (process.env.HOSTINGER_MAIL_API_BASE || 'https://api.mail.hostinger.com').replace(/\/+$/, '');
  const endpoint = `${baseUrl}/api/v1/mailboxes/${encodeURIComponent(account.mailboxId)}/send`;

  const recipients = (Array.isArray(to) ? to : [to]).map((e) => String(e).trim()).filter(Boolean);
  const payload = {
    to: recipients,
    displayName: account.displayName || config.senderName || 'Archit Deshmukh',
    subject: String(subject || '').trim(),
    text: String(text || ''),
  };
  if (html) payload.html = html;
  if (inReplyTo && typeof inReplyTo === 'object' && inReplyTo.uid && inReplyTo.folder) {
    payload.inReplyTo = { folder: String(inReplyTo.folder), uid: Number(inReplyTo.uid) };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${account.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    clearTimeout(timer);

    const rawText = await res.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (_) {
      data = { raw: rawText };
    }

    if (res.ok) {
      const fromHeader = `${payload.displayName} <${account.email}>`;
      console.log(`[Mailer:Hostinger] Sent from ${account.email} to ${recipients.join(', ')} (HTTP ${res.status})`);
      return {
        success: true,
        provider: 'hostinger_mail_api',
        from: fromHeader,
        mailboxId: account.mailboxId,
        messageId: data?.messageId || data?.id || `<hostinger-${Date.now()}@${account.email.split('@')[1] || 'suregreet.com'}>`,
      };
    }

    const errMsg = data?.message || data?.error || (data?.errors ? JSON.stringify(data.errors) : `Hostinger HTTP ${res.status}`);
    console.warn(`[Mailer:Hostinger] Send rejected for ${account.email}:`, errMsg);
    return { success: false, provider: 'hostinger_mail_api', error: errMsg };
  } catch (err) {
    return { success: false, provider: 'hostinger_mail_api', error: err.message };
  }
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
    inReplyTo: typeof inReplyTo === 'string' ? inReplyTo : '',
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

  const hostingerAccounts = getHostingerMailAccounts();
  if (hostingerAccounts.length > 0) {
    const baseUrl = (process.env.HOSTINGER_MAIL_API_BASE || 'https://api.mail.hostinger.com').replace(/\/+$/, '');
    for (const acc of hostingerAccounts) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        const res = await fetch(`${baseUrl}/api/v1/mailboxes/${encodeURIComponent(acc.mailboxId)}/quota`, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${acc.token}`,
            Accept: 'application/json',
          },
        });
        clearTimeout(timer);
        const data = await res.json().catch(() => ({}));
        checks.push({
          provider: `hostinger (${acc.email})`,
          reachable: res.ok,
          mailboxId: acc.mailboxId,
          quota: data,
          note: res.ok
            ? `Hostinger Mail API ready for ${acc.email} (Port 443 HTTP)`
            : data?.message || data?.error || `Hostinger HTTP ${res.status}`,
        });
      } catch (err) {
        checks.push({ provider: `hostinger (${acc.email})`, reachable: false, note: err.message });
      }
    }
  }

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

  // Only test SMTP if no Port 443 HTTP provider is active (avoids slow 5s timeout noise when Hostinger HTTP is active)
  if (!status.port443Ready) {
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
            ? `SMTP blocked (${err.message}). Render Free Tier drops outbound TCP on ports 25/465/587 — connect Hostinger Mail API, Resend, or Gmail HTTPS Bridge for Port 443.`
            : err.message,
        });
      }
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
  if (typeof inReplyTo === 'string' && inReplyTo) customHeaders['In-Reply-To'] = inReplyTo;
  if (references) customHeaders['References'] = references;

  const { selected: selectedFrom, hostingerAccount } = getNextSenderInbox();
  const effectiveFrom = from || selectedFrom;
  const errors = [];

  // 1. Hostinger Business Mail HTTP API (Port 443 — rotates across configured suregreet.com / suregreetai.com mailboxes)
  const hostingerAccounts = getHostingerMailAccounts();
  if (hostingerAccounts.length > 0) {
    const explicitMatch = from
      ? hostingerAccounts.find((a) => String(from).toLowerCase().includes(a.email.toLowerCase()))
      : null;
    const chosenAccount = explicitMatch || hostingerAccount || hostingerAccounts[0];
    const hRes = await sendViaHostingerMail({
      account: chosenAccount,
      to,
      subject,
      html,
      text,
      inReplyTo,
    });
    if (hRes) {
      if (hRes.success) return hRes;
      errors.push(`Hostinger(${chosenAccount.email}): ${hRes.error}`);
    }
  }

  // 2. Resend HTTP API (Port 443)
  const resendRes = await sendViaResend({ to, subject, html, text, effectiveFrom, replyTo, customHeaders });
  if (resendRes) {
    if (resendRes.success) return resendRes;
    errors.push(`Resend: ${resendRes.error}`);
  }

  // 3. Gmail Apps Script Bridge (Port 443)
  const gmailRes = await sendViaGmailBridge({ to, subject, html, text, effectiveFrom, replyTo, inReplyTo });
  if (gmailRes) {
    if (gmailRes.success) return gmailRes;
    errors.push(`GmailBridge: ${gmailRes.error}`);
  }

  // 4. Brevo HTTP API (Port 443)
  const brevoRes = await sendViaBrevo({ to, subject, html, text, effectiveFrom, replyTo, customHeaders });
  if (brevoRes) {
    if (brevoRes.success) return brevoRes;
    errors.push(`Brevo: ${brevoRes.error}`);
  }

  // 5. Fallback to Nodemailer SMTP (only works on paid Render / local dev / VPS)
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
      if (typeof inReplyTo === 'string' && inReplyTo) mailOptions.inReplyTo = inReplyTo;
      if (references) mailOptions.references = references;
      if (messageId) mailOptions.messageId = messageId;

      const info = await mailClient.sendMail(mailOptions);
      console.log(`[Mailer:SMTP] Sent to ${to} (MessageId: ${info.messageId}, From: ${smtpFrom})`);
      return { success: true, messageId: info.messageId, provider: 'smtp', from: smtpFrom };
    } catch (err) {
      const hint = /timeout|ETIMEDOUT|ECONNREFUSED/i.test(err.message)
        ? ' (Render Free Tier blocks SMTP ports 25/465/587 — use Hostinger Mail API, Resend, or Gmail Bridge over Port 443)'
        : '';
      console.error(`[Mailer:SMTP] Error sending email to ${to}:`, err.message);
      errors.push(`SMTP: ${err.message}${hint}`);
    }
  }

  if (process.env.MOCK_EMAIL === 'true') {
    console.log(`[Mailer Mock] Email to: ${to} | Subject: "${subject}" | From: ${effectiveFrom}`);
    return { mock: true, success: true, messageId: messageId || `<mock-${Date.now()}@suregreet.ai>`, from: effectiveFrom };
  }

  return {
    success: false,
    error: errors.length > 0
      ? errors.join(' | ')
      : 'No Port 443 or reachable SMTP email transport configured',
  };
}
