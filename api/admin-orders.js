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
      range: 'Comenzi!A:V',
    });

    const rows = resp.data.values || [];
    const orders = rows
      .map((row, i) => {
        const col = (n) => String(row[n] || '').trim();

        /* Detectăm formatul comenzii:
           - Format NOU (website fix): E = adresă completă (nu conține @)
           - Format VECHI (website pre-fix): E = email (conține @)
           - Format BOT: E = adresă (nu conține @), P = status real
        */
        const eIsEmail = col(4).includes('@');
        const isOldWebsite = eIsEmail;

        return {
          rowIndex:    i + 1,
          id:          col(0),
          data:        col(1),
          nume:        col(2),
          telefon:     col(3),
          adresa:      isOldWebsite
                         ? `${col(7)}, ${col(8)}`.replace(/^,\s*|,\s*$/, '')
                         : col(4),
          produse:     col(5),
          livrare:     isOldWebsite ? col(6) : col(12),
          status:      isOldWebsite ? col(9) : col(15),
          email:       isOldWebsite ? col(4) : col(17),
          sursa:       isOldWebsite ? col(10) : col(18),
          nota_client: col(19),
          suma:        col(20),
          pret:        col(8),
          // păstrăm indexul coloanei de status pentru update corect
          statusCol:   isOldWebsite ? 'J' : 'P',
        };
      })
      .filter(o => o.nume && o.telefon && !['client', 'nr.', 'nr'].includes(o.nume.toLowerCase()));

    return res.status(200).json({ orders });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
