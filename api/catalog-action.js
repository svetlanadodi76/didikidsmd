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

async function getSheets() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!verifyToken(req)) return res.status(401).json({ error: 'Neautorizat' });

  const { action, product, rowIndex } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Action required' });

  const sid = process.env.GOOGLE_SHEET_ID;

  try {
    const sheets = await getSheets();

    if (action === 'add') {
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId: sid,
        range: 'catalog!A:A',
      });
      const nextRow = (resp.data.values || []).length + 1;

      await sheets.spreadsheets.values.update({
        spreadsheetId: sid,
        range: `catalog!A${nextRow}:J${nextRow}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[
          product.cod,
          '',
          product.descriere || '',
          product.nume,
          product.pret,
          product.marimi,
          product.categorie,
          product.imagine,
          product.status || 'Activ',
          product.gen || '',
        ]] },
      });

    } else if (action === 'edit') {
      if (!rowIndex) return res.status(400).json({ error: 'rowIndex required' });
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sid,
        resource: {
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: `catalog!A${rowIndex}`, values: [[product.cod]] },
            { range: `catalog!D${rowIndex}`, values: [[product.nume]] },
            { range: `catalog!E${rowIndex}`, values: [[product.pret]] },
            { range: `catalog!F${rowIndex}`, values: [[product.marimi]] },
            { range: `catalog!G${rowIndex}`, values: [[product.categorie]] },
            { range: `catalog!H${rowIndex}`, values: [[product.imagine]] },
            { range: `catalog!I${rowIndex}`, values: [[product.status]] },
            { range: `catalog!J${rowIndex}`, values: [[product.gen || '']] },
          ],
        },
      });

    } else if (action === 'delete') {
      if (!rowIndex) return res.status(400).json({ error: 'rowIndex required' });
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sid });
      const catalogSheet = spreadsheet.data.sheets.find(s => s.properties.title === 'catalog');
      if (!catalogSheet) return res.status(404).json({ error: 'Sheet catalog negăsit' });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sid,
        resource: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId:    catalogSheet.properties.sheetId,
                dimension:  'ROWS',
                startIndex: rowIndex - 1,
                endIndex:   rowIndex,
              },
            },
          }],
        },
      });

    } else {
      return res.status(400).json({ error: 'Acțiune necunoscută' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
