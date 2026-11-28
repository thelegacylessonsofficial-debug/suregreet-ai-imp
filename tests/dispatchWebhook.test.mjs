import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeE164Phone,
  parseLeadCallbackPayload,
  createLeadCallbackHandler,
} from '../src/routes/leadCallbackWebhook.js';
import { config } from '../src/config.js';
import { dispatchRetellCall, sendSlackAlert } from '../src/services/retell.js';
import { buildCallbackContactProperties } from '../src/services/hubspot.js';
import { getCalAcceptedBookings } from '../src/services/calcom.js';
import { normalizeCalBooking } from '../src/cron/reminderCron.js';
import { formatBookingDateTime } from '../src/routes/calcomWebhook.js';

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test('normalizeE164Phone validates strict E.164 and strips benign formatting', () => {
  assert.equal(normalizeE164Phone('+1 (512) 555-0199'), '+15125550199');
  assert.equal(normalizeE164Phone('+442071838750'), '+442071838750');
  assert.equal(normalizeE164Phone('+abcdef1234'), null);
  assert.equal(normalizeE164Phone('5125550199'), null);
  assert.equal(normalizeE164Phone('+0123456789'), null);
  assert.equal(normalizeE164Phone('+1234'), null);
});

test('parseLeadCallbackPayload handles nested body, sanitization, and invalid emails', () => {
  const parsed = parseLeadCallbackPayload({
    body: {
      full_name: 'Randy <Vance>',
      company_name: 'Vance HVAC & Cooling',
      email: 'RANDY@VANCEAC.COM',
      phone_e164: '+1 (713) 702-4721',
      industry: 'HVAC',
      bottleneck_notes: 'Missing calls after 6 PM',
    },
  });
  assert.equal(parsed.fullName, 'Randy <Vance>');
  assert.equal(parsed.companyName, 'Vance HVAC & Cooling');
  assert.equal(parsed.email, 'randy@vanceac.com');
  assert.equal(parsed.phoneE164, '+17137024721');

  const badEmail = parseLeadCallbackPayload({
    full_name: 'Bob',
    email: 'not-an-email',
    phone_e164: '+15125550101',
  });
  assert.equal(badEmail.email, '');
});

test('leadCallback handler rejects honeypot bots and malformed phones with 400', async () => {
  let called = false;
  const handler = createLeadCallbackHandler({
    dedupeStore: new Map(),
    dispatchRetellCall: async () => {
      called = true;
      return { ok: true };
    },
  });

  const botRes = mockRes();
  await handler({ body: { company_website_fax: 'spam', phone_e164: '+15125550199' } }, botRes);
  assert.equal(botRes.statusCode, 400);
  assert.equal(botRes.body.status, 'ignored');
  assert.equal(called, false);

  const badPhoneRes = mockRes();
  await handler({ body: { phone_e164: '+123-abc-9999' } }, badPhoneRes);
  assert.equal(badPhoneRes.statusCode, 400);
  assert.equal(called, false);
});

test('leadCallback handler orchestrates live dispatch, Supabase, HubSpot, Telegram, and dedupe', async () => {
  const alerts = [];
  const telegrams = [];
  const dbWrites = [];
  let dispatchCount = 0;

  const handler = createLeadCallbackHandler({
    dedupeStore: new Map(),
    dispatchRetellCall: async (args) => {
      dispatchCount += 1;
      assert.equal(args.toNumber, '+15125550142');
      assert.equal(args.companyName, 'Cool Air LLC');
      return { ok: true, dispatched: true, mock: false, callId: 'call_live_123' };
    },
    createLeadFromCallback: async (args) => {
      assert.equal(args.companyName, 'Cool Air LLC');
      return { ok: true, id: 'hs_999' };
    },
    supabaseFetch: async (ep, opts) => {
      dbWrites.push({ ep, body: JSON.parse(opts.body) });
      return { ok: true, status: 201, data: [{ id: 'sb_1' }] };
    },
    sendTelegramHtml: async (html) => {
      telegrams.push(html);
      return { ok: true };
    },
    sendSlackAlert: async () => ({ ok: true, skipped: false }),
    sendAutomationAlert: async (a) => alerts.push(a),
  });

  const payload = {
    full_name: 'Jane <Owner>',
    company_name: 'Cool Air LLC',
    email: 'jane@coolair.example',
    phone_e164: '+15125550142',
    industry: 'HVAC',
    bottleneck_notes: 'Voicemail after 5 PM',
  };

  const res1 = mockRes();
  await handler({ body: payload }, res1);
  assert.equal(res1.statusCode, 200);
  assert.equal(res1.body.status, 'ok');
  assert.equal(res1.body.dispatch_mode, 'live');
  assert.equal(res1.body.call_dispatched, true);
  assert.equal(res1.body.crm_synced, true);
  assert.equal(res1.body.hubspot_contact_id, 'hs_999');
  assert.equal(res1.body.supabase_logged, true);
  assert.equal(res1.body.telegram_notified, true);
  assert.equal(res1.body.call_id, 'call_live_123');
  assert.equal(alerts.length, 0);
  assert.equal(dbWrites.length, 1);
  assert.equal(dbWrites[0].ep, '/leads');
  assert.equal(dbWrites[0].body.status, 'dispatched');
  assert.equal(telegrams.length, 1);
  assert.ok(telegrams[0].includes('Jane &lt;Owner&gt;'), 'Telegram HTML should escape user-supplied angle brackets');

  // Duplicate submission within 60s is cleanly suppressed without re-firing Retell
  const res2 = mockRes();
  await handler({ body: payload }, res2);
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.status, 'duplicate_suppressed');
  assert.equal(dispatchCount, 1);
});

