const { google } = require('googleapis');
const crypto   = require('crypto');

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
  if (!verifyToken(req)) return res.status(401).json({ error: 'Neautorizat' });

  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Comenzi!A:L',
    });

    const rows = resp.data.values || [];
    const orders = rows
      .map((row, i) => ({
        rowIndex:  i + 1,
        id:        row[0] || '',
        data:      row[1] || '',
        nume:      row[2] || '',
        telefon:   row[3] || '',
        email:     row[4] || '',
        produse:   row[5] || '',
        livrare:   row[6] || '',
        localitate:row[7] || '',
        adresa:    row[8] || '',
        status:    row[9] || '',
        sursa:     row[10] || '',
        suma:      row[11] || '',
      }))
      .filter(o => o.nume && o.telefon);

    return res.status(200).json({ orders });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
