import axios from 'axios';  
import * as cheerio from 'cheerio';  
import fs from 'fs';  
  
const BASE_URL = 'https://apkmody.io';  
const apps = [];  
const MAX_PAGES = 100; // Scrapes ~2000 apps, increase for more  
  
// Category mapping  
const categoryMap = {  
  'arcade': 'arcade',  
  'action': 'action',  
  'adventure': 'action',  
  'strategy': 'strategy',  
  'racing': 'racing',  
  'puzzle': 'puzzle',  
  'role-playing': 'rpg',  
  'rpg': 'rpg',  
  'tools': 'tools',  
  'social': 'social',  
  'photography': 'photography',  
  'music': 'music',  
  'productivity': 'productivity'  
};  
  
async function scrapeAppList() {  
  console.log('🔍 Starting APKMody scraper...');  
    
  for (let page = 1; page <= MAX_PAGES; page++) {  
    try {  
      const url = page === 1 ? BASE_URL : `${BASE_URL}/page/${page}`;  
      console.log(`📄 Scraping page ${page}...`);  
        
      const { data } = await axios.get(url, {  
        headers: {  
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'  
        }  
      });  
        
      const $ = cheerio.load(data);  
        
      $('.post').each((i, el) => {  
        const $el = $(el);  
        const titleEl = $el.find('.entry-title a');  
        const imgEl = $el.find('.post-thumbnail img');  
          
        const title = titleEl.text().trim();  
        const appUrl = titleEl.attr('href');  
        const icon = imgEl.attr('src') || imgEl.attr('data-src');  
          
        if (!title || !appUrl) return;  
          
        // Extract slug from URL  
        const slug = appUrl.split('/').filter(Boolean).pop().replace('.html', '');  
          
        // Determine type and category from URL/title  
        let type = 'games';  
        let category = 'action';  
          
        if (appUrl.includes('/apps/') || title.toLowerCase().includes('tool') ||   
            title.toLowerCase().includes('editor') || title.toLowerCase().includes('vpn')) {  
          type = 'apps';  
          category = 'tools';  
        }  
          
        apps.push({  
          slug,  
          title,  
          icon,  
          apkUrl: appUrl,  
          type,  
          category,  
          scrapedAt: new Date().toISOString()  
        });  
      });  
        
      console.log(`✅ Page ${page}: ${apps.length} apps total`);  
        
      // Small delay to be respectful  
      await new Promise(resolve => setTimeout(resolve, 1000));  
        
    } catch (error) {  
      console.error(`❌ Failed page ${page}:`, error.message);  
    }  
  }  
}  
  
async function scrapeAppDetails() {  
  console.log('\n📝 Scraping app details...');  
    
  for (let i = 0; i < Math.min(apps.length, 5000); i++) {  
    const app = apps[i];  
      
    try {  
      if (i % 100 === 0) {  
        console.log(`📝 Details: ${i}/${apps.length} apps...`);  
      }  
        
      const { data } = await axios.get(app.apkUrl, {  
        headers: {  
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'  
        }  
      });  
        
      const $ = cheerio.load(data);  
        
      // Extract description  
      const description = $('.entry-content p').first().text().trim().substring(0, 500);  
        
      // Extract meta info  
      const version = $('strong:contains("Version")').parent().text().replace('Version', '').trim() || 'Latest';  
      const size = $('strong:contains("Size")').parent().text().replace('Size', '').trim() || 'Varies';  
      const modFeatures = $('strong:contains("MOD feature")').parent().text().replace('MOD feature', '').trim() ||   
                          $('.entry-title').text().match(/\(([^)]+)\)/)?.[1] || 'Premium Unlocked';  
        
      // Extract screenshots  
      const screenshots = [];  
      $('.gallery-item img, .wp-block-image img').each((i, el) => {  
        const src = $(el).attr('src') || $(el).attr('data-src');  
        if (src && i < 5) screenshots.push(src);  
      });  
        
      // Better category detection  
      const content = data.toLowerCase();  
      if (content.includes('arcade') || app.title.toLowerCase().includes('casual')) {  
        app.category = 'arcade';  
      } else if (content.includes('strategy') || content.includes('tower defense')) {  
        app.category = 'strategy';  
      } else if (content.includes('racing') || content.includes('car') || content.includes('bike')) {  
        app.category = 'racing';  
      } else if (content.includes('puzzle')) {  
        app.category = 'puzzle';  
      } else if (content.includes('rpg') || content.includes('role')) {  
        app.category = 'rpg';  
      }  
        
      // Update app object  
      Object.assign(app, {  
        description,  
        version,  
        size,  
        modFeatures,  
        screenshots,  
        updatedAt: new Date().toISOString()  
      });  
        
      // Small delay  
      await new Promise(resolve => setTimeout(resolve, 500));  
        
    } catch (error) {  
      console.error(`❌ Failed details for ${app.title}`);  
    }  
  }  
}  
  
async function main() {  
  await scrapeAppList();  
  await scrapeAppDetails();  
    
  // Save to JSON  
  fs.mkdirSync('src/data', { recursive: true });  
  fs.writeFileSync('src/data/apps.json', JSON.stringify(apps, null, 2));  
    
  console.log(`\n✅ DONE! Scraped ${apps.length} apps`);  
  console.log(`📁 Saved to: src/data/apps.json`);  
}  
  
main();
