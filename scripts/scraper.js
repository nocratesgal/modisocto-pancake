import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

const BASE_URL = 'https://modyolo.com/apps';
const apps = [];
const MAX_PAGES = 500;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeAppList() {
  console.log('🔍 Starting Modyolo scraper...');

  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const url = page === 1 ? BASE_URL : `${BASE_URL}/page/${page}/`;
      console.log(`📄 Scraping page ${page}...`);

      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
      });

      const $ = cheerio.load(data);

      $('.post').each((i, el) => {
        const $el = $(el);
        const titleEl = $el.find('.entry-title a');
        const imgEl = $el.find('.post-thumbnail img');

        const title = titleEl.text().trim();
        const appUrl = titleEl.attr('href');
        const icon = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-srcset');

        if (!title || !appUrl) return;

        const slug = appUrl.split('/').filter(Boolean).pop().replace('.html', '');

        // Detect type more reliably
        let type = 'games';
        const keywords = [
          'vpn','browser','messenger','telegram','whatsapp','instagram','tiktok',
          'facebook','youtube','spotify','netflix','editor','camera','photo','gallery',
          'launcher','keyboard','cleaner','manager','downloader','player'
        ];
        if (appUrl.toLowerCase().includes('/apps/') || keywords.some(k => title.toLowerCase().includes(k))) {
          type = 'apps';
        }

        apps.push({
          slug,
          title,
          icon,
          apkUrl: appUrl,
          type,
          scrapedAt: new Date().toISOString()
        });
      });

      console.log(`✅ Page ${page}: ${apps.length} apps total`);
      await sleep(1000);

    } catch (error) {
      console.error(`❌ Failed page ${page}:`, error.message);
    }
  }
}

async function scrapeAppDetails() {
  console.log('\n📝 Scraping app details...');

  for (let i = 0; i < apps.length; i++) {
    const app = apps[i];

    try {
      if (i % 50 === 0) {
        console.log(`📝 Details: ${i}/${apps.length} apps...`);
      }

      const { data } = await axios.get(app.apkUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
      });

      const $ = cheerio.load(data);

      // Description
      const description = $('.entry-content p').first().text().trim().substring(0, 500);

      // Version & Size from table if present
      let version = 'Latest';
      let size = 'Varies';
      $('table.apk-info tr').each((idx, el) => {
        const key = $(el).find('th').text().toLowerCase();
        const val = $(el).find('td').text().trim();
        if (key.includes('version')) version = val || version;
        if (key.includes('size')) size = val || size;
      });

      // Mod features
      let modFeatures = $('strong:contains("MOD feature")').parent().text().replace('MOD feature', '').trim();
      if (!modFeatures) {
        const match = $('.entry-title').text().match(/\(([^)]+)\)/);
        modFeatures = match ? match[1] : 'Premium Unlocked';
      }

      // Screenshots (handle lazy-loaded)
      const screenshots = [];
      $('.gallery-item img, .wp-block-image img').each((idx, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-srcset');
        if (src && idx < 5) screenshots.push(src);
      });

      Object.assign(app, {
        description,
        version,
        size,
        modFeatures,
        screenshots,
        updatedAt: new Date().toISOString()
      });

      await sleep(500);

    } catch (error) {
      console.error(`❌ Failed details for ${app.title}:`, error.message);
    }
  }
}

async function main() {
  await scrapeAppList();
  await scrapeAppDetails();

  fs.mkdirSync('src/data', { recursive: true });
  fs.writeFileSync('src/data/apps.json', JSON.stringify(apps, null, 2));

  console.log(`\n✅ DONE! Scraped ${apps.length} apps`);
  console.log(`📁 Saved to: src/data/apps.json`);
}

main();
