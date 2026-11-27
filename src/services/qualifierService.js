/**
 * SureGreet AI — Lead Qualifier (10-Second Eye Test + 100-Point Scoring Engine)
 *
 * Scoring Rubric:
 * ┌────────────────────┬──────────────────────────────────────────┬────────┐
 * │ Metric             │ Pass Condition                            │ Points │
 * ├────────────────────┼──────────────────────────────────────────┼────────┤
 * │ Intake Friction    │ Emergency form leak / after-hours gap     │ 25 pts │
 * │ Fleet Size         │ 5–15 trucks                              │ 20 pts │
 * │ Ownership          │ Single-location independent founder      │ 20 pts │
 * │ Ad Spend           │ Active Google Screened (LSA) / Google Ads│ 15 pts │
 * │ High Ticket        │ Sells $8,000+ system replacements        │ 10 pts │
 * │ Owner Contact      │ Named founder + direct phone or email    │ 10 pts │
 * └────────────────────┴──────────────────────────────────────────┴────────┘
 * Total: 100 pts. Minimum to qualify: 60 pts.
 *
 * 10-Second Eye Test (binary gates — logged but don't block scoring):
 *   1. Reviews between 20–300 (filters solo Chucks & PE chains)
 *   2. Family-owned / 1–2 locations (ensures accessible founder)
 *   3. Form leak or closed after 5 PM (guarantees pain)
 *   4. Active Google Screened / Ads (guarantees they value leads)
 */

const QUALIFY_THRESHOLD = 60; // Minimum score to enter pipeline CRM

// ─── Regex helpers ────────────────────────────────────────────────────────────

/**
 * Extract truck / vehicle count from page text.
 * Looks for patterns like "10 trucks", "fleet of 12 vehicles", "8 service vans"
 */
