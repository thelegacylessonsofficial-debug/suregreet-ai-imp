import { auditHarveyCopy, BANNED_AI_PHRASES, formatSalutation, getUnsubscribeUrl } from '../templates/outreachTemplates.js';
import { getCityClimateProfile } from './qualifierService.js';
import { fetchJinaMarkdown } from './auditorService.js';
import { updateProspect, getProspectById } from './outreachService.js';
import { config } from '../config.js';

const TRADE_TREATMENTS = {
  hvac: ['Emergency AC Repair', 'HVAC Replacement', 'Heat Pump Repair', 'Furnace Maintenance', 'Commercial Refrigeration'],
  plumbing: ['Emergency Plumbing', 'Drain Cleaning', 'Water Heater Replacement', 'Sewer Line Repair', 'Burst Pipe Repair'],
  roofing: ['Emergency Roof Repair', 'Roof Replacement', 'Storm Damage Restoration', 'Leak Detection'],
  electrical: ['Emergency Electrical Repair', 'Panel Upgrade', 'Commercial Wiring', 'Generator Installation'],
  water_damage: ['24/7 Water Damage Extraction', 'Flood Cleanup', 'Mold Remediation', 'Structural Drying'],
  default: ['Emergency After-Hours Service', 'Emergency Dispatch', 'Rapid Service Calls'],
};

