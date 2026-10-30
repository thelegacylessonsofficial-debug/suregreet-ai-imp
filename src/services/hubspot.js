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

export async function createOrUpdateContactFromBooking({ customerName, customerEmail, customerPhone }) {
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

export async function createLeadFromCallback({ fullName, email, phoneE164, industry, bottleneckNotes }) {
  if (!config.hubspot.accessToken) return null;
  const nameParts = (fullName || '').trim().split(' ');
  const firstname = nameParts[0] || 'Lead';
  const lastname = nameParts.slice(1).join(' ') || '';

  try {
    const res = await hubspotClient.post('/crm/v3/objects/contacts', {
      properties: {
        email: email || '',
        firstname,
        lastname,
        phone: phoneE164,
        lifecyclestage: 'lead',
        industry: industry || '',
        message: `Bottleneck: ${bottleneckNotes || 'N/A'}`,
        lead_source: 'SureGreet Website Strategy Call Modal',
      },
    });
    console.log(`[HubSpot] Callback lead created (ID: ${res.data.id})`);
    return res.data;
  } catch (err) {
    console.error('[HubSpot] Error creating callback lead:', err.response?.data || err.message);
    return null;
  }
}