test('leadCallback handler fires sendAutomationAlert on Retell and HubSpot failures', async () => {
  const alerts = [];
  const handler = createLeadCallbackHandler({
    dedupeStore: new Map(),
    dispatchRetellCall: async () => ({ ok: false, dispatched: false, mock: false, callId: null, error: 'Retell 502 Bad Gateway' }),
    createLeadFromCallback: async () => ({ ok: false, skipped: false, error: 'HubSpot missing scope' }),
    supabaseFetch: async () => ({ ok: true, data: [] }),
    sendTelegramHtml: async () => ({ ok: true }),
    sendSlackAlert: async () => ({ ok: false, skipped: true }),
    sendAutomationAlert: async (a) => alerts.push(a),
  });

  const res = mockRes();
  await handler({ body: { full_name: 'Test Contractor', phone_e164: '+12145550188', industry: 'Plumbing' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'fallback_cal');
  assert.equal(res.body.dispatch_mode, 'fallback');
  assert.equal(res.body.call_dispatched, false);
  assert.equal(res.body.crm_synced, false);
  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].action, 'dispatchRetellCall');
  assert.equal(alerts[1].action, 'createLeadFromCallback');
});

test('retell.js dispatchRetellCall handles mock mode, placeholder fromNumber, empty target, and unconfigured Slack', async () => {
  const origKey = config.retell.apiKey;
  const origAgent = config.retell.agentId;
  const origFrom = config.retell.fromNumber;
  const origSlack = config.slackWebhookUrl;

  try {
    config.retell.apiKey = '';
    config.retell.agentId = '';
    const retellRes = await dispatchRetellCall({
      toNumber: '+15125550199',
      customerName: 'Archit',
      industry: 'HVAC',
    });
    assert.equal(retellRes.ok, true);
    assert.equal(retellRes.mock, true);
    assert.ok(String(retellRes.callId).startsWith('mock_retell_call_'));

    config.retell.apiKey = 'test_key';
    config.retell.agentId = 'test_agent';
    config.retell.fromNumber = '+1XXXXXXXXXX';
    const badFrom = await dispatchRetellCall({
      toNumber: '+15125550199',
      customerName: 'Archit',
      industry: 'HVAC',
    });
    assert.equal(badFrom.ok, false);
    assert.equal(badFrom.dispatched, false);
    assert.match(String(badFrom.error), /RETELL_FROM_NUMBER/);

    const emptyNum = await dispatchRetellCall({ toNumber: '' });
    assert.equal(emptyNum.ok, false);

    config.slackWebhookUrl = '';
    const slackRes = await sendSlackAlert({ text: 'test' });
    assert.equal(slackRes.skipped, true);
  } finally {
    config.retell.apiKey = origKey;
    config.retell.agentId = origAgent;
    config.retell.fromNumber = origFrom;
    config.slackWebhookUrl = origSlack;
  }
});

test('formatBookingDateTime converts UTC timestamps to America/New_York instead of server UTC', () => {
  // 2026-11-28T20:00:00Z is 03:00 PM EST (UTC-5 in late November)
  const formatted = formatBookingDateTime('2026-11-28T20:00:00Z', 'America/New_York');
  assert.equal(formatted, '28 Nov 2026, 03:00 PM');
});

test('normalizeCalBooking extracts Cal.com v2 start, end, meetingUrl, and attendee', () => {
  const norm = normalizeCalBooking(
    {
      id: 98765,
      title: 'HVAC AI Demo',
      start: '2026-11-29T18:00:00.000Z',
      end: '2026-11-29T18:15:00.000Z',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      attendees: [{ name: 'Randy Vance', email: 'randy@vanceac.com' }],
    },
    'America/New_York'
  );
  assert.equal(norm.bookingId, 98765);
  assert.equal(norm.meetingUrl, 'https://meet.google.com/abc-defg-hij');
  assert.equal(norm.attendeeEmail, 'randy@vanceac.com');
  assert.equal(norm.startTime, '29 Nov 2026, 01:00 PM EST/EDT');
});

test('getCalAcceptedBookings hits Cal.com API v2 upcoming endpoint without BadRequestException', async () => {
  const bookings = await getCalAcceptedBookings();
  assert.ok(Array.isArray(bookings), 'Expected array from Cal.com v2 upcoming bookings');
});

test('buildCallbackContactProperties omits invalid lead_source/blank email and sets standard HubSpot fields', () => {
  const props = buildCallbackContactProperties({
    fullName: 'Randy Vance',
    companyName: 'Vance Air Conditioning',
    email: 'not-an-email',
    phoneE164: '+17137024721',
    industry: 'HVAC',
    bottleneckNotes: 'Missed evening calls',
  });
  assert.equal(props.firstname, 'Randy');
  assert.equal(props.lastname, 'Vance');
  assert.equal(props.company, 'Vance Air Conditioning');
  assert.equal(props.hs_lead_status, 'NEW');
  assert.equal(props.lifecyclestage, 'lead');
  assert.equal('lead_source' in props, false);
  assert.equal('email' in props, false);
  assert.ok(props.message.includes('Missed evening calls'));
});
