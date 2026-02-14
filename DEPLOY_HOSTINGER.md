# פריסה ל־Hostinger מה־Git (מדריך מהיר)

המטרה: לדחוף את הפרויקט מה־GitHub לשרת Hostinger בצורה יציבה וחוזרת.

## מה זוהה כרגע
- לריפו המקומי כרגע **אין remote** מוגדר (`origin`) בסביבה הזו.
- לפי צילום המסך: השרת הוא `76.13.145.150` ושם משתמש SSH מוגדר `root`.
- הסקריפט תומך fallback אוטומטי גם ל-`yossi` אם `root` לא עובד.

## שלב 0 — בדיקות מוקדמות (מומלץ)

```bash
HOSTINGER_HOST=76.13.145.150 REPO_URL=https://github.com/<USERNAME>/<REPO>.git HOSTINGER_USERS="root yossi" REMOTE_APP_DIR=/var/www/historical-newspaper ./scripts/preflight_hostinger.sh
```

הבדיקות כוללות:
- `origin` קיים בריפו המקומי
- SSH נגיש (`root` ואז `yossi`)
- בשרת קיימים: `git`, `node`, `crontab`
- הרשאות כתיבה לנתיב הפרויקט

## שלב 1 — חיבור הפרויקט ל־GitHub

```bash
git remote add origin https://github.com/<USERNAME>/<REPO>.git
git branch -M main
git push -u origin main
```

אימות:

```bash
git remote -v
```

## שלב 2 — פריסה לשרת Hostinger (VPS/SSH)

השתמש בסקריפט המצורף:

```bash
HOSTINGER_HOST=76.13.145.150 \
REPO_URL=https://github.com/<USERNAME>/<REPO>.git \
HOSTINGER_USERS="root yossi" \
REMOTE_APP_DIR=/var/www/historical-newspaper \
BRANCH=main \
./scripts/deploy_hostinger.sh
```

מה הסקריפט עושה:
1. דוחף את הקוד המקומי ל־GitHub.
2. מנסה להתחבר ב-SSH לפי הסדר `root` ואז `yossi` (או `HOSTINGER_USER` אם הוגדר).
3. עושה `git clone` בפעם הראשונה / `git fetch + reset --hard` בעדכונים.


## שלב 2 — אוטומציה מלאה על השרת (pull + collector יומי)

הרצה מקומית (תתחבר אוטומטית ב-SSH ל-root/yossi ותגדיר cron):

```bash
HOSTINGER_HOST=76.13.145.150 REPO_URL=https://github.com/<USERNAME>/<REPO>.git HOSTINGER_USERS="root yossi" REMOTE_APP_DIR=/var/www/historical-newspaper BRANCH=main ./scripts/run_stage2_setup.sh
```

מה יוגדר אוטומטית:
1. `auto_pull.sh` — עדכון קוד אוטומטי כל 10 דקות.
2. `run_daily_collector.sh` — הרצת `node data-collector.js` כל יום ב-02:00.
3. לוגים בנתיב: `/var/log/historical-newspaper`.

ניתן לשנות תזמונים דרך משתני סביבה:
- `SCHEDULE_PULL` (ברירת מחדל: `*/10 * * * *`)
- `SCHEDULE_COLLECTOR` (ברירת מחדל: `0 2 * * *`)


## בדיקת סטטוס (אחרי שלב 2)

```bash
HOSTINGER_HOST=76.13.145.150 HOSTINGER_USERS="root yossi" REMOTE_APP_DIR=/var/www/historical-newspaper ./scripts/check_stage2_status.sh
```

הסקריפט בודק:
- חיבור SSH
- קיום הריפו בשרת + commit אחרון
- קיום סקריפטי `auto_pull.sh` ו-`run_daily_collector.sh`
- נוכחות cron לשני הסקריפטים
- tail ללוגים (`auto-pull.log`, `collector.log`)


## מצב "תמשיך אוטומטית" (פקודה אחת)

```bash
HOSTINGER_HOST=76.13.145.150 REPO_URL=https://github.com/<USERNAME>/<REPO>.git HOSTINGER_USERS="root yossi" REMOTE_APP_DIR=/var/www/historical-newspaper BRANCH=main ./scripts/continue_automatically.sh
```

הפקודה מריצה ברצף:
1. `preflight_hostinger.sh`
2. `deploy_hostinger.sh`
3. `run_stage2_setup.sh`
4. `check_stage2_status.sh`

## שלב 3 — הגשת האתר

### Nginx (דוגמה)
הגדרת root:

- `root /var/www/historical-newspaper;`
- `index index.html;`

ואז:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## אם אתה ב־Shared Hosting (ללא SSH מלא)
- היכנס ל־hPanel → Git deployment.
- חבר ריפו GitHub + branch `main`.
- הגדר target לתיקייה הציבורית (לרוב `public_html`).
- Deploy אחרי כל push.

## הערת אבטחה חשובה
- לא לשמור סיסמאות/טוקנים בקבצי Git.
- להשתמש במשתני סביבה / SSH keys.
- לבצע Rotate לטוקנים/סיסמאות ששותפו בצ׳אט.
