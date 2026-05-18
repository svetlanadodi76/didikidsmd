const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { nume, telefon, email, livrare, localitate, adresa, produse, nota_client, cart } = req.body || {};

  if (!nume || !telefon || !email || !livrare || !localitate || !adresa || !produse) {
    return res.status(400).json({ error: 'Date incomplete' });
  }

  const cartItems = Array.isArray(cart) && cart.length > 0 ? cart : null;
  const order = { nume, telefon, email, livrare, localitate, adresa, produse, nota_client: nota_client || '' };
  const results = {};

  /* 1 ── Google Sheets
     Structura CRM (A-T):
     A=Nr  B=Data  C=Client  D=Telefon  E=Adresa  F=Cod Produs
     G=Descriere  H=Cantitate  I=Preț/buc  J=Cost/buc  K=Total Vânzare
     L=Total Cost  M=Metodă Livrare  N=Cost Livrare  O=AWB
     P=Status  Q=Profit  R=Email  S=Sursă  T=Nota client
  */
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const now = new Date().toLocaleDateString('ro-MD');
    const sid = process.env.GOOGLE_SHEET_ID;

    // Găsim ultimul rând cu date reale în coloana C
    const colC = await sheets.spreadsheets.values.get({
      spreadsheetId: sid,
      range: 'Comenzi!C:C',
    });
    const cRows = colC.data.values || [];
    let lastDataRow = 1;
    for (let i = cRows.length - 1; i >= 0; i--) {
      if (cRows[i] && cRows[i][0] && String(cRows[i][0]).trim()) {
        lastDataRow = i + 1;
        break;
      }
    }
    const nextRow = lastDataRow + 1;

    const makeRow = (item, isFirst) => [
      '',                                          // A: Nr (formula)
      isFirst ? now : '',                          // B: Data (doar pe primul rând)
      order.nume,                                  // C: Client
      order.telefon,                               // D: Telefon
      `${order.localitate}, ${order.adresa}`,      // E: Adresa
      item ? `${item.cod} - ${item.name} - ${item.size || ''}`.replace(/ - $/, '') : order.produse, // F: Cod Produs
      '',                                          // G: Descriere (liber pentru admin)
      item ? String(item.qty) : '1',               // H: Cantitate
      item && item.pret ? item.pret : '',          // I: Preț/buc
      '',                                          // J: Cost/buc
      item && item.pret ? String(Number(item.pret) * item.qty) : '', // K: Total Vânzare
      '',                                          // L: Total Cost
      order.livrare,                               // M: Metodă Livrare
      '',                                          // N: Cost Livrare
      '',                                          // O: AWB
      'Nou',                                       // P: Status
      '',                                          // Q: Profit
      isFirst ? order.email : '',                  // R: Email (doar pe primul rând)
      isFirst ? 'Website' : '',                    // S: Sursă (doar pe primul rând)
      isFirst ? order.nota_client : '',            // T: Nota client (doar pe primul rând)
    ];

    const rows = cartItems
      ? cartItems.map((item, i) => makeRow(item, i === 0))
      : [makeRow(null, true)];

    await sheets.spreadsheets.values.update({
      spreadsheetId:    sid,
      range:            `Comenzi!A${nextRow}:T${nextRow + rows.length - 1}`,
      valueInputOption: 'USER_ENTERED',
      resource:         { values: rows },
    });
    results.sheets = 'ok';
    console.log('Sheets: ok, rows', nextRow, '-', nextRow + rows.length - 1);
  } catch (e) {
    results.sheets = e.message;
    console.log('Sheets ERROR:', e.message);
  }

  /* 2 ── Telegram */
  const tgText =
    `🛍 <b>Comandă nouă de pe site!</b>\n\n` +
    `👤 <b>Client:</b> ${order.nume}\n` +
    `📞 <b>Telefon:</b> ${order.telefon}\n` +
    `✉️ <b>Email:</b> ${order.email}\n` +
    `📦 <b>Produse:</b> ${order.produse}\n` +
    `🚚 <b>Livrare:</b> ${order.livrare}\n` +
    `📍 <b>Adresă:</b> ${order.localitate}, ${order.adresa}` +
    (order.nota_client ? `\n💬 <b>Observații:</b> ${order.nota_client}` : '');

  try {
    const tgRes  = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: process.env.OWNER_CHAT_ID, text: tgText, parse_mode: 'HTML' }),
    });
    const tgData = await tgRes.json();
    results.telegram = tgRes.ok ? 'ok' : tgData;
  } catch (e) {
    results.telegram = e.message;
  }
  console.log('Telegram:', results.telegram);

  return res.status(200).json({ ok: true, results });
};