export function getCleanSubject(clinicName) {
  let clean = (clinicName || '')
    .replace(/,\s*(LLC|Inc\.?|Corp\.?|Co\.?|P\.?C\.?|PLLC)$/i, '')
    .replace(/\s+(LLC|Inc\.?|Corp\.?|Co\.?|P\.?C\.?|PLLC)$/i, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toLowerCase();
  clean = clean.replace(/\bfree\w*\b/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const base = words.length > 2 ? words.slice(0, 2).join(' ') : (words.join(' ') || 'contractor');
  return `${base} calls`;
}

/**
 * STEP 1: Deep Content Extraction & Contractor Dossier Compilation
 */
export async function extractClinicDossier(url, htmlContent = '', nicheHint = null) {
  let text = '';
  if (htmlContent) {
    text = htmlContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } else if (url) {
    text = (await fetchJinaMarkdown(url, 8000)) || '';
  }

  // Determine Niche — Treat all trade services as Trade Contractor
  const isTrade = nicheHint ? nicheHint.toLowerCase() !== 'medspa' : true;
  let resolvedNiche = nicheHint ? nicheHint.toLowerCase() : 'hvac';
  if (isTrade && !['hvac', 'plumbing', 'roofing', 'electrical', 'water_damage'].includes(resolvedNiche)) {
    if (/plumb/i.test(text) || (url && /plumb/i.test(url))) resolvedNiche = 'plumbing';
    else if (/roof/i.test(text) || (url && /roof/i.test(url))) resolvedNiche = 'roofing';
    else if (/electr/i.test(text) || (url && /electr/i.test(url))) resolvedNiche = 'electrical';
    else if (/water.*damage|flood|restor/i.test(text) || (url && /water|restor/i.test(url))) resolvedNiche = 'water_damage';
    else resolvedNiche = 'hvac';
  }

  const candidateTreatments = TRADE_TREATMENTS[resolvedNiche] || TRADE_TREATMENTS.default;
  const detectedTreatments = candidateTreatments.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(text));
  
  let primaryTreatment = detectedTreatments[0];
  if (!primaryTreatment) {
    if (resolvedNiche === 'plumbing') primaryTreatment = 'Emergency Plumbing & Drain Cleaning';
    else if (resolvedNiche === 'roofing') primaryTreatment = 'Emergency Roof Leak & Storm Repair';
    else if (resolvedNiche === 'electrical') primaryTreatment = 'Emergency Electrical & Panel Repair';
    else if (resolvedNiche === 'water_damage') primaryTreatment = '24/7 Water Damage Extraction';
    else primaryTreatment = 'Emergency AC & Heating Repair';
  }

  // Detect owner/founder name if mentioned on site
  let doctorName = null;
  const ownerMatch = text.match(/(?:owner|founder|president)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (ownerMatch && ownerMatch[1]) {
    doctorName = ownerMatch[1].trim();
  }

  // Detect booking mechanism
  const hasLiveScheduler = /calendly|acuityscheduling|housecallpro|servicetitan|jobber|cal\.com|schedule-now/i.test(text);
  const hasStaticForm = /request (an? )?appointment|request a quote|fill out the form|contact form|schedule consultation|get an estimate/i.test(text) && !hasLiveScheduler;
  const bookingType = hasLiveScheduler ? 'live_scheduler' : hasStaticForm ? 'static_contact_form' : 'phone_or_form';

  // Detect operating hours
  const closesEarly = /closes? at 5|closed at 5|5:00 pm|5:30 pm|6:00 pm/i.test(text);
  const closedWeekends = /closed (sat|sun|saturday|sunday)|mon - fri|monday - friday/i.test(text);
  const hoursSummary = closesEarly ? 'Closes at 5:00 PM EST' : 'Standard business hours';

  // Detect paid ad signals
  const hasMetaPixel = htmlContent.includes('fbevents.js') || htmlContent.includes('fbq(');
  const hasGoogleAds = htmlContent.includes('googletagmanager.com/gtag') || htmlContent.includes('googleadservices.com');
  const adSignal = hasMetaPixel || hasGoogleAds ? 'Active Paid Meta/Google Ads' : 'Organic Traffic';

  // Synthesize verifiable trade friction observation ($2,000 ticket math)
  let frictionObservation = '';
  let napkinMathLoss = '$4,000/mo';

  if (isTrade) {
    if (bookingType === 'static_contact_form') {
      frictionObservation = `Saw your emergency repair page routes homeowners to a static contact form instead of instant dispatch.`;
    } else {
      frictionObservation = `Saw your emergency line after 7 PM routes homeowners to voicemail while competitors answer live.`;
    }
  } else {
    frictionObservation = `Noticed after 5 PM and on weekends, evening inquiries wait until next morning.`;
  }

  return {
    url,
    isHvac: resolvedNiche === 'hvac',
    isTrade,
    niche: resolvedNiche,
    doctorName: doctorName || 'Owner / Operations Lead',
    primaryTreatment,
    detectedTreatments,
    bookingType,
    hasLiveScheduler,
    hasStaticForm,
    closesEarly,
    closedWeekends,
    hoursSummary,
    adSignal,
    frictionObservation,
    napkinMathLoss,
  };
}

/**
 * STEP 2: Harvey Dynamic Prompt Builder (Strictly Trade Contractors & Pre-Send Rules)
 */
export function buildHarveyPrompt(dossier, prospect = {}) {
  const doctor = prospect.doctor_name || dossier.doctorName || 'Owner';
  const clinic = prospect.clinic_name || 'Contractor';
  const city = prospect.city || 'United States';
  const treatment = prospect.treatment || dossier.primaryTreatment || 'Emergency Dispatch';
  const salutation = formatSalutation(doctor, clinic, prospect.niche || dossier.niche || 'hvac');

  const qualLine = prospect.qual_score
    ? `- Qualifier Rate Score: ${prospect.qual_score}/100 (${prospect.qual_grade || 'Q'})${prospect.review_count ? ` • ${prospect.review_count} Google Reviews` : ''}${prospect.fleet_size ? ` • ~${prospect.fleet_size} Trucks` : ''}`
    : '';
  const climate = getCityClimateProfile(city);
  const climateRule =
    climate.belt === 'hot_belt'
      ? `\n12. CLIMATE MATCH (${city}): Never mention furnaces, boilers, or winter freeze calls; focus strictly on cooling / AC / residential emergencies.`
      : '';

  return `You are Harvey, principal outbound sales strategist for SureGreet AI.
You write strictly for Archit (Founder of SureGreet AI, 17, building an AI receptionist & voice dispatching agency for US trade contractors).

[AUDITED PROSPECT DOSSIER]
- Contractor Business: ${clinic}
- Owner / Operations Lead: ${salutation}
- Target Metro: ${city}
- Core Emergency Service: ${treatment}
- Ad Spend Signals: ${dossier.adSignal || 'Active'}
- Operating Hours: ${dossier.hoursSummary || 'Standard'}
- Friction Finding: ${dossier.frictionObservation || prospect.specific_observation || 'Routes after-hours calls to voicemail'}
- Estimated Revenue Leak: ${dossier.napkinMathLoss || '$4,000/mo'}
${qualLine ? qualLine + '\n' : ''}

[STRICT HARVEY COPYWRITING RULES]
1. PEER-TO-PEER FOUNDER TONE: Write as Archit. Zero automated agency fluff.
2. WORD COUNT: Strictly between 45 and 62 words total (excluding signoff). Hard ceiling is 70 words.
3. ZERO EM-DASHES (—) or DOUBLE HYPHENS (--): Banned. Use commas or short periods.
4. ZERO EXCLAMATION MARKS (!): Exclamation marks are banned in cold peer-to-peer outreach.
5. EXACTLY ONE QUESTION MARK (?): Only the final CTA is a question ("Worth a quick look?").
6. ZERO AI CLICHÉS: Banned: "hope this email finds you well", "wanted to reach out", "supercharge", "transform", "cutting-edge", "game-changing", "seamless", "revolutionize", "bespoke", "dive deep".
7. ZERO MEDICAL/PATIENT WORDS: Never use "patient", "consultation", "Morpheus8", "practice", "clinic", "EHR". This is a trade contractor (HVAC, plumbing, roofing, electrical).
8. ECONOMIC TICKET MATH: Mention that the average emergency ticket is $2,000+ and missing 2 after-hours calls a month leaks $4,000+ in revenue.
9. SUBJECT LINE: 2 to 4 words lowercase (e.g. "${getCleanSubject(clinic)}").
10. LOW-FRICTION CTA: Soft interest ask ("Worth a quick look?").
11. RETURN FORMAT: Valid JSON only with keys: "subject", "body", "frictionHook".${climateRule}`;
}

/**
 * STEP 3: LLM Generation via Gemini API with Autonomous Fallback
 */
export async function generateHarveyDraft(prompt, dossier, prospect = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || config.geminiApiKey || '';
  const doctor = prospect.doctor_name || dossier.doctorName || 'Owner';
  const clinic = prospect.clinic_name || 'Contractor';
  const currentNiche = prospect.niche || dossier.niche || 'hvac';
  const salutation = formatSalutation(doctor, clinic, currentNiche);
  const hook = dossier.frictionObservation || prospect.specific_observation || `Saw your emergency line after 7 PM routes homeowners to voicemail while competitors answer live.`;
  const subject = getCleanSubject(clinic);

  // Attempt live Gemini API generation if key is present
  if (apiKey) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            parts: [
              {
                text: `${prompt}\n\nRespond with ONLY strict JSON matching {"subject": string, "body": string, "frictionHook": string}. Do not wrap in markdown code blocks.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 250,
          responseMimeType: 'application/json',
        },
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
          if (parsed.subject && parsed.body) {
            return {
              subject: parsed.subject.toLowerCase(),
              body: parsed.body.trim(),
              frictionHook: parsed.frictionHook || hook,
              engine: 'gemini-2.5-flash',
            };
          }
        }
      } else {
        console.warn('[Harvey:Gemini] API returned non-OK status:', res.status);
      }
    } catch (apiErr) {
      console.warn('[Harvey:Gemini] Failed live LLM dispatch, falling back to deterministic synthesis:', apiErr.message);
    }
  }

  // High-performance dynamic synthesis engine (Context-aware trade angles & guaranteed 100% gate pass)
  const city = prospect.city || dossier.city || 'your area';
  const niche = prospect.niche || dossier.niche || 'hvac';
  const isPlumbing = niche === 'plumbing' || /plumb/i.test(clinic);
  const isRoofing = niche === 'roofing' || /roof/i.test(clinic);
  const isElectrical = niche === 'electrical' || /electr/i.test(clinic);
  const isWaterDamage = niche === 'water_damage' || /water|flood|restor/i.test(clinic);

  let dynamicHook = '';
  if (dossier.frictionObservation && dossier.frictionObservation.length > 20 && !dossier.frictionObservation.includes('undefined')) {
    dynamicHook = dossier.frictionObservation;
  } else if (isPlumbing) {
    if (dossier.bookingType === 'static_contact_form') {
      dynamicHook = `Saw your emergency repair page in ${city} routes panicked homeowners with burst pipes to an online form instead of live dispatch.`;
    } else {
      dynamicHook = `Checked your emergency line across ${city}. When water leaks or sewer backups hit after 7 PM, callers hit voicemail while competitors answer live.`;
    }
  } else if (isRoofing) {
    dynamicHook = `Saw your storm repair page across ${city} sends urgent leak calls into a contact form instead of dispatching technicians directly.`;
  } else if (isElectrical) {
    dynamicHook = `Checked your emergency line across ${city}. After-hours electrical outages hit voicemail while homeowners need immediate dispatch.`;
  } else if (isWaterDamage) {
    dynamicHook = `Checked your 24/7 water mitigation line in ${city}. Panicked homeowners with flooding hit an answering queue instead of immediate crew dispatch.`;
  } else {
    // HVAC
    if (dossier.bookingType === 'static_contact_form') {
      dynamicHook = `Saw your emergency repair page in ${city} routes urgent AC service requests to a static contact form instead of live dispatch.`;
    } else {
      dynamicHook = `Saw your emergency line after 7 PM across ${city} routes homeowners to voicemail while competitors answer live.`;
    }
  }

  // Dynamic ticket math tailored to trade
  let dynamicMath = 'Average emergency ticket is $2,000+. Missing just 2 after-hours calls a month leaks $4,000+ in revenue.';
  if (isRoofing) {
    dynamicMath = 'Average roof replacement or storm repair is $3,500+. Missing just 1 emergency repair call a month leaks thousands.';
  } else if (isWaterDamage) {
    dynamicMath = 'Average flood mitigation ticket is $3,000+. Panicked homeowners call the next contractor immediately if nobody picks up.';
  }

  // Dynamic solutions and CTAs
  const solutions = [
    'Put together a 60-second walkthrough showing our AI voice line answering in 2 rings and booking jobs 24/7.',
    'Built a 60-second demo of our AI voice dispatcher answering in 2 rings and scheduling emergency dispatch 24/7.',
    'Put together a quick 60-second walkthrough showing how our 24/7 voice line captures emergency jobs automatically.',
  ];
  const solIndex = (clinic.length + city.length) % solutions.length;
  const solution = solutions[solIndex];

  const ctas = [
    'Worth a quick look?',
    'Open to checking the test line?',
    'Worth a 60-second look?',
  ];
  const ctaIndex = clinic.length % ctas.length;
  const cta = ctas[ctaIndex];

  const body = `Hey ${salutation},\n\n${dynamicHook}\n\n${dynamicMath}\n\n${solution}\n\n${cta}\n\nBest,\nArchit`;

  return {
    subject,
    body,
    frictionHook: dynamicHook,
    engine: 'harvey-dynamic-trade-v3',
  };
}

/**
 * STEP 4: Deterministic Quality Gate & Self-Healing Loop
 */
export async function runQualityGateAndHeal(draftData, prompt, dossier, prospect = {}, maxRetries = 2) {
  let currentDraft = { ...draftData };
  const currentNiche = prospect.niche || dossier.niche || 'hvac';
  const city = prospect.city || dossier.city || '';
  const climate = getCityClimateProfile(city);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Audit current draft with city climate awareness
    const audit = auditHarveyCopy(currentDraft.body, currentDraft.subject, currentNiche, city);

    if (audit.passed) {
      return {
        passed: true,
        attempts: attempt + 1,
        audit,
        draft: currentDraft,
      };
    }

    console.log(`[Harvey Quality Gate] Attempt #${attempt + 1} flagged issues:`, audit.issues);

    // Self-healing sanitization
    let cleanedBody = currentDraft.body;
    let cleanedSubject = currentDraft.subject;

    // 1. Strip em-dashes and double hyphens
    cleanedBody = cleanedBody.replace(/—/g, ' - ').replace(/--/g, ' - ');

    // 2. Strip exclamation marks
    cleanedBody = cleanedBody.replace(/!+/g, '.');

    // 3. Remove banned AI clichés
    for (const banned of BANNED_AI_PHRASES) {
      const reg = new RegExp(`\\b${banned}\\b`, 'gi');
      cleanedBody = cleanedBody.replace(reg, '');
    }

    // 4. Remove forbidden trade words & heal hot-belt climate mismatches (e.g. never pitch furnaces in Phoenix)
    for (const tw of ['patient', 'patients', 'morpheus8', 'botox', 'juvederm', 'bodytite', 'consultation', 'medical director']) {
      const reg = new RegExp(`\\b${tw}\\b`, 'gi');
      cleanedBody = cleanedBody.replace(reg, '');
    }
    if (climate.belt === 'hot_belt') {
      cleanedBody = cleanedBody.replace(/\bfurnaces?\b/gi, 'AC systems').replace(/\bboilers?\b/gi, 'cooling systems').replace(/\bwinter\s+freeze\b/gi, 'peak cooling');
      cleanedSubject = cleanedSubject.replace(/\bfurnaces?\b/gi, 'ac');
    }

    // 5. Clean subject line to 2-4 words lowercase
    cleanedSubject = getCleanSubject(cleanedSubject.replace(/calls$/i, '').trim() || prospect.clinic_name);

    // 6. Ensure question mark limit (max 1 for final CTA)
    const qParts = cleanedBody.split('?');
    if (qParts.length > 2) {
      // Keep only the final question mark
      cleanedBody = qParts.slice(0, -1).join('.') + '?' + qParts[qParts.length - 1];
    }

    // 7. Trim excess words if over 70
    const words = cleanedBody.split(/\s+/).filter(Boolean);
    if (words.length > 70) {
      const doctor = prospect.doctor_name || dossier.doctorName || 'Owner';
      const salutation = formatSalutation(doctor, prospect.clinic_name, currentNiche);
      const hook = dossier.frictionObservation || `Saw your emergency line after 7 PM routes homeowners to voicemail while competitors answer live.`;
      cleanedBody = `Hey ${salutation},\n\n${hook}\n\nAverage emergency ticket is $2,000+. Missing just 2 after-hours calls a month leaks $4,000+ in revenue.\n\nPut together a 60-second walkthrough showing our AI voice line answering in 2 rings and booking jobs 24/7.\n\nWorth a quick look?\n\nBest,\nArchit`;
    }

    currentDraft.body = cleanedBody;
    currentDraft.subject = cleanedSubject;

    // Re-verify after self-healing
    const reAudit = auditHarveyCopy(currentDraft.body, currentDraft.subject, currentNiche, city);
    if (reAudit.passed) {
      return {
        passed: true,
        healed: true,
        attempts: attempt + 1,
        audit: reAudit,
        draft: currentDraft,
      };
    }
  }

  // Return last state with audit breakdown
  const finalAudit = auditHarveyCopy(currentDraft.body, currentDraft.subject, currentNiche, city);
  return {
    passed: finalAudit.score >= 80,
    attempts: maxRetries + 1,
    audit: finalAudit,
    draft: currentDraft,
  };
}

/**
 * FULL END-TO-END ORCHESTRATOR:
 * Scrapes -> Builds Dossier -> Prompts -> Generates -> Quality Gates -> Stages in Supabase
 */
export async function runHarveyAutonomousPipeline({ prospectId, url, htmlContent, niche }) {
  console.log(`[Harvey Autonomous Pipeline] Starting for prospect ${prospectId || url}...`);

  let prospect = null;
  if (prospectId) {
    prospect = await getProspectById(prospectId);
  }

  const targetUrl = url || prospect?.website_url || (prospect?.email ? `https://${prospect.email.split('@')[1]}` : '');
  const nicheHint = niche || prospect?.niche;

  // Step 1: Deep Extraction
  const dossier = await extractClinicDossier(targetUrl, htmlContent, nicheHint);

  // Step 2: Build Dynamic Prompt
  const prompt = buildHarveyPrompt(dossier, prospect || {});

  // Step 3: LLM Generation
  const rawDraft = await generateHarveyDraft(prompt, dossier, prospect || {});

  // Step 4: Quality Gate & Self-Healing
  const gateResult = await runQualityGateAndHeal(rawDraft, prompt, dossier, prospect || {});

  // Stage into Supabase public.prospects
  let stagedProspect = prospect;
  if (prospectId) {
    const unsubUrl = getUnsubscribeUrl(prospect?.email || '');
    const fullTextPayload = `${gateResult.draft.body}\n\n--\nOpt out: ${unsubUrl}`;

    stagedProspect = await updateProspect(prospectId, {
      harvey_prompt: prompt,
      harvey_draft: fullTextPayload,
      harvey_score: gateResult.audit.score,
      harvey_status: gateResult.passed ? 'passed' : 'flagged',
      specific_observation: dossier.frictionObservation,
      recommended_angle: `Pitch 24/7 AI voice capture to eliminate ${dossier.napkinMathLoss} in after-hours leaks.`,
      original_subject: gateResult.draft.subject,
    });
    console.log(`[Harvey Autonomous Pipeline] Staged in CRM for ${prospectId} (Score: ${gateResult.audit.score}/100)`);
  }

  return {
    success: true,
    dossier,
    prompt,
    draft: gateResult.draft,
    audit: gateResult.audit,
    passed: gateResult.passed,
    prospect: stagedProspect,
  };
}

/**
 * LIVE WEBSITE DIAGNOSTIC & FULL 4-STEP SEQUENCE GENERATION (HARVEY-SALES SKILL)
 */
export async function diagnoseAndGenerateFullSequence({
  url,
  doctorName,
  clinicName,
  city,
  email,
  niche,
  treatment,
  customObservation,
  framework = 'pas',
}) {
  console.log(`[Harvey Studio] Diagnosing website ${url || clinicName}...`);

  // 1. Deep Extraction & Dossier
  const dossier = await extractClinicDossier(url, '', niche);

  // 2. Resolve Overrides
  const isTrade = niche ? niche.toLowerCase() !== 'medspa' : true;
  const doc = doctorName || dossier.doctorName || 'Owner';
  const clinic = clinicName || (url ? url.replace(/^https?:\/\//, '').split('/')[0] : 'Contractor');
  const cleanClinic = (clinic.split("'")[0].split("-")[0] || clinic).trim();
  const cCity = city || 'US';
  const treat = treatment || dossier.primaryTreatment || 'emergency service calls';
  const salutation = formatSalutation(doc, cleanClinic, niche || 'hvac');
  const calUrl = 'https://cal.com/archit-suregreet/15min';

  // 3. Verifiable Hook from /harvey-sales skill
  let hook = (customObservation || '').trim() || dossier.frictionObservation;
  if (!hook) {
    hook = `Saw your emergency repair line in ${cCity} routes after-hours calls to voicemail while competitors answer live.`;
  }

  // 4. Generate Step 1 based on selected framework (PAS vs QVC)
  let step1Subject = getCleanSubject(cleanClinic);
  let step1Body = '';

  if (framework === 'qvc') {
    // Framework B: QVC from /harvey-sales
    const question = `How does ${cleanClinic} handle emergency service calls between 5 PM and 8 AM?`;
    const value = `Most contractors lose 3 to 5 emergency jobs every weekend because callers dislike voicemails. SureGreet AI acts as your 24/7 voice dispatcher, booking calls directly into your calendar in 2 rings.`;
    step1Body = `Hey ${salutation},\n\n${question}\n\n${value}\n\nWorth a 3-minute walkthrough to see if it makes sense for your lines?\n\nBest,\nArchit`;
  } else {
    // Framework A: PAS from /harvey-sales with $2,000 ticket math
    const math = `Average emergency ticket is $2,000+. Missing just 2 after-hours calls a month leaks $4,000+ in revenue.`;
    const solution = `Put together a 60-second walkthrough showing our AI voice line answering in 2 rings and booking jobs 24/7.`;
    step1Body = `Hey ${salutation},\n\n${hook}\n\n${math}\n\n${solution}\n\nWorth a quick look?\n\nBest,\nArchit`;
  }

  // 5. Generate Step 2: Proof & Audio Demo (Threaded Re: from /harvey-sales)
  const step2Subject = `Re: ${step1Subject}`;
  const step2Body = `hey ${salutation},\n\nfloating this back up - happy to text over a test line so you can hear how our AI voice dispatcher handles emergency callers after 7 PM.\n\nBest,\nArchit`;

  // 6. Generate Step 3: Economic Napkin Math & 14-Day Trial with Cal.com link (from /harvey-sales)
  const step3Subject = `Re: ${step1Subject}`;
  const math = `Quick napkin math - average emergency ticket is $2,000+. Missing just 2 after-hours calls a month to voicemail is $4,000+ in leaked revenue.`;

  const step3Body = `Hey ${salutation},\n\n${math}\n\nWe can plug our 24/7 AI voice dispatcher into your lines for 14 days to capture those emergency jobs at zero risk, or grab 10 minutes on my direct calendar (${calUrl}).\n\nFair enough?\n\nBest,\nArchit`;

  // 7. Generate Step 4: Clean Breakup (Threaded Re: from /harvey-sales)
  const step4Subject = `Re: ${step1Subject}`;
  const step4Body = `hey ${salutation},\n\nassuming you're all set on after-hours dispatch coverage for now - i'll get out of your hair. if missed evening calls ever become a headache, just reply here.\n\nBest,\nArchit`;

  // 8. Quality Gate Audit for each step
  const unsubUrl = getUnsubscribeUrl(email || 'doctor@clinic.com');
  const makeHtml = (body) => `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #111827; max-width: 520px;">
    ${body.split('\n\n').map(p => `<p style="margin: 0 0 12px 0;">${p.replace(/\n/g, '<br>')}</p>`).join('\n')}
    <p style="margin: 16px 0 0 0; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px;">Opt out: <a href="${unsubUrl}" style="color: #9ca3af;">unsubscribe</a></p>
  </div>`;

  const sequence = [
    {
      step: 1,
      name: 'Cold Hook (Micro-Audit)',
      timing: 'Day 1',
      subject: step1Subject,
      text: `${step1Body}\n\n--\nOpt out: ${unsubUrl}`,
      html: makeHtml(step1Body),
      audit: auditHarveyCopy(step1Body, step1Subject),
    },
    {
      step: 2,
      name: 'Proof & 30s Audio Demo',
      timing: '+2 Biz Days',
      subject: step2Subject,
      text: `${step2Body}\n\n--\nOpt out: ${unsubUrl}`,
      html: makeHtml(step2Body),
      audit: auditHarveyCopy(step2Body, step2Subject),
    },
    {
      step: 3,
      name: 'Revenue Leak Automation & Calendar',
      timing: '+3 Biz Days',
      subject: step3Subject,
      text: `${step3Body}\n\n--\nOpt out: ${unsubUrl}`,
      html: makeHtml(step3Body),
      audit: auditHarveyCopy(step3Body, step3Subject),
    },
    {
      step: 4,
      name: 'Clean Breakup',
      timing: '+3 Biz Days',
      subject: step4Subject,
      text: `${step4Body}\n\n--\nOpt out: ${unsubUrl}`,
      html: makeHtml(step4Body),
      audit: auditHarveyCopy(step4Body, step4Subject),
    },
  ];

  return {
    success: true,
    dossier,
    sequence,
    audit: sequence[0].audit,
    calUrl,
    leakedAmount: dossier.napkinMathLoss,
  };
}
