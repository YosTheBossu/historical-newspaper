// data-collector.js — Daily data pipeline
// Fetches from HE + EN Wikipedia, translates with DeepSeek, generates social posts
// Classifies events into categories, prioritizes Israeli content
// Runs server-side via cron — no API keys exposed to client

const https = require('https');
const fs = require('fs');

// ====== Configuration ======
const CONFIG = {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    WIKI_HE: 'https://he.wikipedia.org/api/rest_v1/feed/onthisday/all',
    WIKI_EN: 'https://en.wikipedia.org/api/rest_v1/feed/onthisday/all',
    HEBCAL: 'https://www.hebcal.com/converter',
    YNET_RSS: 'https://www.ynet.co.il/Integration/StoryRss2.xml',
    USER_AGENT: 'HistoricalNewspaperBot/1.0 (educational project)',
    TRANSLATE_BATCH_SIZE: 25,
    MAX_EVENTS: 50,
    MAX_BIRTHS: 30,
    MAX_DEATHS: 25
};

// ====== Category Classification ======
const CATEGORY_KEYWORDS = {
    israel: {
        keywords: ['ישראל', 'ירושלים', 'תל אביב', 'תל-אביב', 'חיפה', 'צה"ל', 'צהל',
            'כנסת', 'ציונ', 'יהוד', 'עברי', 'מנדט', 'פלשתינ', 'גולן', 'נגב', 'גליל',
            'יהודה', 'שומרון', 'באר שבע', 'אילת', 'רמת גן', 'בני ברק', 'נתניה',
            'הגנה', 'אצ"ל', 'לח"י', 'מוסד', 'שב"כ', 'שואה', 'עליי',
            'israel', 'jerusalem', 'tel aviv', 'haifa', 'idf', 'knesset', 'zion',
            'jewish', 'hebrew', 'palestine', 'mandate', 'kibbutz', 'mossad',
            'holocaust', 'yishuv', 'aliyah', 'israeli', 'judea', 'samaria', 'negev',
            'galilee', 'golan', 'eilat', 'beersheba', 'nazareth', 'bethlehem', 'jaffa'],
        label: 'ישראל'
    },
    politics: {
        keywords: ['ממשל', 'נשיא', 'ראש ממשלה', 'בחירות', 'מפלג', 'פרלמנט', 'קונגרס',
            'חוק', 'חוקה', 'דמוקרט', 'דיפלומט', 'הסכם', 'אמנה', 'מלך', 'קיסר',
            'ממלכ', 'שגריר', 'עצמאות', 'מהפכ', 'הכרז', 'חתימ',
            'president', 'prime minister', 'election', 'parliament', 'congress',
            'treaty', 'governor', 'political', 'kingdom', 'empire', 'republic',
            'constitution', 'independence', 'revolution', 'monarchy', 'ambassador',
            'chancellor', 'senator', 'legislation', 'sovereign', 'coronation'],
        label: 'פוליטיקה'
    },
    military: {
        keywords: ['מלחמ', 'צבא', 'קרב', 'לחימ', 'חייל', 'צבאי', 'פלישה', 'הפצצ',
            'כיבוש', 'מבצע', 'חזית', 'ביטחון', 'טרור', 'פיגוע', 'התקפ', 'הגנ',
            'war', 'battle', 'army', 'military', 'invasion', 'bombing', 'attack',
            'siege', 'troops', 'naval', 'combat', 'terror', 'warfare', 'soldier',
            'artillery', 'fleet', 'offensive', 'surrender', 'armistice', 'massacre'],
        label: 'ביטחון'
    },
    sports: {
        keywords: ['ספורט', 'אולימפ', 'כדורגל', 'כדורסל', 'שיא עולמי', 'אליפות',
            'גביע', 'טורניר', 'מונדיאל', 'שחקן', 'קבוצ', 'ליגה', 'טניס',
            'olympic', 'football', 'soccer', 'basketball', 'championship',
            'world record', 'tournament', 'world cup', 'super bowl', 'athlete',
            'medal', 'tennis', 'baseball', 'cricket', 'rugby', 'marathon',
            'fifa', 'uefa', 'nba', 'nfl', 'boxing', 'wrestling', 'swimming'],
        label: 'ספורט'
    },
    culture: {
        keywords: ['אמנ', 'ציור', 'סרט', 'שיר', 'מוסיקה', 'סופר', 'ספרות',
            'תיאטרון', 'אוניברסיט', 'פרס נובל', 'אוסקר', 'אופרה', 'זמר',
            'artist', 'film', 'movie', 'music', 'author', 'book', 'theater',
            'theatre', 'nobel', 'oscar', 'grammy', 'singer', 'actor', 'actress',
            'opera', 'composer', 'poet', 'novel', 'painting', 'sculpture',
            'museum', 'gallery', 'broadway', 'concert', 'album', 'literary'],
        label: 'תרבות'
    },
    science: {
        keywords: ['מדע', 'המצא', 'גילוי', 'חלל', 'מחשב', 'רפוא', 'פיזיק',
            'כימי', 'טכנולוג', 'אסטרונ', 'לוויין', 'מעבד', 'אינטרנט',
            'science', 'invent', 'discover', 'space', 'computer', 'medical',
            'physics', 'chemistry', 'technology', 'nasa', 'satellite', 'astronaut',
            'vaccine', 'patent', 'laboratory', 'genome', 'nuclear', 'atomic',
            'telescope', 'rocket', 'spacecraft', 'engineering', 'experiment'],
        label: 'מדע וטכנולוגיה'
    }
};

