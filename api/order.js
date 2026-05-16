const { google } = require('googleapis');

const SHEET_ID      = process.env.GOOGLE_SHEET_ID;
const RESEND_KEY    = process.env.RESEND_API_KEY;
const TG_TOKEN      = process.env.TELEGRAM_TOKEN;
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;

async function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function saveToSheets(order) {
  const sheets = await getSheetsClient();
  const now    = new Date().toLocaleDateString('ro-MD');
  await sheets.spreadsheets.values.append({
    spreadsheetId:    SHEET_ID,
    range:            'Comenzi!A:K',
    valueInputOption: 'USER_ENTERED',
    resource: { values: [[
      '',               // A - Nr (formulă)
      now,              // B - Data
      order.nume,       // C - Client
      order.telefon,    // D - Telefon
      order.email,      // E - Email
      order.produse,    // F - Produse
      order.livrare,    // G - Metodă livrare
      order.localitate, // H - Localitate
      order.adresa,     // I - Adresă
      'Nou',            // J - Status
      'Website',        // K - Sursa
    ]] },
  });
}

async function sendEmailClient(order) {
  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    'DiDiKidsMD <onboarding@resend.dev>',
      to:      order.email,
      subject: '✅ Comanda ta la DiDiKidsMD — confirmată!',
      html: `
        <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#3a1f2d;background:#faf6f0;">
          <div style="background:#5c2d4a;padding:2rem;text-align:center;">
            <h1 style="color:#faf6f0;font-size:1.8rem;margin:0;font-weight:400;letter-spacing:0.05em;">DiDiKidsMD</h1>
            <p style="color:#c9a96e;margin:0.5rem 0 0;font-size:0.9rem;letter-spacing:0.1em;">HAINE CARE ÎMBRĂȚIȘEAZĂ COPILĂRIA</p>
          </div>
          <div style="padding:2rem;">
            <p style="font-size:1.2rem;margin-bottom:0.5rem;">✅ Comanda primită!</p>
            <p style="color:#7a5566;">Bună, <strong>${order.nume}</strong>! Comanda ta a fost înregistrată și va fi procesată în cel mai scurt timp.</p>

            <div style="background:#f0e8d8;padding:1.2rem;margin:1.5rem 0;border-left:3px solid #c9a96e;">
              <p style="font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;color:#c9a96e;margin:0 0 0.8rem;">Produse comandate</p>
              <p style="margin:0;font-size:0.95rem;">${order.produse}</p>
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

            <p style="font-style:italic;color:#7a5566;font-size:0.95rem;">
              Vei fi contactat/ă pentru confirmarea finală și detalii de plată.
              Mulțumim că ai ales DiDiKidsMD! 🐻
            </p>
          </div>
          <div style="background:#f0e8d8;padding:1rem 2rem;text-align:center;font-size:0.82rem;color:#7a5566;">
            DiDiKidsMD · <a href="https://instagram.com/didikidsmd" style="color:#5c2d4a;">@didikidsmd</a>
          </div>
        </div>
      `,
    }),
  });
}

async function notifyManagerTelegram(order) {
  if (!TG_TOKEN || !OWNER_CHAT_ID) return;
  const text =
    `🛍 *Comandă nouă de pe site!*\n\n` +
    `👤 *Client:* ${order.nume}\n` +
    `📞 *Telefon:* ${order.telefon}\n` +
    `✉️ *Email:* ${order.email}\n` +
    `📦 *Produse:* ${order.produse}\n` +
    `🚚 *Livrare:* ${order.livrare}\n` +
    `📍 *Adresă:* ${order.localitate}, ${order.adresa}`;

  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      chat_id:    OWNER_CHAT_ID,
      text,
      parse_mode: 'Markdown',
    }),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { nume, telefon, email, livrare, localitate, adresa, produse } = req.body;
  if (!nume || !telefon || !email || !livrare || !localitate || !adresa || !produse) {
    return res.status(400).json({ error: 'Date incomplete' });
  }

  try {
    await saveToSheets({ nume, telefon, email, livrare, localitate, adresa, produse });
    await sendEmailClient({ nume, telefon, email, livrare, localitate, adresa, produse });
    await notifyManagerTelegram({ nume, telefon, email, livrare, localitate, adresa, produse });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Order error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
