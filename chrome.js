const { chromium } = require('playwright');
const fs = require('fs');
const he = require('he');
const cheerio = require('cheerio');
const { exec } = require('child_process');
const path = require('path');

// Ayarlar
const MIN_DELAY = 4000;
const MAX_DELAY = 6000;
const PAGE_LIMIT = 5;
const EMPTY_PAGE_RETRY_WAIT = 3 * 60 * 1000; // 3 dakika
const RESTART_WAIT = 12 * 60 * 1000; // 12 dakika

const COOKIES_PATH = 'cookie.json';
const BACKUP_COOKIES_PATH = 'cookie_base.json';
const DATA_PATH = 'tum_kullanicilar.json';
const ERROR_LOG = 'logs/error.log';

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0'
];

function randomDelay(min = MIN_DELAY, max = MAX_DELAY) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function safeWrite(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    logError('Dosya yazarken hata: ' + err.message);
  }
}

function logError(message) {
  console.error('❌ HATA:', message);
  fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${message}\n`, 'utf-8');
}

function ensureFolders() {
  if (!fs.existsSync('logs')) fs.mkdirSync('logs');
}

async function restoreCookies() {
  if (fs.existsSync(BACKUP_COOKIES_PATH)) {
    fs.copyFileSync(BACKUP_COOKIES_PATH, COOKIES_PATH);
    console.log('🔄 Eski cookie yedeği geri yüklendi.');
  }
}

async function runBot() {
  console.clear();
  console.log('🚀 Bot başlatılıyor...');
  ensureFolders();
  let allUsers = [];

  try {
    if (!fs.existsSync(COOKIES_PATH)) throw new Error('cookie.json bulunamadı.');

    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
    const browser = await chromium.launch({
      headless: false,
      slowMo: 50,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });

    const context = await browser.newContext();
    await context.addCookies(cookies);
    const page = await context.newPage();

    const updatedCookies = await context.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(updatedCookies, null, 2), 'utf-8');
    fs.writeFileSync(BACKUP_COOKIES_PATH, JSON.stringify(updatedCookies, null, 2), 'utf-8');
    console.log('💾 Cookie güncellendi ve yedeklendi.');

    for (let i = 1; i <= PAGE_LIMIT; i++) {
      console.log(`\n📄 Sayfa ${i} çekiliyor...`);

      await page.setExtraHTTPHeaders({
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)]
      });

      const url = `https://www.tikleap.com/country-load-more/tr/${i}`;
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (!response) throw new Error(`Sayfa ${i} yanıt vermedi.`);
      const status = response.status();

      if (status === 403 || status === 401) {
        await browser.close();
        logError(`Sayfa ${i} için ${status} hatası: Cookie geçersiz.`);
        console.log(`🔁 Cookie geçersiz. 3 dk sonra eski cookie ile yeniden deneniyor...`);
        await restoreCookies();
        return setTimeout(() => exec('node index.js'), EMPTY_PAGE_RETRY_WAIT);
      }

      const html = await page.content();
      let htmlContent = '';

      const preStart = html.indexOf('<pre>');
      const preEnd = html.indexOf('</pre>');
      if (preStart !== -1 && preEnd !== -1) {
        const preContent = html.substring(preStart + 5, preEnd);
        const parsedPre = JSON.parse(preContent);
        htmlContent = he.decode(parsedPre.html);
      } else {
        htmlContent = html;
      }

      const $ = cheerio.load(htmlContent);
      let bulunan = 0;

      $('a.ranklist-table-row').each((_, elem) => {
        const profil = $(elem).attr('href') || '';
        const siralama = $(elem).find('.ranklist-place-wrapper span').text() || '';
        const kullaniciAdi = $(elem).find('.ranklist-username').text() || '';
        const kazanc = $(elem).find('.ranklist-earning-wrapper .price').text() || '';
        allUsers.push({ sayfa: i, profil, siralama, kullaniciAdi, kazanc });
        bulunan++;
      });

      if (bulunan === 0) {
        console.log(`⚠️ Sayfa ${i} boş geldi. 3 dk bekleniyor, bot yeniden başlatılıyor...`);
        return setTimeout(() => exec('node index.js'), EMPTY_PAGE_RETRY_WAIT);
      }

      console.log(`✅ Sayfa ${i} tamamlandı, ${bulunan} kullanıcı bulundu.`);
      safeWrite(DATA_PATH, allUsers);

      if (i !== PAGE_LIMIT) {
        const delay = randomDelay();
        console.log(`⏳ ${delay / 1000} saniye bekleniyor...`);
        await new Promise(res => setTimeout(res, delay));
      }
    }

    await browser.close();
    console.log('\n✅ Tüm işlem tamamlandı! 12 dk sonra tekrar başlayacak.');
    setTimeout(() => exec('node index.js'), RESTART_WAIT);

  } catch (error) {
    logError(error.message);
    console.log('\n⏳ Hata sonrası 3 dk bekleniyor ve bot yeniden başlatılıyor...');
    await restoreCookies();
    setTimeout(() => exec('node index.js'), EMPTY_PAGE_RETRY_WAIT);
  }
}

runBot();