function extractFleetSize(text) {
  if (!text) return null;
  const patterns = [
    /(\d{1,3})\s*(?:service\s+)?trucks?/i,
    /(\d{1,3})\s*(?:service\s+)?vans?/i,
    /(\d{1,3})\s*(?:service\s+)?vehicles?/i,
    /fleet\s+of\s+(\d{1,3})/i,
    /(\d{1,3})\s*technicians?/i,
    /(\d{1,3})\s*service\s+pros?/i,
    /team\s+of\s+(\d{1,3})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/**
 * Extract Google review count from page text / HTML.
 * Looks for "1,234 reviews", "(456 Google reviews)", "4.9 stars · 123 reviews"
 */
function extractReviewCount(text) {
  if (!text) return null;
  const patterns = [
    /\(?\s*([\d,]+)\s*(?:google\s+)?reviews?\s*\)?/i,
    /([\d,]+)\s*(?:customer\s+)?ratings?/i,
    /stars?[^0-9]*([\d,]+)\s*reviews?/i,
    /([\d,]+)\s*reviews?\s*on/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const count = parseInt(m[1].replace(/,/g, ''), 10);
      if (count > 0) return count;
    }
  }
  return null;
}

/**
 * Detect if site mentions Google Local Services Ads (LSA / Google Screened)
 */
function detectLSA(html, text) {
  const combined = (html || '') + ' ' + (text || '');
  return (
    /google\s+screened/i.test(combined) ||
    /local\s+services?\s+ads?/i.test(combined) ||
    /localservices\.google\.com/i.test(combined) ||
    /lsa\s+verified/i.test(combined) ||
    /google\s+guaranteed/i.test(combined)
  );
}

/**
 * Detect after-hours / form-leak friction signals in page content
 */
function detectIntakeFriction(html, text, auditData) {
  if (auditData) {
    if (auditData.hasStaticForm || auditData.hasVoicemailComplaint || auditData.mentionsAfterHours) {
      return true;
    }
  }
  const combined = (html || '') + ' ' + (text || '');
  return (
    /request\s+(a\s+)?quote/i.test(combined) ||
    /fill\s+out\s+(the\s+)?form/i.test(combined) ||
    /contact\s+us\s+for/i.test(combined) ||
    /after\s+hours/i.test(combined) ||
    /voicemail/i.test(combined) ||
    /8\s*(am|:00)/i.test(combined) ||  // Opens at 8 AM → closes at 5
    /5\s*(pm|:00)/i.test(combined) ||  // Closes at 5 PM
    /monday.{0,30}friday/i.test(combined) // Mon–Fri only = no weekends
  );
}

/**
 * Detect high-ticket services ($8,000+ system replacements)
 */
function detectHighTicket(text) {
  if (!text) return false;
  return (
    /system\s+replacement/i.test(text) ||
    /new\s+(hvac|ac|heat\s+pump|furnace)\s+(system|unit|installation)/i.test(text) ||
    /\$\s*[89]\s*,?\s*000/i.test(text) ||          // $8,000 or $9,000
    /\$\s*1[0-9]\s*,?\s*000/i.test(text) ||         // $10,000–$19,999
    /\$\s*[2-9][0-9]\s*,?\s*000/i.test(text) ||     // $20k+
    /full\s+(system|unit)\s+(install|replacement)/i.test(text) ||
    /complete\s+hvac\s+(system|overhaul)/i.test(text) ||
    /8[,.]?000|9[,.]?000|10[,.]?000/i.test(text)   // numeric without $ sign
  );
}

/**
 * Detect named founder / owner with direct contact
 */
function detectNamedOwner(lead) {
  const name = lead.doctorName || '';
  const hasName = (
    name.length > 3 &&
    !name.toLowerCase().includes('operations lead') &&
    !name.toLowerCase().includes('medical director') &&
    !name.toLowerCase().includes('team at') &&
    !name.toLowerCase().includes('owner /') &&
    !name.toLowerCase().includes('owner at')
  );
  const hasContact = !!(lead.phone || lead.email);
  return { hasName, hasContact, passes: hasName && hasContact };
}

// ─── Main Qualifier ───────────────────────────────────────────────────────────

/**
 * Score an enriched lead and decide if it qualifies for the pipeline CRM.
 *
 * @param {object} lead - Enriched lead from huntAndEnrichLead()
 * @param {object} [auditData] - Optional audit result from runDigitalAudit()
 * @returns {object} { score, breakdown, eyeTest, qualified, disqualifyReasons }
 */
export function qualifyLead(lead, auditData = null) {
  const html = lead.rawHtml || '';
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const breakdown = {};
  let totalScore = 0;

  // ── 1. INTAKE FRICTION (25 pts) ─────────────────────────────────────────────
  const hasFriction = detectIntakeFriction(html, text, auditData);
  breakdown.intakeFriction = {
    label: 'Intake Friction',
    max: 25,
    earned: hasFriction ? 25 : 0,
    detail: hasFriction
      ? 'Form leak or after-hours gap detected'
      : 'No clear intake friction found',
    pass: hasFriction,
  };
  totalScore += breakdown.intakeFriction.earned;

  // ── 2. FLEET SIZE (20 pts) ──────────────────────────────────────────────────
  const fleetSize = extractFleetSize(text);
  const fleetPasses = fleetSize !== null && fleetSize >= 5 && fleetSize <= 15;
  const fleetPartial = fleetSize !== null && (fleetSize >= 3 && fleetSize < 5); // 3–4 trucks = 10 pts
  breakdown.fleetSize = {
    label: 'Fleet Size',
    max: 20,
    earned: fleetPasses ? 20 : (fleetPartial ? 10 : 0),
    detail: fleetSize !== null
      ? `Detected ~${fleetSize} trucks/technicians`
      : 'Fleet size not found on page',
    pass: fleetPasses,
    detected: fleetSize,
  };
  totalScore += breakdown.fleetSize.earned;

  // ── 3. OWNERSHIP / SINGLE LOCATION (20 pts) ─────────────────────────────────
  const isMultiLoc = lead.multiLocation?.isMultiLocation === true;
  const isSingleLoc = !isMultiLoc;
  breakdown.ownership = {
    label: 'Ownership',
    max: 20,
    earned: isSingleLoc ? 20 : 0,
    detail: isSingleLoc
      ? 'Single-location independent operator'
      : `Multi-location chain: ${lead.multiLocation?.reason || 'chain detected'}`,
    pass: isSingleLoc,
  };
  totalScore += breakdown.ownership.earned;

  // ── 4. AD SPEND — Google Screened / Google Ads (15 pts) ─────────────────────
  const hasLSA = detectLSA(html, text);
  const hasGoogleAds = lead.adSignals?.googleAds === true;
  const hasAnyPaidAds = hasLSA || hasGoogleAds || lead.adSignals?.hasPaidAds === true;
  breakdown.adSpend = {
    label: 'Ad Spend',
    max: 15,
    earned: hasLSA ? 15 : (hasGoogleAds ? 12 : (hasAnyPaidAds ? 8 : 0)),
    detail: hasLSA
      ? 'Google Screened / LSA verified'
      : hasGoogleAds
      ? 'Active Google Ads detected'
      : hasAnyPaidAds
      ? 'Active paid ads (Meta/TikTok)'
      : 'No paid ad spend detected',
    pass: hasAnyPaidAds,
    hasLSA,
    hasGoogleAds,
  };
  totalScore += breakdown.adSpend.earned;

  // ── 5. HIGH TICKET (10 pts) ─────────────────────────────────────────────────
  const isHighTicket = detectHighTicket(text);
  breakdown.highTicket = {
    label: 'High Ticket',
    max: 10,
    earned: isHighTicket ? 10 : 0,
    detail: isHighTicket
      ? '$8,000+ system replacement services detected'
      : 'No high-ticket system replacement signals found',
    pass: isHighTicket,
  };
  totalScore += breakdown.highTicket.earned;

  // ── 6. OWNER CONTACT (10 pts) ───────────────────────────────────────────────
  const ownerCheck = detectNamedOwner(lead);
  breakdown.ownerContact = {
    label: 'Owner Contact',
    max: 10,
    earned: ownerCheck.passes ? 10 : (ownerCheck.hasContact ? 5 : 0),
    detail: ownerCheck.passes
      ? `Named founder with direct ${lead.phone ? 'phone' : 'email'}`
      : ownerCheck.hasContact
      ? 'Contact info found, but no named founder'
      : 'No named founder or direct contact',
    pass: ownerCheck.passes,
  };
  totalScore += breakdown.ownerContact.earned;

  // ── 10-SECOND EYE TEST (binary gates — informational, don't block score) ───
  const reviewCount = extractReviewCount(text);
  const eyeTest = {
    reviewsInRange: reviewCount !== null
      ? { pass: reviewCount >= 20 && reviewCount <= 300, value: reviewCount, label: `${reviewCount} reviews` }
      : { pass: null, value: null, label: 'Review count not found' },
    familyOwned: { pass: isSingleLoc, label: isSingleLoc ? '1–2 locations (accessible founder)' : 'Multi-location chain' },
    hasFormLeak: { pass: hasFriction, label: hasFriction ? 'Form leak or after-hours gap confirmed' : 'No form/after-hours leak found' },
    hasActivePaidAds: { pass: hasAnyPaidAds, label: hasAnyPaidAds ? 'Active paid ads confirmed' : 'No paid ad spend' },
  };

  // Eye test gate: how many binary checks pass
  const eyePassCount = Object.values(eyeTest).filter(e => e.pass === true).length;
  const eyeKnownCount = Object.values(eyeTest).filter(e => e.pass !== null).length;

  // ── FINAL VERDICT ────────────────────────────────────────────────────────────
  const qualified = totalScore >= QUALIFY_THRESHOLD;
  const disqualifyReasons = [];

  if (!qualified) {
    if (!isSingleLoc) disqualifyReasons.push('Multi-location chain — decision maker inaccessible');
    if (!hasFriction) disqualifyReasons.push('No intake friction detected — no clear pain to pitch against');
    if (!hasAnyPaidAds) disqualifyReasons.push('No paid ad spend — may not value lead generation');
    if (totalScore < QUALIFY_THRESHOLD) disqualifyReasons.push(`Score ${totalScore}/100 below minimum threshold of ${QUALIFY_THRESHOLD}`);
  }

  return {
    score: totalScore,
    maxScore: 100,
    threshold: QUALIFY_THRESHOLD,
    qualified,
    grade: totalScore >= 90 ? 'A' : totalScore >= 75 ? 'B' : totalScore >= 60 ? 'C' : totalScore >= 45 ? 'D' : 'F',
    breakdown,
    eyeTest,
    eyePassCount,
    eyeKnownCount,
    reviewCount,
    disqualifyReasons,
    qualifiedAt: qualified ? new Date().toISOString() : null,
  };
}

/**
 * Quick summary string for logging / UI badge
 */
export function getQualificationBadge(qualResult) {
  if (!qualResult) return '⚪ Unscored';
  const { score, grade, qualified } = qualResult;
  const emoji = grade === 'A' ? '🟢' : grade === 'B' ? '🟡' : grade === 'C' ? '🟠' : '🔴';
  return `${emoji} ${qualified ? 'QUALIFIED' : 'REJECTED'} · ${score}/100 (${grade})`;
}
