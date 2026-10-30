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
