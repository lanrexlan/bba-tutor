// api/send-application.js

export default async function handler(req, res) {
  // CORS (optional)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  const origin = req.headers.origin || '*';
  const allowed = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : [];
  if (allowed.length > 0) {
    if (allowed.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
  const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
  const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;   // REQUIRED in body as user_id
  const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY; // REQUIRED in Authorization header
  const ORIGIN_HEADER = process.env.EMAILJS_ORIGIN || 'https://tutors.baobabonlineacademy.com';

  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY || !PRIVATE_KEY) {
    return res.status(500).json({
      error: 'Missing EmailJS env vars. Required: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY'
    });
  }

  try {
    const templateParams =
      typeof req.body === 'object' && req.body !== null
        ? req.body
        : JSON.parse(req.body || '{}');

    if (!templateParams.fullName || !templateParams.email) {
      return res.status(400).json({ error: 'Missing required fields (fullName, email)' });
    }

    const emailResp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PRIVATE_KEY}`,
        'origin': ORIGIN_HEADER
      },
      body: JSON.stringify({
        service_id: SERVICE_ID,
        template_id: TEMPLATE_ID,
        user_id: PUBLIC_KEY,              // IMPORTANT: Public Key in body
        template_params: templateParams
      })
    });

    const raw = await emailResp.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = raw; }

    if (!emailResp.ok) {
      console.error('EmailJS error:', emailResp.status, parsed);
      return res.status(emailResp.status).json({
        error: 'EmailJS send failed',
        status: emailResp.status,
        details: parsed
      });
    }

    return res.status(200).json({ ok: true, result: parsed || 'OK' });
  } catch (err) {
    console.error('Email send error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}