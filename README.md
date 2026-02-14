# העיתון של ההיסטוריה - אב טיפוס

## 🎯 הרעיון
אתר שמציג בכל יום "עיתון" עם כל האירועים ההיסטוריים שהתרחשו בתאריך הזה לאורך השנים.

## ✨ תכונות באב הטיפוס

### 1. **מבנה עיתון אמיתי**
- כותרת ראשית עם קטגוריה
- עמודות חדשות (2 עמודות)
- קטגוריות: פוליטיקה, ספורט, תרבות, עולם

### 2. **ציוצים היסטוריים**
- פוסטים מדומים של דמויות היסטוריות
- עיצוב בסגנון טוויטר אמיתי
- סטטיסטיקות (לייקים, ריטוויטים, תגובות)

### 3. **קטגוריות נוספות**
- ימי הולדת של סלבים
- טיימליין של אירועים היסטוריים נוספים
- תצוגה רספונסיבית

### 4. **עיצוב אותנטי**
- פונטים קלאסיים (Frank Ruhl Libre, Heebo)
- צבעי עיתון מסורתיים עם נגיעות מודרניות
- אפקט נייר ישן ברקע
- עיצוב RTL מלא

## 🚀 איך להריץ

### מקומי:
```bash
cd newspaper-prototype
python3 -m http.server 8080
```
לפתוח בדפדפן: http://localhost:8080

### באינטרנט:
להעלות את התיקייה לשרת כלשהו (Hostinger, Netlify, GitHub Pages, etc.)

## 📁 מבנה הקבצים
```
newspaper-prototype/
├── index.html          # הדף הראשי
├── style.css           # עיצוב
└── README.md           # קובץ זה
```


## ✅ פקודה אחת וזה רץ

אם אתה רוצה שאני "אעשה הכל לבד" מצד הסקריפטים — תריץ רק:

```bash
SSH_PASSWORD='<SERVER_PASSWORD>' ./scripts/run_everything_now.sh
```

מדריך קצר מאוד: `ONE_COMMAND_HE.md`.

## 🟢 הכי פשוט (ללא טכני)

אם אתה רוצה רק להתחיל בלי משתנים ובלי כאב ראש:

```bash
./scripts/quick_start_hostinger.sh
```

הסקריפט ישאל אותך רק 3 שאלות ויריץ הכל אוטומטית.

## ⚙️ התחלה מהירה לעבודה על MVP (עכשיו)

1. איסוף נתונים יומי (Wikimedia + YNET):
```bash
node data-collector.js
```

2. קובצי פלט שנוצרים:
- `daily-digest-YYYY-MM-DD.json`
- `example-events.json` (נכתב מחדש בכל הרצה)

3. הרצת האתר סטטית לצפייה:
```bash
python3 -m http.server 8080
```

4. פריסה ל-Hostinger דרך Git/SSH:
```bash
HOSTINGER_HOST=76.13.145.150 REPO_URL=https://github.com/<USERNAME>/<REPO>.git ./scripts/deploy_hostinger.sh
```
(הסקריפט ינסה root ואז yossi; פרטים מלאים ב-`DEPLOY_HOSTINGER.md`)


5. הפעלת שלב 2 (אוטומציה מלאה בשרת):
```bash
HOSTINGER_HOST=76.13.145.150 REPO_URL=https://github.com/<USERNAME>/<REPO>.git ./scripts/run_stage2_setup.sh
```


6. בדיקת סטטוס שלב 2 (פקודה אחת):
```bash
HOSTINGER_HOST=76.13.145.150 ./scripts/check_stage2_status.sh
```


7. בדיקות מוקדמות (מומלץ לפני הכל):
```bash
HOSTINGER_HOST=76.13.145.150 REPO_URL=https://github.com/<USERNAME>/<REPO>.git ./scripts/preflight_hostinger.sh
```

