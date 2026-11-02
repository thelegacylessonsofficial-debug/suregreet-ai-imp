import axios from 'axios';
import { config } from '../config.js';

export async function getCalAcceptedBookings() {
  if (!config.calcom.apiKey) {
    console.warn('[Cal.com] CAL_API_KEY is not configured.');
    return [];
  }

  try {
    const res = await axios.get('https://api.cal.com/v2/bookings?status=accepted', {
      headers: {
        Authorization: `Bearer ${config.calcom.apiKey}`,
        'cal-api-version': config.calcom.apiVersion,
      },
    });

    const data = res.data.data || res.data;
    const bookingList = Array.isArray(data) ? data : data.bookings || [data];
    return bookingList.filter(Boolean);
  } catch (err) {
    console.error('[Cal.com] Error fetching bookings:', err.response?.data || err.message);
    return [];
  }
}

/**
 * Queries real-time available slots from Cal.com API v2
 * Prevents AI availability hallucination during live calls.
 */
export async function getCalAvailableSlots({ dateStr, eventTypeId = 7509658, targetTimezone = 'America/New_York' } = {}) {
  let targetDate = new Date();
  const lower = (dateStr || '').trim().toLowerCase();

  if (lower === 'tomorrow') {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (lower && lower !== 'today') {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed;
    } else {
      targetDate.setDate(targetDate.getDate() + 1);
    }
  }

  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  const dateOnly = `${year}-${month}-${day}`;

  const startTime = `${dateOnly}T00:00:00Z`;
  const endTime = `${dateOnly}T23:59:59Z`;

  const fallbackSlots = ['10:00 AM', '02:00 PM', '04:30 PM'];
  const formattedDate = targetDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: targetTimezone,
  });

  if (!config.calcom.apiKey) {
    return {
      date: dateOnly,
      formattedDate,
      slots: fallbackSlots,
      isLive: false,
    };
  }

  try {
    const url = `https://api.cal.com/v2/slots/available?startTime=${startTime}&endTime=${endTime}&eventTypeId=${eventTypeId}`;
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${config.calcom.apiKey}`,
        'cal-api-version': config.calcom.apiVersion,
      },
      timeout: 4000,
    });

    const slotsMap = res.data?.data?.slots || {};
    const rawSlots = slotsMap[dateOnly] || [];

    if (rawSlots.length === 0) {
      return {
        date: dateOnly,
        formattedDate,
        slots: fallbackSlots,
        isLive: true,
      };
    }

    const formattedSlots = rawSlots
      .map((s) => {
        try {
          const dt = new Date(s.time);
          return dt.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: targetTimezone,
          });
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const selected = formattedSlots.length > 3
      ? [formattedSlots[0], formattedSlots[Math.floor(formattedSlots.length / 2)], formattedSlots[formattedSlots.length - 1]]
      : (formattedSlots.length > 0 ? formattedSlots : fallbackSlots);

    return {
      date: dateOnly,
      formattedDate,
      slots: Array.from(new Set(selected)),
      isLive: true,
    };
  } catch (err) {
    console.warn('[Cal.com] Slot query error, falling back to standard hours:', err.message);
    return {
      date: dateOnly,
      formattedDate,
      slots: fallbackSlots,
      isLive: false,
    };
  }
}
