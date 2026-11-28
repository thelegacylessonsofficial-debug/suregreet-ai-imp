/**
 * SureGreet AI — Strict Lead Qualification Engine
 *
 * Implements:
 * 1. Hard Must-Haves (Any NO -> Instant Skip, qualified: false)
 *    - US Residential Service Focus (no commercial-only / new-construction-only)
 *    - Goldilocks Fleet Size (2-15 Trucks / 20-500 Reviews proxy)
 *    - 100% Independent Ownership (single-location / single-metro private shop)
 *    - Verifiable Phone & Owner Identity (active phone + named founder/decision-maker)
 *    - Compatible Scheduling Stack (GCal, Outlook, Housecall Pro, Jobber, GHL, or ServiceTitan fallback)
 *    - Verifiable Intake Friction (closed evenings/weekends, static emergency form, or missed-call reviews)
 *
 * 2. Automatic Disqualifiers (Hard Blocklist)
 *    - review_count > 500 (blocks BelRed, Lex, Brody Pennell, Bob's, Wind Bender & PE roll-ups)
 *    - review_count < 15 (unless fleet size explicitly verified as 2+ trucks)
 *    - PE & National Franchises (Apex Service Partners, Turnpoint, Champions Group, Blackstone, Cortec, Odyssey, Wrench Group, etc.)
 *    - Existing AI / 24/7 Live Human Call Centers (Avoca AI, Smith.ai, Ruby, Nexa, etc.)
 *    - Affiliate / Lead Broker Shells (emergency-*.com, *-pros.com, airconditioneremergency.com, city-subdomain scrapers)
 *    - Dead / Inactive Businesses (unreachable, parked, no phone, stale > 6 months)
 *
 * 3. 100-Point Scoring Matrix
 *    - A. Pain Signals (35 pts): Mystery Call Fail (+15), Static Form (+10), 5 PM / Weekend Close (+5), Missed-Call Review Complaints (+5)
 *    - B. Fit & Urgency (25 pts): Goldilocks Fleet + Residential (+10), Active Paid Ads/LSA (+10), Climate/Seasonal Urgency (+5)
 *    - C. Ability to Buy (20 pts): 3+ Yrs & 4.3+ Stars (+10), High-Ticket $2K-$10K+ / Financing / Plans (+10)
 *    - D. Ease of Delivery & Reachability (20 pts): Compatible Stack (+10), Direct Owner + Direct Email/Phone (+10)
 *
 * 4. Action Tiers
 *    - 80-100 -> Tier A (Contact First: call direct phone + custom Harvey PAS email)
 *    - 60-79  -> Tier B (Standard 4-step Harvey cadence with matched city/service tags)
 *    - < 60   -> Tier C (Delete immediately — never store in CRM)
 */

export const DEFAULT_QUALIFY_THRESHOLD = 60;

export const HARD_BLOCKED_CHAIN_PATTERNS = [
  /\bapex\s+service\s+partners\b/i,
  /\bturnpoint\b/i,
  /\bchampions?\s+group\b/i,
  /\bservice\s+champions\b/i,
  /\bblackstone\b/i,
  /\bcortec\b/i,
  /\bodyssey\b/i,
  /\bwrench\s*group\b/i,
  /\bars\.com\b/i,
  /\bars\s*\/?\s*rescue\s*rooter\b/i,
  /\bserviceexperts\.com\b/i,
  /\bservice\s+experts\b/i,
  /\brotorooter\.com\b/i,
  /\broto[-\s]?rooter\b/i,
  /\bhappyhiller\.com\b/i,
  /\bhiller\s+plumbing\b/i,
  /\bleecompany\.com\b/i,
  /\blee\s+company\b/i,
  /\bonehourheatandair\.com\b/i,
  /\bone\s+hour\s+heating\b/i,
  /\bbenjaminfranklinplumbing\b/i,
  /\bmister\s*sparky\b/i,
  /\bmr\.?\s*rooter\b/i,
  /\baireserv\.com\b/i,
  /\baire\s+serv\b/i,
  /\bhorizonservices\b/i,
  /\bgoettl\b/i,
  /\bairtron\b/i,
  /\bsierraairconditioning\.com\b/i,
  /\bbelred\b/i,
  /\blexairconditioning\.com\b/i,
  /\blex\s*[-]?\s*air\b/i,
  /\bbrody\s*pennell\b/i,
  /\bbrodpannell\b/i,
  /\bbobsheating\.com\b/i,
  /\bbob'?s\s+heating(?:\s*(?:&|and)\s*air)?\b/i,
  /\bwind\s*bender\b/i,
  /\bwindbenderohio\.com\b/i,
  /\bfourseasonsheatingcooling\.com\b/i,
  /\bmorris[-\s]?jenkins\b/i,
  /\bberkeys\b/i,
  /\bbakerbrothersplumbing\b/i,
  /\bgeorgebrazil\b/i,
  /\bchampionair\b/i,
  /\bpremierishere\.com\b/i,
  /\bsummersphc\.com\b/i,
  /\bandersonpha\.com\b/i,
  /\bbillhowe\.com\b/i,
];

