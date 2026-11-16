import { Router } from 'express';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { supabaseFetch } from '../services/outreachService.js';
import { sendTelegramHtml } from '../services/telegram.js';

export const callsRouter = Router();

/**
 * Fetch recent call logs from Supabase
 */
async function getCallLogs({ limit = 50 } = {}) {
  try {
    const res = await supabaseFetch(`/call_logs?select=*&order=created_at.desc&limit=${limit}`);
    return res.ok && Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('[Calls Dashboard] Error fetching call logs:', err.message);
    return [];
  }
}

/**
 * Fetch recent booked discovery appointments from Supabase
 */
async function getDiscoveryBookings({ limit = 20 } = {}) {
  try {
    const res = await supabaseFetch(`/bookings?select=*&order=created_at.desc&limit=${limit}`);
    return res.ok && Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('[Calls Dashboard] Error fetching bookings:', err.message);
    return [];
  }
}

/**
 * 1. Log an Outbound Call Dial (Archit's Daily 10 RGAs)
 */
callsRouter.post('/log-outbound', async (req, res) => {
  const body = req.body || {};
  const contactName = (body.contactName || body.doctorName || 'Doctor / Lead').trim();
  const clinicName = (body.clinicName || 'Clinic').trim();
  const phone = (body.phone || '').trim();
  const outcome = body.outcome || 'Decision Maker Connected';
  const notes = (body.notes || '').trim();

  try {
    const insertRes = await supabaseFetch('/call_logs', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        call_type: 'outbound_dial',
        caller_phone: phone,
        contact_name: contactName,
        clinic_name: clinicName,
        duration: 'Manual Dial',
        outcome,
        sentiment: outcome === 'Demo / Meeting Booked' ? 'Positive' : 'Neutral',
        summary: `Outbound sales dial to ${contactName} (${clinicName})`,
        notes,
        metadata: { loggedBy: 'Archit', timestamp: new Date().toISOString() },
      }),
    });

    // Calculate today's total outbound dials
    const todayEST = DateTime.now().setZone(config.timezone).toFormat('yyyy-MM-dd');
    const allCalls = await getCallLogs({ limit: 100 });
    const todayOutbound = allCalls.filter(
      (c) =>
        c.call_type === 'outbound_dial' &&
        DateTime.fromISO(c.created_at).setZone(config.timezone).toFormat('yyyy-MM-dd') === todayEST
    );

    const countToday = todayOutbound.length;

    // Send Telegram VIP push confirmation to Archit
    try {
      const outcomeEmoji =
        outcome.includes('Booked') ? '🎯' : outcome.includes('Connected') ? '🗣️' : outcome.includes('Voicemail') ? '📼' : '📞';

      const tgMsg =
        `${outcomeEmoji} <b>OUTBOUND DIAL LOGGED!</b>\n\n` +
        `👤 <b>Contact:</b> ${contactName} (${clinicName})\n` +
        `📞 <b>Phone:</b> ${phone || 'N/A'}\n` +
        `📊 <b>Outcome:</b> <code>${outcome}</code>\n` +
        `📝 <b>Notes:</b> <i>${notes || 'None noted'}</i>\n\n` +
        `🔥 <b>Today's Progress:</b> ${countToday} / 10 calls completed (${Math.round((countToday / 10) * 100)}%)`;

      await sendTelegramHtml(tgMsg);
    } catch (tgErr) {
      console.warn('[Calls Dashboard] Telegram push warning:', tgErr.message);
    }

    return res.status(200).json({
      status: 'success',
      todayCount: countToday,
      call: insertRes.data?.[0] || null,
    });
  } catch (err) {
    console.error('[Calls Dashboard] Error logging outbound call:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * 2. API Endpoint returning JSON data
 */
callsRouter.get('/api/data', async (req, res) => {
  const callLogs = await getCallLogs({ limit: 50 });
  const bookings = await getDiscoveryBookings({ limit: 20 });
  res.json({
    status: 'success',
    callLogs,
    bookings,
  });
});

/**
 * 3. Unified Agency Call Tracker Dashboard HTML
 */
callsRouter.get(['/', '/dashboard'], async (req, res) => {
  const callLogs = await getCallLogs({ limit: 60 });
  const bookings = await getDiscoveryBookings({ limit: 20 });

  const nowEST = DateTime.now().setZone(config.timezone);
  const todayDateStr = nowEST.toFormat('yyyy-MM-dd');

  // Compute metrics
  const inboundAICalls = callLogs.filter((c) => c.call_type !== 'outbound_dial');
  const outboundDials = callLogs.filter((c) => c.call_type === 'outbound_dial');

  const todayDialsCount = outboundDials.filter(
    (c) => DateTime.fromISO(c.created_at).setZone(config.timezone).toFormat('yyyy-MM-dd') === todayDateStr
  ).length;

  const totalBookedAI = inboundAICalls.filter((c) => (c.outcome || '').toLowerCase().includes('book')).length;
  const totalBookedConsults = bookings.length;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SureGreet AI • Personal Call Command Center</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="icon" href="/suregreetai.svg">
  <style>
    @keyframes pulse-slow { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .pulse-dot { animation: pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
  </style>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen antialiased font-sans selection:bg-emerald-500 selection:text-black">

  <!-- Global Agency Navigation -->
  <header class="border-b border-gray-800/80 bg-gray-900/80 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div class="flex items-center space-x-3">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-black font-extrabold text-lg shadow-md shadow-emerald-500/20">
        📞
      </div>
      <div>
        <div class="flex items-center space-x-2">
          <span class="text-base font-bold tracking-tight text-white">SureGreet AI</span>
          <span class="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Call Command Center</span>
        </div>
        <p class="text-[11px] text-gray-400">Live AI Voice Telemetry & Daily Outbound Dial Tracker</p>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <nav class="flex flex-wrap items-center gap-1.5 bg-gray-950/80 p-1.5 rounded-xl border border-gray-800 text-xs">
      <a href="/calls" class="px-3 py-1.5 rounded-lg font-semibold bg-emerald-500 text-black shadow-sm">
        📞 Call Tracker
      </a>
      <a href="/outreach/prospects" class="px-3 py-1.5 rounded-lg font-semibold text-gray-400 hover:text-white hover:bg-gray-800/50 transition">
        📊 Pipeline CRM
      </a>
      <a href="/scraper/dashboard" class="px-3 py-1.5 rounded-lg font-semibold text-gray-400 hover:text-white hover:bg-gray-800/50 transition">
        ⚡ Lead Scraper
      </a>
      <a href="/inbox/dashboard" class="px-3 py-1.5 rounded-lg font-semibold text-gray-400 hover:text-white hover:bg-gray-800/50 transition">
        ✉️ Inbox Triage
      </a>
    </nav>

    <!-- External Retell AI Link -->
    <div class="flex items-center gap-2">
      <a href="https://dashboard.retellai.com" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-emerald-400 border border-gray-700 text-xs font-mono flex items-center gap-1.5 transition">
        <span>🎙️ Retell Console</span>
        <span class="text-[10px] text-gray-400">↗</span>
      </a>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
    
    <!-- Top Metrics Row -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      
      <!-- Metric 1: Today's Outbound Dial Goal -->
      <div class="p-5 rounded-2xl bg-gray-900 border border-emerald-500/40 relative overflow-hidden shadow-[0_0_25px_rgba(16,185,129,0.1)]">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-mono uppercase text-gray-400 tracking-wider">Today's Sales Dials</span>
          <span class="w-2 h-2 rounded-full bg-emerald-400 pulse-dot"></span>
        </div>
        <div class="text-3xl font-extrabold text-white mt-1.5 font-mono">
          <span id="metricTodayDials">${todayDialsCount}</span> <span class="text-sm font-normal text-gray-400">/ 10</span>
        </div>
        <!-- Progress Bar -->
        <div class="w-full bg-gray-800 h-2 rounded-full mt-3 overflow-hidden">
          <div id="metricProgressBar" class="bg-emerald-500 h-full rounded-full transition-all duration-500" style="width: ${Math.min((todayDialsCount / 10) * 100, 100)}%;"></div>
        </div>
        <div class="text-[10px] text-gray-400 mt-2 font-mono flex justify-between">
          <span>Top RGA Quota</span>
          <span id="metricProgressPercent">${Math.round((todayDialsCount / 10) * 100)}% Complete</span>
        </div>
      </div>

      <!-- Metric 2: Inbound AI Calls -->
      <div class="p-5 rounded-2xl bg-gray-900 border border-gray-800">
        <div class="text-[11px] font-mono uppercase text-gray-400 tracking-wider">Inbound AI Calls</div>
        <div class="text-3xl font-extrabold text-white mt-1.5 font-mono">${inboundAICalls.length}</div>
        <div class="text-[11px] text-emerald-400 mt-2 font-mono flex items-center gap-1">
          <span>${totalBookedAI} Appointments Captured</span>
        </div>
      </div>

      <!-- Metric 3: Scheduled Discovery Sessions -->
      <div class="p-5 rounded-2xl bg-gray-900 border border-gray-800">
        <div class="text-[11px] font-mono uppercase text-gray-400 tracking-wider">Booked Consultations</div>
        <div class="text-3xl font-extrabold text-white mt-1.5 font-mono">${totalBookedConsults}</div>
        <div class="text-[11px] text-gray-400 mt-2 font-mono">
          <span>Google Meet Cal.com Ingest</span>
        </div>
      </div>

      <!-- Metric 4: Agency Timezone -->
      <div class="p-5 rounded-2xl bg-gray-900 border border-gray-800">
        <div class="text-[11px] font-mono uppercase text-gray-400 tracking-wider">US Operations Time</div>
        <div class="text-xl font-bold text-white mt-1.5 font-mono">${nowEST.toFormat('hh:mm a')} <span class="text-xs text-emerald-400 font-normal">EST</span></div>
        <div class="text-[11px] text-gray-400 mt-2 font-mono">${nowEST.toFormat('cccc, LLL dd')}</div>
      </div>

    </div>

    <!-- Quick Outbound Call Logger (Top 3 RGAs) -->
    <div class="p-6 rounded-2xl bg-gradient-to-r from-gray-900 via-gray-900 to-gray-900/90 border border-gray-800 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-800/80 gap-2">
        <div>
          <div class="text-xs font-mono text-emerald-400 uppercase tracking-wider font-semibold">1-Click Fast Call Logger</div>
          <h3 class="text-base font-bold text-white">Log Front-Desk Dial to Practice Manager</h3>
        </div>
        <span class="text-xs font-mono text-gray-400 bg-gray-950 px-3 py-1 rounded-lg border border-gray-800 w-fit">
          Non-Negotiable: 10 Dials / Day
        </span>
      </div>

      <form id="outboundLogForm" onsubmit="handleOutboundSubmit(event)" class="space-y-4">
        <div class="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          <input
            id="logContactName"
            required
            placeholder="Doctor / Practice Mgr Name"
            class="bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
          <input
            id="logClinicName"
            required
            placeholder="Clinic / Business Name"
            class="bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
          <input
            id="logPhone"
            required
            type="tel"
            placeholder="Phone Number Dialed"
            class="bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
          <select
            id="logOutcome"
            class="bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="Decision Maker Connected">🗣️ Connected with Decision Maker</option>
            <option value="Demo / Meeting Booked">🎯 Demo / Meeting Booked!</option>
            <option value="Left Voicemail">📼 Left Voicemail</option>
            <option value="Gatekeeper Blocked">🛡️ Gatekeeper Blocked</option>
            <option value="No Answer / Line Busy">📵 No Answer / Line Busy</option>
          </select>
        </div>

        <div class="flex flex-col sm:flex-row gap-3">
          <input
            id="logNotes"
            placeholder="Brief conversation notes (e.g., Receptionist said Dr. Riveros reviews tech on Thursday, call back at 2 PM)"
            class="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            id="btnLogDial"
            class="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-lg shadow-emerald-500/10"
          >
            <span>+ Log Call to Daily Quota</span>
          </button>
        </div>
      </form>
    </div>

    <!-- Calls Tables & Scheduled Sessions -->
    <div class="space-y-6">
      
      <!-- Section A: Scheduled Discovery Strategy Sessions -->
      <div class="p-6 rounded-2xl bg-gray-900 border border-gray-800 space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-gray-800">
          <div class="flex items-center gap-2">
            <span class="text-lg">🗓️</span>
            <h3 class="text-sm font-bold text-white uppercase tracking-wider font-mono">Confirmed Strategy Appointments (${bookings.length})</h3>
          </div>
          <span class="text-[11px] font-mono text-gray-400">Google Meet Integrated</span>
        </div>

        ${
          bookings.length === 0
            ? `<div class="p-8 text-center text-gray-500 text-xs font-mono">No appointments scheduled yet. Send audits to fill your calendar!</div>`
            : `<div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="text-gray-400 font-mono border-b border-gray-800">
                    <tr>
                      <th class="pb-2.5">Date & Slot (US EST)</th>
                      <th class="pb-2.5">Lead / Doctor</th>
                      <th class="pb-2.5">Contact Details</th>
                      <th class="pb-2.5">Stated Bottleneck</th>
                      <th class="pb-2.5">Meeting Link</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-800/60 font-mono">
                    ${bookings
                      .map(
                        (b) => `
                      <tr class="hover:bg-gray-950/40 transition">
                        <td class="py-3 text-emerald-400 font-bold">${b.start_time || 'Upcoming'}</td>
                        <td class="py-3 text-white font-medium">${b.attendee_name || 'Client'}</td>
                        <td class="py-3 text-gray-300">
                          <div>${b.attendee_email || ''}</div>
                          <div class="text-[11px] text-gray-500">${b.attendee_phone || ''}</div>
                        </td>
                        <td class="py-3 text-gray-400 max-w-xs truncate">${b.notes || 'Inbound Booking'}</td>
                        <td class="py-3">
                          <a href="${b.metadata?.meetingUrl || '#'}" target="_blank" class="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-black transition inline-flex items-center gap-1 font-bold">
                            <span>Join Meet</span>
                            <span class="text-[10px]">↗</span>
                          </a>
                        </td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>`
        }
      </div>

      <!-- Section B: Live AI Voice Telemetry & Outbound History -->
      <div class="p-6 rounded-2xl bg-gray-900 border border-gray-800 space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-gray-800">
          <div class="flex items-center gap-2">
            <span class="text-lg">🎙️</span>
            <h3 class="text-sm font-bold text-white uppercase tracking-wider font-mono">Recent Call History (Inbound AI & Outbound Dials)</h3>
          </div>
          <span class="text-[11px] font-mono text-gray-400">${callLogs.length} Records</span>
        </div>

        ${
          callLogs.length === 0
            ? `<div class="p-8 text-center text-gray-500 text-xs font-mono">No call history recorded yet. Inbound Retell calls and outbound dials will appear here live.</div>`
            : `<div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="text-gray-400 font-mono border-b border-gray-800">
                    <tr>
                      <th class="pb-2.5">Type</th>
                      <th class="pb-2.5">Date / Time (EST)</th>
                      <th class="pb-2.5">Contact / Clinic</th>
                      <th class="pb-2.5">Phone Number</th>
                      <th class="pb-2.5">Duration</th>
                      <th class="pb-2.5">Outcome</th>
                      <th class="pb-2.5">Summary / Notes</th>
                      <th class="pb-2.5">Recording</th>
                    </tr>
                  </thead>
                  <tbody id="callTableBody" class="divide-y divide-gray-800/60 font-mono">
                    ${callLogs
                      .map((c) => {
                        const isOutbound = c.call_type === 'outbound_dial';
                        const typeBadge = isOutbound
                          ? '<span class="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">OUTBOUND</span>'
                          : '<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">AI INBOUND</span>';

                        const outcomeBadgeColor = (c.outcome || '').includes('Booked')
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold'
                          : (c.outcome || '').includes('Connected')
                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                          : (c.outcome || '').includes('Voicemail')
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-gray-800 text-gray-300 border-gray-700';

                        const formattedDate = DateTime.fromISO(c.created_at)
                          .setZone(config.timezone)
                          .toFormat('LLL dd, hh:mm a');

                        return `
                        <tr class="hover:bg-gray-950/40 transition">
                          <td class="py-3">${typeBadge}</td>
                          <td class="py-3 text-gray-300">${formattedDate}</td>
                          <td class="py-3 font-semibold text-white">
                            <div>${c.contact_name || c.clinic_name || 'Prospect'}</div>
                            <div class="text-[10px] text-gray-500">${c.clinic_name || ''}</div>
                          </td>
                          <td class="py-3 text-gray-300">
                            <a href="tel:${c.caller_phone}" class="hover:underline text-emerald-400">${c.caller_phone || 'N/A'}</a>
                          </td>
                          <td class="py-3 text-gray-400">${c.duration || '—'}</td>
                          <td class="py-3">
                            <span class="px-2 py-0.5 rounded-full text-[10px] border ${outcomeBadgeColor}">
                              ${c.outcome || 'Inquiry'}
                            </span>
                          </td>
                          <td class="py-3 text-gray-400 max-w-xs truncate" title="${c.summary || c.notes || ''}">
                            ${c.notes || c.summary || 'None'}
                          </td>
                          <td class="py-3">
                            ${
                              c.recording_url
                                ? `<a href="${c.recording_url}" target="_blank" class="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-emerald-400 border border-gray-700 transition inline-flex items-center gap-1 text-[11px]">
                                    <span>Play 🔊</span>
                                  </a>`
                                : '<span class="text-gray-600">—</span>'
                            }
                          </td>
                        </tr>
                      `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>`
        }
      </div>

    </div>

  </main>

  <script>
    async function handleOutboundSubmit(e) {
      e.preventDefault();
      const btn = document.getElementById('btnLogDial');
      btn.disabled = true;
      btn.innerText = 'Logging...';

      const payload = {
        contactName: document.getElementById('logContactName').value,
        clinicName: document.getElementById('logClinicName').value,
        phone: document.getElementById('logPhone').value,
        outcome: document.getElementById('logOutcome').value,
        notes: document.getElementById('logNotes').value,
      };

      const urlKey = new URLSearchParams(window.location.search).get('key');
      if (urlKey) {
        localStorage.setItem('suregreet_admin_key', urlKey);
      }
      const adminKey = urlKey || localStorage.getItem('suregreet_admin_key') || '';

      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (adminKey) headers['x-admin-key'] = adminKey;

      const endpoint = '/calls/log-outbound' + (adminKey ? '?key=' + encodeURIComponent(adminKey) : '');

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          let errMsg = 'HTTP ' + res.status;
          try {
            const errData = await res.json();
            errMsg = errData.message || errData.error || errMsg;
          } catch(e) {
            if (res.status === 401) errMsg = 'Authentication required. Please reload the page to log in.';
          }
          throw new Error(errMsg);
        }

        const data = await res.json();
        btn.disabled = false;
        btn.innerText = '+ Log Call to Daily Quota';

        if (data.status === 'success') {
          // Update counters
          const count = data.todayCount || 1;
          document.getElementById('metricTodayDials').innerText = count;
          document.getElementById('metricProgressBar').style.width = Math.min((count / 10) * 100, 100) + '%';
          document.getElementById('metricProgressPercent').innerText = Math.round((count / 10) * 100) + '% Complete';

          // Reset inputs
          document.getElementById('logContactName').value = '';
          document.getElementById('logClinicName').value = '';
          document.getElementById('logPhone').value = '';
          document.getElementById('logNotes').value = '';

          alert('✅ Call successfully logged! Your daily progress: ' + count + '/10 calls.');
          window.location.reload();
        } else {
          alert('Error: ' + (data.message || 'Failed to log call'));
        }
      } catch (err) {
        btn.disabled = false;
        btn.innerText = '+ Log Call to Daily Quota';
        alert('Network error: ' + err.message);
      }
    }
  </script>
</body>
</html>`);
});