function classifyEvent(event) {
    const text = ((event.text || '') + ' ' + (event.extract || '') + ' ' + (event.pageTitle || '')).toLowerCase();

    for (const [cat, config] of Object.entries(CATEGORY_KEYWORDS)) {
        for (const kw of config.keywords) {
            if (text.includes(kw.toLowerCase())) {
                return cat;
            }
        }
    }
    return 'general';
}

// ====== HTTP Helpers ======
function httpGet(url, headers = {}, expectJson = true) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            headers: { 'User-Agent': CONFIG.USER_AGENT, ...headers }
        };
        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                }
                if (expectJson) {
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(new Error(`Invalid JSON from ${url}`)); }
                } else {
                    resolve(data);
                }
            });
        }).on('error', reject);
    });
}

function httpPost(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const payload = JSON.stringify(body);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                ...headers
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                }
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`Invalid JSON response`)); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ====== Date Helpers ======
function pad2(n) { return String(n).padStart(2, '0'); }

function getTodayParts(date = new Date()) {
    return {
        isoDate: date.toISOString().slice(0, 10),
        year: date.getFullYear(),
        month: pad2(date.getMonth() + 1),
        day: pad2(date.getDate())
    };
}

// ====== Wikipedia Data Fetching ======
function processWikiEntry(entry, lang) {
    const page = (entry.pages || [])[0] || {};
    return {
        year: entry.year || 0,
        text: entry.text || '',
        lang,
        extract: page.extract || null,
        thumbnail: (page.thumbnail && page.thumbnail.source) || null,
        pageTitle: page.title || '',
        category: 'general'
    };
}

async function fetchWikiData(lang, month, day) {
    const baseUrl = lang === 'he' ? CONFIG.WIKI_HE : CONFIG.WIKI_EN;
    const url = `${baseUrl}/${month}/${day}`;
    return httpGet(url);
}

async function fetchHebrewDate(year, month, day) {
    const url = `${CONFIG.HEBCAL}?cfg=json&gy=${year}&gm=${parseInt(month)}&gd=${parseInt(day)}&g2h=1`;
    return httpGet(url);
}

// ====== YNET RSS ======
function extractPlainText(html) {
    return (html || '')
        .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseRssItems(xmlText) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xmlText)) !== null) {
        const xml = match[1];
        const title = extractPlainText((xml.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]);
        const link = extractPlainText((xml.match(/<link>([\s\S]*?)<\/link>/i) || [])[1]);
        const desc = extractPlainText((xml.match(/<description>([\s\S]*?)<\/description>/i) || [])[1]);
        if (title && link) {
            items.push({ title, url: link, summary: desc, source: 'ynet' });
        }
    }
    return items;
}

