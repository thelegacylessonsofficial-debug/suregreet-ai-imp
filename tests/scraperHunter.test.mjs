import test from 'node:test';
import assert from 'node:assert/strict';
import {
  qualifyLead,
  detectSchedulingStack,
  hasLiveSchedulerInText,
  GENERIC_EMAIL_LOCALS,
} from '../src/services/qualifierService.js';
import { isSafePublicHttpUrl, extractVisibleText } from '../src/services/scraperService.js';
import {
  commitLeadToSupabase,
  getNextCascadeCity,
  ORDERED_CASCADE_CITIES,
} from '../src/services/leadHunterService.js';
import { runDigitalAudit } from '../src/services/auditorService.js';

test('cal.com boundary detection prevents mechanical domains from triggering Google Calendar', () => {
  assert.equal(hasLiveSchedulerInText('Visit https://missionmechanical.com for service'), false);
  assert.equal(hasLiveSchedulerInText('Visit https://local.com/hvac'), false);
  assert.equal(hasLiveSchedulerInText('Book at https://cal.com/archit/15min'), true);
  assert.equal(hasLiveSchedulerInText('Book at https://app.cal.com/team/call'), true);
  assert.equal(hasLiveSchedulerInText('https://calendly.com/acme-hvac'), true);

  const stack = detectSchedulingStack('Powered by https://missionmechanical.com and servicetitan.com', {}, { hasHtmlForm: true });
  assert.equal(stack.isServiceTitan, true);
  assert.equal(stack.allDetected.includes('Google Calendar'), false);
});

test('SSRF URL guard blocks loopback, private LAN, cloud metadata, and allows valid HTTPS contractor sites', () => {
  assert.equal(isSafePublicHttpUrl('http://127.0.0.1:10000/secret'), false);
  assert.equal(isSafePublicHttpUrl('http://localhost:3000'), false);
  assert.equal(isSafePublicHttpUrl('http://169.254.169.254/latest/meta-data/'), false);
  assert.equal(isSafePublicHttpUrl('http://10.0.0.5/admin'), false);
  assert.equal(isSafePublicHttpUrl('http://172.16.0.1/status'), false);
  assert.equal(isSafePublicHttpUrl('http://192.168.1.1'), false);
  assert.equal(isSafePublicHttpUrl('ftp://missionmechanical.com'), false);
  assert.equal(isSafePublicHttpUrl('https://missionmechanical.com'), true);
  assert.equal(isSafePublicHttpUrl('jwheatingandair.com'), true);
});

test('PE and national franchise blocklist blocks One Hour Air, bluefrog, Servpro, and affiliate shells', () => {
  const oneHour = qualifyLead({
    url: 'https://pitzersonehourair.com',
    clinicName: "Pitzer's One Hour Air Conditioning and Heating",
    phone: '(928) 985-4107',
    email: 'office@pitzersonehourair.com',
    doctorName: 'Jane Doe (Owner)',
    niche: 'hvac',
    visibleText: 'Mon-Fri 8am-5pm. Residential AC repair and system replacement.',
  });
  assert.equal(oneHour.qualified, false);
  assert.equal(oneHour.isChain, true);

  const bluefrog = qualifyLead({
    url: 'https://bluefrogplumbingnorthdallas.com',
    clinicName: 'bluefrog Plumbing + Drain of North Dallas',
    phone: '(214) 555-0144',
    email: 'owner@example.com',
    doctorName: 'Bob Smith (Owner)',
    niche: 'plumbing',
    visibleText: 'Emergency plumbing Mon-Fri 8am-5pm.',
  });
  assert.equal(bluefrog.qualified, false);
  assert.equal(bluefrog.isChain, true);

  const affiliate = qualifyLead({
    url: 'https://emergency-ac-pros.com',
    clinicName: 'Austin Emergency AC Pros',
    phone: '(512) 555-0199',
    doctorName: 'Mike Ross',
    niche: 'hvac',
    visibleText: 'Request a quote today.',
  });
  assert.equal(affiliate.qualified, false);
  assert.equal(affiliate.isAffiliate, true);
});

test('generic email rejection treats customerservice@ and noreply@ uniformly as generic', () => {
  assert.equal(GENERIC_EMAIL_LOCALS.has('customerservice'), true);
  assert.equal(GENERIC_EMAIL_LOCALS.has('noreply'), true);

  const res = qualifyLead({
    url: 'https://familyhvacshop.com',
    clinicName: 'Family HVAC Shop',
    phone: '(317) 555-0142',
    email: 'customerservice@familyhvacshop.com',
    doctorName: 'Owner / Operations Lead at Family HVAC Shop',
    niche: 'hvac',
    visibleText: 'Residential AC repair since 2010. 250 Google reviews 4.8 stars. Mon-Fri 8am-5pm. System replacement & financing.',
    adSignals: { lsaVerified: true },
  }, { hasStaticForm: true });

  assert.equal(res.mustHaves.verifiablePhoneAndOwner.pass, false);
  assert.equal(res.qualified, false);
});

