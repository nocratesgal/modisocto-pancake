import axios from 'axios';
import axiosRetry from 'axios-retry';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { URL } from 'url';

// --- 1. CONFIGURATION AND UTILITIES ---

const BASE_URL = 'https://modyolo.com';
const START_PATH = '/apps';
// 8. LOWER YOUR MAX_PAGES FOR FIRST RUN
const MAX_PAGES = 300; 
const apps = [];

// High-quality, diverse User Agents to mimic real browsers
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/119.0.2151.0 Safari/537.36'
];

// Realistic Referer pool
const REFERERS = [
    'https://www.google.com/',
    'https://www.bing.com/search?q=modyolo',
    'https://duckduckgo.com/',
    'https://modyolo.com/' // Internal Referer
];

// Use a simple in-memory object for cookie management
const cookieJar = {};

// Helper for Random Delays
async function sleepRandom() {
    // 2000ms to 5000ms (2-5 seconds)
    const delay = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000;
    console.log(`⏳ Pausing for ${delay}ms to simulate human browsing...`);
    await new Promise(resolve => setTimeout(resolve, delay));
}


// --- 2. ROBOTS.TXT CHECK ---

async function checkRobotsTxt(baseUrl) {
    const robotsUrl = new URL('/robots.txt', baseUrl).href;
    try {
        const response = await axios.get(robotsUrl, { timeout: 5000 });
        if (response.data.includes('Disallow: /')) {
            console.warn(`⚠️ Warning: ${robotsUrl} contains a 'Disallow: /'. Proceeding may violate site policy.`);
        } else {
            console.log(`✅ ${robotsUrl} retrieved. No immediate 'Disallow: /' found.`);
        }
    } catch (error) {
        console.log(`✅ Could not retrieve ${robotsUrl}, proceeding...`);
    }
}


// --- 3. AXIOS SESSION AND INTERCEPTORS ---

// 4. ADD CONNECTION: KEEP-ALIVE
const session = axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
    maxRedirects: 5,
    headers: {
        'Connection': 'keep-alive'
    }
});

// 3. FIX YOUR DELAY TIMING (REMOVED sleepRandom() from here)
// Request Interceptor (Middleware for headers and cookies)
session.interceptors.request.use(config => {
    
    // Rotate User Agent & Referer
    config.headers['User-Agent'] = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    config.headers['Referer'] = REFERERS[Math.floor(Math.random() * REFERERS.length)];

    // Realistic Headers
    config.headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
    config.headers['Accept-Language'] = 'en-US,en;q=0.5';
    config.headers['Sec-Fetch-Dest'] = 'document';
    config.headers['Sec-Fetch-Mode'] = 'navigate';
    config.headers['Sec-Fetch-Site'] = 'none';
    config.headers['Sec-Fetch-User'] = '?1';
    config.headers['Upgrade-Insecure-Requests'] = '1';

    // 6. ADD DNT (DO NOT TRACK) HEADER
    config.headers['DNT'] = '1';

    // Cookie Handling (Request side)
    const cookies = Object.keys(cookieJar).map(key => `${key}=${cookieJar[key]}`).join('; ');
    if (cookies) {
        config.headers['Cookie'] = cookies;
    }

    return config;
}, error => {
    return Promise.reject(error);
});

// Response Interceptor (Middleware for robust cookie management)
session.interceptors.response.use(response => {
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader) {
        setCookieHeader.forEach(cookieStr => {
            // 5. FIX COOKIE PARSING (Robust split for key=value)
            const parts = cookieStr.split(';')[0]; 
            const index = parts.indexOf('=');
            if (index > 0) {
                const key = parts.substring(0, index).trim();
                const value = parts.substring(index + 1).trim();
                if (key && value) {
                    cookieJar[key] = value;
                    // Note: Removed console.log here to reduce output spam during long scrapes
                }
            }
        });
    }
    return response;
}, error => {
    return Promise.reject(error);
});

const MAX_RETRIES = 4;
// Intelligent Retry Logic
axiosRetry(session, {
    retries: MAX_RETRIES, 
    // 1. FIX YOUR RETRY LOGIC BUG (Use MAX_RETRIES constant)
    retryDelay: (retryCount, error) => {
        // Exponential Backoff
        const delay = Math.min(30000, 2000 * Math.pow(2, retryCount));
        const status = error.response ? error.response.status : 'Network Error';
        console.warn(`🚨 Retry ${retryCount}/${MAX_RETRIES} for status ${status}. Waiting ${delay}ms (Exponential Backoff)...`);
        return delay;
    },
    retryCondition: (error) => {
        // Retry on Network Errors, 429, and 5xx
        if (axiosRetry.isNetworkError(error)) return true; 
        if (error.response && [429, 500, 502, 503, 504].includes(error.response.status)) {
            return true;
        }
        return false;
    }
});


// --- 4. CLOUDFLARE WARMUP ---

