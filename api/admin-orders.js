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

    /* Structura CRM:
       A(0)=Nr  B(1)=Data  C(2)=Client  D(3)=Telefon  E(4)=Adresa
       F(5)=Cod Produs  G(6)=Descriere  H(7)=Cantitate
       I(8)=Preț/buc  J(9)=Cost/buc  K(10)=Total Vânzare  L(11)=Total Cost
       M(12)=Metodă Livrare  N(13)=Cost Livrare  O(14)=AWB
       P(15)=Status  Q(16)=Profit
       R(17)=Email  S(18)=Sursă  T(19)=Nota client
       U(20)=Suma comenzii  V(21)=Nota manager
    */
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Comenzi!A:V',
    });

    const rows = resp.data.values || [];
    const orders = rows
      .map((row, i) => ({
        rowIndex:    i + 1,
        id:          row[0]  || '',
        data:        row[1]  || '',
        nume:        row[2]  || '',
        telefon:     row[3]  || '',
        adresa:      row[4]  || '',
        produse:     row[5]  || '',
        cantitate:   row[7]  || '',
        pret:        row[8]  || '',
        livrare:     row[12] || '',
        status:      row[15] || '',
        email:       row[17] || '',
        sursa:       row[18] || '',
        nota_client: row[19] || '',
        suma:        row[20] || '',
      }))
      .filter(o => o.nume && o.telefon && !['client', 'nr.', 'nr'].includes(o.nume.toLowerCase()));

    return res.status(200).json({ orders });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
