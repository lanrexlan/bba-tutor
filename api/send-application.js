// api/send-application.js

export default async function handler(req, res) {
  // Basic CORS (optional but helpful for local dev)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Allow from any origin or restrict by environment variable
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

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate env vars
  const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
  const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
  const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY; // EmailJS public key (same as emailjs.init)
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    return res.status(500).json({ error: 'EmailJS environment variables are not set' });
  }

  try {
    // Parse body (Next.js API routes already parse JSON; plain Vercel Node does not)
    const templateParams = typeof req.body === 'object' && req.body !== null
      ? req.body
      : JSON.parse(req.body || '{}');

    // Basic sanity check (optional)
    if (!templateParams.fullName || !templateParams.email) {
      return res.status(400).json({ error: 'Missing required fields (fullName, email)' });
    }

    // Send via EmailJS REST API (server-to-server; no origin restrictions)
    const emailResp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: SERVICE_ID,
        template_id: TEMPLATE_ID,
        user_id: PUBLIC_KEY, // public key is OK on server
        template_params: templateParams
      })
    });

    const data = await emailResp.json().catch(() => ({}));

    if (!emailResp.ok) {
      const msg = data?.error || data?.message || 'EmailJS send failed';
      return res.status(emailResp.status).json({ error: msg, details: data });
    }

    return res.status(200).json({ ok: true, result: data });
  } catch (err) {
    console.error('Email send error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}