import { Router } from 'express';
import {
  getProspects,
  getProspectById,
  addProspect,
  sendOutreachStep,
  activateProspect,
  markProspectReplied,
  unsubscribeProspect,
  getDueProspects,
  renderStepContent,
} from '../services/outreachService.js';
import { runOutreachQueueWorker, isWithinSendingWindow } from '../cron/outreachCron.js';

export const outreachRouter = Router();

// 1. List all prospects from Supabase
outreachRouter.get('/prospects', async (req, res) => {
  try {
    const status = req.query.status;
    const limit = req.query.limit || 100;
    const list = await getProspects({ status, limit });

    res.json({
      status: 'success',
      count: list.length,
      active: list.filter((p) => p.status === 'active').length,
      pending: list.filter((p) => p.status === 'pending').length,
      replied: list.filter((p) => p.status === 'replied').length,
      unsubscribed: list.filter((p) => p.status === 'unsubscribed').length,
      completed: list.filter((p) => p.status === 'completed').length,
      prospects: list,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2. Add a new prospect to Supabase
outreachRouter.post('/add', async (req, res) => {
  const body = req.body || {};
  if (!body.email) {
    return res.status(400).json({ status: 'error', message: 'Field "email" is required' });
  }

  const result = await addProspect({
    doctorName: body.doctorName,
    clinicName: body.clinicName,
    email: body.email,
    city: body.city,
    treatment: body.treatment,
    notes: body.notes,
  });

  res.json({ status: result.success ? 'success' : 'ignored', ...result });
});

// 3. Activate prospect (dispatches Step 1 immediately and schedules Step 2)
outreachRouter.post('/activate', async (req, res) => {
  const { prospectId, email } = req.body || {};
  const target = prospectId || email;

  if (!target) {
    return res.status(400).json({ status: 'error', message: 'prospectId or email is required' });
  }

  const result = await activateProspect(target);
  if (result.success) {
    res.json({ status: 'success', result });
  } else {
    res.status(400).json({ status: 'error', error: result.error });
  }
});

// 4. Manually dispatch a specific outreach email step (1, 2, 3, or 4)
outreachRouter.post('/send', async (req, res) => {
  const { prospectId, stepNumber } = req.body || {};

  if (!prospectId || !stepNumber) {
    return res.status(400).json({ status: 'error', message: 'prospectId and stepNumber (1-4) are required' });
  }

  const result = await sendOutreachStep({
    prospectId,
    stepNumber: Number(stepNumber),
  });

  if (result.success) {
    res.json({ status: 'success', result });
  } else {
    res.status(400).json({ status: 'error', error: result.error });
  }
});

// 5. Mark prospect as replied (stops sequence immediately + Telegram alert)
outreachRouter.post('/mark-replied', async (req, res) => {
  const { prospectId, email } = req.body || {};
  const target = prospectId || email;

  if (!target) {
    return res.status(400).json({ status: 'error', message: 'prospectId or email is required' });
  }

  const result = await markProspectReplied(target);
  if (result.success) {
    res.json({ status: 'success', message: 'Prospect marked as replied. Sequence stopped.', result });
  } else {
    res.status(400).json({ status: 'error', error: result.error });
  }
});

// 6. View due prospects
outreachRouter.get('/due', async (req, res) => {
  try {
    const list = await getDueProspects(20);
    res.json({
      status: 'success',
      inSendingWindow: isWithinSendingWindow(),
      count: list.length,
      prospects: list,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 7. Trigger the automated queue worker manually
outreachRouter.all('/run-queue', async (req, res) => {
  try {
    const force = req.query.force === 'true' || req.body?.force === true;
    const result = await runOutreachQueueWorker({ force });
    res.json({ status: 'success', result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 8. Preview email step in browser before sending
outreachRouter.get('/preview', (req, res) => {
  const step = Number(req.query.step || 1);
  const sample = {
    doctor_name: req.query.doctorName || 'Dr. Robert Miller',
    clinic_name: req.query.clinicName || 'Aura MedSpa & Aesthetics',
    city: req.query.city || 'Dallas, TX',
    treatment: req.query.treatment || 'Morpheus8 & Injectables',
    email: req.query.email || 'lead@example.com',
    original_subject: req.query.originalSubject || 'quick question - Aura MedSpa & Aesthetics inquiries',
  };

  try {
    const rendered = renderStepContent(step, sample);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <div style="background:#0f172a;color:#f8fafc;padding:14px 24px;font-family:sans-serif;font-size:13px;border-bottom:2px solid #38bdf8;">
        <strong>Subject:</strong> ${rendered.subject} &nbsp;|&nbsp; <strong>Step:</strong> ${step}/4 &nbsp;|&nbsp; <strong>Minimalist Mode</strong>
      </div>
      <div style="padding: 24px; background: #ffffff;">
        ${rendered.html}
      </div>
      <div style="background:#f1f5f9;border-top:1px solid #cbd5e1;padding:16px 24px;font-family:monospace;font-size:12px;color:#334155;">
        <strong>Plain Text Representation (Primary):</strong>
        <pre style="white-space: pre-wrap; margin-top: 8px;">${rendered.text}</pre>
      </div>
    `);
  } catch (err) {
    res.status(400).send(`Error: ${err.message}`);
  }
});

// 9. CAN-SPAM 1-Click Unsubscribe link
outreachRouter.get('/unsubscribe', async (req, res) => {
  const email = req.query.email;
  if (email) {
    await unsubscribeProspect(email);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Unsubscribed — SureGreet AI</title></head>
    <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:80vh;background:#f8fafc;color:#1e293b;margin:0;">
      <div style="text-align:center;background:#ffffff;padding:40px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.06);max-width:480px;">
        <h2 style="color:#0f172a;margin-top:0;">You have been unsubscribed</h2>
        <p style="color:#64748b;line-height:1.6;">${email ? `<strong>${email}</strong> has been removed from all SureGreet AI outreach sequences.` : 'Your email has been safely removed.'}</p>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px;">SureGreet AI • 24/7 AI Voice & Lead Capture</p>
      </div>
    </body>
    </html>
  `);
});