const AFFILIATE_DOMAIN_PATTERNS = [
  /(^|\.)emergency-[a-z0-9-]+\./i,
  /[a-z0-9-]+-pros\./i,
  /airconditioneremergency\./i,
  /emergencyhvacservices\./i,
  /emergency-hvac-repair\./i,
  /hvacacrepair\.org/i,
  /brentwoodhvacrepair\./i,
  /topchoiceheatingairconditioning/i,
  /near-?me\./i,
  /\b(yelp|angi|angieslist|homeadvisor|thumbtack|networx|bark|porch|modernize|craftjack|expertise|mapquest|yellowpages|bbb)\.com$/i,
];

const COMPETITOR_AI_AND_CALLCENTER_PATTERNS = [
  /\bavoca\.ai\b/i,
  /\bavoca\s+ai\b/i,
  /\bpowered\s+by\s+avoca\b/i,
  /\bsmith\.ai\b/i,
  /\bruby\s+receptionists?\b/i,
  /\bnexa\s+receptionists?\b/i,
  /\bjill'?s\s+office\b/i,
  /\bgoodcall\.com\b/i,
  /\bservicebird\b/i,
  /\bzyratalk\b/i,
  /\bdedicated\s+24\/?7\s+(?:in-house\s+)?call\s+center\b/i,
];

const HOT_BELT_HINT = /\b(phoenix|tucson|mesa|scottsdale|chandler|gilbert|glendale,\s*az|arizona|az|miami|tampa|orlando|jacksonville|fort\s+lauderdale|west\s+palm|florida|fl|las\s+vegas|henderson|nevada|nv|austin|houston|san\s+antonio|dallas|fort\s+worth|prosper|celina|fulshear|katy|sugar\s+land|tx|los\s+angeles|san\s+diego|riverside|irvine|anaheim|fresno|palm\s+springs|honolulu|hawaii|hi|louisiana|la)\b/i;
const COLD_BELT_HINT = /\b(carmel|zionsville|indianapolis|fishers|noblesville|indiana|in|dublin|columbus|powell|westerville|cleveland|cincinnati|ohio|oh|brentwood|franklin|nashville|tennessee|tn|chicago|illinois|il|detroit|michigan|mi|minneapolis|minnesota|mn|milwaukee|wisconsin|wi|denver|colorado|co|seattle|bellevue|spokane|tacoma|vancouver,\s*wa|washington|wa|portland|eugene|oregon|or|buffalo|rochester|syracuse|albany|new\s+york|ny|boston|massachusetts|ma|pennsylvania|pa|new\s+jersey|nj|utah|ut)\b/i;

export function getCityClimateProfile(city = '') {
  const c = String(city || '').trim();
  const month = new Date().getUTCMonth() + 1; // 1..12
  const isWinterMonths = month >= 11 || month <= 3;

  if (HOT_BELT_HINT.test(c) && !/\breno\b/i.test(c)) {
    return {
      belt: 'hot_belt',
      label: isWinterMonths ? 'Hot-Belt Cooling / Mild Heating' : 'Peak Cooling Climate',
      forbidTerms: ['furnace', 'snowmelt', 'freeze-up'],
      activeUrgency: true,
    };
  }
  if (COLD_BELT_HINT.test(c) || /\breno\b/i.test(c)) {
    return {
      belt: 'cold_belt',
      label: isWinterMonths ? 'Cold-Belt Winter Freeze / No-Heat Urgency' : 'Four-Season HVAC & Pipe Urgency',
      forbidTerms: [],
      activeUrgency: true,
    };
  }
  return {
    belt: 'mixed',
    label: 'Active Residential Emergency Market',
    forbidTerms: [],
    activeUrgency: Boolean(c && c !== 'US'),
  };
}

export function isAffiliateShellDomain(url = '', visibleText = '') {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = u.hostname.toLowerCase();
    if (AFFILIATE_DOMAIN_PATTERNS.some((p) => p.test(host))) {
      return { isAffiliate: true, reason: `Matched affiliate/directory domain pattern (${host})` };
    }
    const parts = host.split('.');
    // Detect city-subdomain scraper shells (e.g. austin.emergencyacpros.com)
    if (parts.length >= 3) {
      const sub = parts[0];
      if (!new Set(['www', 'm', 'web', 'book', 'app', 'schedule', 'mail', 'shop', 'portal', 'blog']).has(sub)) {
        if (/(hvac|plumb|roof|electric|repair|cooling|heating|service|drain)/i.test(parts[1])) {
          return { isAffiliate: true, reason: `City-subdomain lead scraper shell (${host})` };
        }
      }
    }
  } catch (e) {}

  if (/\b(?:we\s+connect\s+you\s+with\s+local\s+contractors|third-party\s+lead\s+network|matched\s+with\s+independent\s+pros)\b/i.test(visibleText || '')) {
    return { isAffiliate: true, reason: 'Lead-broker / affiliate disclaimer detected on page' };
  }
  return { isAffiliate: false, reason: null };
}

