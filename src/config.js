import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  ownerEmail: process.env.OWNER_EMAIL || 'architd062@gmail.com',
  businessEmail: process.env.BUSINESS_EMAIL || process.env.OWNER_EMAIL || 'architd062@gmail.com',
  senderName: process.env.EMAIL_SENDER_NAME || 'Archit | SureGreet AI',
  timezone: process.env.TIMEZONE || 'America/New_York',

  // Email / SMTP or HTTP API (Easily switchable to custom business domain)
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE !== 'false',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || `Archit | SureGreet AI <${process.env.BUSINESS_EMAIL || process.env.OWNER_EMAIL || 'architd062@gmail.com'}>`,
  },
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFrom: process.env.RESEND_FROM || `Archit | SureGreet AI <${process.env.BUSINESS_EMAIL ? process.env.BUSINESS_EMAIL : 'onboarding@resend.dev'}>`,

  // Cal.com
  calcom: {
    apiKey: process.env.CAL_API_KEY || '',
    apiVersion: '2024-08-13',
  },

  // HubSpot
  hubspot: {
    accessToken: process.env.HUBSPOT_ACCESS_TOKEN || '',
  },

  // Retell AI
  retell: {
    apiKey: process.env.RETELL_API_KEY || '',
    fromNumber: process.env.RETELL_FROM_NUMBER || '',
    agentId: process.env.RETELL_AGENT_ID || '',
  },

  // Slack
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',

  // Google Sheets
  googleSheets: {
    sheetId: process.env.GOOGLE_SHEET_ID || '1Ev8UJfc8kvBE2C6o6eJRr2aJfNKflAKWGiRgVg7svXM',
    tabName: process.env.GOOGLE_SHEET_TAB_NAME || '📞 Call Logs',
    serviceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './service-account.json',
  },
};
