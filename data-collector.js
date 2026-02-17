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
    // Israeli news sources
    YNET_RSS: 'https://www.ynet.co.il/Integration/StoryRss2.xml',
    WALLA_RSS: 'https://rss.walla.co.il/feed/1',
    GOOGLE_NEWS_IL_RSS: 'https://news.google.com/rss?hl=he&gl=IL&ceid=IL:he',
    MAARIV_RSS: 'https://www.maariv.co.il/Rss/RssChad498',
    ISRAEL_HAYOM_RSS: 'https://www.israelhayom.co.il/rss.xml',
    CALCALIST_RSS: 'https://www.calcalist.co.il/GeneralRss/0,16335,L-8,00.xml',
    USER_AGENT: 'HistoricalNewspaperBot/1.0 (educational project)',
    TRANSLATE_BATCH_SIZE: 7,
    MAX_EVENTS: 60,
    MAX_BIRTHS: 30,
    MAX_DEATHS: 25,
    ANCIENT_EVENT_SLOTS: 8
};

// ====== Category Classification ======
const CATEGORY_KEYWORDS = {
    israel: {
        keywords: ['ישראל', 'ירושלים', 'תל אביב', 'תל-אביב', 'חיפה', 'צה"ל', 'צהל',
            'כנסת', 'ציונ', 'מנדט', 'גולן', 'נגב', 'גליל',
            'יהודה', 'שומרון', 'באר שבע', 'אילת', 'רמת גן', 'בני ברק', 'נתניה',
            'הגנה', 'אצ"ל', 'לח"י', 'מוסד', 'שב"כ', 'עליי',
            'israel', 'israeli', 'jerusalem', 'tel aviv', 'haifa', 'idf', 'knesset',
            'zionist', 'kibbutz', 'mossad', 'yishuv', 'aliyah', 'judea', 'samaria',
            'negev', 'galilee', 'golan', 'eilat', 'beersheba'],
        weakKeywords: ['jewish', 'hebrew', 'zion', 'palestine', 'mandate',
            'holocaust', 'שואה', 'יהוד', 'עברי', 'nazareth', 'bethlehem', 'jaffa', 'פלשתינ'],
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
    const text = ((event.text || '') + ' ' + (event.pageTitle || '')).toLowerCase();

    let bestCategory = 'general';
    let bestScore = 0;

    for (const [cat, config] of Object.entries(CATEGORY_KEYWORDS)) {
        let score = 0;
        for (const kw of config.keywords) {
            if (text.includes(kw.toLowerCase())) score += 2;
        }
        for (const kw of (config.weakKeywords || [])) {
            if (text.includes(kw.toLowerCase())) score += 1;
        }
        if (score > bestScore) {
            bestScore = score;
            bestCategory = cat;
        }
    }

    // Require minimum score of 2 for Israel (at least one strong keyword)
    if (bestCategory === 'israel' && bestScore < 2) return 'general';

    return bestCategory;
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
        const req = https.get(options, (res) => {
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
        });
        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error(`Timeout after 30s for ${url}`));
        });
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
        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error(`Timeout after 60s for ${url}`));
        });
        req.write(payload);
        req.end();
    });
}

async function httpGetWithRetry(url, headers = {}, expectJson = true, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await httpGet(url, {
                'Accept': expectJson ? 'application/json' : 'application/rss+xml, application/xml, text/xml, */*',
                ...headers
            }, expectJson);
        } catch (err) {
            console.error(`    Attempt ${attempt + 1}/${retries + 1} failed for ${url}: ${err.message}`);
            if (attempt < retries) {
                const delay = 1000 * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw err;
            }
        }
    }
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

        // Extract image from various RSS tags
        let image = null;
        const enclosure = xml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i);
        if (enclosure) image = enclosure[1];
        if (!image) {
            const mediaContent = xml.match(/<media:content[^>]+url=["']([^"']+)["']/i);
            if (mediaContent) image = mediaContent[1];
        }
        if (!image) {
            const mediaThumbnail = xml.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
            if (mediaThumbnail) image = mediaThumbnail[1];
        }
        // Try image from description HTML
        if (!image) {
            const imgInHtml = match[1].match(/<img[^>]+src=["']([^"']+)["']/i);
            if (imgInHtml) image = imgInHtml[1];
        }

        if (title && link) {
            items.push({ title, url: link, summary: desc, source: 'unknown', image: image || null });
        }
    }
    return items;
}

