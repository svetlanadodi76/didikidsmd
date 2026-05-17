// Script one-time: descarcă pozele din Telegram și le salvează în /images/
// Rulare: node --env-file=.env.local scripts/download-images.js

const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');
const https = require('https');

const IMAGES_DIR = path.join(__dirname, '..', 'images');
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR);

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, res => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlink(destPath, () => {}); reject(err); });
  });
}

async function getTelegramFileUrl(fileId, token) {
  const res  = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`TG error for ${fileId}: ${data.description}`);
  return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
}

async function askToken() {
  const { createInterface } = require('readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('🔑 Introdu TELEGRAM_TOKEN: ', answer => { rl.close(); resolve(answer.trim()); });
  });
}

async function main() {
  let token = process.env.TELEGRAM_TOKEN;
  if (!token) token = await askToken();
  if (!token) { console.error('❌ Token lipsă'); process.exit(1); }

  console.log('📊 Citesc catalogul din Google Sheets...');
  const fs2 = require('fs');
  const credPath = '/Users/svetlana/Downloads/smiling-wind-494418-r9-2fbf55dfc440.json';
  const credentials = JSON.parse(
    process.env.GOOGLE_CREDENTIALS && process.env.GOOGLE_CREDENTIALS !== '""'
      ? process.env.GOOGLE_CREDENTIALS
      : fs2.readFileSync(credPath, 'utf8')
  );
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetId = process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SHEET_ID !== '""'
    ? process.env.GOOGLE_SHEET_ID
    : '1db_XyOvCsGgxb3hs-zkpDE-cPbF2jQLJxRsHEsoanVM';
  const resp   = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'catalog!A:B',
  });

  const rows = (resp.data.values || []).slice(1).filter(r => r[0] && r[1]);
  console.log(`📦 ${rows.length} produse cu FileID găsite\n`);

  for (const [cod, fileId] of rows) {
    const destJpg  = path.join(IMAGES_DIR, `${cod}.jpg`);
    if (fs.existsSync(destJpg)) {
      console.log(`⏭  ${cod}.jpg — deja există, skip`);
      continue;
    }
    try {
      const url  = await getTelegramFileUrl(fileId, token);
      const dest = path.join(IMAGES_DIR, `${cod}.jpg`);
      await downloadFile(url, dest);
      console.log(`✅ ${cod}.${ext} — descărcat`);
    } catch (e) {
      console.log(`❌ ${cod} — eroare: ${e.message}`);
    }
  }

  console.log('\n✨ Gata! Pozele sunt în folderul /images/');
  console.log('👉 Pasul următor: git add images/ && git push, apoi vercel --prod');
}

main().catch(console.error);