// ====== DeepSeek API ======
async function callDeepSeek(systemPrompt, userPrompt, maxTokens = 4096) {
    if (!CONFIG.DEEPSEEK_API_KEY) {
        console.log('  ⏭️  DeepSeek API key not set, skipping');
        return null;
    }

    const body = {
        model: CONFIG.DEEPSEEK_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: maxTokens
    };

    const result = await httpPost('https://api.deepseek.com/v1/chat/completions', body, {
        'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`
    });

    const content = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
    return content || null;
}

function extractJsonFromResponse(text) {
    if (!text) return null;
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
        const objMatch = jsonStr.match(/\{[\s\S]*\}/);
        try {
            return JSON.parse(arrayMatch ? arrayMatch[0] : objMatch[0]);
        } catch (e2) {
            return null;
        }
    }
}

// ====== Translation ======
async function translateBatch(entries) {
    if (entries.length === 0) return entries;

    const textsToTranslate = entries.map((e, i) => ({
        id: i,
        text: e.text,
        extract: e.extract || ''
    }));

    const systemPrompt = `You are a professional Hebrew translator specializing in historical content.
Translate the given entries from English to Hebrew.
Rules:
- Use formal newspaper Hebrew style
- Transliterate well-known proper nouns to Hebrew (e.g., "Abraham Lincoln" → "אברהם לינקולן")
- Keep year numbers as-is
- Be concise but accurate
- Translate BOTH the "text" field AND the "extract" field
- Return ONLY a valid JSON array with objects: {"id": number, "text": "Hebrew translation", "extract": "Hebrew translation of extract"}`;

    const userPrompt = `Translate these ${entries.length} historical entries to Hebrew:\n${JSON.stringify(textsToTranslate)}`;

    try {
        const response = await callDeepSeek(systemPrompt, userPrompt);
        const translated = extractJsonFromResponse(response);

        if (Array.isArray(translated)) {
            for (const t of translated) {
                if (typeof t.id === 'number' && t.text && entries[t.id]) {
                    entries[t.id].text = t.text;
                    entries[t.id].originalLang = 'en';
                    entries[t.id].lang = 'he';
                    if (t.extract && entries[t.id].extract) {
                        entries[t.id].extract = t.extract;
                    }
                }
            }
            console.log(`    Translated ${translated.length}/${entries.length} entries`);
        } else {
            console.log(`    Could not parse translation response`);
        }
    } catch (err) {
        console.error(`    Translation batch failed: ${err.message}`);
    }

    return entries;
}

async function translateAllEnglishEntries(data) {
    const categories = ['events', 'births', 'deaths', 'selected', 'holidays'];
    let totalEN = 0;

    for (const cat of categories) {
        const enEntries = (data[cat] || []).filter(e => e.lang === 'en');
        if (enEntries.length === 0) continue;

        totalEN += enEntries.length;
        console.log(`  Translating ${enEntries.length} English ${cat}...`);

        for (let i = 0; i < enEntries.length; i += CONFIG.TRANSLATE_BATCH_SIZE) {
            const batch = enEntries.slice(i, i + CONFIG.TRANSLATE_BATCH_SIZE);
            await translateBatch(batch);
        }
    }

    // Retry any entries that failed translation
    let untranslated = 0;
    for (const cat of categories) {
        const stillEN = (data[cat] || []).filter(e => e.lang === 'en');
        untranslated += stillEN.length;
    }
    if (untranslated > 0 && CONFIG.DEEPSEEK_API_KEY) {
        console.log(`  Retrying ${untranslated} untranslated entries...`);
        for (const cat of categories) {
            const stillEN = (data[cat] || []).filter(e => e.lang === 'en');
            if (stillEN.length > 0) {
                await translateBatch(stillEN);
            }
        }
    }

    console.log(`  Total processed for translation: ${totalEN} entries`);
    return data;
}