export function isEnterpriseOrPeChain(url = '', companyName = '', visibleText = '') {
  const target = `${url} ${companyName} ${(visibleText || '').slice(0, 3500)}`;
  for (const pat of HARD_BLOCKED_CHAIN_PATTERNS) {
    if (pat.test(target)) {
      return { matched: true, reason: `Matched PE / National Franchise / Enterprise blocklist (${pat.source.replace(/\\b/g, '')})` };
    }
  }
  return { matched: false, reason: null };
}

export function detectSchedulingStack(visibleText = '', rawSignals = {}, lead = {}) {
  const hay = `${visibleText || ''} ${rawSignals.stackText || ''}`.toLowerCase();
  const explicit = lead.schedulingStack || rawSignals.detectedStack || '';
  const detected = [];

  if (/housecallpro\.com|housecall\s*pro/i.test(hay) || explicit === 'Housecall Pro') detected.push('Housecall Pro');
  if (/getjobber\.com|jobber\.com|clienthub\.getjobber/i.test(hay) || explicit === 'Jobber') detected.push('Jobber');
  if (/leadconnectorhq\.com|msgsndr\.com|gohighlevel/i.test(hay) || explicit === 'GoHighLevel') detected.push('GoHighLevel');
  if (/calendly\.com|cal\.com|calendar\.google\.com|google\s+calendar|scheduleonce/i.test(hay) || explicit === 'Google Calendar') detected.push('Google Calendar');
  if (/outlook\.office365\.com|outlook\.office\.com|bookings\.microsoft\.com|microsoft\s+bookings/i.test(hay) || explicit === 'Outlook') detected.push('Outlook');
  const hasServiceTitan = /servicetitan\.com|scheduleengine/i.test(hay) || explicit === 'ServiceTitan';
  if (hasServiceTitan) detected.push('ServiceTitan');

  const directCompatible = detected.filter((s) => s !== 'ServiceTitan');
  if (directCompatible.length > 0) {
    return {
      stackName: directCompatible[0],
      allDetected: detected,
      compatible: true,
      isServiceTitan: false,
      earned: 10,
      detail: `Compatible stack verified: ${directCompatible.join(', ')}`,
    };
  }

  if (hasServiceTitan) {
    const agreedFallback = Boolean(lead.serviceTitanFallbackAgreed || rawSignals.serviceTitanFallbackAgreed);
    return {
      stackName: 'ServiceTitan (Email/Booking Fallback)',
      allDetected: detected,
      compatible: true,
      isServiceTitan: true,
      requiresFallbackAgreement: !agreedFallback,
      earned: agreedFallback ? 10 : 6,
      detail: agreedFallback
        ? 'ServiceTitan fallback approved by owner'
        : 'ServiceTitan detected — accepted with email/booking-request fallback',
    };
  }

  // Standard contractor contact form / direct phone lines onboard directly onto SureGreet Google Calendar / Cal.com
  if (lead.hasHtmlForm || lead.phone) {
    return {
      stackName: 'Google Calendar / Cal.com Ready',
      allDetected: ['Standard Form / Phone Dispatch'],
      compatible: true,
      isServiceTitan: false,
      earned: 9,
      detail: 'No legacy enterprise lock-in; ready for Google Calendar / Cal.com sync',
    };
  }

  return {
    stackName: 'Unknown',
    allDetected: [],
    compatible: false,
    isServiceTitan: false,
    earned: 0,
    detail: 'No compatible scheduling workflow verified',
  };
}

