const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Date incomplete' });

  if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Email sau parolă incorecte' });
  }

  const secret = process.env.ADMIN_SECRET || 'fallback-secret';
  const token = crypto.createHmac('sha256', secret)
    .update(email + ':' + password)
    .digest('hex');

  return res.status(200).json({ token });
};
