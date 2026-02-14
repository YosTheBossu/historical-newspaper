# מה עושים עכשיו (בלי להבין קוד)

פשוט להריץ פקודה אחת מתוך תיקיית הפרויקט:

```bash
SSH_PASSWORD='YOUR_SERVER_PASSWORD' ./scripts/run_everything_now.sh
```

זהו. הסקריפט יעשה לבד:
1. חיבור SSH
2. פריסה לשרת
3. אוטומציה יומית
4. קונטיינר Docker חדש
5. בדיקת תקינות

אם אין צורך בסיסמה (כי SSH key כבר מוגדר), תריץ:

```bash
./scripts/run_everything_now.sh
```
