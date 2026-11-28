import axios from 'axios';
import { config } from '../config.js';

const hubspotClient = axios.create({
  baseURL: 'https://api.hubapi.com',
  headers: {
    'Content-Type': 'application/json',
  },
});

hubspotClient.interceptors.request.use((req) => {
  if (config.hubspot.accessToken) {
    req.headers['Authorization'] = `Bearer ${config.hubspot.accessToken}`;
  }
  return req;
});

export async function searchContactByEmail(email) {
  if (!email || !config.hubspot.accessToken) return null;
  try {
    const res = await hubspotClient.post('/crm/v3/objects/contacts/search', {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'email',
              operator: 'EQ',
              value: email,
            },
          ],
        },
      ],
    });
    if (res.data.total > 0 && res.data.results?.length > 0) {
      return res.data.results[0];
    }
    return null;
  } catch (err) {
    console.error('[HubSpot] Search contact by email error:', err.response?.data || err.message);
    return null;
  }
}

export async function searchContactByPhone(phone) {
  if (!phone || !config.hubspot.accessToken) return null;
  try {
    const res = await hubspotClient.post('/crm/v3/objects/contacts/search', {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'phone',
              operator: 'EQ',
              value: phone,
            },
          ],
        },
      ],
    });
    if (res.data.total > 0 && res.data.results?.length > 0) {
      return res.data.results[0];
    }
    return null;
  } catch (err) {
    console.error('[HubSpot] Search contact by phone error:', err.response?.data || err.message);
    return null;
  }
}

export async function createOrUpdateContactFromBooking({ customerName, customerEmail, customerPhone, companyName, bottleneckNotes }) {
  if (!config.hubspot.accessToken) {
    console.warn('[HubSpot] Skipped: HUBSPOT_ACCESS_TOKEN not set.');
    return null;
  }

  const nameParts = (customerName || '').trim().split(' ');
  const firstname = nameParts[0] || 'Client';
  const lastname = nameParts.slice(1).join(' ') || '';

  const properties = {
    firstname,
    lastname,
    phone: customerPhone || '',
    company: companyName || '',
    message: bottleneckNotes ? `Bottleneck: ${bottleneckNotes}` : undefined,
    hs_lead_status: 'OPEN',
    lifecyclestage: 'opportunity',
  };

  const existing = await searchContactByEmail(customerEmail);

  if (existing) {
    try {
      const res = await hubspotClient.patch(`/crm/v3/objects/contacts/${existing.id}`, { properties });
      console.log(`[HubSpot] Contact updated (ID: ${existing.id})`);
      return res.data;
    } catch (err) {
      console.error('[HubSpot] Error updating contact:', err.response?.data || err.message);
      return null;
    }
  } else {
    try {
      const res = await hubspotClient.post('/crm/v3/objects/contacts', {
        properties: {
          email: customerEmail,
          ...properties,
        },
      });
      console.log(`[HubSpot] New contact created (ID: ${res.data.id})`);
      return res.data;
    } catch (err) {
      console.error('[HubSpot] Error creating contact:', err.response?.data || err.message);
      return null;
    }
  }
}

/**
 * Creates an associated Deal in HubSpot CRM for booked discovery calls
 */
export async function createDealForBooking({ contactId, customerName, companyName, bookingTime, amount = 1000 }) {
  if (!config.hubspot.accessToken) {
    console.warn('[HubSpot] Skipped Deal: HUBSPOT_ACCESS_TOKEN not set.');
    return null;
  }

  const dealName = `${companyName || customerName} — SureGreet Inbound Retainer`;
  const properties = {
    dealname: dealName,
    dealstage: 'appointmentscheduled',
    pipeline: 'default',
    amount: String(amount),
    description: `Discovery Call scheduled for ${bookingTime || 'Upcoming'}. Automated calendar-first booking.`,
  };

  try {
    const res = await hubspotClient.post('/crm/v3/objects/deals', { properties });
    const dealId = res.data.id;
    console.log(`[HubSpot] Deal created (ID: ${dealId}) for ${dealName}`);

    // Associate Deal with Contact
    if (contactId && dealId) {
      try {
        await hubspotClient.put(`/crm/v4/objects/deals/${dealId}/associations/contacts/${contactId}`, [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 3, // Deal to Contact association in HubSpot
          },
        ]);
        console.log(`[HubSpot] Deal ${dealId} successfully associated with Contact ${contactId}`);
      } catch (assocErr) {
        console.warn(`[HubSpot] Association warning:`, assocErr.response?.data || assocErr.message);
      }
    }

    return res.data;
  } catch (err) {
    console.error('[HubSpot] Error creating deal:', err.response?.data || err.message);
    return null;
  }
}

