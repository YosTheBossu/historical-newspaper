// מערכת תאריכים לעיתון היומי
class DailyNewspaperSystem {
    constructor() {
        this.today = new Date();
        this.hebrewDate = this.getHebrewDate();
        this.historicalEvents = [];
    }

    // קבלת תאריך עברי (פישוט - בפועל נשתמש בספרייה)
    getHebrewDate() {
        const today = this.today;
        const hebrewMonths = ['תשרי', 'חשוון', 'כסלו', 'טבת', 'שבט', 'אדר', 'ניסן', 'אייר', 'סיוון', 'תמוז', 'אב', 'אלול'];
        const day = today.getDate();
        const month = hebrewMonths[today.getMonth()];
        const year = 5786; // תשפ"ו - צריך חישוב מדויק
        
        return {
            day: day,
            month: month,
            year: year,
            formatted: `${day} ב${month} תשפ"ו`
        };
    }

    // פורמט תאריך לעיתון
    getNewspaperDate() {
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            timeZone: 'Asia/Jerusalem'
        };
        
        const gregorian = this.today.toLocaleDateString('he-IL', options);
        const hebrew = this.hebrewDate.formatted;
        
        return {
            gregorian: gregorian,
            hebrew: hebrew,
            display: `${gregorian} | ${hebrew}`
        };
    }

    // יצירת מזהה יומי
    getDailyId() {
        const year = this.today.getFullYear();
        const month = String(this.today.getMonth() + 1).padStart(2, '0');
        const day = String(this.today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // בדיקה אם זה עיתון חדש (להחלפה יומית)
    isNewDay(previousDate) {
        const todayId = this.getDailyId();
        return todayId !== previousDate;
    }

    // קבלת אירועים היסטוריים לתאריך הזה (יפותח בהמשך)
    async fetchHistoricalEvents() {
        // כאן יתחבר ל-API או קובץ נתונים
        const day = this.today.getDate();
        const month = this.today.getMonth() + 1;
        
        // דוגמה - בפועל זה יגיע ממקור נתונים
        return [
            {
                year: 1949,
                title: "הכנסת הראשונה מתכנסת",
                category: "פוליטיקה",
                description: "הכנסת הראשונה של מדינת ישראל מתכנסת לישיבתה הראשונה בירושלים.",
                importance: "high"
            },
            {
                year: 1998,
                title: "מכבי תל אביב מנצחת את פנאתינאיקוס",
                category: "ספורט",
                description: "ניצחון דרמטי של מכבי תל אביב על פנאתינאיקוס היוונית ביורוליג.",
                importance: "medium"
            }
        ];
    }

    // יצירת כותרת עיתון יומית
    generateDailyHeadline(events) {
        if (events.length === 0) return "היום בהיסטוריה";
        
        const mainEvent = events.find(e => e.importance === "high") || events[0];
        return `היום לפני ${new Date().getFullYear() - mainEvent.year} שנים: ${mainEvent.title}`;
    }
}

// יצוא לשימוש באתר
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DailyNewspaperSystem;
} else {
    window.DailyNewspaperSystem = DailyNewspaperSystem;
}