// ====== Social Media Post Generation ======
async function generateSocialPosts(data) {
    if (!CONFIG.DEEPSEEK_API_KEY) return [];

    // Prefer Israeli events, then selected, then general events
    const israelEvents = (data.events || []).filter(e => e.category === 'israel').slice(0, 3);
    const topSelected = (data.selected || []).slice(0, 2);
    const topEvents = (data.events || []).slice(0, 4);
    const topBirths = (data.births || []).filter(e => e.category === 'israel').slice(0, 2)
        .concat((data.births || []).slice(0, 2));

    const allSources = [...israelEvents, ...topSelected, ...topEvents, ...topBirths];
    // Deduplicate by year
    const seen = new Set();
    const uniqueSources = allSources.filter(e => {
        if (seen.has(e.year)) return false;
        seen.add(e.year);
        return true;
    }).slice(0, 6);

    if (uniqueSources.length === 0) return [];

    const eventsText = uniqueSources.map(e => `${e.year}: ${e.text}`).join('\n');

    const systemPrompt = `You are a creative Hebrew social media content writer for a historical newspaper.
Create engaging social media posts as if historical figures were posting on modern platforms.
Each post MUST be tied to a specific event year from the list.
All content MUST be in Hebrew.
Return ONLY a valid JSON array.`;

    const userPrompt = `Based on these historical events that happened on this day:

${eventsText}

Create exactly 5 social media posts. Each post should be from the perspective of a relevant historical figure.
Prefer Israeli/Jewish historical figures when relevant.
Return a JSON array with objects:
{
    "author": "name in Hebrew",
    "handle": "@HandleInEnglish",
    "platform": "twitter" or "facebook" or "instagram",
    "content": "post content in Hebrew, max 200 chars, with relevant hashtags",
    "year": the exact year number from the event this post references,
    "eventYear": same year number (used to link to the event),
    "likes": random number between 500-15000,
    "retweets": random number between 100-5000,
    "replies": random number between 50-2000
}

Make them creative, witty, and historically accurate. ALL content MUST be in Hebrew.`;

    try {
        const response = await callDeepSeek(systemPrompt, userPrompt);
        const posts = extractJsonFromResponse(response);
        if (Array.isArray(posts) && posts.length > 0) {
            console.log(`  Generated ${posts.length} social posts`);
            return posts;
        }
    } catch (err) {
        console.error(`  Social post generation failed: ${err.message}`);
    }

    return [];
}

