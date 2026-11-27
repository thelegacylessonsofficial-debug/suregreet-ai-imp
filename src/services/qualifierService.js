/**
 * SureGreet AI — Lead Qualifier (10-Second Eye Test + 100-Point Rate Scoring Engine)
 *
 * [10-SECOND EYE TEST]
 *   1. Reviews between 20 and 300? ───────────────> (Filters out solo Chucks & giant PE chains)
 *   2. Family-owned / 1-2 locations? ─────────────> (Ensures accessible founder)
 *   3. Form leak or closed after 5:00 PM? ────────> (Guarantees pain)
 *   4. Active Google Screened / Ads? ─────────────> (Guarantees they value leads)
 *
 * [100-POINT SCORING RUBRIC]
 *   • Intake Friction : 25 pts (Emergency form leak or unstaffed after-hours gap)
 *   • Fleet Size      : 20 pts (5 to 15 trucks, or inferred from 20-300 review sweet spot)
 *   • Ownership       : 20 pts (Single-location independent / family founder; PE chains rejected)
 *   • Ad Spend        : 15 pts (Active Google Screened / LSA / Google Ads / CallRail / Paid Pixels)
 *   • High Ticket     : 10 pts (Sells $8,000+ system replacements & full installations)
 *   • Owner Contact   : 10 pts (Named founder with direct phone or email)
 *
 * Default minimum rate score to enter Pipeline CRM: 60 / 100 pts (configurable via minScore).
 */

export const DEFAULT_QUALIFY_THRESHOLD = 60;

/**
 * Extract truck / fleet / technician count from visible website copy
 */
function extractFleetSize(visibleText) {
  if (!visibleText) return null;
  const patterns = [
    /\b(\d{1,3})\s+(?:fully\s+stocked\s+)?(?:service\s+)?trucks?\b/i,
    /\b(\d{1,3})\s+(?:service\s+)?vans?\b/i,
    /\b(\d{1,3})\s+(?:service\s+)?vehicles?\b/i,
    /\bfleet\s+of\s+(?:over\s+)?(\d{1,3})\b/i,
    /\b(\d{1,2})\s+(?:certified\s+|nates?-certified\s+|licensed\s+)?technicians?\b/i,
    /\bteam\s+of\s+(?:over\s+)?(\d{1,2})\b/i,
  ];
  for (const p of patterns) {
    const m = visibleText.match(p);
    if (m) {
      const val = parseInt(m[1], 10);
      if (val >= 1 && val <= 200) return val;
    }
  }
  return null;
}

/**
 * Extract verified review count and Google star rating from JSON-LD or visible copy
 */
function extractReviewMetrics(visibleText, jsonLd = null) {
  let reviewCount = jsonLd?.reviewCount || null;
  let googleRating = jsonLd?.ratingValue || null;

  if (visibleText) {
    if (!reviewCount) {
      const revPatterns = [
        /\b([\d,]{2,6})\+?\s*(?:verified\s+)?(?:google|customer|five[- ]star|5[- ]star)\s+reviews?\b/i,
        /\bbased\s+on\s+([\d,]{2,6})\+?\s*reviews?\b/i,
        /\bover\s+([\d,]{2,6})\s*(?:5[- ]star\s+)?reviews?\b/i,
        /\b([\d,]{2,6})\+?\s*reviews?\s+(?:on\s+google|with|and)\b/i,
        /\b([\d,]{2,6})\+?\s+reviews?\b/i,
        /\(\s*([\d,]{2,5})\s*(?:reviews?|ratings?)\s*\)/i,
      ];
      for (const p of revPatterns) {
        const m = visibleText.match(p);
        if (m) {
          const val = parseInt(m[1].replace(/,/g, ''), 10);
          if (val >= 5 && val <= 50000) {
            reviewCount = val;
            break;
          }
        }
      }
    }

    if (!googleRating) {
      const ratePatterns = [
        /\b([34]\.\d|5\.0)\s*(?:out\s+of\s+5|\/\s*5|stars?|★)\b/i,
        /\brated\s+([34]\.\d|5\.0)\b/i,
      ];
      for (const p of ratePatterns) {
        const m = visibleText.match(p);
        if (m) {
          const r = parseFloat(m[1]);
          if (r >= 3.0 && r <= 5.0) {
            googleRating = Number(r.toFixed(1));
            break;
          }
        }
      }
    }
  }

  return { reviewCount, googleRating };
}

