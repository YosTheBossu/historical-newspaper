# הקמה מחדש – צעד אחר צעד (פשוט)

זה המסלול המדויק להריץ הכל על שרת חדש:

1. בדיקות מקומיות
2. פתיחת גישת SSH (אם צריך, עם סיסמה פעם אחת)
3. בדיקות Preflight לשרת
4. Deploy לקוד
5. הפעלת אוטומציה יומית (Stage 2)
6. יצירת קונטיינר Docker חדש
7. בדיקת בריאות מלאה

## פקודה אחת שעושה את כל השלבים

```bash
HOSTINGER_HOST=187.77.75.48 \
REPO_URL=https://github.com/<USERNAME>/<REPO>.git \
HOSTINGER_USERS="root yossi" \
HOSTINGER_USER=root \
SSH_PASSWORD='<SERVER_PASSWORD>' \
APP_PORT=8080 \
./scripts/step_by_step_setup.sh
```

## אם כבר יש SSH key (בלי סיסמה)

```bash
HOSTINGER_HOST=187.77.75.48 \
REPO_URL=https://github.com/<USERNAME>/<REPO>.git \
HOSTINGER_USERS="root yossi" \
APP_PORT=8080 \
./scripts/step_by_step_setup.sh
```

## אם רוצים בלי Docker כרגע

```bash
HOSTINGER_HOST=187.77.75.48 \
REPO_URL=https://github.com/<USERNAME>/<REPO>.git \
SETUP_DOCKER=0 \
./scripts/step_by_step_setup.sh
```

בסיום, אם Docker פעיל, הכתובת תהיה:

`http://187.77.75.48:8080`