export async function createContactFromCall(callerPhone) {
  if (!config.hubspot.accessToken) return null;
  try {
    const res = await hubspotClient.post('/crm/v3/objects/contacts', {
      properties: {
        phone: callerPhone,
        firstname: 'Lead from Call',
        lastname: callerPhone,
        lifecyclestage: 'lead',
        hs_lead_status: 'IN_PROGRESS',
      },
    });
    console.log(`[HubSpot] New contact created from phone call (ID: ${res.data.id})`);
    return res.data;
  } catch (err) {
    console.error('[HubSpot] Error creating call contact:', err.response?.data || err.message);
    return null;
  }
}

export async function createNoteAndAssociate({ contactId, noteHtml }) {
  if (!config.hubspot.accessToken || !contactId) return null;
  try {
    const noteRes = await hubspotClient.post('/crm/v3/objects/notes', {
      properties: {
        hs_timestamp: new Date().toISOString(),
        hs_note_body: noteHtml,
      },
    });

    const noteId = noteRes.data.id;

    await hubspotClient.put(`/crm/v4/objects/notes/${noteId}/associations/contacts/${contactId}`, [
      {
        associationCategory: 'HUBSPOT_DEFINED',
        associationTypeId: 202,
      },
    ]);

    console.log(`[HubSpot] Call note ${noteId} associated with contact ${contactId}`);
    return noteRes.data;
  } catch (err) {
    console.error('[HubSpot] Error creating/associating note:', err.response?.data || err.message);
    return null;
  }
}

/**
 * Builds HubSpot-schema-valid contact properties for inbound callback leads.
 */
export function buildCallbackContactProperties({ fullName, companyName, email, phoneE164, industry, bottleneckNotes } = {}) {
  const nameParts = String(fullName || '').trim().split(/\s+/);
  const firstname = nameParts[0] || 'Lead';
  const lastname = nameParts.slice(1).join(' ') || '';

  const properties = {
    firstname,
    lastname,
    phone: phoneE164,
    lifecyclestage: 'lead',
    hs_lead_status: 'NEW',
    industry: industry || '',
    message: `Source: SureGreet Website Strategy Call Modal | Bottleneck: ${bottleneckNotes || 'N/A'}`,
  };
  if (companyName) {
    properties.company = String(companyName).trim();
  }
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    properties.email = cleanEmail;
  }
  return properties;
}

export async function createLeadFromCallback({ fullName, companyName, email, phoneE164, industry, bottleneckNotes }) {
  if (!config.hubspot.accessToken) {
    return { ok: false, skipped: true, error: 'HUBSPOT_ACCESS_TOKEN not configured' };
  }

  const properties = buildCallbackContactProperties({
    fullName,
    companyName,
    email,
    phoneE164,
    industry,
    bottleneckNotes,
  });

  try {
    const existing =
      (properties.email ? await searchContactByEmail(properties.email) : null) ||
      (phoneE164 ? await searchContactByPhone(phoneE164) : null);

    if (existing?.id) {
      const updateProps = { ...properties };
      delete updateProps.email;
      const res = await hubspotClient.patch(`/crm/v3/objects/contacts/${existing.id}`, {
        properties: updateProps,
      });
      console.log(`[HubSpot] Callback lead updated existing contact (ID: ${res.data.id})`);
      return { ok: true, id: res.data.id, updated: true, data: res.data, error: null };
    }

    const res = await hubspotClient.post('/crm/v3/objects/contacts', { properties });
    console.log(`[HubSpot] Callback lead created (ID: ${res.data.id})`);
    return { ok: true, id: res.data.id, updated: false, data: res.data, error: null };
  } catch (err) {
    const errMsg =
      (err.response?.data && (err.response.data.message || JSON.stringify(err.response.data))) ||
      err.message ||
      'HubSpot callback lead error';
    console.error('[HubSpot] Error creating callback lead:', errMsg);
    return { ok: false, skipped: false, id: null, error: errMsg };
  }
}