/**
 * Detect hours / closed after 5 PM / voicemail / form leak friction
 */
function detectIntakeFriction(lead, auditData, visibleText) {
  const signals = [];

  if (lead.hasHtmlForm && !lead.hasLiveScheduler) {
    signals.push('Static web form without instant booking');
  }
  if (auditData?.hasStaticForm) {
    signals.push('Routes quote/service requests through contact form');
  }
  if (auditData?.hasVoicemailComplaint) {
    signals.push('Review complaints mention voicemail / missed callbacks');
  }

  const text = visibleText || '';
  const closesAt5 =
    /(?:mon|monday)[\s–-]+(?:fri|friday)[^.]{0,40}(?:4:30|5:00|5pm|5\s*pm|5:30|6:00|17:00)/i.test(text) ||
    /closes?\s+at\s+(?:5|5:00)\s*pm/i.test(text) ||
    /(?:7|8)(?::\d{2})?\s*am\s*[-–to]+\s*(?:4|5|6)(?::\d{2})?\s*pm/i.test(text) ||
    (lead.jsonLd?.openingHours || []).some((h) => /17:00|17:30|18:00|5:00\s*pm/i.test(h));

  if (closesAt5) {
    signals.push('Office hours close around 5:00 PM');
  }

  const formLanguage =
    /request\s+(?:a\s+|an\s+)?(?:quote|estimate|service|appointment|callback)|fill\s+out\s+(?:the\s+|our\s+)?form|contact\s+us\s+today|schedule\s+(?:an?\s+)?service/i.test(
      text
    ) && !lead.hasLiveScheduler;

  if (formLanguage && signals.length === 0) {
    signals.push('Static request-service / contact form workflow');
  }

  const hasAfterHoursGap =
    Boolean(auditData?.mentionsAfterHours) || /after[- ]hours|voicemail|left a message|next business day/i.test(text);
  if (hasAfterHoursGap) {
    signals.push('After-hours / voicemail gap detected');
  }

  const hasFriction = signals.length > 0;
  return { hasFriction, closesAt5, signals };
}

/**
 * Detect high-ticket $8,000+ system replacement & installation offerings
 */
function detectHighTicket(visibleText, lead) {
  const combined = `${visibleText || ''} ${lead.treatment || ''} ${(lead.allTreatments || []).join(' ')}`;
  return (
    /system\s+replacement/i.test(combined) ||
    /\b(hvac|ac|air\s+conditioning|furnace|heat\s+pump|water\s+heater|roof|panel)\s+(replacement|installation|install)\b/i.test(
      combined
    ) ||
    /\bnew\s+(hvac|ac|cooling|heating|roof|generator)\s+system\b/i.test(combined) ||
    /\bfree\s+(replacement\s+)?estimate/i.test(combined) ||
    /\bfinancing\s+available\b/i.test(combined) ||
    /\$\s*(?:[89],?\d{3}|[1-9]\d,?\d{3})\b/.test(combined)
  );
}

/**
 * Check if extracted decision maker is an actual named person rather than a generic placeholder
 */
