# Nexflo & SureGreet AI Automation Hub

> **100% Free, Zero-Subscription Replacement for n8n**
> Covers all 4 workflows: Cal.com 24h Daily Reminders, Cal.com Booking Management, Retell AI Post-Call Sync, and Instant Voice Callback.

---

## 🚀 Features Included

| Workflow | Trigger | Replacement Action |
| :--- | :--- | :--- |
| **24h Daily Reminders** | Daily at 9:00 AM (US Eastern) | Polls Cal.com v2 API for tomorrow's accepted bookings, sends styled reminder emails to attendees, and sends an agenda summary table to `architd062@gmail.com`. |
| **Booking Management** | `POST /webhook/calcom-booking-webhook` | Handles `BOOKING_CREATED`, `BOOKING_CANCELLED`, and `BOOKING_RESCHEDULED`. Sends branded HTML emails to both client and owner, and searches/upserts contacts in HubSpot CRM. |
| **Post-Call Voice Sync** | `POST /webhook/retell-post-call-webhook` | Appends caller data to Google Sheets (`📞 Call Logs`), searches/creates contacts in HubSpot, creates formatted HTML call logs & associates them, and emails the owner an executive summary with recording link. |
| **Instant Voice Callback** | `POST /webhook/suregreet-lead-callback` | Validates honeypots & E.164 phone numbers, dispatches automated calls via Retell AI, syncs lead to HubSpot, triggers Slack alerts, and returns instant webhook acknowledgement. |

---

## 🛠️ Quick Local Setup

### 1. Install Dependencies
```bash
cd nexflo-automation-server
npm install
```

### 2. Configure Your `.env` File
Open `.env` and fill in:
* **`SMTP_PASS`**: Your 16-character **Gmail App Password** (see instructions below).
* **`RETELL_API_KEY` & `RETELL_AGENT_ID`**: Your Retell AI credentials.
* **`GOOGLE_SERVICE_ACCOUNT_PATH`**: Path to your Google Cloud Service Account `service-account.json` (for appending to Google Sheets).

### 3. Start the Server
```bash
npm start
```
* The server runs on `http://localhost:3000`.
* The daily 9:00 AM EST reminder cron runs automatically in the background.
* To test the daily reminder immediately without waiting for 9:00 AM, open `http://localhost:3000/test/run-reminders` in your browser.

---

## 🔑 How to Get a Free Gmail App Password (2 Minutes)

You do **not** need to set up Google Cloud OAuth or pay for SendGrid/n8n. Gmail gives you 500 emails/day completely free:

1. Go to your [Google Account Security Settings](https://myaccount.google.com/security).
2. Ensure **2-Step Verification** is turned ON.
3. In the search bar at the top, type **"App passwords"** (or find it under 2-Step Verification).
4. Enter an app name (e.g. `Nexflo Automation`) and click **Create**.
5. Copy the **16-character code** generated (e.g. `abcd efgh ijkl mnop`).
6. Paste it into your `.env`:
   ```env
   SMTP_PASS=abcdefghijklmnop
   ```

---

## ☁️ How to Host 24/7 for FREE (Zero n8n Subscription)

You can host this entire server completely free so it receives webhooks 24/7:

### Option A: Render.com (Recommended - 100% Free)
1. Push this folder to a private GitHub repository.
2. Sign up at [Render.com](https://render.com) (free).
3. Click **New +** → **Web Service** → Connect your GitHub repo.
4. Set:
   * **Runtime**: Node
   * **Build Command**: `npm install`
   * **Start Command**: `npm start`
5. Under **Environment Variables**, copy-paste the values from your `.env`.
6. Click **Create Web Service**.
7. Render gives you a free HTTPS URL: `https://nexflo-automation.onrender.com`.

### Option B: Railway.app / Fly.io / VPS
Alternatively, you can deploy to Railway ($5 free monthly credit covers this easily) or any \$3-5/mo VPS using PM2:
```bash
npm install -g pm2
pm2 start src/server.js --name "nexflo-hub"
```

---

## 🔗 Update Your Webhook URLs

Once your server is running (e.g., `https://your-domain.com` or local tunnel via ngrok):

1. **Cal.com Webhook:**
   * URL: `https://your-domain.com/webhook/calcom-booking-webhook`
   * Triggers: Booking Created, Booking Cancelled, Booking Rescheduled
2. **Retell AI Webhook:**
   * URL: `https://your-domain.com/webhook/retell-post-call-webhook`
3. **Website Callback Form:**
   * URL: `https://your-domain.com/webhook/suregreet-lead-callback`