8. הרצה אוטומטית מלאה (שלבים 0→1→2→בדיקה):
```bash
HOSTINGER_HOST=76.13.145.150 REPO_URL=https://github.com/<USERNAME>/<REPO>.git ./scripts/continue_automatically.sh
```

## 🔮 תכונות עתידיות מתוכננות

### שלב 2:
- מסד נתונים של אירועים היסטוריים
- API לאיסוף אירועים אוטומטי
- לוח שנה לניווט בין ימים

### שלב 3:
- מערכת ניהול תוכן (CMS)
- משתמשים יכולים להוסיף אירועים
- דירוג ותגובות של קוראים

### שלב 4:
- פודקאסט יומי אוטומטי
- אינסטגרם היסטורי (פוסטים ויזואליים)
- אינטגרציה עם רשתות חברתיות

## 🎨 עיצוב
- **צבעים דומיננטיים**: אדום כהה (#8b0000), בז' (#f5f1e8), שחור (#222)
- **פונטים**: Frank Ruhl Libre לכותרות, Heebo לטקסט
- **אפקטים**: נייר משובץ, הצללות עדינות, אנימציות קלות

## 🤖 טכנולוגיות בשימוש
- HTML5, CSS3, JavaScript בסיסי
- Font Awesome לאייקונים
- Google Fonts לפונטים
- רספונסיביות מלאה

## 📊 נתונים לדוגמה באב הטיפוס
האתר מציג אירועים אמיתיים ל-11 בפברואר:
- 1949: הכנסת הראשונה מתכנסת
- 1998: מכבי ת"א מנצחת את פנאתינאיקוס
- 1985: שלום חנוך מוציא "חתונה לבנה"
- 1990: נלסון מנדלה משתחרר
- 2016: גילוי גלי כבידה

## 👥 צוות הפיתוח
- **יוסי סוריק** - יוזם הפרויקט
- **OpenClaw AI** - פיתוח ועיצוב

## 📝 הערות טכניות
- האתר עובד בכל הדפדפנים המודרניים
- תמיכה מלאה במובייל וטאבלט
- קוד נקי וקריא עם הערות בעברית
- אין תלות בספריות חיצוניות כבדות

## 🎯 מטרת האב טיפוס
להוכיח שהרעיון אפשרי טכנית ולהמחיש את החוויה למשתמש לפני פיתוח מלא.


## 💾 גיבוי VPS לפני שדרוג

להורדת גיבוי מלא למחשב המקומי:
```bash
VPS_HOST=76.13.145.150 ./scripts/backup_vps_to_local.sh
```

פירוט מלא: `BACKUP_VPS.md`.



## 🆕 התחלה מחדש על VPS חדש

פקודה אחת להקמה מאפס (כולל Bootstrap SSH key ופריסה מלאה):
```bash
HOSTINGER_HOST=187.77.75.48 REPO_URL=https://github.com/<USERNAME>/<REPO>.git HOSTINGER_USER=root SSH_PASSWORD='<SERVER_PASSWORD>' ./scripts/fresh_start_new_server.sh
```

פירוט מלא: `START_FRESH.md`.



## 🐳 Docker container חדש על השרת החדש

```bash
HOSTINGER_HOST=187.77.75.48 APP_PORT=8080 ./scripts/run_docker_setup.sh
```

מדריך קצר ופשוט בעברית: `SIMPLE_NEXT_STEP_HE.md`.



## 🧭 הקמה צעד־אחר־צעד (מומלץ)

להרצה מודרכת של כל השלבים על שרת חדש (בדיקות → deploy → אוטומציה → docker → health):
```bash
HOSTINGER_HOST=187.77.75.48 REPO_URL=https://github.com/<USERNAME>/<REPO>.git HOSTINGER_USERS="root yossi" HOSTINGER_USER=root SSH_PASSWORD='<SERVER_PASSWORD>' APP_PORT=8080 ./scripts/step_by_step_setup.sh
```

מדריך קצר: `STEP_BY_STEP_HE.md`.