function extractFleetSize(visibleText) {
  if (!visibleText) return null;
  const patterns = [
    /\b(\d{1,3})\s+(?:fully\s+stocked\s+)?(?:service\s+)?trucks?\b/i,
    /\b(\d{1,3})\s+(?:service\s+)?vans?\b/i,
    /\b(\d{1,3})\s+(?:service\s+)?vehicles?\b/i,
    /\bfleet\s+of\s+(?:over\s+)?(\d{1,3})\b/i,
    /\b(\d{1,2})\s+(?:certified\s+|nates?-certified\s+|licensed\s+)?technicians?\b/i,
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

function extractYearsInBusiness(visibleText, explicitYears = null) {
  if (Number.isFinite(Number(explicitYears)) && Number(explicitYears) > 0) {
    return Number(explicitYears);
  }
  if (!visibleText) return null;
  const currentYear = new Date().getFullYear();

  const sinceMatch = visibleText.match(/\b(?:since|est\.?|established|founded(?:\s+in)?|serving\s+[^.]{0,30}\s+since)\s+(19[3-9]\d|20[0-2]\d)\b/i);
  if (sinceMatch) {
    const yr = parseInt(sinceMatch[1], 10);
    if (yr >= 1930 && yr <= currentYear) return Math.max(1, currentYear - yr);
  }

  const yrsMatch = visibleText.match(/\b(?:over\s+)?(\d{1,2})\+?\s+years?\s+(?:of\s+)?(?:combined\s+)?(?:hvac|plumbing|roofing|electrical|service|experience|in\s+business)\b/i);
  if (yrsMatch) {
    const y = parseInt(yrsMatch[1], 10);
    if (y >= 1 && y <= 90) return y;
  }
  return null;
}

function extractReviewMetrics(visibleText, jsonLd = null, explicitReviews = null, explicitRating = null) {
  let reviewCount = explicitReviews ?? jsonLd?.reviewCount ?? null;
  let googleRating = explicitRating ?? jsonLd?.ratingValue ?? null;

  if (visibleText) {
    if (reviewCount === null) {
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
          if (val >= 1 && val <= 50000) {
            reviewCount = val;
            break;
          }
        }
      }
    }

    if (googleRating === null) {
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

function detectResidentialFocus(visibleText = '', lead = {}) {
  const hay = `${visibleText || ''} ${lead.clinicName || ''} ${lead.treatment || ''}`;
  const isCommercialOnly =
    /\b(?:commercial\s+only|commercial\s+(?:&|and)\s+industrial(?:\s+only)?|we\s+do\s+not\s+service\s+residential|no\s+residential(?:\s+(?:calls?|service|work|jobs?))?|new\s+construction(?:\s+bids?)?\s+only|industrial\s+mechanical\s+contractor(?:\s+only)?)\b/i.test(
      hay
    ) ||
    (/\b(?:commercial\s+hvac|commercial\s+mechanical|industrial\s+refrigeration|design-build\s+mechanical)\b/i.test(hay) &&
      !/\b(?:residential|homeowner|homeowners|home\s+comfort|your\s+home|house)\b/i.test(hay));

  if (isCommercialOnly) {
    return { pass: false, detail: 'Commercial-only or new-construction focus (no homeowner repair)' };
  }

  const hasResidentialSignals =
    /\b(?:residential|homeowner|homeowners|your\s+home|ac\s+repair|furnace|water\s+heater|drain|roof\s+repair|panel\s+upgrade|water\s+damage|emergency\s+(?:hvac|plumbing|heating|cooling|electrical|roofing))\b/i.test(
      hay
    );
  return {
    pass: hasResidentialSignals || (lead.niche && lead.niche !== 'medspa'),
    detail: hasResidentialSignals ? 'Verified US residential home-service contractor' : 'Residential service unconfirmed',
  };
}

function detectIntakeFriction(lead, auditData, visibleText) {
  const signals = [];
  const text = visibleText || '';

  const failedMysteryCall = Boolean(lead.mysteryCallFailed || auditData?.failedMysteryCall);
  const hasStaticForm = Boolean(
    auditData?.hasStaticForm ||
      (lead.hasHtmlForm && !lead.hasLiveScheduler) ||
      (/request\s+(?:a\s+|an\s+)?(?:quote|estimate|service|appointment|callback)|fill\s+out\s+(?:the\s+|our\s+)?form|contact\s+us\s+today/i.test(text) &&
        !lead.hasLiveScheduler)
  );
  const closesAt5OrWeekends =
    /(?:mon|monday)[\s–-]+(?:fri|friday)[^.]{0,40}(?:4:30|5:00|5pm|5\s*pm|5:30|6:00|17:00)/i.test(text) ||
    /closes?\s+at\s+(?:5|5:00)\s*pm|closed\s+(?:sat|sun|saturday|sunday|weekends?)/i.test(text) ||
    /(?:7|8)(?::\d{2})?\s*am\s*[-–to]+\s*(?:4|5|6)(?::\d{2})?\s*pm/i.test(text) ||
    (lead.jsonLd?.openingHours || []).some((h) => /17:00|17:30|18:00|5:00\s*pm/i.test(h));
  const hasReviewComplaints = Boolean(
    auditData?.hasVoicemailComplaint ||
      /called\s+twice|nobody\s+picked\s+up|never\s+called\s+back|straight\s+to\s+voicemail|hard\s+to\s+reach|no\s+call\s*back|slow\s+callback/i.test(text)
  );
  const mentionsAfterHours = Boolean(auditData?.mentionsAfterHours) || /after[- ]hours|voicemail|left\s+a\s+message|next\s+business\s+day/i.test(text);

  if (failedMysteryCall) signals.push('Failed mystery test call (voicemail / unanswered)');
  if (hasStaticForm) signals.push('Emergency / quote page routes to static web form');
  if (closesAt5OrWeekends) signals.push('Closes ~5 PM or closed weekends (100+ unstaffed hrs/wk)');
  if (hasReviewComplaints) signals.push('Reviews mention missed calls / slow callbacks');
  if (mentionsAfterHours && signals.length === 0) signals.push('After-hours voicemail gap noted');

  return {
    hasFriction: signals.length > 0,
    failedMysteryCall,
    hasStaticForm,
    closesAt5OrWeekends,
    hasReviewComplaints,
    signals,
  };
}

function detectHighTicket(visibleText, lead) {
  const combined = `${visibleText || ''} ${lead.treatment || ''} ${(lead.allTreatments || []).join(' ')}`;
  return (
    /system\s+replacement|full\s+replacement/i.test(combined) ||
    /\b(hvac|ac|air\s+conditioning|furnace|heat\s+pump|water\s+heater|roof|panel|generator)\s+(replacement|installation|install|upgrade)\b/i.test(
      combined
    ) ||
    /\bnew\s+(hvac|ac|cooling|heating|roof|generator)\s+system\b/i.test(combined) ||
    /\bfinancing\s+available|monthly\s+payments|maintenance\s+(?:plan|membership|club)|service\s+agreement\b/i.test(combined) ||
    /\$\s*(?:[2-9],?\d{3}|[1-9]\d,?\d{3})\b/.test(combined)
  );
}

function evaluateOwnerIdentity(lead) {
  const doc = (lead.doctorName || '').trim();
  const email = (lead.email || '').trim().toLowerCase();
  const isGenericEmail = /^(info|service|services|sales|office|support|contact|admin|help|hello|dispatch|dispatcher|team|general|mail|quotes|estimates)@/i.test(
    email
  );
  const isPlaceholderDoc =
    !doc ||
    doc.length < 3 ||
    /^(owner\s*\/\s*operations|operations lead|medical director|local service|team at|owner$|unknown)/i.test(doc) ||
    doc.includes('Operations Lead');

  const isEmailDerivedOnly = doc.includes('(Owner Contact)');
  const hasVerifiedOwnerName = !isPlaceholderDoc;
  const hasPhone = Boolean(lead.phone);
  const hasDirectPersonalEmail = Boolean(email) && !isGenericEmail;

  // Hard Must-Have #4: Active local business phone number AND a verified owner/decision-maker name
  // (never rely solely on generic info@ / dispatcher@ without a named founder/decision-maker)
  const passesMustHave = hasPhone && (hasVerifiedOwnerName || hasDirectPersonalEmail);

  let earned = 0;
  let detail = 'Missing verified owner/decision-maker name or direct phone';
  if (hasVerifiedOwnerName && (hasDirectPersonalEmail || !isEmailDerivedOnly) && hasPhone) {
    earned = 10;
    detail = `Verified owner (${doc.replace(/\s*\([^)]+\)/g, '')}) + direct phone${hasDirectPersonalEmail ? ' & owner email' : ''}`;
  } else if (hasDirectPersonalEmail && hasPhone) {
    earned = 10;
    detail = `Direct owner contact (${email}) + verified phone (${lead.phone})`;
  } else if (hasVerifiedOwnerName && hasPhone) {
    earned = 7;
    detail = `Verified owner (${doc.replace(/\s*\([^)]+\)/g, '')}) + phone (${lead.phone}; generic email)`;
  } else if (hasPhone) {
    earned = 0;
    detail = `Generic inbox only (${email || 'none'}) with no verified owner/decision-maker name`;
  }

  return {
    passesMustHave,
    hasVerifiedOwnerName,
    hasDirectPersonalEmail,
    isGenericEmail,
    hasPhone,
    earned,
    detail,
  };
}

/**
 * Action Tier Mapping:
 *   80-100 -> Tier A (Contact First)
 *   60-79  -> Tier B (Standard Sequence)
 *   < 60   -> Tier C (Delete Immediately)
 */
export function getRatePointTier(score, hardPass = true) {
  if (!hardPass || score < 60) {
    return {
      grade: 'C',
      tier: 'Tier C',
      label: 'Tier C · Reject / Delete Immediately',
      protocol: 'Delete immediately — do not store in CRM or email.',
      color: 'rose',
    };
  }
  if (score >= 80) {
    return {
      grade: 'A',
      tier: 'Tier A',
      label: 'Tier A · Contact First',
      protocol: 'Run 10s manual hook check, dial direct phone, send custom Harvey PAS email.',
      color: 'emerald',
    };
  }
  return {
    grade: 'B',
    tier: 'Tier B',
    label: 'Tier B · Standard Sequence',
    protocol: 'Enroll in automated 4-step Harvey cadence with matched city/service tags.',
    color: 'cyan',
  };
}

/**
 * Full Qualification Gate:
 *  - Runs Automatic Disqualifiers (Hard Blocklist)
 *  - Evaluates 6 Hard Must-Haves (ANY NO = Instant Skip)
 *  - Computes 100-Point Matrix (Pain 35 + Fit/Urgency 25 + Ability 20 + Ease/Reach 20)
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

  const { reviewCount, googleRating } = extractReviewMetrics(visibleText, lead.jsonLd, lead.reviewCount, lead.googleRating);
  const fleetSize = lead.fleetSize ?? extractFleetSize(visibleText);
  const yearsInBusiness = extractYearsInBusiness(visibleText, lead.yearsInBusiness);

  // ── 1. AUTOMATIC DISQUALIFIERS (Hard Blocklist) ────────────────────────────
  const blocklistHits = [];

  if (reviewCount !== null && reviewCount > 500) {
    blocklistHits.push(`review_count=${reviewCount} > 500 (enterprise / PE roll-up threshold)`);
  }
  if (reviewCount !== null && reviewCount < 15 && !(fleetSize !== null && fleetSize >= 2 && fleetSize <= 15)) {
    blocklistHits.push(`review_count=${reviewCount} < 15 (solo operator without verified 2+ truck fleet)`);
  }
  if (fleetSize !== null && fleetSize > 15) {
    blocklistHits.push(`fleet_size=${fleetSize} > 15 trucks (enterprise / PE scale)`);
  }
  if (fleetSize !== null && fleetSize < 2) {
    blocklistHits.push(`fleet_size=${fleetSize} < 2 trucks (solo Chuck in a truck)`);
  }

  const chainCheck = isEnterpriseOrPeChain(lead.url, lead.clinicName, visibleText);
  const isMultiLocChain = lead.multiLocation?.isMultiLocation === true || chainCheck.matched;
  if (isMultiLocChain) {
    blocklistHits.push(chainCheck.reason || `Multi-location / PE franchise: ${lead.multiLocation?.reason || 'blocked'}`);
  }

  const hasCompetitorAi =
    Boolean(lead.hasCompetitorAi || auditData?.hasCompetitorAi) ||
    COMPETITOR_AI_AND_CALLCENTER_PATTERNS.some((p) => p.test(visibleText));
  if (hasCompetitorAi) {
    blocklistHits.push('Existing Voice AI (e.g., Avoca AI) or 24/7 in-house call center detected');
  }

  const affiliateCheck = isAffiliateShellDomain(lead.url, visibleText);
  if (affiliateCheck.isAffiliate) {
    blocklistHits.push(affiliateCheck.reason);
  }

  const isDeadSite =
    lead.dataSource === 'unreachable' ||
    !lead.url ||
    !lead.phone ||
    Boolean(auditData?.noRecentReviews6Mo) ||
    /\b(?:domainmarket|this domain is for sale|account suspended|domain is parked)\b/i.test(`${lead.clinicName || ''} ${visibleText.slice(0, 600)}`);
  if (isDeadSite) {
    blocklistHits.push(
      !lead.phone
        ? 'Missing active local business phone number'
        : lead.dataSource === 'unreachable'
        ? 'Dead / unreachable site or broken SSL'
        : 'Parked, dead, or stale (>6 months inactive) business'
    );
  }

  const residential = detectResidentialFocus(visibleText, lead);
  if (!residential.pass) {
    blocklistHits.push(residential.detail);
  }

  // ── 2. HARD MUST-HAVES (All 6 must pass) ───────────────────────────────────
  const isFamilyOwned =
    !isMultiLocChain &&
    (lead.multiLocation?.isFamilyOwned || /family[- ]owned|family[- ]operated|locally owned|since 19\d\d/i.test(visibleText));

  const fleetInRange =
    (fleetSize !== null ? fleetSize >= 2 && fleetSize <= 15 : true) &&
    (reviewCount !== null
      ? reviewCount <= 500 && (reviewCount >= 20 || (reviewCount >= 15 && fleetSize !== null && fleetSize >= 2))
      : true);

  const owner = evaluateOwnerIdentity(lead);
  const stack = detectSchedulingStack(visibleText, { stackText: lead.stackText, detectedStack: lead.schedulingStack }, lead);
  const pain = detectIntakeFriction(lead, auditData, visibleText);

  const mustHaves = {
    residentialFocus: {
      label: 'US Residential Focus',
      pass: residential.pass,
      detail: residential.detail,
    },
    goldilocksFleet: {
      label: '2–15 Trucks / 20–500 Reviews',
      pass: fleetInRange,
      detail:
        fleetSize !== null
          ? `${fleetSize} trucks${reviewCount !== null ? ` (${reviewCount} reviews)` : ''}`
          : reviewCount !== null
          ? `${reviewCount} reviews`
          : 'Single-metro family shop (20–500 proxy unconfirmed)',
    },
    independentOwnership: {
      label: '100% Independent Owner',
      pass: !isMultiLocChain && !affiliateCheck.isAffiliate,
      detail: isMultiLocChain ? 'Failed — PE / Multi-location chain' : isFamilyOwned ? 'Family-owned single-metro shop' : 'Independent local shop',
    },
    verifiablePhoneAndOwner: {
      label: 'Verified Phone & Owner Name',
      pass: owner.passesMustHave,
      detail: owner.detail,
    },
    compatibleStack: {
      label: 'Compatible Calendar / FSM',
      pass: stack.compatible,
      detail: stack.detail,
    },
    verifiableIntakeFriction: {
      label: 'Intake Friction Confirmed',
      pass: pain.hasFriction,
      detail: pain.hasFriction ? pain.signals[0] : 'No closed-hours, form-leak, or callback complaint confirmed',
    },
  };

  // Backwards-compatible eyeTest summary for Lead Hunter UI cards
  const eyeTest = {
    reviewsInRange:
      reviewCount !== null
        ? {
            pass: reviewCount >= 20 && reviewCount <= 500,
            value: reviewCount,
            label:
              reviewCount >= 20 && reviewCount <= 500
                ? `${reviewCount} reviews (20–500 sweet spot)`
                : reviewCount < 20
                ? `${reviewCount} reviews (<20 solo risk)`
                : `${reviewCount} reviews (>500 enterprise/PE blocked)`,
          }
        : { pass: null, value: null, label: 'Reviews unpublished on site' },
    familyOwned: mustHaves.independentOwnership,
    painConfirmed: mustHaves.verifiableIntakeFriction,
    activeAds: {
      pass: Boolean(lead.adSignals?.lsaVerified || lead.adSignals?.confirmedGoogleAds || lead.adSignals?.gtmOrGtag || lead.adSignals?.metaPixel),
      label: lead.adSignals?.lsaVerified
        ? 'Google Screened / LSA active'
        : lead.adSignals?.confirmedGoogleAds || lead.adSignals?.gtmOrGtag || lead.adSignals?.metaPixel
        ? 'Active Paid Ads / Tracking'
        : 'No paid acquisition tags detected',
    },
  };

  // ── 3. 100-POINT SCORING MATRIX ────────────────────────────────────────────
  const breakdown = {};

  // A. Pain Signals (35 pts max)
  const painMystery = pain.failedMysteryCall ? 15 : 0;
  const painForm = pain.hasStaticForm ? 10 : 0;
  const painHours = pain.closesAt5OrWeekends ? 5 : 0;
  const painReviews = pain.hasReviewComplaints ? 5 : 0;
  const painEarned = Math.min(35, painMystery + painForm + painHours + painReviews);
  breakdown.painSignals = {
    label: 'A. Pain Signals',
    max: 35,
    earned: painEarned,
    pass: painEarned >= 10,
    subScores: { mysteryCall: painMystery, staticForm: painForm, closedHours: painHours, reviewComplaints: painReviews },
    detail: pain.signals.join(' | ') || 'No clear call-leak pain detected',
  };

  // B. Fit & Urgency (25 pts max)
  const fitFleet = fleetInRange && residential.pass ? 10 : 0;
  const lsa = lead.adSignals?.lsaVerified === true;
  const gAds = lead.adSignals?.confirmedGoogleAds === true;
  const gtmOrMeta = lead.adSignals?.gtmOrGtag === true || lead.adSignals?.metaPixel === true || lead.adSignals?.tikTokPixel === true;
  const fitAds = lsa || gAds ? 10 : gtmOrMeta ? 7 : 0;
  const climate = getCityClimateProfile(lead.city);
  const fitUrgency = climate.activeUrgency ? 5 : 2;
  const fitEarned = Math.min(25, fitFleet + fitAds + fitUrgency);
  breakdown.fitAndUrgency = {
    label: 'B. Fit & Urgency',
    max: 25,
    earned: fitEarned,
    pass: fitEarned >= 15,
    subScores: { goldilocksFleet: fitFleet, paidAds: fitAds, seasonalClimate: fitUrgency },
    detail: `${mustHaves.goldilocksFleet.detail} | ${eyeTest.activeAds.label} | ${climate.label}`,
  };

  // C. Ability to Buy (20 pts max)
  const ratingOk = googleRating === null ? (reviewCount !== null && reviewCount >= 20) : googleRating >= 4.3;
  const yearsOk = yearsInBusiness === null ? (reviewCount !== null && reviewCount >= 35) : yearsInBusiness >= 3;
  const abilityTrack =
    ratingOk && yearsOk
      ? 10
      : yearsInBusiness !== null && yearsInBusiness >= 5 && googleRating === null
      ? 8
      : ratingOk || yearsOk
      ? 6
      : 0;
  const isHighTicket = detectHighTicket(visibleText, lead);
  const abilityTicket = isHighTicket ? 10 : 0;
  const abilityEarned = Math.min(20, abilityTrack + abilityTicket);
  breakdown.abilityToBuy = {
    label: 'C. Ability to Buy',
    max: 20,
    earned: abilityEarned,
    pass: abilityEarned >= 10,
    subScores: { trackRecord: abilityTrack, highTicket: abilityTicket },
    detail: `${yearsInBusiness ? `${yearsInBusiness}+ yrs` : 'Years N/A'}, ${googleRating ? `${googleRating}*` : 'Rating N/A'} | ${isHighTicket ? 'High-ticket replacements/financing' : 'No high-ticket replacements seen'}`,
  };

  // D. Ease of Delivery & Reachability (20 pts max)
  const easeStack = stack.earned;
  const easeOwner = owner.earned;
  const easeEarned = Math.min(20, easeStack + easeOwner);
  breakdown.easeAndReach = {
    label: 'D. Stack & Owner',
    max: 20,
    earned: easeEarned,
    pass: owner.passesMustHave && stack.compatible,
    subScores: { schedulingStack: easeStack, ownerContact: easeOwner },
    detail: `${stack.stackName} | ${owner.detail}`,
  };

  // Legacy category aliases kept intact for backward UI / analytics compatibility
  breakdown.intakeFriction = { label: 'Pain Signals', max: 35, earned: painEarned, pass: painEarned >= 10, detail: breakdown.painSignals.detail };
  breakdown.fleetSize = { label: 'Goldilocks Fleet', max: 10, earned: fitFleet, pass: fitFleet === 10, detected: fleetSize, detail: mustHaves.goldilocksFleet.detail };
  breakdown.ownership = { label: 'Independent Owner', max: 20, earned: mustHaves.independentOwnership.pass ? 20 : 0, pass: mustHaves.independentOwnership.pass, detail: mustHaves.independentOwnership.detail };
  breakdown.adSpend = { label: 'Paid Acquisition', max: 10, earned: fitAds, pass: fitAds > 0, hasLSA: lsa, hasGoogleAds: gAds || gtmOrMeta, detail: eyeTest.activeAds.label };
  breakdown.highTicket = { label: 'High Ticket ($2K–$10K+)', max: 10, earned: abilityTicket, pass: isHighTicket, detail: isHighTicket ? 'Replacements / financing / plans' : 'None detected' };
  breakdown.ownerContact = { label: 'Owner Identity', max: 10, earned: easeOwner, pass: owner.passesMustHave, detail: owner.detail };

  const totalScore = painEarned + fitEarned + abilityEarned + easeEarned;
  const threshold = Number(minScore) || DEFAULT_QUALIFY_THRESHOLD;

  const failedMustHaves = Object.values(mustHaves)
    .filter((m) => !m.pass)
    .map((m) => `${m.label}: ${m.detail}`);

  const allDisqualifiers = [...new Set([...blocklistHits, ...failedMustHaves])];
  if (totalScore < threshold) {
    allDisqualifiers.push(`Score ${totalScore}/100 below ${threshold}-pt CRM threshold`);
  }

  const hardPass = blocklistHits.length === 0 && failedMustHaves.length === 0;
  const qualified = hardPass && totalScore >= threshold;
  const tier = getRatePointTier(totalScore, hardPass && totalScore >= threshold);

  return {
    score: totalScore,
    maxScore: 100,
    ratePoints: `${totalScore}/100`,
    threshold,
    qualified,
    hardPass,
    grade: tier.grade,
    tier: tier.tier,
    tierLabel: tier.label,
    actionProtocol: tier.protocol,
    tierColor: tier.color,
    isChain: isMultiLocChain,
    isFamilyOwned,
    isAffiliate: affiliateCheck.isAffiliate,
    hasCompetitorAi,
    climate,
    schedulingStack: stack,
    yearsInBusiness,
    reviewCount,
    googleRating,
    fleetSize,
    mustHaves,
    blocklistHits,
    breakdown,
    eyeTest,
    eyePassCount: Object.values(mustHaves).filter((x) => x.pass).length,
    eyeKnownCount: Object.keys(mustHaves).length,
    disqualifyReasons: allDisqualifiers,
    qualifiedAt: qualified ? new Date().toISOString() : null,
  };
}

export function getQualificationBadge(qualResult) {
  if (!qualResult) return 'Unscored';
  const { score, grade, qualified } = qualResult;
  return `${qualified ? 'QUALIFIED' : 'REJECTED'} ${score}/100 (Tier ${grade})`;
}
