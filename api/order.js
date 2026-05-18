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

  /* 2 + 3 ── Email și Telegram în paralel (nu unul după altul) */
  const emailHtml = `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#3a1f2d;background:#faf6f0;">
      <div style="background:#5c2d4a;padding:2rem;text-align:center;">
        <h1 style="color:#faf6f0;font-size:1.8rem;margin:0;font-weight:400;">DiDiKidsMD</h1>
        <p style="color:#c9a96e;margin:0.5rem 0 0;font-size:0.85rem;letter-spacing:0.1em;">HAINE CARE ÎMBRĂȚIȘEAZĂ COPILĂRIA</p>
      </div>
      <div style="padding:2rem;">
        <p style="font-size:1.1rem;">✅ Comanda primită!</p>
        <p style="color:#7a5566;">Bună, <strong>${order.nume}</strong>! Comanda ta a fost înregistrată și va fi procesată în cel mai scurt timp.</p>
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
          <tr>
            <td style="padding:0.6rem 0;color:#7a5566;">📞 Telefon</td>
            <td style="padding:0.6rem 0;font-weight:600;">${order.telefon}</td>
          </tr>
        </table>
        ${order.nota_client ? `<div style="background:#f0e8d8;padding:1rem;margin-bottom:1.5rem;border-radius:4px;border-left:3px solid #c9a96e;"><p style="margin:0;color:#5c2d4a;font-size:.9rem;">💬 Observațiile tale: <em>${order.nota_client}</em></p></div>` : ''}
        <p style="font-style:italic;color:#7a5566;">Vei fi contactat/ă pentru confirmarea finală și detalii de plată. Mulțumim că ai ales DiDiKidsMD! 🐻</p>
      </div>
      <div style="background:#f0e8d8;padding:1rem;text-align:center;font-size:0.82rem;color:#7a5566;">
        DiDiKidsMD · <a href="https://instagram.com/didikidsmd" style="color:#5c2d4a;">@didikidsmd</a>
      </div>
    </div>`;

  const tgText =
    `🛍 *Comandă nouă de pe site!*\n\n` +
    `👤 *Client:* ${order.nume}\n` +
    `📞 *Telefon:* ${order.telefon}\n` +
    `✉️ *Email:* ${order.email}\n` +
    `📦 *Produse:* ${order.produse}\n` +
    `🚚 *Livrare:* ${order.livrare}\n` +
    `📍 *Adresă:* ${order.localitate}, ${order.adresa}` +
    (order.nota_client ? `\n💬 *Observații:* ${order.nota_client}` : '');

  const [emailResult, tgResult] = await Promise.allSettled([
    fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ from: 'DiDiKidsMD <onboarding@resend.dev>', to: order.email, subject: '✅ Comanda ta la DiDiKidsMD — înregistrată!', html: emailHtml }),
    }).then(r => r.json().then(d => ({ ok: r.ok, data: d }))),
    fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: process.env.OWNER_CHAT_ID, text: tgText, parse_mode: 'Markdown' }),
    }).then(r => r.json().then(d => ({ ok: r.ok, data: d }))),
  ]);

  results.email    = emailResult.status  === 'fulfilled' ? (emailResult.value.ok  ? 'ok' : emailResult.value.data)  : emailResult.reason?.message;
  results.telegram = tgResult.status === 'fulfilled' ? (tgResult.value.ok ? 'ok' : tgResult.value.data) : tgResult.reason?.message;
  console.log('Email:', results.email, '| Telegram:', results.telegram);

  return res.status(200).json({ ok: true, results });
};
