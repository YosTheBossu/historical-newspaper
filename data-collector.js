// סקריפט לאיסוף אירועים היסטוריים מויקיפדיה
// מתאים ל-Node.js

const https = require('https');
const fs = require('fs');

// קבלת התאריך הנוכחי בפורמט ויקיפדיה (למשל: "פברואר_11")
function getWikipediaDate() {
    const now = new Date();
    const months = [
        'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
        'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
    ];
    const month = months[now.getMonth()];
    const day = now.getDate();
    return `${month}_${day}`;
}

// פונקציה לאחזור אירועים מויקיפדיה
function fetchHistoricalEvents(date) {
    return new Promise((resolve, reject) => {
        const url = `https://he.wikipedia.org/w/api.php?action=parse&page=${date}&prop=text&format=json`;
        
        const options = {
            headers: {
                'User-Agent': 'HistoricalNewspaperBot/1.0 (https://example.com; contact@example.com)'
            }
        };
        
        https.get(url, options, (response) => {
            let data = '';
            
            response.on('data', (chunk) => {
                data += chunk;
            });
            
            response.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    if (jsonData.parse && jsonData.parse.text) {
                        const events = parseWikipediaText(jsonData.parse.text['*']);
                        resolve(events);
                    } else {
                        resolve([]);
                    }
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

// פענוח הטקסט מויקיפדיה
function parseWikipediaText(html) {
    const events = [];
    
    // חלוקה לסעיפים (זה מאוד בסיסי - בפועל צריך parser מורכב יותר)
    const sections = html.split('<h2>');
    
    sections.forEach(section => {
        if (section.includes('אירועים היסטוריים') || section.includes('אירועים')) {
            // ניסיון לחלץ רשימות
            const listItems = section.match(/<li>.*?<\/li>/g);
            if (listItems) {
                listItems.forEach(item => {
                    // הסרת תגי HTML
                    const cleanText = item
                        .replace(/<[^>]*>/g, '')
                        .replace(/&#91;/g, '[')
                        .replace(/&#93;/g, ']')
                        .trim();
                    
                    if (cleanText && cleanText.length > 10) {
                        events.push(cleanText);
                    }
                });
            }
        }
    });
    
    return events.slice(0, 20); // הגבלה ל-20 אירועים
}

// פונקציה לשמירת האירועים לקובץ JSON
function saveEventsToFile(events, date) {
    const data = {
        date: new Date().toISOString().split('T')[0],
        wikipediaDate: date,
        events: events,
        count: events.length
    };
    
    fs.writeFileSync(`historical-events-${new Date().toISOString().split('T')[0]}.json`, 
        JSON.stringify(data, null, 2), 'utf8');
    
    console.log(`נשמרו ${events.length} אירועים לקובץ JSON`);
    return data;
}

// פונקציה ליצירת קטגוריות לאירועים
function categorizeEvents(events) {
    const categories = {
        politics: [],
        sports: [],
        culture: [],
        science: [],
        world: [],
        israel: [],
        other: []
    };
    
    const keywords = {
        politics: ['נבחר', 'נשיא', 'ראש ממשלה', 'ממשלה', 'בחירות', 'הסכם', 'מלחמה', 'שלום', 'כנסת', 'פרלמנט'],
        sports: ['כדורגל', 'כדורסל', 'משחק', 'אליפות', 'גביע', 'שחקן', 'קבוצה', 'ניצחון', 'תחרות'],
        culture: ['סרט', 'מוזיקה', 'ספר', 'תיאטרון', 'אמן', 'שחקן', 'במאי', 'אלבום', 'סינגל', 'תערוכה'],
        science: ['מדע', 'גילוי', 'מחקר', 'ניסוי', 'חלל', 'רפואה', 'טכנולוגיה', 'המצאה'],
        israel: ['ישראל', 'ישראלי', 'ירושלים', 'תל אביב', 'צה"ל', 'מדינת ישראל', 'העלייה'],
        world: ['ארצות הברית', 'רוסיה', 'צרפת', 'גרמניה', 'בריטניה', 'סין', 'יפן', 'עולם']
    };
    
    events.forEach(event => {
        let categorized = false;
        const eventLower = event.toLowerCase();
        
        for (const [category, words] of Object.entries(keywords)) {
            for (const word of words) {
                if (eventLower.includes(word.toLowerCase())) {
                    categories[category].push(event);
                    categorized = true;
                    break;
                }
            }
            if (categorized) break;
        }
        
        if (!categorized) {
            categories.other.push(event);
        }
    });
    
    return categories;
}

// הרצה ראשית
async function main() {
    try {
        console.log('מתחיל באיסוף אירועים היסטוריים...');
        
        const wikipediaDate = getWikipediaDate();
        console.log(`מחפש אירועים לתאריך: ${wikipediaDate}`);
        
        const events = await fetchHistoricalEvents(wikipediaDate);
        console.log(`נמצאו ${events.length} אירועים`);
        
        if (events.length > 0) {
            console.log('\nדוגמאות לאירועים:');
            events.slice(0, 5).forEach((event, i) => {
                console.log(`${i + 1}. ${event}`);
            });
            
            const categorized = categorizeEvents(events);
            console.log('\nחלוקה לקטגוריות:');
            Object.entries(categorized).forEach(([category, items]) => {
                if (items.length > 0) {
                    console.log(`  ${category}: ${items.length} אירועים`);
                }
            });
            
            const savedData = saveEventsToFile(events, wikipediaDate);
            
            // יצירת קובץ לדוגמה לשימוש באתר
            const exampleData = {
                date: new Date().toISOString().split('T')[0],
                categories: categorized
            };
            
            fs.writeFileSync('example-events.json', 
                JSON.stringify(exampleData, null, 2), 'utf8');
            
            console.log('\n✅ האירועים נשמרו בהצלחה!');
            console.log('קבצים שנוצרו:');
            console.log('1. historical-events-YYYY-MM-DD.json - כל האירועים');
            console.log('2. example-events.json - דוגמה לפורמט לאתר');
        } else {
            console.log('❌ לא נמצאו אירועים. ייתכן שיש בעיה בחיבור לויקיפדיה.');
        }
        
    } catch (error) {
        console.error('❌ שגיאה באיסוף האירועים:', error.message);
    }
}

// אם הסקריפט מופעל ישירות
if (require.main === module) {
    main();
}

module.exports = {
    getWikipediaDate,
    fetchHistoricalEvents,
    categorizeEvents,
    saveEventsToFile
};