// ====== Main Pipeline ======
async function collectDailyData() {
    const { isoDate, year, month, day } = getTodayParts();
    console.log(`\n========================================`);
    console.log(`Historical Newspaper — Data Collection`);
    console.log(`Date: ${isoDate}`);
    console.log(`========================================\n`);

    const data = {
        date: isoDate,
        generatedAt: new Date().toISOString(),
        hebrewDate: '',
        events: [],
        births: [],
        deaths: [],
        selected: [],
        holidays: [],
        socialPosts: [],
        news: [],
        categories: {},
        stats: { he: 0, en: 0, translated: 0, total: 0, israelEvents: 0 }
    };

    // --- Step 1: Fetch Hebrew Wikipedia ---
    console.log('1. Fetching Hebrew Wikipedia...');
    try {
        const heData = await fetchWikiData('he', month, day);
        const categories = ['events', 'births', 'deaths', 'selected', 'holidays'];
        for (const cat of categories) {
            const items = (heData[cat] || []).map(e => processWikiEntry(e, 'he'));
            data[cat].push(...items);
            data.stats.he += items.length;
        }
        console.log(`  Hebrew: ${data.stats.he} items`);
    } catch (err) {
        console.error(`  Hebrew Wikipedia failed: ${err.message}`);
    }

    // --- Step 2: Fetch English Wikipedia ---
    console.log('2. Fetching English Wikipedia...');
    try {
        const enData = await fetchWikiData('en', month, day);
        const categories = ['events', 'births', 'deaths', 'selected', 'holidays'];
        for (const cat of categories) {
            const existingYears = new Set(data[cat].map(e => e.year));
            const newItems = (enData[cat] || [])
                .filter(e => !existingYears.has(e.year))
                .map(e => processWikiEntry(e, 'en'));
            data[cat].push(...newItems);
            data.stats.en += newItems.length;
        }
        console.log(`  English: ${data.stats.en} new items`);
    } catch (err) {
        console.error(`  English Wikipedia failed: ${err.message}`);
    }

    // --- Step 3: Fetch Hebrew Date ---
    console.log('3. Fetching Hebrew date...');
    try {
        const hebDate = await fetchHebrewDate(year, month, day);
        data.hebrewDate = hebDate.hebrew || '';
        console.log(`  Hebrew date: ${data.hebrewDate}`);
    } catch (err) {
        console.error(`  Hebrew date failed: ${err.message}`);
    }

    // --- Step 4: Fetch YNET News ---
    console.log('4. Fetching YNET news...');
    try {
        const xml = await httpGet(CONFIG.YNET_RSS, {}, false);
        data.news = parseRssItems(xml).slice(0, 10);
        console.log(`  YNET: ${data.news.length} articles`);
    } catch (err) {
        console.error(`  YNET failed: ${err.message}`);
    }

    // --- Step 5: Translate English entries with DeepSeek ---
    console.log('5. Translating English content with DeepSeek...');
    await translateAllEnglishEntries(data);

    // --- Step 6: Classify events into categories ---
    console.log('6. Classifying events into categories...');
    const catCounts = {};
    for (const cat of ['events', 'births', 'deaths', 'selected', 'holidays']) {
        for (const entry of (data[cat] || [])) {
            entry.category = classifyEvent(entry);
            catCounts[entry.category] = (catCounts[entry.category] || 0) + 1;
        }
    }
    data.categories = catCounts;
    data.stats.israelEvents = catCounts.israel || 0;
    console.log(`  Categories: ${JSON.stringify(catCounts)}`);

    // Sort: Israeli events first, then by year (most recent first)
    data.events.sort((a, b) => {
        if (a.category === 'israel' && b.category !== 'israel') return -1;
        if (a.category !== 'israel' && b.category === 'israel') return 1;
        return b.year - a.year;
    });
    data.births.sort((a, b) => {
        if (a.category === 'israel' && b.category !== 'israel') return -1;
        if (a.category !== 'israel' && b.category === 'israel') return 1;
        return b.year - a.year;
    });
    data.deaths.sort((a, b) => b.year - a.year);

    // Trim to limits
    data.events = data.events.slice(0, CONFIG.MAX_EVENTS);
    data.births = data.births.slice(0, CONFIG.MAX_BIRTHS);
    data.deaths = data.deaths.slice(0, CONFIG.MAX_DEATHS);

    // --- Step 7: Generate social media posts with DeepSeek ---
    console.log('7. Generating social media posts with DeepSeek...');
    data.socialPosts = await generateSocialPosts(data);

    // --- Final stats ---
    data.stats.total = data.events.length + data.births.length + data.deaths.length;
    data.stats.translated = [...data.events, ...data.births, ...data.deaths]
        .filter(e => e.originalLang === 'en').length;

    return data;
}

function saveData(data) {
    const todayFile = 'today.json';
    const archiveFile = `daily-digest-${data.date}.json`;

    fs.writeFileSync(todayFile, JSON.stringify(data, null, 2), 'utf8');
    fs.writeFileSync(archiveFile, JSON.stringify(data, null, 2), 'utf8');

    return { todayFile, archiveFile };
}

async function main() {
    try {
        const data = await collectDailyData();
        const { todayFile, archiveFile } = saveData(data);

        console.log(`\n========================================`);
        console.log(`Collection complete!`);
        console.log(`Files: ${todayFile}, ${archiveFile}`);
        console.log(`Stats:`);
        console.log(`   Events: ${data.events.length}`);
        console.log(`   Births: ${data.births.length}`);
        console.log(`   Deaths: ${data.deaths.length}`);
        console.log(`   Social Posts: ${data.socialPosts.length}`);
        console.log(`   News: ${data.news.length}`);
        console.log(`   Sources: ${data.stats.he} HE + ${data.stats.en} EN`);
        console.log(`   Translated: ${data.stats.translated}`);
        console.log(`   Israeli events: ${data.stats.israelEvents}`);
        console.log(`   Categories: ${JSON.stringify(data.categories)}`);
        console.log(`========================================\n`);
    } catch (err) {
        console.error(`\nFatal error: ${err.message}`);
        console.error(err.stack);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}

module.exports = { collectDailyData, saveData, getTodayParts };
