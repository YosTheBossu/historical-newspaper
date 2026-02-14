# התחלה מחדש על שרת חדש (VPS חדש)

אם השרת הישן נמחק ורוצים הקמה מאפס — זה המסלול הפשוט.

## פקודה אחת (עם סיסמה חד-פעמית)

```bash
HOSTINGER_HOST=187.77.75.48 \
REPO_URL=https://github.com/<USERNAME>/<REPO>.git \
HOSTINGER_USER=root \
SSH_PASSWORD='<SERVER_PASSWORD>' \
BRANCH=main \
./scripts/fresh_start_new_server.sh
```

מה הפקודה עושה:
1. מגדירה `origin` ל-GitHub.
2. מתקינה מפתח SSH בשרת (חד-פעמי) דרך הסיסמה.
3. מריצה אוטומטית: preflight → deploy → stage2 → health-check.

## אם כבר יש SSH key

```bash
HOSTINGER_HOST=187.77.75.48 \
REPO_URL=https://github.com/<USERNAME>/<REPO>.git \
HOSTINGER_USER=root \
BRANCH=main \
./scripts/fresh_start_new_server.sh
```

## אבטחה
- אחרי Bootstrap מומלץ להחליף סיסמת root.
- עדיף לעבור להתחברות עם SSH key בלבד.


## קונטיינר Docker חדש (נדרש בשרת החדש)

כברירת מחדל `fresh_start_new_server.sh` מקים קונטיינר חדש אוטומטית.

פורט ברירת מחדל: `8080` (אפשר לשנות עם `APP_PORT`).

```bash
HOSTINGER_HOST=187.77.75.48 \
REPO_URL=https://github.com/<USERNAME>/<REPO>.git \
HOSTINGER_USER=root \
SSH_PASSWORD='<SERVER_PASSWORD>' \
APP_PORT=8080 \
./scripts/fresh_start_new_server.sh
```
