const { chromium } = require('playwright');
const fs = require('fs');
const he = require('he');
const cheerio = require('cheerio');
const { exec } = require('child_process');

// Kullanıcı bilgileri
const USERNAME = 'kullaniciadi'; // TODO: Buraya kullanıcı adını yaz
const PASSWORD = 'sifre';         // TODO: Buraya şifreyi yaz

// Bekleme fonksiyonları
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min = 4000, max = 6000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0'
];

async function loginAndSaveCookies() {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('🔑 Giriş yapılıyor...');

  await page.goto('https://www.tikleap.com/login', { waitUntil: 'domcontentloaded' });

  await page.fill('input[name="email"]', USERNAME);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'domcontentloaded' })
  ]);

  console.log('✅ Giriş başarılı, cookie kaydediliyor...');

  const cookies = await context.cookies();
  fs.writeFileSync('cookies.json', JSON.stringify(cookies, null, 2), 'utf-8');

  await browser.close();
}

async function fetchPages() {
  if (!fs.existsSync('cookies.json')) {
    console.error('❌ cookies.json bulunamadı. Önce login olmanız gerekiyor.');
    return;
  }

  const cookies = JSON.parse(fs.readFileSync('cookies.json', 'utf-8'));
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();

  let tumKullanicilar = [];

  for (let i = 1; i <= 5; i++) {
    console.log(`\n🚀 Sayfa ${i} çekiliyor...`);

    await page.setExtraHTTPHeaders({
      'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)]
    });

    await page.goto(`https://www.tikleap.com/country-load-more/tr/${i}`, { waitUntil: 'domcontentloaded' });

    const html = await page.content();

    let htmlContent = '';
    const preTagStart = html.indexOf('<pre>');
    const preTagEnd = html.indexOf('</pre>');

    if (preTagStart !== -1 && preTagEnd !== -1) {
      const preContent = html.substring(preTagStart + 5, preTagEnd);
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

      tumKullanicilar.push({
        sayfa: i,
        profil,
        siralama,
        kullaniciAdi,
        kazanc
      });

      bulunan++;
    });

    if (bulunan === 0) {
      console.log(`⚠️ Sayfa ${i} boş geldi. 3 dakika bekleniyor...`);
      await browser.close();
      await delay(180000);
      console.log('🔄 Bot yeniden başlatılıyor...');
      exec('node bot.js');
      return;
    }

    console.log(`✅ Sayfa ${i} tamamlandı, ${bulunan} kullanıcı bulundu.`);

    fs.writeFileSync('tum_kullanicilar.json', JSON.stringify(tumKullanicilar, null, 2), 'utf-8');
    console.log(`💾 ${tumKullanicilar.length} kullanıcı dosyaya yazıldı.`);

    if (i !== 5) {
      const bekle = randomDelay();
      console.log(`⏳ ${bekle / 1000} saniye bekleniyor...`);
      await delay(bekle);
    }
  }

  await browser.close();

  console.log('\n🎉✅ Tüm sayfalar başarıyla çekildi! 12 dakika bekleniyor...');
  await delay(720000);

  console.log('🔄 Bot yeniden başlatılıyor...');
  exec('node bot.js');
}

(async () => {
  if (!fs.existsSync('cookies.json')) {
    await loginAndSaveCookies();
  }

  await fetchPages();
})();
