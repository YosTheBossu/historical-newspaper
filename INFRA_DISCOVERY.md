# זיהוי GitHub + Hostinger (ללא ידע בקוד)

הכנתי עבורך סקריפט שמזהה אוטומטית:
- חשבון GitHub ורשימת ריפוזיטוריז (כולל התאמות לשמות כמו history/newspaper)
- מידע זמין מ-Hostinger API (domains/websites/hosting)

## איך מריצים

```bash
GITHUB_TOKEN='<your_github_token>' \
HOSTINGER_API_TOKEN='<your_hostinger_api_token>' \
./scripts/discover_infra.sh
```

בסוף ההרצה ייווצר קובץ:
`infra-discovery-YYYYMMDD-HHMMSS.txt`

זה הקובץ שממנו אני יכול להגיד לך בדיוק:
1. מה ה-GitHub של הפרויקט
2. איפה הוא מאוחסן בהוסטינגר
3. מה חסר כדי להשלים חיבור מלא ופריסה אוטומטית

## אבטחה
- אל תשמור טוקנים בתוך קבצי קוד.
- מומלץ לסובב (rotate) כל טוקן/סיסמה ששיתפת בצ'אט.
