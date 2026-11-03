import { Router } from 'express';
import {
  getProspects,
  addProspect,
  sendOutreachStep,
  renderStepHtml,
  unsubscribeProspect,
} from '../services/outreachService.js';

export const outreachRouter = Router();

// 1. List all prospects
outreachRouter.get('/prospects', (req, res) => {
  const list = getProspects();
  res.json({
    status: 'success',
    count: list.length,
    active: list.filter((p) => p.status === 'active').length,
    unsubscribed: list.filter((p) => p.status === 'unsubscribed').length,
    prospects: list,
  });
});

// 2. Add a new prospect
outreachRouter.post('/add', (req, res) => {
  const body = req.body || {};
  if (!body.email) {
    return res.status(400).json({ status: 'error', message: 'Field "email" is required' });
  }

  const result = addProspect({
    doctorName: body.doctorName,
    clinicName: body.clinicName,
    email: body.email,
    city: body.city,
    treatment: body.treatment,
    adUrl: body.adUrl,
    phone: body.phone,
  });

  res.json({ status: result.success ? 'success' : 'ignored', ...result });
});

// 3. Dispatch an outreach email step (1, 2, 3, or 4)
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

// 4. Preview email step in browser before sending
outreachRouter.get('/preview', (req, res) => {
  const step = Number(req.query.step || 1);
  const sample = {
    doctorName: req.query.doctorName || 'Dr. Robert Miller',
    clinicName: req.query.clinicName || 'Aura MedSpa & Aesthetics',
    city: req.query.city || 'Dallas, TX',
    treatment: req.query.treatment || 'Morpheus8 & Injectables',
    email: req.query.email || 'lead@example.com',
  };

  try {
    const { subject, html } = renderStepHtml(step, sample);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <div style="background:#0f172a;color:#f8fafc;padding:12px 20px;font-family:sans-serif;font-size:13px;border-bottom:2px solid #38bdf8;">
        <strong>Subject:</strong> ${subject} &nbsp;|&nbsp; <strong>Step:</strong> ${step}/4 &nbsp;|&nbsp; <strong>Preview Mode</strong>
      </div>
      ${html}
    `);
  } catch (err) {
    res.status(400).send(`Error: ${err.message}`);
  }
});

// 5. CAN-SPAM 1-Click Unsubscribe link
outreachRouter.get('/unsubscribe', (req, res) => {
  const email = req.query.email;
  if (email) {
    unsubscribeProspect(email);
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
        <p style="color:#94a3b8;font-size:12px;margin-top:24px;">SureGreet AI • Zero Missed Inquiries</p>
      </div>
    </body>
    </html>
  `);
});