function evaluateOwnerContact(lead) {
  const doc = (lead.doctorName || '').trim();
  const isPlaceholder =
    !doc ||
    doc.length < 3 ||
    /^(owner\s*\/\s*operations|operations lead|medical director|local service|team at)/i.test(doc) ||
    doc.includes('Operations Lead');

  const isEmailOnlyFirst = doc.includes('(Owner Contact)');
  const hasNamedFounder = !isPlaceholder && !isEmailOnlyFirst;
  const hasDirectEmailContact = !isPlaceholder && Boolean(lead.email);
  const hasPhone = Boolean(lead.phone);
  const hasEmail = Boolean(lead.email);

  let earned = 0;
  let pass = false;
  let detail = 'No named founder or direct phone/email found';

  if (hasNamedFounder && (hasPhone || hasEmail)) {
    earned = 10;
    pass = true;
    detail = `Named founder (${doc.replace(/\s*\([^)]+\)/g, '')}) + direct ${hasPhone ? 'phone' : 'email'}`;
  } else if (hasDirectEmailContact && hasPhone) {
    earned = 9;
    pass = true;
    detail = `Direct owner contact + phone (${lead.phone})`;
  } else if (hasPhone && hasEmail) {
    earned = 6;
    pass = true;
    detail = `Direct business phone (${lead.phone}) & email`;
  } else if (hasPhone || hasEmail) {
    earned = 3;
    pass = false;
    detail = hasEmail ? 'Generic/fallback domain email only (no named owner)' : 'Phone only';
  }

  return { earned, pass, detail, hasNamedFounder };
}

/**
 * Map numeric score to crisp Grade + Rate Point Tier Label
 */
export function getRatePointTier(score) {
  if (score >= 90) return { grade: 'A', label: 'A-Tier · Elite Target', color: 'emerald' };
  if (score >= 75) return { grade: 'B', label: 'B-Tier · Strong Target', color: 'emerald' };
  if (score >= 60) return { grade: 'C', label: 'C-Tier · Qualified', color: 'yellow' };
  if (score >= 45) return { grade: 'D', label: 'D-Tier · Weak Fit', color: 'rose' };
  return { grade: 'F', label: 'F-Tier · Disqualified', color: 'rose' };
}

/**
 * Score an enriched contractor lead on the 10-Second Eye Test + 100-Point Rate Scale
 *
 * @param {object} lead - Output from scrapeClinicWebsite() / huntAndEnrichLead()
 * @param {object} [auditData] - Output from runDigitalAudit()
 * @param {number} [minScore=60] - Minimum rate points required to qualify for Pipeline CRM
 */