// 2. ADD INITIAL COOKIE WARMUP (CRITICAL)
async function warmupSession() {
    console.log('🔥 Warming up session to get Cloudflare cookies...');
    try {
        await session.get('/'); // Hit homepage first
        console.log(`✅ Session warmed up. Cookies saved: ${Object.keys(cookieJar).join(', ')}`);
    } catch (error) {
        console.error('❌ Failed to warm up session (Network or Hard Block):', error.message);
        throw error;
    }
}


// --- 5. SCRAPING LOGIC MODIFIED ---

async function scrapeAppList() {
    console.log('\n🔍 Starting Modyolo list scraper...');

    for (let page = 1; page <= MAX_PAGES; page++) {
        // 3. FIX YOUR DELAY TIMING (Delay only between pages)
        if (page > 1) await sleepRandom(); 
        
        try {
            const urlPath = page === 1 ? START_PATH : `${START_PATH}/page/${page}/`;
            console.log(`\n📄 Scraping page ${page} at ${BASE_URL}${urlPath}...`);

            const { data } = await session.get(urlPath);
            
            // 7. DETECT CLOUDFLARE CHALLENGE PAGE
            if (data.includes('Checking your browser') || 
                data.includes('Just a moment') || 
                data.includes('cf-browser-verification')) {
                console.error('⛔ CLOUDFLARE CHALLENGE DETECTED - Stopping scrape.');
                throw new Error('Cloudflare challenge page detected');
            }

            const $ = cheerio.load(data);

            // --- (Original list scraping logic) ---
            $('.post').each((i, el) => {
                const $el = $(el);
                const titleEl = $el.find('.entry-title a');
                const imgEl = $el.find('.post-thumbnail img');

                const title = titleEl.text().trim();
                const appUrl = titleEl.attr('href');
                const icon = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-srcset');

                if (!title || !appUrl) return;

                const slug = appUrl.split('/').filter(Boolean).pop().replace('.html', '');

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

            console.log(`✅ Page ${page}: ${apps.length} apps total. Status: 200 OK`);

        } catch (error) {
            console.error(`❌ Failed page ${page}. Final error: ${error.message}`);
            if (error.message.includes('Cloudflare challenge')) {
                 // Stop the process if challenge is detected
                 break; 
            }
            if (error.response && error.response.status === 403) {
                 console.error("⛔ Hard block (403 Forbidden) encountered. Cloudflare challenge likely failed.");
                 break;
            }
        }
    }
}

async function scrapeAppDetails() {
    console.log('\n📝 Scraping app details with throttling...');

    for (let i = 0; i < apps.length; i++) {
        const app = apps[i];
        
        // 3. FIX YOUR DELAY TIMING (Delay only between detail pages)
        await sleepRandom(); 

        try {
            if (i % 50 === 0) {
                console.log(`\n📝 Details progress: ${i}/${apps.length} apps...`);
            }

            const { data } = await session.get(app.apkUrl);
            
            // 7. DETECT CLOUDFLARE CHALLENGE PAGE
            if (data.includes('Checking your browser') || 
                data.includes('Just a moment') || 
                data.includes('cf-browser-verification')) {
                console.error(`⛔ CLOUDFLARE CHALLENGE DETECTED on detail page for ${app.title}. Stopping.`);
                throw new Error('Cloudflare challenge page detected');
            }

            const $ = cheerio.load(data);

            // --- (Original detail scraping logic) ---
            const description = $('.entry-content p').first().text().trim().substring(0, 500);

            let version = 'Latest';
            let size = 'Varies';
            $('table.apk-info tr').each((idx, el) => {
                const key = $(el).find('th').text().toLowerCase();
                const val = $(el).find('td').text().trim();
                if (key.includes('version')) version = val || version;
                if (key.includes('size')) size = val || size;
            });

            let modFeatures = $('strong:contains("MOD feature")').parent().text().replace('MOD feature', '').trim();
            if (!modFeatures) {
                const match = $('.entry-title').text().match(/\(([^)]+)\)/);
                modFeatures = match ? match[1] : 'Premium Unlocked';
            }

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

        } catch (error) {
            console.error(`❌ Failed details for ${app.title}:`, error.message);
            if (error.message.includes('Cloudflare challenge')) {
                // Stop the entire detail process
                break; 
            }
        }
    }
}

async function main() {
    try {
        await checkRobotsTxt(BASE_URL);
        // 2. ADD INITIAL COOKIE WARMUP (CRITICAL)
        await warmupSession(); 
        
        await scrapeAppList();
        await scrapeAppDetails();

        fs.mkdirSync('src/data', { recursive: true });
        fs.writeFileSync('src/data/apps.json', JSON.stringify(apps, null, 2));

        console.log(`\n✅ DONE! Scraped ${apps.length} apps`);
        console.log(`📁 Saved to: src/data/apps.json`);
    } catch (e) {
        console.error(`\n🛑 SCRAPER HALTED due to critical error: ${e.message}`);
    }
}

main();
