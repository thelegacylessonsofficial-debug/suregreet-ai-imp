import { Router } from 'express';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { supabaseFetch } from '../services/outreachService.js';
import { sendTelegramHtml } from '../services/telegram.js';
import { renderSaasShell, getSvgIcon } from '../views/saasLayout.js';

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
  const authKey = req.query.key || '';
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

  const bodyContent = `
    <!-- Top Metrics Row -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      
      <!-- Metric 1: Today's Outbound Dial Goal -->
      <div class="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--accent-emerald)]/40 relative overflow-hidden shadow-lg">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-mono uppercase text-[var(--text-muted)] tracking-wider">Today's Sales Dials</span>
          <span class="w-2 h-2 rounded-full bg-[var(--accent-emerald)] pulse-dot"></span>
        </div>
        <div class="text-3xl font-extrabold text-[var(--text-primary)] mt-1.5 font-mono">
          <span id="metricTodayDials">${todayDialsCount}</span> <span class="text-sm font-normal text-[var(--text-muted)]">/ 10</span>
        </div>
        <!-- Progress Bar -->
        <div class="w-full bg-[var(--bg-surface)] h-2 rounded-full mt-3 overflow-hidden">
          <div id="metricProgressBar" class="bg-[var(--accent-emerald)] h-full rounded-full transition-all duration-500" style="width: ${Math.min((todayDialsCount / 10) * 100, 100)}%;"></div>
        </div>
        <div class="text-[10px] text-[var(--text-muted)] mt-2 font-mono flex justify-between">
          <span>Top RGA Quota</span>
          <span id="metricProgressPercent">${Math.round((todayDialsCount / 10) * 100)}% Complete</span>
        </div>
      </div>

      <!-- Metric 2: Inbound AI Calls -->
      <div class="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-md">
        <div class="text-[11px] font-mono uppercase text-[var(--text-muted)] tracking-wider">Inbound AI Calls</div>
        <div class="text-3xl font-extrabold text-[var(--text-primary)] mt-1.5 font-mono">${inboundAICalls.length}</div>
        <div class="text-[11px] text-[var(--accent-emerald)] mt-2 font-mono flex items-center gap-1">
          <span>${totalBookedAI} Appointments Captured</span>
        </div>
      </div>

      <!-- Metric 3: Scheduled Discovery Sessions -->
      <div class="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-md">
        <div class="text-[11px] font-mono uppercase text-[var(--text-muted)] tracking-wider">Booked Consultations</div>
        <div class="text-3xl font-extrabold text-[var(--text-primary)] mt-1.5 font-mono">${totalBookedConsults}</div>
        <div class="text-[11px] text-[var(--text-muted)] mt-2 font-mono">
          <span>Google Meet Cal.com Ingest</span>
        </div>
      </div>

      <!-- Metric 4: Agency Timezone -->
      <div class="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-md">
        <div class="text-[11px] font-mono uppercase text-[var(--text-muted)] tracking-wider">US Operations Time</div>
        <div class="text-xl font-bold text-[var(--text-primary)] mt-1.5 font-mono">${nowEST.toFormat('hh:mm a')} <span class="text-xs text-[var(--accent-emerald)] font-normal">EST</span></div>
        <div class="text-[11px] text-[var(--text-muted)] mt-2 font-mono">${nowEST.toFormat('cccc, LLL dd')}</div>
      </div>

    </div>

    <!-- Quick Outbound Call Logger (Top 3 RGAs) -->
    <div class="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[var(--border-subtle)] gap-2">
        <div>
          <div class="text-xs font-mono text-[var(--accent-emerald)] uppercase tracking-wider font-semibold">1-Click Fast Call Logger</div>
          <h3 class="text-base font-bold text-[var(--text-primary)]">Log Front-Desk Dial to Practice Manager</h3>
        </div>
        <span class="text-xs font-mono text-[var(--text-muted)] bg-[var(--bg-surface)] px-3 py-1 rounded-lg border border-[var(--border-subtle)] w-fit font-bold">
          Non-Negotiable: 10 Dials / Day
        </span>
      </div>

      <form id="outboundLogForm" onsubmit="handleOutboundSubmit(event)" class="space-y-4">
        <div class="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          <input
            id="logContactName"
            required
            placeholder="Doctor / Practice Mgr Name"
            class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-emerald)]"
          />
          <input
            id="logClinicName"
            required
            placeholder="Clinic / Business Name"
            class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-emerald)]"
          />
          <input
            id="logPhone"
            required
            type="tel"
            placeholder="Phone Number Dialed"
            class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-emerald)] font-mono"
          />
          <select
            id="logOutcome"
            class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-emerald)]"
          >
            <option value="Decision Maker Connected">Connected with Decision Maker</option>
            <option value="Demo / Meeting Booked">Demo / Meeting Booked (HOT)</option>
            <option value="Left Voicemail">Left Voicemail</option>
            <option value="Gatekeeper Blocked">Gatekeeper Blocked</option>
            <option value="No Answer / Line Busy">No Answer / Line Busy</option>
          </select>
        </div>

        <div class="flex flex-col sm:flex-row gap-3">
          <input
            id="logNotes"
            placeholder="Brief conversation notes (e.g., Receptionist said Dr. Riveros reviews tech on Thursday, call back at 2 PM)"
            class="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-emerald)]"
          />
          <button
            type="submit"
            id="btnLogDial"
            class="px-6 py-2.5 rounded-xl bg-[var(--accent-emerald)] hover:opacity-90 text-black font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-lg shadow-emerald-500/10"
          >
            <span>+ Log Call to Daily Quota</span>
          </button>
        </div>
      </form>
    </div>

    <!-- Calls Tables & Scheduled Sessions -->
    <div class="space-y-6">
      
      <!-- Section A: Scheduled Discovery Strategy Sessions -->
      <div class="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
        <div class="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div class="flex items-center gap-2">
            <span class="text-cyan-400">${getSvgIcon('pipeline', 'w-4 h-4')}</span>
            <h3 class="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono">Confirmed Strategy Appointments (${bookings.length})</h3>
          </div>
          <span class="text-[11px] font-mono text-[var(--text-muted)]">Google Meet Integrated</span>
        </div>

        ${
          bookings.length === 0
            ? `<div class="p-8 text-center text-[var(--text-muted)] text-xs font-mono">No appointments scheduled yet. Send audits to fill your calendar!</div>`
            : `<div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="text-[var(--text-muted)] font-mono border-b border-[var(--border-subtle)]">
                    <tr>
                      <th class="pb-2.5">Date & Slot (US EST)</th>
                      <th class="pb-2.5">Lead / Doctor</th>
                      <th class="pb-2.5">Contact Details</th>
                      <th class="pb-2.5">Stated Bottleneck</th>
                      <th class="pb-2.5">Meeting Link</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-[var(--border-subtle)]/60 font-mono">
                    ${bookings
                      .map(
                        (b) => `
                      <tr class="hover:bg-[var(--bg-hover)] transition">
                        <td class="py-3 text-[var(--accent-emerald)] font-bold">${b.start_time || 'Upcoming'}</td>
                        <td class="py-3 text-[var(--text-primary)] font-medium">${b.attendee_name || 'Client'}</td>
                        <td class="py-3 text-[var(--text-secondary)]">
                          <div>${b.attendee_email || ''}</div>
                          <div class="text-[11px] text-[var(--text-muted)]">${b.attendee_phone || ''}</div>
                        </td>
                        <td class="py-3 text-[var(--text-muted)] max-w-xs truncate">${b.notes || 'Inbound Booking'}</td>
                        <td class="py-3">
                          <a href="${b.metadata?.meetingUrl || '#'}" target="_blank" class="px-2.5 py-1 rounded bg-[var(--accent-emerald-subtle)] text-[var(--accent-emerald)] border border-[var(--accent-emerald)]/30 hover:bg-[var(--accent-emerald)] hover:text-black transition inline-flex items-center gap-1 font-bold">
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
      <div class="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4 shadow-xl">
        <div class="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div class="flex items-center gap-2">
            <span class="text-cyan-400">${getSvgIcon('calls', 'w-4 h-4')}</span>
            <h3 class="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono">Recent Call History (Inbound AI & Outbound Dials)</h3>
          </div>
          <span class="text-[11px] font-mono text-[var(--text-muted)]">${callLogs.length} Records</span>
        </div>

        ${
          callLogs.length === 0
            ? `<div class="p-8 text-center text-[var(--text-muted)] text-xs font-mono">No call history recorded yet. Inbound Retell calls and outbound dials will appear here live.</div>`
            : `<div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="text-[var(--text-muted)] font-mono border-b border-[var(--border-subtle)]">
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
                  <tbody id="callTableBody" class="divide-y divide-[var(--border-subtle)]/60 font-mono">
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
                          : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)]';

                        const formattedDate = DateTime.fromISO(c.created_at)
                          .setZone(config.timezone)
                          .toFormat('LLL dd, hh:mm a');

                        return `
                        <tr class="hover:bg-[var(--bg-hover)] transition">
                          <td class="py-3">${typeBadge}</td>
                          <td class="py-3 text-[var(--text-secondary)]">${formattedDate}</td>
                          <td class="py-3 font-semibold text-[var(--text-primary)]">
                            <div>${c.contact_name || c.clinic_name || 'Prospect'}</div>
                            <div class="text-[10px] text-[var(--text-muted)]">${c.clinic_name || ''}</div>
                          </td>
                          <td class="py-3 text-[var(--text-secondary)]">
                            <a href="tel:${c.caller_phone}" class="hover:underline text-[var(--accent-emerald)]">${c.caller_phone || 'N/A'}</a>
                          </td>
                          <td class="py-3 text-[var(--text-muted)]">${c.duration || '—'}</td>
                          <td class="py-3">
                            <span class="px-2 py-0.5 rounded-full text-[10px] border ${outcomeBadgeColor}">
                              ${c.outcome || 'Inquiry'}
                            </span>
                          </td>
                          <td class="py-3 text-[var(--text-muted)] max-w-xs truncate" title="${c.summary || c.notes || ''}">
                            ${c.notes || c.summary || 'None'}
                          </td>
                          <td class="py-3">
                            ${
                              c.recording_url
                                ? `<a href="${c.recording_url}" target="_blank" class="px-2 py-0.5 rounded bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--accent-emerald)] border border-[var(--border-subtle)] transition inline-flex items-center gap-1 text-[11px]">
                                    <span>Play 🔊</span>
                                  </a>`
                                : '<span class="text-[var(--text-muted)]">—</span>'
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
  `;

  const extraScripts = `
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

        try {
          const res = await fetch(getAuthUrl('/calls/log-outbound'), {
            method: 'POST',
            credentials: 'include',
            headers: getAuthHeaders(),
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
            const count = data.todayCount || 1;
            document.getElementById('metricTodayDials').innerText = count;
            document.getElementById('metricProgressBar').style.width = Math.min((count / 10) * 100, 100) + '%';
            document.getElementById('metricProgressPercent').innerText = Math.round((count / 10) * 100) + '% Complete';

            document.getElementById('logContactName').value = '';
            document.getElementById('logClinicName').value = '';
            document.getElementById('logPhone').value = '';
            document.getElementById('logNotes').value = '';

            showToast('Dial Logged!', count + '/10 calls completed today.', 'success');
            setTimeout(() => window.location.reload(), 1200);
          } else {
            showToast('Log Failed', data.message || 'Failed to log call', 'error');
          }
        } catch (err) {
          btn.disabled = false;
          btn.innerText = '+ Log Call to Daily Quota';
          showToast('Network Error', err.message, 'error');
        }
      }
    </script>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(
    renderSaasShell({
      title: 'SureGreet AI — Personal Call Command Center',
      activeNav: 'calls',
      pageHeading: 'Daily Dials & Call Telemetry',
      badgeText: `10 RGA Goal • ${todayDialsCount}/10 Logged`,
      bodyContent,
      extraScripts,
      authKeyParam: authKey,
    })
  );
});
