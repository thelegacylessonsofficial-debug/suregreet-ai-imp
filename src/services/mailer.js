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
    });
  }
  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
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
    console.log(`[Mailer] Email sent successfully to: ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Mailer] Error sending email to ${to}:`, err.message);
    throw err;
  }
}
