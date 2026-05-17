const { google } = require('googleapis');
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
  if (req.method !== 'GET') return res.status(405).end();

  const isAdmin = verifyToken(req);

  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'catalog!A:I',
    });

    const rows = resp.data.values || [];
    const products = rows
      .slice(1) // skip header row
      .map((row, i) => {
        const col = (n) => String(row[n] || '').trim();
        return {
          rowIndex:  i + 2,
          cod:       col(0),
          fileId:    col(1),
          descriere: col(2),
          nume:      col(3),
          pret:      col(4),
          marimi:    col(5),
          categorie: col(6),
          imagine:   col(7),
          status:    col(8) || 'Activ',
        };
      })
      .filter(p => p.cod && (isAdmin || p.status === 'Activ'));

    return res.status(200).json({ products });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
