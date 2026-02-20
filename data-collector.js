// data-collector.js — Daily data pipeline
// Fetches from HE + EN Wikipedia, translates with OpenRouter/DeepSeek
// Classifies events into newspaper sections, generates social posts per article
// Runs server-side via cron — no API keys exposed to client

const https = require('https');
const fs = require('fs');

// ====== Configuration ======
const CONFIG = {
    // LLM APIs — OpenRouter (primary, free models), DeepSeek (fallback)
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
    OPENROUTER_URL: 'https://openrouter.ai/api/v1/chat/completions',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    // Data sources
    WIKI_HE: 'https://he.wikipedia.org/api/rest_v1/feed/onthisday/all',
    WIKI_EN: 'https://en.wikipedia.org/api/rest_v1/feed/onthisday/all',
    HEBCAL: 'https://www.hebcal.com/converter',
    USER_AGENT: 'HistoricalNewspaperBot/1.0 (educational project)',
    TRANSLATE_BATCH_SIZE: 7,
    MAX_EVENTS: 60,
    MAX_BIRTHS: 30,
    MAX_DEATHS: 25,
    ANCIENT_EVENT_SLOTS: 8,
    MIN_HISTORICAL_YEARS: Math.max(1, parseInt(process.env.MIN_HISTORICAL_YEARS || '25', 10) || 25)
};

// Helper: check if any LLM API key is available
function hasLLMKey() {
    return !!(CONFIG.OPENROUTER_API_KEY || CONFIG.DEEPSEEK_API_KEY);
}

// Newspaper section names in Hebrew
const SECTION_NAMES = {
    israel: 'ישראל',
    politics: 'מדיני',
    military: 'צבאי ובטחוני',
    science: 'מדע וטכנולוגיה',
    culture: 'תרבות ובידור',
    sports: 'ספורט',
    economy: 'כלכלה',
    religion: 'דת ומסורת',
    world: 'עולמי',
    general: 'כללי'
};

// Decorative source attribution by category (for newspaper look)
const SOURCE_BY_CATEGORY = {
    israel: ['ynet', 'ישראל היום', 'כאן חדשות', 'מעריב-NRG'],
    politics: ['הארץ', 'ynet', 'מעריב-NRG', 'כאן חדשות'],
    military: ['ynet', 'ישראל היום', 'כאן חדשות', 'מעריב-NRG'],
    sports: ['ספורט5', 'ONE', 'ynet', 'מאקו'],
    culture: ['מאקו', 'וואלה', 'ynet', 'הארץ'],
    economy: ['כלכליסט', 'גלובס', 'הארץ', 'ynet'],
    science: ['ynet', 'הארץ', 'מאקו', 'וואלה'],
    religion: ['כאן חדשות', 'ynet', 'מעריב-NRG', 'וואלה'],
    general: ['ynet', 'מאקו', 'וואלה', 'ישראל היום'],
    world: ['ynet', 'הארץ', 'כאן חדשות', 'מעריב-NRG']
};

const HEADLINE_WEIGHTS = {
    verifiedIsraeli: 45,
    historicalImportance: 30,
    descriptionDepth: 15,
    image: 10
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

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function getHeadlineScore(event, nowYear) {
    if (!event || !event.year) return 0;

    const ageYears = Math.max(0, nowYear - event.year);
    const verifiedIsraeliStrength = event.category === 'israel'
        ? (event.lang === 'he' && event.originalLang !== 'en' ? 1 : 0.7)
        : 0;
    const historicalImportance = clamp(ageYears / 150, 0, 1);
    const descriptionDepth = clamp(((event.extract || '').trim().length) / 280, 0, 1);
    const image = event.thumbnail ? 1 : 0;

    const score =
        (verifiedIsraeliStrength * HEADLINE_WEIGHTS.verifiedIsraeli) +
        (historicalImportance * HEADLINE_WEIGHTS.historicalImportance) +
        (descriptionDepth * HEADLINE_WEIGHTS.descriptionDepth) +
        (image * HEADLINE_WEIGHTS.image);

    return Number(score.toFixed(2));
}

// ====== HTTP Helpers ======
function httpGet(url, headers = {}, expectJson = true, redirectDepth = 0) {
    const MAX_REDIRECTS = 5;
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
                if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                    const location = res.headers.location;
                    if (!location) {
                        return reject(new Error(`HTTP ${res.statusCode} redirect without location for ${url}`));
                    }
                    if (redirectDepth >= MAX_REDIRECTS) {
                        return reject(new Error(`Too many redirects (${MAX_REDIRECTS}) for ${url}`));
                    }
                    const redirectUrl = new URL(location, url).toString();
                    return resolve(httpGet(redirectUrl, headers, expectJson, redirectDepth + 1));
                }

                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                }

                const response = {
                    body: data,
                    statusCode: res.statusCode,
                    finalUrl: url
                };

                if (expectJson) {
                    try {
                        response.body = JSON.parse(data);
                        resolve(response);
                    }
                    catch (e) { reject(new Error(`Invalid JSON from ${url}`)); }
                } else {
                    resolve(response);
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
    const response = await httpGet(url);
    return response.body;
}