function isProbablyHebrew(text) {
    if (!text || !text.trim()) return true;
    const letters = (text.match(/[A-Za-z\u0590-\u05FF]/g) || []).length;
    if (letters === 0) return true;
    const hebLetters = (text.match(/[\u0590-\u05FF]/g) || []).length;
    return (hebLetters / letters) >= 0.3;
}

// ====== DeepSeek API ======
async function callDeepSeek(systemPrompt, userPrompt, maxTokens = 4096) {
    if (!CONFIG.DEEPSEEK_API_KEY) {
        console.log('  DeepSeek API key not set, skipping');
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

    try {
        const result = await httpPost('https://api.deepseek.com/chat/completions', body, {
            'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`
        });

        const content = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
        if (!content) {
            console.error('  DeepSeek returned empty content. Response keys:', Object.keys(result || {}));
        }
        return content || null;
    } catch (err) {
        console.error(`  DeepSeek API call failed: ${err.message}`);
        throw err;
    }
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

    // Build lines: both title (T) and extract/description (E)
    const lines = [];
    entries.forEach((e, i) => {
        lines.push(`${i}T. ${e.text}`);
        if (e.extract) {
            const truncExtract = e.extract.length > 300 ? e.extract.substring(0, 300) + '...' : e.extract;
            lines.push(`${i}E. ${truncExtract}`);
        }
    });
    const textsToTranslate = lines.join('\n');

    const systemPrompt = `You are a professional Hebrew translator specializing in historical content.
Translate each numbered line from English to Hebrew.
Lines marked "T" are titles. Lines marked "E" are descriptions.
Rules:
- Use formal newspaper Hebrew style
- Transliterate proper nouns to Hebrew (e.g., "Abraham Lincoln" → "אברהם לינקולן")
- Keep year numbers as-is
- Be concise but accurate
- Return ONLY a valid JSON array: [{"id": 0, "text": "Hebrew title translation", "extract": "Hebrew description translation or null if no E line"}, ...]`;

    const userPrompt = `Translate these ${entries.length} historical entries to Hebrew:\n${textsToTranslate}`;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await callDeepSeek(systemPrompt, userPrompt);
            const translated = extractJsonFromResponse(response);

            if (Array.isArray(translated)) {
                let count = 0;
                for (const t of translated) {
                    if (typeof t.id === 'number' && t.text && entries[t.id]) {
                        entries[t.id].text = t.text;
                        if (t.extract && entries[t.id].extract) {
                            entries[t.id].extract = t.extract;
                        }
                        entries[t.id].originalLang = 'en';
                        entries[t.id].lang = 'he';
                        count++;
                    }
                }
                console.log(`    Translated ${count}/${entries.length} entries (with extracts)`);
                return entries;
            } else {
                console.log(`    Could not parse translation response (attempt ${attempt + 1})`);
            }
        } catch (err) {
            console.error(`    Translation batch failed (attempt ${attempt + 1}): ${err.message}`);
        }
        // Short delay before retry
        if (attempt < 1) await new Promise(r => setTimeout(r, 2000));
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

async function translateNewsSummaries(newsItems) {
    if (!Array.isArray(newsItems) || newsItems.length === 0) return newsItems;

    const candidates = newsItems
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => !isProbablyHebrew(`${item.title || ''} ${item.summary || ''}`));

    if (candidates.length === 0) {
        console.log('  News translation: all items already in Hebrew');
        return newsItems;
    }

    if (!CONFIG.DEEPSEEK_API_KEY) {
        console.log(`  News translation: skipped ${candidates.length} non-Hebrew items (no API key)`);
        return newsItems;
    }

    const compactSummary = (txt) => {
        if (!txt) return '';
        return txt.length > 350 ? txt.substring(0, 350) + '...' : txt;
    };

    const lines = candidates.map(({ item, idx }) => ({
        id: idx,
        title: item.title || '',
        summary: compactSummary(item.summary || '')
    }));

    const systemPrompt = `You are a professional Hebrew news translator.
Translate each item title and summary into natural Hebrew suitable for an Israeli news digest.
Return ONLY valid JSON in this exact format:
[{"id":0,"title":"...","summary":"..."}]
Rules:
- Keep factual meaning and tone
- Transliterate names to accepted Hebrew forms
- Keep numbers and dates accurate
- If summary is empty, return an empty string`;

    const userPrompt = `Translate these news items to Hebrew:\n${JSON.stringify(lines)}`;

    try {
        const response = await callDeepSeek(systemPrompt, userPrompt);
        const translated = extractJsonFromResponse(response);
        if (!Array.isArray(translated)) {
            console.log('  News translation: invalid response format');
            return newsItems;
        }

        let updated = 0;
        for (const t of translated) {
            if (typeof t.id !== 'number') continue;
            const target = newsItems[t.id];
            if (!target) continue;

            target.originalTitle = target.title || '';
            target.originalSummary = target.summary || '';
            target.translatedTitle = (t.title || '').trim() || target.title || '';
            target.translatedSummary = (t.summary || '').trim() || target.summary || '';
            target.title = target.translatedTitle;
            target.summary = target.translatedSummary;
            target.lang = 'he';
            updated++;
        }
        console.log(`  News translation: translated ${updated}/${candidates.length} non-Hebrew items`);
    } catch (err) {
        console.error(`  News translation failed: ${err.message}`);
    }

    return newsItems;
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
    }).slice(0, 10);

    if (uniqueSources.length === 0) return [];

    const eventsText = uniqueSources.map(e => `${e.year}: ${e.text}`).join('\n');

    const systemPrompt = `You are a creative Hebrew social media content writer for a historical newspaper.
Create engaging social media posts as if historical figures were posting on modern platforms.
Each post MUST be tied to a specific event year from the list.
All content MUST be in Hebrew.
Return ONLY a valid JSON array.`;

    const userPrompt = `Based on these historical events that happened on this day:

${eventsText}

Create exactly 8 social media posts. Each post should be from the perspective of a relevant historical figure.
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

// ====== Ancient/Biblical Events Generation ======
async function generateAncientEvents(month, day) {
    if (!CONFIG.DEEPSEEK_API_KEY) return [];

    const systemPrompt = `אתה היסטוריון מומחה בהיסטוריה עתיקה, תנ"כית ויהודית.