test('fleet #1 and calendar year reviews do not cause false-positive disqualifications', () => {
  const res = qualifyLead({
    url: 'https://solidlocalhvac.com',
    clinicName: 'Solid Local HVAC',
    phone: '(317) 733-8686',
    email: 'mike@solidlocalhvac.com',
    doctorName: 'Mike Solid (Owner)',
    city: 'Carmel, IN',
    niche: 'hvac',
    adSignals: { confirmedGoogleAds: true },
    visibleText:
      'Family owned residential AC repair & HVAC replacement since 2012. Voted #1 technicians in Carmel 2024 reviews showcase. 185 Google reviews, 4.9 stars. Mon-Fri 8:00 AM to 5:00 PM. Request a quote.',
  }, { hasStaticForm: true });

  assert.equal(res.fleetSize, null);
  assert.equal(res.reviewCount, 185);
  assert.equal(res.qualified, true);
  assert.equal(res.score, 79);
  assert.equal(res.grade, 'B');

  const tierA = qualifyLead({
    url: 'https://solidlocalhvac.com',
    clinicName: 'Solid Local HVAC',
    phone: '(317) 733-8686',
    email: 'mike@solidlocalhvac.com',
    doctorName: 'Mike Solid (Owner)',
    city: 'Carmel, IN',
    niche: 'hvac',
    stackText: 'housecallpro.com',
    adSignals: { confirmedGoogleAds: true },
    visibleText:
      'Family owned residential AC repair & HVAC replacement since 2012. Voted #1 technicians in Carmel 2024 reviews showcase. 185 Google reviews, 4.9 stars. Mon-Fri 8:00 AM to 5:00 PM. Request a quote.',
  }, { hasStaticForm: true });
  assert.equal(tierA.score, 80);
  assert.equal(tierA.grade, 'A');
});

test('qualifyLead honors explicit minScore=0 instead of coercing to 60', () => {
  const res = qualifyLead({
    url: 'https://familyhvac.com',
    clinicName: 'Family HVAC',
    phone: '(317) 555-0111',
    email: 'john@familyhvac.com',
    doctorName: 'John Doe (Owner)',
    city: 'Carmel, IN',
    niche: 'hvac',
    visibleText: 'Residential AC repair. Request a quote.',
  }, { hasStaticForm: true }, 0);

  assert.equal(res.threshold, 0);
  assert.equal(res.qualified, true);
});

test('commitLeadToSupabase rejects leads without a verified email rather than fabricating info@', async () => {
  const res = await commitLeadToSupabase({
    url: 'https://crowsheatandair.com',
    clinicName: "Crow's Heat & Air",
    phone: '(972) 548-1323',
    email: null,
    qualification: { score: 82, grade: 'A', qualified: true, disqualifyReasons: [] },
  });

  assert.equal(res.success, false);
  assert.equal(res.noEmail, true);
});

test('runDigitalAudit correctly identifies static form on mechanical domain without false cal.com hit', async () => {
  const html = `
    <html><body>
      <h1>Mission Mechanical Heating & Cooling</h1>
      <p>Visit missionmechanical.com — Request an estimate for Emergency AC Repair. Closed weekends.</p>
      <form><input name="name"><input name="phone"><textarea name="issue"></textarea></form>
    </body></html>
  `;
  const audit = await runDigitalAudit({
    url: 'https://missionmechanical.com',
    niche: 'hvac',
    htmlContent: html,
  });

  assert.equal(audit.success, true);
  assert.equal(audit.hasStaticForm, true);
  assert.ok(!audit.specificObservation.includes('patient'), 'Trade contractor audit must never use medical copy');
});

test('cascade city progression advances cleanly across cities and wraps cleanly', () => {
  const first = ORDERED_CASCADE_CITIES[0];
  const last = ORDERED_CASCADE_CITIES[ORDERED_CASCADE_CITIES.length - 1];
  assert.equal(getNextCascadeCity('Carmel, IN'), 'Zionsville, IN');
  assert.equal(getNextCascadeCity(last), first);
  assert.equal(getNextCascadeCity(''), first);
});

test('extractVisibleText strips HTML script/style noise and keeps clean visible content', () => {
  const txt = extractVisibleText('<html><script>alert(1)</script><style>body{}</style><body><h1>Hello&nbsp;HVAC &amp; Cooling</h1></body></html>');
  assert.equal(txt, 'Hello HVAC & Cooling');
});

test('qualifyLead awards 10 ad points for explicit googleAds callers while preserving 7 pts for GTM-only', () => {
  const explicitAds = qualifyLead({
    url: 'https://hvacsample.com',
    clinicName: 'HVAC Sample',
    phone: '(317) 555-0100',
    doctorName: 'John Smith (Owner)',
    adSignals: { googleAds: true, hasPaidAds: true },
    visibleText: 'Mon-Fri 8am-5pm. Request a quote.',
  });
  assert.equal(explicitAds.breakdown.fitAndUrgency.subScores.paidAds, 10);

  const gtmOnly = qualifyLead({
    url: 'https://hvacsample2.com',
    clinicName: 'HVAC Sample 2',
    phone: '(317) 555-0101',
    doctorName: 'Jane Smith (Owner)',
    adSignals: { googleAds: true, gtmOrGtag: true, confirmedGoogleAds: false },
    visibleText: 'Mon-Fri 8am-5pm. Request a quote.',
  });
  assert.equal(gtmOnly.breakdown.fitAndUrgency.subScores.paidAds, 7);
});