async function fetchHebrewDate(year, month, day) {
    const url = `${CONFIG.HEBCAL}?cfg=json&gy=${year}&gm=${parseInt(month)}&gd=${parseInt(day)}&g2h=1`;
    const response = await httpGet(url);
    return response.body;
}

// ====== YNET RSS ======
function extractPlainText(html) {
    return (html || '')
        .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function decodeXmlEntities(text) {
    return (text || '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .trim();
}

function extractFirstMatch(text, regexList) {
    for (const regex of regexList) {
        const match = text.match(regex);
        if (match && match[1]) return match[1];
    }
    return '';
}

function extractImageFromXml(fragment) {
    const directPatterns = [
        /<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i,
        /<media:content[^>]+url=["']([^"']+)["']/i,
        /<media:thumbnail[^>]+url=["']([^"']+)["']/i,
        /<link[^>]+rel=["']enclosure["'][^>]+href=["']([^"']+)["'][^>]*type=["']image/i,
        /<link[^>]+href=["']([^"']+)["'][^>]*type=["']image\//i
    ];

    for (const pattern of directPatterns) {
        const match = fragment.match(pattern);
        if (match && match[1]) return match[1];
    }

    const mediaGroup = fragment.match(/<media:group>([\s\S]*?)<\/media:group>/i);
    if (mediaGroup) {
        const mediaGroupImage = extractImageFromXml(mediaGroup[1]);
        if (mediaGroupImage) return mediaGroupImage;
    }

    const imgInHtml = fragment.match(/<img[^>]+src=["']([^"']+)["']/i);
    return imgInHtml ? imgInHtml[1] : null;
}

function parseRssItems(xmlText) {
    const items = [];
    const telemetry = { format: 'unknown', parseFailureReason: null };

    const hasRssItems = /<item[\s>]/i.test(xmlText);
    const hasAtomEntries = /<entry[\s>]/i.test(xmlText);

    if (!hasRssItems && !hasAtomEntries) {
        telemetry.parseFailureReason = 'no_item_or_entry_nodes';
        return { items, telemetry };
    }

    if (hasRssItems) {
        telemetry.format = 'rss';
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        let match;
        while ((match = itemRegex.exec(xmlText)) !== null) {
            const xml = match[1];
            const title = extractPlainText(extractFirstMatch(xml, [/<title>([\s\S]*?)<\/title>/i]));
            const link = decodeXmlEntities(extractPlainText(extractFirstMatch(xml, [/<link>([\s\S]*?)<\/link>/i])));
            const desc = extractPlainText(extractFirstMatch(xml, [
                /<content:encoded>([\s\S]*?)<\/content:encoded>/i,
                /<description>([\s\S]*?)<\/description>/i
            ]));
            const image = extractImageFromXml(xml);

            if (title && link) {
                items.push({ title, url: link, summary: desc, source: 'unknown', image: image || null });
            }
        }
    }

    if (hasAtomEntries) {
        telemetry.format = telemetry.format === 'rss' ? 'rss+atom' : 'atom';
        const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
        let match;
        while ((match = entryRegex.exec(xmlText)) !== null) {
            const xml = match[1];
            const title = extractPlainText(extractFirstMatch(xml, [/<title[^>]*>([\s\S]*?)<\/title>/i]));

            const linkMatch = xml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)
                || xml.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*>/i);
            const link = decodeXmlEntities(linkMatch ? linkMatch[1] : '');

            const desc = extractPlainText(extractFirstMatch(xml, [
                /<content[^>]*>([\s\S]*?)<\/content>/i,
                /<summary[^>]*>([\s\S]*?)<\/summary>/i
            ]));
            const image = extractImageFromXml(xml);

            if (title && link) {
                items.push({ title, url: link, summary: desc, source: 'unknown', image: image || null });
            }
        }
    }

    if (items.length === 0 && !telemetry.parseFailureReason) {
        telemetry.parseFailureReason = 'nodes_found_but_no_valid_items';
    }

    return { items, telemetry };
}

function isProbablyHebrew(text) {
    if (!text || !text.trim()) return true;
    const letters = (text.match(/[A-Za-z\u0590-\u05FF]/g) || []).length;
    if (letters === 0) return true;
    const hebLetters = (text.match(/[\u0590-\u05FF]/g) || []).length;
    return (hebLetters / letters) >= 0.3;
}

// ====== LLM API (OpenRouter primary, DeepSeek fallback) ======
async function callLLM(systemPrompt, userPrompt, maxTokens = 4096) {
    if (!hasLLMKey()) {
        console.log('  No LLM API key set (OpenRouter or DeepSeek), skipping');
        return null;
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];

    // Try OpenRouter first (free models)
    if (CONFIG.OPENROUTER_API_KEY) {
        try {
            const result = await httpPost(CONFIG.OPENROUTER_URL, {
                model: CONFIG.OPENROUTER_MODEL,
                messages,
                temperature: 0.3,
                max_tokens: maxTokens
            }, {
                'Authorization': `Bearer ${CONFIG.OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'https://historical-newspaper.app',
                'X-Title': 'Historical Newspaper'
            });

            const content = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
            if (content) {
                // Some models wrap output in <think> tags — strip them
                const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                return cleaned || content;
            }
            console.error('  OpenRouter returned empty content');
        } catch (err) {
            console.error(`  OpenRouter failed: ${err.message}`);
        }
    }

    // Fallback to DeepSeek
    if (CONFIG.DEEPSEEK_API_KEY) {
        try {
            const result = await httpPost('https://api.deepseek.com/chat/completions', {
                model: CONFIG.DEEPSEEK_MODEL,
                messages,
                temperature: 0.3,
                max_tokens: maxTokens
            }, {
                'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`
            });

            const content = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
            if (content) return content;
            console.error('  DeepSeek returned empty content');
        } catch (err) {
            console.error(`  DeepSeek also failed: ${err.message}`);
            throw err;
        }
    }

    return null;
}

// Keep backward compat alias
const callDeepSeek = callLLM;

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

const FALLBACK_GLOSSARY = {
    war: 'מלחמה', battle: 'קרב', empire: 'אימפריה', king: 'מלך', queen: 'מלכה',
    president: 'נשיא', prime: 'ראשי', minister: 'שר', israel: 'ישראל', jerusalem: 'ירושלים',
    jews: 'יהודים', jewish: 'יהודי', independence: 'עצמאות', revolution: 'מהפכה',
    founded: 'הוקם', established: 'הוקם',
    born: 'נולד', died: 'נפטר', treaty: 'הסכם', law: 'חוק', state: 'מדינה',
    city: 'עיר', army: 'צבא', science: 'מדע', university: 'אוניברסיטה',
    olympic: 'אולימפי', football: 'כדורגל', movie: 'סרט', music: 'מוזיקה'
};

function transliterateToken(token) {
    const map = {
        a: 'א', b: 'ב', c: 'ק', d: 'ד', e: 'ה', f: 'פ', g: 'ג', h: 'ה', i: 'י', j: 'ג׳',
        k: 'ק', l: 'ל', m: 'מ', n: 'נ', o: 'ו', p: 'פ', q: 'ק', r: 'ר', s: 'ס', t: 'ט',
        u: 'ו', v: 'ו', w: 'ו', x: 'קס', y: 'י', z: 'ז'
    };
    return token
        .toLowerCase()
        .split('')
        .map(ch => map[ch] || ch)
        .join('');
}

function basicFallbackTranslate(text) {
    if (!text) return '';
    return String(text).replace(/[A-Za-z][A-Za-z'’-]*/g, (word) => {
        const key = word.toLowerCase();
        if (FALLBACK_GLOSSARY[key]) return FALLBACK_GLOSSARY[key];
        if (/^[A-Z][a-z]/.test(word) || word.length > 7) return transliterateToken(word);
        return word;
    });
}

function applyFallbackTranslation(entry) {
    entry.text = basicFallbackTranslate(entry.text);
    if (entry.extract) entry.extract = basicFallbackTranslate(entry.extract);
    entry.originalLang = 'en';
    entry.lang = 'he';
    entry.translationMode = 'fallback';
    return entry;
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
                        if (typeof t.extract === 'string' && entries[t.id].extract) {
                            entries[t.id].extract = t.extract;
                        }
                        entries[t.id].originalLang = 'en';
                        entries[t.id].lang = 'he';
                        entries[t.id].translationMode = 'deepseek';
                        count++;
                    }
                }
                // Handle partial JSON cases: translated text exists, extract missing/null
                entries.forEach((entry, idx) => {
                    if (entry.lang === 'en' && translated[idx] && typeof translated[idx].text === 'string') {
                        entry.text = translated[idx].text;
                        entry.originalLang = 'en';
                        entry.lang = 'he';
                        entry.translationMode = 'deepseek';
                        count++;
                    }
                });
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

    if (!hasLLMKey()) {
        console.log('  No LLM key available, using fallback translation for English entries');
        for (const cat of categories) {
            const enEntries = (data[cat] || []).filter(e => e.lang === 'en');
            enEntries.forEach(applyFallbackTranslation);
        }
        data.translationMode = 'fallback';
        return data;
    }

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
    if (untranslated > 0 && hasLLMKey()) {
        console.log(`  Retrying ${untranslated} untranslated entries...`);
        for (const cat of categories) {
            const stillEN = (data[cat] || []).filter(e => e.lang === 'en');
            if (stillEN.length > 0) {
                await translateBatch(stillEN);
            }
        }
    }

    // Final fallback for any entries that remained untranslated
    for (const cat of categories) {
        const stillEN = (data[cat] || []).filter(e => e.lang === 'en');
        stillEN.forEach(applyFallbackTranslation);
    }

    data.translationMode = 'deepseek';

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
function generateDeterministicSocialPosts(data) {
    const preferredEvents = [
        ...(data.events || []).filter(e => e.category === 'israel'),
        ...(data.selected || []),
        ...(data.events || []),
        ...(data.births || []).filter(e => e.category === 'israel'),
        ...(data.births || []),
        ...(data.deaths || [])
    ];

    const seenYears = new Set();
    const uniqueEvents = preferredEvents.filter(e => {
        if (!e || typeof e.year !== 'number' || !e.text) return false;
        if (seenYears.has(e.year)) return false;
        seenYears.add(e.year);
        return true;
    }).slice(0, 8);

    if (uniqueEvents.length === 0) return [];

    const postCount = Math.min(8, Math.max(6, uniqueEvents.length));
    const templates = [
        {
            platform: 'twitter',
            author: 'מערכת דברי הימים',
            handle: '@HistoryDeskIL',
            buildContent: (ev) => `בדיוק היום בשנת ${ev.year}: ${ev.text}. אם זה היה קורה היום — הייתם משתפים או רק עושים לייק? #היסטוריה_יומית`
        },
        {
            platform: 'facebook',
            author: 'הארכיון הלאומי',
            handle: '@NationalArchiveIL',
            buildContent: (ev) => `פלאשבק היסטורי: ${ev.text} (${ev.year}). כתבו בתגובות איך האירוע הזה שינה את העולם לדעתכם.`
        },
        {
            platform: 'instagram',
            author: 'כרוניקה בזמן',
            handle: '@ChronicleToday',
            buildContent: (ev) => `רגע אחד ששווה תמונה: "${ev.text}" — ${ev.year}. #OnThisDay #זיכרון_היסטורי`
        },
        {
            platform: 'twitter',
            author: 'כתב מהעבר',
            handle: '@PastReporter',
            buildContent: (ev) => `דיווח מתגלגל מ-${ev.year}: ${ev.text}. הכותרות משתנות, הדרמות נשארות. #היום_בהיסטוריה`
        }
    ];

    return uniqueEvents.slice(0, postCount).map((event, index) => {
        const template = templates[index % templates.length];
        const seed = Math.abs((event.year * 37) + (index * 101));
        return {
            author: template.author,
            handle: template.handle,
            platform: template.platform,
            content: template.buildContent(event).slice(0, 200),
            year: event.year,
            eventYear: event.year,
            likes: 500 + (seed % 14501),
            retweets: 100 + (seed % 4901),
            replies: 50 + (seed % 1951),
            source: 'template'
        };
    });
}

async function generateSocialPosts(data) {
    if (!hasLLMKey()) {
        return generateDeterministicSocialPosts(data);
    }

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
            const normalizedPosts = posts.map(post => ({
                ...post,
                source: 'ai'
            }));
            console.log(`  Generated ${normalizedPosts.length} social posts (AI)`);
            return normalizedPosts;
        }
    } catch (err) {
        console.error(`  Social post generation failed: ${err.message}`);
    }

    const fallbackPosts = generateDeterministicSocialPosts(data);
    if (fallbackPosts.length > 0) {
        console.log(`  Generated ${fallbackPosts.length} social posts (template fallback)`);
    }
    return fallbackPosts;
}

