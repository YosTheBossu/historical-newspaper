// סקריפט איסוף MVP: Wikimedia "On This Day" + YNET RSS
// מתאים ל-Node.js ללא תלויות חיצוניות

const https = require('https');
const fs = require('fs');

function httpGetJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            return reject(new Error(`HTTP ${response.statusCode} עבור ${url}`));
          }

          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error(`JSON לא תקין מ-${url}: ${error.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

function httpGetText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            return reject(new Error(`HTTP ${response.statusCode} עבור ${url}`));
          }
          resolve(data);
        });
      })
      .on('error', reject);
  });
}

function toTwoDigits(num) {
  return String(num).padStart(2, '0');
}

function getTodayParts(date = new Date()) {
  return {
    isoDate: date.toISOString().slice(0, 10),
    month: toTwoDigits(date.getMonth() + 1),
    day: toTwoDigits(date.getDate())
  };
}

function extractPlainTextFromHtml(value = '') {
  return value
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
    const itemXml = match[1];
    const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
    const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/i);

    const title = extractPlainTextFromHtml(titleMatch ? titleMatch[1] : '');
    const url = extractPlainTextFromHtml(linkMatch ? linkMatch[1] : '');
    const summary = extractPlainTextFromHtml(descMatch ? descMatch[1] : '');

    if (!title || !url) {
      continue;
    }

    items.push({
      source: 'ynet',
      section: 'news',
      title,
      url,
      summary,
      publishedAtRaw: pubDateMatch ? extractPlainTextFromHtml(pubDateMatch[1]) : null
    });
  }

  return items;
}

async function fetchWikimediaOnThisDay({ month, day }) {
  const url = `https://he.wikipedia.org/api/rest_v1/feed/onthisday/all/${month}/${day}`;
  const data = await httpGetJson(url, {
    'User-Agent': 'HistoricalNewspaperBot/1.0 (contact: support@example.com)'
  });

  const groups = ['selected', 'events', 'births', 'deaths', 'holidays'];
  const items = [];

  groups.forEach((group) => {
    (data[group] || []).forEach((entry) => {
      items.push({
        source: 'wikimedia',
        section: 'history',
        category: group,
        year: entry.year || null,
        title: entry.text || '',
        url: entry.pages?.[0]?.content_urls?.desktop?.page || null,
        summary: entry.pages?.[0]?.extract || null
      });
    });
  });

  return items;
}

async function fetchYnetFeed() {
  const feedUrl = 'https://www.ynet.co.il/Integration/StoryRss2.xml';
  const xml = await httpGetText(feedUrl, {
    'User-Agent': 'HistoricalNewspaperBot/1.0 (contact: support@example.com)'
  });
  return parseRssItems(xml);
}

function buildDigest({ isoDate, historyItems, ynetItems }) {
  return {
    date: isoDate,
    generatedAt: new Date().toISOString(),
    stats: {
      historyItems: historyItems.length,
      ynetItems: ynetItems.length,
      total: historyItems.length + ynetItems.length
    },
    history: historyItems,
    currentNews: ynetItems
  };
}

function saveDigest(digest) {
  const target = `daily-digest-${digest.date}.json`;
  fs.writeFileSync(target, JSON.stringify(digest, null, 2), 'utf8');
  fs.writeFileSync('example-events.json', JSON.stringify(digest, null, 2), 'utf8');
  return target;
}

async function main() {
  const { isoDate, month, day } = getTodayParts();
  console.log(`מתחיל איסוף ל-${isoDate}...`);

  let historyItems = [];
  let ynetItems = [];

  try {
    historyItems = await fetchWikimediaOnThisDay({ month, day });
    console.log(`✅ Wikimedia: ${historyItems.length} פריטים`);
  } catch (error) {
    console.error(`⚠️ Wikimedia נכשל: ${error?.message || String(error)}`);
  }

  try {
    ynetItems = await fetchYnetFeed();
    console.log(`✅ YNET RSS: ${ynetItems.length} פריטים`);
  } catch (error) {
    console.error(`⚠️ YNET נכשל: ${error?.message || String(error)}`);
  }

  const digest = buildDigest({ isoDate, historyItems, ynetItems });
  const filename = saveDigest(digest);

  console.log(`\nנשמר קובץ: ${filename}`);
  console.log(`סה"כ פריטים: ${digest.stats.total}`);

  if (digest.stats.total === 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getTodayParts,
  parseRssItems,
  fetchWikimediaOnThisDay,
  fetchYnetFeed,
  buildDigest,
  saveDigest
};
