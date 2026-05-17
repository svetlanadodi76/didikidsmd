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

async function getSheets() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

function confirmHtml(order, nota, suma) {
  return `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#3a1f2d;background:#faf6f0;">
      <div style="background:#5c2d4a;padding:2rem;text-align:center;">
        <h1 style="color:#faf6f0;font-size:1.8rem;margin:0;font-weight:400;">DiDiKidsMD</h1>
        <p style="color:#c9a96e;margin:0.5rem 0 0;font-size:0.85rem;letter-spacing:0.1em;">HAINE CARE ÎMBRĂȚIȘEAZĂ COPILĂRIA</p>
      </div>
      <div style="padding:2rem;">
        <p style="font-size:1.1rem;">✅ Comanda confirmată!</p>
        <p style="color:#7a5566;">Bună, <strong>${order.nume}</strong>! Comanda ta a fost confirmată și va fi pregătită în cel mai scurt timp.</p>
        <div style="background:#f0e8d8;padding:1.2rem;margin:1.5rem 0;border-left:3px solid #c9a96e;">
          <p style="font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;color:#c9a96e;margin:0 0 0.8rem;">Produse comandate</p>
          <p style="margin:0;">${order.produse}</p>
        </div>
        <table style="width:100%;font-size:0.95rem;border-collapse:collapse;margin-bottom:1.5rem;">
          <tr style="border-bottom:1px solid #e5d8c4;">
            <td style="padding:0.6rem 0;color:#7a5566;width:40%;">📦 Livrare</td>
            <td style="padding:0.6rem 0;font-weight:600;">${order.livrare}</td>
          </tr>
          <tr style="border-bottom:1px solid #e5d8c4;">
            <td style="padding:0.6rem 0;color:#7a5566;">📍 Adresă</td>
            <td style="padding:0.6rem 0;font-weight:600;">${order.localitate}, ${order.adresa}</td>
          </tr>
          ${suma ? `<tr style="border-bottom:1px solid #e5d8c4;">
            <td style="padding:0.6rem 0;color:#7a5566;">💰 Suma de plată</td>
            <td style="padding:0.6rem 0;font-weight:600;color:#5c2d4a;">${suma} MDL</td>
          </tr>` : ''}
          <tr>
            <td style="padding:0.6rem 0;color:#7a5566;">📞 Telefon</td>
            <td style="padding:0.6rem 0;font-weight:600;">${order.telefon}</td>
          </tr>
        </table>
        ${nota ? `<div style="background:#f0e8d8;padding:1rem;margin-bottom:1.5rem;border-radius:4px;border-left:3px solid #c9a96e;"><p style="margin:0;color:#5c2d4a;">📝 ${nota}</p></div>` : ''}
        <p style="font-style:italic;color:#7a5566;">Vei fi contactat/ă pentru detalii de plată și livrare. Mulțumim că ai ales DiDiKidsMD! 🐻</p>
      </div>
      <div style="background:#f0e8d8;padding:1rem;text-align:center;font-size:0.82rem;color:#7a5566;">
        DiDiKidsMD · <a href="https://instagram.com/didikidsmd" style="color:#5c2d4a;">@didikidsmd</a>
      </div>
    </div>`;
}

function cancelHtml(order) {
  return `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#3a1f2d;background:#faf6f0;">
      <div style="background:#5c2d4a;padding:2rem;text-align:center;">
        <h1 style="color:#faf6f0;font-size:1.8rem;margin:0;font-weight:400;">DiDiKidsMD</h1>
        <p style="color:#c9a96e;margin:0.5rem 0 0;font-size:0.85rem;letter-spacing:0.1em;">HAINE CARE ÎMBRĂȚIȘEAZĂ COPILĂRIA</p>
      </div>
      <div style="padding:2rem;">
        <p style="font-size:1.1rem;">❌ Comanda anulată</p>
        <p style="color:#7a5566;">Bună, <strong>${order.nume}</strong>! Din păcate, comanda ta nu a putut fi procesată în acest moment.</p>
        <p style="color:#7a5566;">Te rugăm să ne contactezi pe <a href="https://t.me/didikidsmd_bot" style="color:#5c2d4a;">Telegram</a> sau <a href="https://instagram.com/didikidsmd" style="color:#5c2d4a;">Instagram</a> pentru mai multe detalii.</p>
        <p style="font-style:italic;color:#7a5566;">Îți mulțumim pentru înțelegere. DiDiKidsMD 🐻</p>
      </div>
      <div style="background:#f0e8d8;padding:1rem;text-align:center;font-size:0.82rem;color:#7a5566;">
        DiDiKidsMD · <a href="https://instagram.com/didikidsmd" style="color:#5c2d4a;">@didikidsmd</a>
      </div>
    </div>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!verifyToken(req)) return res.status(401).json({ error: 'Neautorizat' });

  const { rowIndex, action, order, nota, suma } = req.body || {};
  if (!rowIndex || !action || !order) return res.status(400).json({ error: 'Date incomplete' });

  const results = {};

  /* 1 — Update Google Sheets */
  try {
    const sheets = await getSheets();

    if (action === 'edit') {
      await sheets.spreadsheets.values.update({
        spreadsheetId:    process.env.GOOGLE_SHEET_ID,
        range:            `Comenzi!F${rowIndex}:L${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[order.produse, order.livrare, order.localitate, order.adresa, order.status, order.sursa, suma || '']] },
      });
    } else {
      const newStatus = action === 'confirm' ? 'Confirmat' : 'Anulat';
      await sheets.spreadsheets.values.update({
        spreadsheetId:    process.env.GOOGLE_SHEET_ID,
        range:            `Comenzi!J${rowIndex}:L${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[newStatus, order.sursa || 'Website', suma || '']] },
      });
    }
    results.sheets = 'ok';
  } catch (e) {
    results.sheets = e.message;
    console.log('Sheets ERROR:', e.message);
  }

  /* 2 — Email către client */
  if ((action === 'confirm' || action === 'cancel') && order.email) {
    try {
      const subject = action === 'confirm'
        ? '✅ Comanda ta la DiDiKidsMD — confirmată!'
        : '❌ Comanda ta la DiDiKidsMD — anulată';
      const html = action === 'confirm' ? confirmHtml(order, nota, suma) : cancelHtml(order);

      const emailRes = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'DiDiKidsMD <onboarding@resend.dev>', to: order.email, subject, html }),
      });
      const emailData = await emailRes.json();
      results.email = emailRes.ok ? 'ok' : emailData;
    } catch (e) {
      results.email = e.message;
      console.log('Email ERROR:', e.message);
    }
  }

  return res.status(200).json({ ok: true, results });
};
