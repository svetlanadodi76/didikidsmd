const { put } = require('@vercel/blob');
const crypto = require('crypto');

function verifyToken(req) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!auth) return false;
  const secret   = process.env.ADMIN_SECRET || 'fallback-secret';
  const expected = crypto.createHmac('sha256', secret)
    .update(process.env.ADMIN_EMAIL + ':' + process.env.ADMIN_PASSWORD)
    .digest('hex');
  return auth === expected;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!verifyToken(req)) return res.status(401).json({ error: 'Neautorizat' });

  const { cod, fileId } = req.body || {};
  if (!cod || !fileId) return res.status(400).json({ error: 'cod și fileId sunt obligatorii' });

  try {
    // Obținem calea fișierului din Telegram
    const tgRes  = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/getFile?file_id=${fileId}`);
    const tgData = await tgRes.json();
    if (!tgData.ok) return res.status(500).json({ error: 'Telegram: ' + tgData.description });

    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${tgData.result.file_path}`;

    // Descărcăm imaginea
    const imgRes = await fetch(fileUrl);
    if (!imgRes.ok) return res.status(500).json({ error: 'Nu am putut descărca imaginea din Telegram' });

    const buffer = await imgRes.arrayBuffer();

    // Încărcăm în Vercel Blob (suprascrie dacă există)
    const { url } = await put(`products/${cod}.jpg`, buffer, {
      access:          'public',
      contentType:     'image/jpeg',
      addRandomSuffix: false,
    });

    return res.status(200).json({ url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
