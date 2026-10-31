import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!config.smtp.user || !config.smtp.pass) {
      console.warn('[Mailer] Warning: SMTP_USER or SMTP_PASS is not configured in .env. Emails will only be logged.');
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
      connectionTimeout: 5000, // 5s connection timeout
      greetingTimeout: 5000,
      socketTimeout: 8000,
    });
  }
  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  // 1. Try Resend HTTP API (Port 443 — bypasses any cloud SMTP port blocking)
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'SureGreet AI <onboarding@resend.dev>',
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
          text: text || '',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`[Mailer:Resend] Email sent successfully to ${to} (ID: ${data.id})`);
        return { success: true, messageId: data.id, provider: 'resend' };
      } else {
        console.warn(`[Mailer:Resend] Warning from API:`, data.message || data);
      }
    } catch (resendErr) {
      console.warn(`[Mailer:Resend] Failed HTTP dispatch, trying SMTP fallback:`, resendErr.message);
    }
  }

  // 2. Fallback to Nodemailer SMTP
  const mailClient = getTransporter();

  if (!mailClient) {
    console.log(`[Mailer Mock] Email to: ${to} | Subject: "${subject}"`);
    return { mock: true, success: true };
  }

  try {
    const info = await mailClient.sendMail({
      from: config.smtp.from,
      to,
      subject,
      html,
      text: text || '',
    });
    console.log(`[Mailer:SMTP] Email sent successfully to: ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId, provider: 'smtp' };
  } catch (err) {
    console.error(`[Mailer:SMTP] Error sending email to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}
