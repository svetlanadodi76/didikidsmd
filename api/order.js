const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { nume, telefon, email, livrare, localitate, adresa, produse } = req.body || {};

  console.log('ORDER received:', { nume, telefon, email, livrare, localitate, adresa, produse });

  if (!nume || !telefon || !email || !livrare || !localitate || !adresa || !produse) {
    console.log('ERROR: date incomplete');
    return res.status(400).json({ error: 'Date incomplete' });
  }

  const order = { nume, telefon, email, livrare, localitate, adresa, produse };
  const results = {};

  /* 1 ── Google Sheets */
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const now = new Date().toLocaleDateString('ro-MD');
    await sheets.spreadsheets.values.append({
      spreadsheetId:    process.env.GOOGLE_SHEET_ID,
      range:            'Comenzi!A:K',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[
        '', now, order.nume, order.telefon, order.email,
        order.produse, order.livrare, order.localitate, order.adresa,
        'Nou', 'Website',
      ]] },
    });
    results.sheets = 'ok';
    console.log('Sheets: ok');
  } catch (e) {
    results.sheets = e.message;
    console.log('Sheets ERROR:', e.message);
  }

  /* 2 ── Email client (Resend) */
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'DiDiKidsMD <onboarding@resend.dev>',
        to:      order.email,
        subject: '✅ Comanda ta la DiDiKidsMD — confirmată!',
        html: `
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
              <p style="font-style:italic;color:#7a5566;">Vei fi contactat/ă pentru confirmarea finală și detalii de plată. Mulțumim că ai ales DiDiKidsMD! 🐻</p>
            </div>
            <div style="background:#f0e8d8;padding:1rem;text-align:center;font-size:0.82rem;color:#7a5566;">
              DiDiKidsMD · <a href="https://instagram.com/didikidsmd" style="color:#5c2d4a;">@didikidsmd</a>
            </div>
          </div>
        `,
      }),
    });
    const emailData = await emailRes.json();
    results.email = emailRes.ok ? 'ok' : emailData;
    console.log('Email:', emailRes.status, JSON.stringify(emailData));
  } catch (e) {
    results.email = e.message;
    console.log('Email ERROR:', e.message);
  }

  /* 3 ── Telegram notificare manager */
  try {
    const text =
      `🛍 *Comandă nouă de pe site!*\n\n` +
      `👤 *Client:* ${order.nume}\n` +
      `📞 *Telefon:* ${order.telefon}\n` +
      `✉️ *Email:* ${order.email}\n` +
      `📦 *Produse:* ${order.produse}\n` +
      `🚚 *Livrare:* ${order.livrare}\n` +
      `📍 *Adresă:* ${order.localitate}, ${order.adresa}`;

    const tgRes = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          chat_id:    process.env.OWNER_CHAT_ID,
          text,
          parse_mode: 'Markdown',
        }),
      }
    );
    const tgData = await tgRes.json();
    results.telegram = tgRes.ok ? 'ok' : tgData;
    console.log('Telegram:', tgRes.status, JSON.stringify(tgData));
  } catch (e) {
    results.telegram = e.message;
    console.log('Telegram ERROR:', e.message);
  }

  console.log('Results:', JSON.stringify(results));
  return res.status(200).json({ ok: true, results });
};