export function qualifyLead(lead, auditData = null, minScore = DEFAULT_QUALIFY_THRESHOLD) {
  const visibleText =
    lead.visibleText ||
    (lead.rawHtml || '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const { reviewCount, googleRating } = extractReviewMetrics(visibleText, lead.jsonLd);
  const fleetSize = extractFleetSize(visibleText);
  const isChain = lead.multiLocation?.isMultiLocation === true;
  const isFamilyOwned = !isChain && (lead.multiLocation?.isFamilyOwned || /family[- ]owned|family[- ]operated|locally owned|since 19\d\d/i.test(visibleText));

  const breakdown = {};
  let totalScore = 0;

  // ── 1. INTAKE FRICTION (25 pts) ─────────────────────────────────────────────
  const friction = detectIntakeFriction(lead, auditData, visibleText);
  let frictionEarned = 0;
  if (friction.hasFriction) {
    frictionEarned = lead.hasLiveScheduler && !friction.closesAt5 ? 12 : 25;
  }
  breakdown.intakeFriction = {
    label: 'Intake Friction',
    max: 25,
    earned: frictionEarned,
    pass: frictionEarned >= 20,
    detail: friction.signals.length > 0 ? friction.signals[0] : 'No static form leak or 5 PM gap found',
  };
  totalScore += frictionEarned;

  // ── 2. FLEET SIZE (20 pts) ──────────────────────────────────────────────────
  let fleetEarned = 0;
  let fleetPass = false;
  let fleetDetail = 'Fleet size unconfirmed (reviews & trucks not published)';

  if (fleetSize !== null) {
    if (fleetSize >= 5 && fleetSize <= 15) {
      fleetEarned = 20;
      fleetPass = true;
      fleetDetail = `Sweet spot fleet confirmed: ~${fleetSize} trucks/techs`;
    } else if (fleetSize >= 3 && fleetSize <= 25) {
      fleetEarned = 12;
      fleetPass = true;
      fleetDetail = `Adjacent fleet detected: ~${fleetSize} trucks/techs`;
    } else if (fleetSize > 25) {
      fleetEarned = 0;
      fleetDetail = `Oversized fleet (~${fleetSize} trucks — likely enterprise/PE)`;
    } else {
      fleetEarned = 5;
      fleetDetail = `Small crew (~${fleetSize} trucks — borderline solo Chuck)`;
    }
  } else if (reviewCount !== null) {
    if (reviewCount >= 20 && reviewCount <= 300) {
      fleetEarned = 15;
      fleetPass = true;
      fleetDetail = `Inferred 5–15 trucks via ${reviewCount} reviews (20–300 sweet spot)`;
    } else if (reviewCount > 300 && reviewCount <= 800) {
      fleetEarned = 8;
      fleetDetail = `Established regional shop (${reviewCount} reviews)`;
    } else if (reviewCount < 20) {
      fleetEarned = 0;
      fleetDetail = `Too small (${reviewCount} reviews < 20 solo floor)`;
    } else {
      fleetEarned = 0;
      fleetDetail = `Very high volume (${reviewCount} reviews — check against PE chain)`;
    }
  }

  breakdown.fleetSize = {
    label: 'Fleet Size',
    max: 20,
    earned: fleetEarned,
    pass: fleetPass,
    detected: fleetSize,
    detail: fleetDetail,
  };
  totalScore += fleetEarned;

  // ── 3. OWNERSHIP / SINGLE LOCATION (20 pts) ─────────────────────────────────
  const ownershipEarned = isChain ? 0 : isFamilyOwned ? 20 : 16;
  const ownershipPass = !isChain;
  breakdown.ownership = {
    label: 'Ownership',
    max: 20,
    earned: ownershipEarned,
    pass: ownershipPass,
    detail: isChain
      ? `Chain / multi-location: ${lead.multiLocation?.reason || 'PE/franchise'}`
      : isFamilyOwned
      ? 'Family-owned / independent 1–2 location shop'
      : 'Single-location independent operator',
  };
  totalScore += ownershipEarned;

  // ── 4. AD SPEND — Google Screened / Google Ads (15 pts) ─────────────────────
  const lsa = lead.adSignals?.lsaVerified === true;
  const gAds = lead.adSignals?.confirmedGoogleAds === true;
  const gtmOrMeta = lead.adSignals?.gtmOrGtag === true || lead.adSignals?.metaPixel === true || lead.adSignals?.tikTokPixel === true;
  const adEarned = lsa || gAds ? 15 : gtmOrMeta ? 11 : 0;
  const adPass = adEarned > 0;
  const adDetail = lsa
    ? 'Google Screened / LSA verified'
    : gAds
    ? 'Active Google Ads / CallRail PPC tracking'
    : gtmOrMeta
    ? 'Active paid tracking pixel (GTM / Meta)'
    : lead.dataSource === 'jina_fallback'
    ? 'Proxy text mode — HTML ad tags unverified'
    : 'No active Google Ads or tracking pixels found';

  breakdown.adSpend = {
    label: 'Ad Spend',
    max: 15,
    earned: adEarned,
    pass: adPass,
    hasLSA: lsa,
    hasGoogleAds: gAds || gtmOrMeta,
    detail: adDetail,
  };
  totalScore += adEarned;

  // ── 5. HIGH TICKET ($8,000+ System Replacements) (10 pts) ───────────────────
  const isHighTicket = detectHighTicket(visibleText, lead);
  breakdown.highTicket = {
    label: 'High Ticket',
    max: 10,
    earned: isHighTicket ? 10 : 0,
    pass: isHighTicket,
    detail: isHighTicket ? 'Promotes full system replacements / $8k+ installs' : 'No high-ticket replacement services detected',
  };
  totalScore += breakdown.highTicket.earned;

  // ── 6. OWNER CONTACT (10 pts) ───────────────────────────────────────────────
  const owner = evaluateOwnerContact(lead);
  breakdown.ownerContact = {
    label: 'Owner Contact',
    max: 10,
    earned: owner.earned,
    pass: owner.pass,
    detail: owner.detail,
  };
  totalScore += owner.earned;

  // ── [10-SECOND EYE TEST] (4 Instant Gates) ─────────────────────────────────
  const eyeTest = {
    reviewsInRange:
      reviewCount !== null
        ? {
            pass: reviewCount >= 20 && reviewCount <= 300,
            value: reviewCount,
            label:
              reviewCount >= 20 && reviewCount <= 300
                ? `${reviewCount} reviews (20–300 sweet spot)`
                : reviewCount < 20
                ? `${reviewCount} reviews (under 20 — solo risk)`
                : `${reviewCount} reviews (above 300 — large/regional)`,
          }
        : { pass: null, value: null, label: 'Reviews not published on site' },
    familyOwned: {
      pass: !isChain,
      label: isChain ? 'Failed — Multi-location PE / Franchise' : isFamilyOwned ? 'Family-owned / 1–2 locations' : 'Single-location local shop',
    },
    painConfirmed: {
      pass: friction.hasFriction,
      label: friction.hasFriction ? friction.signals[0] : 'No form leak or 5 PM gap detected',
    },
    activeAds: {
      pass: adPass,
      label: adDetail,
    },
  };

  const eyePassCount = Object.values(eyeTest).filter((x) => x.pass === true).length;
  const eyeKnownCount = Object.values(eyeTest).filter((x) => x.pass !== null).length;

  // ── FINAL QUALIFICATION GATE & RATE POINT VERDICT ───────────────────────────
  const threshold = Number(minScore) || DEFAULT_QUALIFY_THRESHOLD;
  const hasContactChannel = Boolean(lead.email || lead.phone);
  const qualified = totalScore >= threshold && !isChain && hasContactChannel;
  const tier = getRatePointTier(totalScore);

  const disqualifyReasons = [];
  if (isChain) disqualifyReasons.push('PE / Multi-location chain blocked (Eye Test #2)');
  if (!hasContactChannel) disqualifyReasons.push('No email or phone extracted');
  if (!friction.hasFriction) disqualifyReasons.push('No intake friction / after-hours pain found (Eye Test #3)');
  if (!adPass && totalScore < threshold) disqualifyReasons.push('No active paid ads detected (Eye Test #4)');
  if (totalScore < threshold) disqualifyReasons.push(`Rate Score ${totalScore}/100 below ${threshold}-pt CRM gate`);

  return {
    score: totalScore,
    maxScore: 100,
    ratePoints: `${totalScore}/100`,
    threshold,
    qualified,
    grade: tier.grade,
    tierLabel: tier.label,
    tierColor: tier.color,
    isChain,
    isFamilyOwned,
    reviewCount,
    googleRating,
    fleetSize,
    breakdown,
    eyeTest,
    eyePassCount,
    eyeKnownCount,
    disqualifyReasons,
    qualifiedAt: qualified ? new Date().toISOString() : null,
  };
}

/**
 * Compact badge text for logs & UI
 */
export function getQualificationBadge(qualResult) {
  if (!qualResult) return '⚪ Unscored';
  const { score, grade, qualified } = qualResult;
  const emoji = grade === 'A' ? '🟢' : grade === 'B' ? '🟡' : grade === 'C' ? '🟠' : '🔴';
  return `${emoji} ${qualified ? 'QUALIFIED' : 'REJECTED'} · ${score}/100 (${grade})`;
}
