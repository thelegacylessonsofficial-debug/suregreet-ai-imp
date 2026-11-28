/**
 * SureGreet AI — Gmail HTTPS Dispatch Bridge (Google Apps Script)
 *
 * Why this exists:
 * Render's Free Tier blocks outbound TCP connections on SMTP ports (25, 465, 587).
 * Deploying this script as a Google Apps Script Web App lets SureGreet AI dispatch
 * emails cleanly over Port 443 HTTPS directly from your Gmail account (architd062@gmail.com)
 * with zero SMTP firewall timeouts and zero custom domain DNS setup.
 *
 * Setup Steps:
 * 1. Go to https://script.google.com while signed in as architd062@gmail.com
 * 2. Create a new project ("SureGreet Mailer Bridge"), paste this entire file into Code.gs
 * 3. Optional (Recommended): Project Settings -> Script Properties -> add key:
 *    BRIDGE_SECRET = <any long random string, matching GMAIL_WEBHOOK_SECRET in Render>
 * 4. Click Deploy -> New deployment -> Select type: Web app
 *    - Execute as: Me (architd062@gmail.com)
 *    - Who has access: Anyone
 * 5. Authorize Gmail permissions when prompted, copy the Web App URL (ends in /exec)
 * 6. In Render Environment Variables, set:
 *    - GMAIL_WEBHOOK_URL = <your copied /exec URL>
 *    - GMAIL_WEBHOOK_SECRET = <same secret from step 3, if set>
 */

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getExpectedSecret() {
  return PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET') || '';
}

function isAuthorized(providedSecret) {
  var expected = getExpectedSecret();
  if (!expected) return true;
  return String(providedSecret || '') === String(expected);
}

function doGet(e) {
  try {
    var secret = (e && e.parameter && e.parameter.secret) || '';
    if (!isAuthorized(secret)) {
      return jsonOut({ success: false, error: 'Unauthorized: invalid bridge secret' });
    }
    var userEmail = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
    return jsonOut({
      success: true,
      status: 'online',
      provider: 'gmail_apps_script_bridge',
      from: userEmail,
      quotaRemaining: MailApp.getRemainingDailyQuota(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return jsonOut({ success: false, error: err.message });
  }
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(raw);

    if (!isAuthorized(payload.secret)) {
      return jsonOut({ success: false, error: 'Unauthorized: invalid bridge secret' });
    }

    var to = String(payload.to || '').trim();
    var subject = String(payload.subject || '').trim();
    var text = String(payload.text || payload.body || '').trim();
    var html = payload.html ? String(payload.html) : '';

    if (!to || !subject) {
      return jsonOut({ success: false, error: 'Missing required fields: to and subject' });
    }

    var options = {};
    if (html) options.htmlBody = html;
    if (payload.name) options.name = String(payload.name);
    if (payload.replyTo) options.replyTo = String(payload.replyTo);

    GmailApp.sendEmail(to, subject, text || subject, options);

    var activeUser = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
    return jsonOut({
      success: true,
      provider: 'gmail_apps_script_bridge',
      from: activeUser,
      to: to,
      quotaRemaining: MailApp.getRemainingDailyQuota(),
      sentAt: new Date().toISOString(),
    });
  } catch (err) {
    return jsonOut({ success: false, error: err.message });
  }
}