// ====== Ancient/Biblical Events Generation ======
async function generateAncientEvents(month, day) {
    if (!hasLLMKey()) return [];

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
        sections: {},
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

    // --- Step 4: Translate English entries ---
    console.log('4. Translating English content...');
    await translateAllEnglishEntries(data);

    // --- Step 5: Classify events into categories ---
    console.log('5. Classifying events into categories...');
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

    // --- Step 6: Assign decorative news sources ---
    console.log('6. Assigning news sources to events...');
    for (const cat of ['events', 'births', 'deaths', 'selected']) {
        for (const entry of (data[cat] || [])) {
            const sources = SOURCE_BY_CATEGORY[entry.category] || SOURCE_BY_CATEGORY.general;
            entry.source = sources[Math.abs(entry.year * 7) % sources.length];
        }
    }

    // --- Step 7: Generate social media posts ---
    console.log('7. Generating social media posts...');
    data.socialPosts = await generateSocialPosts(data);

    // --- Step 8: Generate ancient/biblical events ---
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

    // --- Step 9: Compute headline scores and pick best fallback by score ---
    const candidateHeadlinePool = [...(data.selected || []), ...(data.events || [])]
        .filter(e => e && !e.isAncient && e.year && (year - e.year) >= CONFIG.MIN_HISTORICAL_YEARS);

    for (const cat of ['events', 'births', 'deaths', 'selected']) {
        for (const entry of (data[cat] || [])) {
            entry.headlineScore = getHeadlineScore(entry, year);
        }
    }

    candidateHeadlinePool.sort((a, b) => (b.headlineScore || 0) - (a.headlineScore || 0));
    if (candidateHeadlinePool.length > 0) {
        data.headline = candidateHeadlinePool[0];
    }

    // --- Step 10: Organize into newspaper sections ---
    console.log('10. Organizing into newspaper sections...');
    const sections = {};
    for (const entry of data.events) {
        const sec = entry.category || 'general';
        if (!sections[sec]) sections[sec] = [];
        sections[sec].push(entry);
    }
    data.sections = sections;
    data.sectionNames = SECTION_NAMES;

    // Link social posts to events by matching year
    const socialByYear = {};
    for (const post of (data.socialPosts || [])) {
        const yr = post.eventYear || post.year;
        if (yr && !socialByYear[yr]) socialByYear[yr] = post;
    }
    for (const entry of [...data.events, ...data.births, ...data.deaths]) {
        if (socialByYear[entry.year]) {
            entry.socialPost = socialByYear[entry.year];
            delete socialByYear[entry.year]; // each post used once
        }
    }

    // --- Final stats ---
    data.stats.total = data.events.length + data.births.length + data.deaths.length;
    data.stats.translated = [...data.events, ...data.births, ...data.deaths]
        .filter(e => e.originalLang === 'en').length;
    data.stats.llmProvider = CONFIG.OPENROUTER_API_KEY ? 'OpenRouter' : (CONFIG.DEEPSEEK_API_KEY ? 'DeepSeek' : 'none');

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
    console.log(`[Diagnostics] OPENROUTER_API_KEY: ${CONFIG.OPENROUTER_API_KEY ? 'set (' + CONFIG.OPENROUTER_API_KEY.substring(0, 12) + '...)' : 'NOT SET'}`);
    console.log(`[Diagnostics] OPENROUTER_MODEL: ${CONFIG.OPENROUTER_MODEL}`);
    console.log(`[Diagnostics] DEEPSEEK_API_KEY: ${CONFIG.DEEPSEEK_API_KEY ? 'set (' + CONFIG.DEEPSEEK_API_KEY.substring(0, 8) + '...)' : 'NOT SET (fallback)'}`);
    console.log(`[Diagnostics] Primary LLM: ${CONFIG.OPENROUTER_API_KEY ? 'OpenRouter' : (CONFIG.DEEPSEEK_API_KEY ? 'DeepSeek' : 'NONE')}`);

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
        console.log(`   Sections: ${Object.keys(data.sections || {}).join(', ')}`);
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