צור אירועים היסטוריים שהתרחשו או מיוחסים מסורתית לתאריך הנתון.
הכל חייב להיות בעברית. החזר רק מערך JSON תקין.`;

    const userPrompt = `צור 5-8 אירועים היסטוריים עתיקים עבור ${day}/${month} (או תאריכים מסורתיים קרובים):

כלול מגוון תקופות:
- אירועים תנ"כיים (תורה, נביאים, כתובים) - למשל: יציאת מצרים, מתן תורה, חורבן בית המקדש
- תקופת בית ראשון ושני - מלכי ישראל, חשמונאים, הורדוס
- תקופת המשנה והתלמוד - תנאים, אמוראים
- אירועים מהעולם העתיק הקשורים לעם ישראל
- אירועים מימי הביניים - קהילות יהודיות, רמב"ם, גירוש ספרד

החזר מערך JSON:
[{"year": -1000, "text": "תיאור קצר בעברית", "category": "israel"}]

השתמש בשנים שליליות עבור לפנה"ס (למשל: -586 לחורבן בית ראשון).
ציין "(מסורת)" כשתאריך אינו מדויק היסטורית.`;

    try {
        const response = await callDeepSeek(systemPrompt, userPrompt, 2048);
        const events = extractJsonFromResponse(response);
        if (Array.isArray(events) && events.length > 0) {
            console.log(`  Generated ${events.length} ancient events`);
            return events.map(e => ({
                year: e.year || 0,
                text: e.text || '',
                lang: 'he',
                category: e.category || 'israel',
                isAncient: true,
                thumbnail: null,
                pageTitle: '',
                extract: null
            }));
        }
    } catch (err) {
        console.error(`  Ancient events generation failed: ${err.message}`);
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
            const raw = heData[cat];
            const arr = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
            const items = arr.filter(e => e && typeof e === 'object' && e.text).map(e => processWikiEntry(e, 'he'));
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
            const raw = enData[cat];
            const arr = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
            const existingYears = new Set(data[cat].map(e => e.year));
            const newItems = arr
                .filter(e => e && typeof e === 'object' && e.text && !existingYears.has(e.year))
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

    // --- Step 4: Fetch Israeli News (with retries and fallbacks) ---
    console.log('4. Fetching Israeli news...');
    const newsSourceConfigs = [
        { name: 'YNET',         url: CONFIG.YNET_RSS,           source: 'ynet',        max: 10 },
        { name: 'Walla',        url: CONFIG.WALLA_RSS,          source: 'וואלה',       max: 5  },
        { name: 'Google News',  url: CONFIG.GOOGLE_NEWS_IL_RSS, source: 'Google News',  max: 5  },
        { name: 'Maariv',       url: CONFIG.MAARIV_RSS,         source: 'מעריב',       max: 4  },
        { name: 'Israel Hayom', url: CONFIG.ISRAEL_HAYOM_RSS,   source: 'ישראל היום',  max: 4  },
        { name: 'Calcalist',    url: CONFIG.CALCALIST_RSS,      source: 'כלכליסט',     max: 3  },
    ];

    let successfulSources = 0;
    for (const src of newsSourceConfigs) {
        try {
            const xml = await httpGetWithRetry(src.url, {}, false, 2);
            const items = parseRssItems(xml)
                .map(item => ({ ...item, source: src.source }))
                .slice(0, src.max);
            if (items.length > 0) {
                data.news.push(...items);
                successfulSources++;
                console.log(`  ${src.name}: ${items.length} articles`);
            } else {
                console.log(`  ${src.name}: 0 articles (empty feed)`);
            }
        } catch (err) {
            console.error(`  ${src.name} failed: ${err.message}`);
        }
    }
    console.log(`  Total news: ${data.news.length} from ${successfulSources} sources`);

    console.log('4.1 Translating non-Hebrew news titles/summaries...');
    await translateNewsSummaries(data.news);

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
    // Separate ancient events to ensure they get reserved slots
    const modernEvents = data.events.filter(e => !e.isAncient);
    const ancientEvts = data.events.filter(e => e.isAncient);

    modernEvents.sort((a, b) => {
        if (a.category === 'israel' && b.category !== 'israel') return -1;
        if (a.category !== 'israel' && b.category === 'israel') return 1;
        return b.year - a.year;
    });
    ancientEvts.sort((a, b) => a.year - b.year); // oldest first for ancient

    data.events = [
        ...modernEvents.slice(0, CONFIG.MAX_EVENTS - CONFIG.ANCIENT_EVENT_SLOTS),
        ...ancientEvts.slice(0, CONFIG.ANCIENT_EVENT_SLOTS)
    ];

    data.births.sort((a, b) => {
        if (a.category === 'israel' && b.category !== 'israel') return -1;
        if (a.category !== 'israel' && b.category === 'israel') return 1;
        return b.year - a.year;
    });
    data.deaths.sort((a, b) => b.year - a.year);

    data.births = data.births.slice(0, CONFIG.MAX_BIRTHS);
    data.deaths = data.deaths.slice(0, CONFIG.MAX_DEATHS);

    // --- Step 7: Generate social media posts with DeepSeek ---
    console.log('7. Generating social media posts with DeepSeek...');
    data.socialPosts = await generateSocialPosts(data);

    // --- Step 8: Generate ancient/biblical events with DeepSeek ---
    console.log('8. Generating ancient/biblical events...');
    const ancientGenerated = await generateAncientEvents(month, day);
    if (ancientGenerated.length > 0) {
        data.ancientEvents = ancientGenerated;
        // Also add to main events if slots available
        const currentAncient = data.events.filter(e => e.isAncient).length;
        const slotsLeft = CONFIG.ANCIENT_EVENT_SLOTS - currentAncient;
        if (slotsLeft > 0) {
            data.events.push(...ancientGenerated.slice(0, slotsLeft));
        }
    }

    // --- Step 9: Mark Israeli headline ---
    // Prefer natively Hebrew Israeli events (more likely truly Israeli)
    const israelHeadlineNative = data.events.find(e =>
        e.category === 'israel' && e.lang === 'he' && !e.isAncient && e.originalLang !== 'en'
    );
    const israelHeadlineAny = data.events.find(e =>
        e.category === 'israel' && e.lang === 'he' && !e.isAncient
    );
    if (israelHeadlineNative) {
        data.headline = israelHeadlineNative;
    } else if (israelHeadlineAny) {
        data.headline = israelHeadlineAny;
    }

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
    console.log(`[Diagnostics] DEEPSEEK_API_KEY: ${CONFIG.DEEPSEEK_API_KEY ? 'set (' + CONFIG.DEEPSEEK_API_KEY.substring(0, 8) + '...)' : 'NOT SET'}`);
    console.log(`[Diagnostics] DEEPSEEK_MODEL: ${CONFIG.DEEPSEEK_MODEL}`);
    console.log(`[Diagnostics] API URL: https://api.deepseek.com/chat/completions`);

    // Safety net: kill the process if collection takes longer than 5 minutes
    const globalTimeout = setTimeout(() => {
        console.error('Global timeout: collection exceeded 5 minutes, exiting');
        process.exit(1);
    }, 300000);
    globalTimeout.unref();

    try {
        const data = await collectDailyData();
        clearTimeout(globalTimeout);
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
        console.log(`   Ancient events: ${(data.ancientEvents || []).length}`);
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
