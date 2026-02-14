# איך מחברים ומקימים קונטיינר חדש (פשוט)

זה מה שצריך לעשות, בלי להסתבך:

1. פותחים טרמינל במחשב שבו נמצא הפרויקט.
2. מריצים פקודה אחת שמבצעת הקמה מחדש לשרת החדש.
3. אחרי שזה מסתיים, מריצים פקודה אחת שמרימה קונטיינר חדש.
4. פותחים את הכתובת של השרת בדפדפן ורואים שהאתר עלה.

אם משהו נופל בדרך, מריצים את בדיקת הבריאות והיא תגיד בדיוק מה חסר.

## פקודות מוכנות (Copy/Paste)

הקמה מחדש לשרת החדש:

```bash
HOSTINGER_HOST=187.77.75.48 REPO_URL=https://github.com/<USERNAME>/<REPO>.git HOSTINGER_USER=root SSH_PASSWORD='<SERVER_PASSWORD>' ./scripts/fresh_start_new_server.sh
```

הרמת קונטיינר חדש בדוקר:

```bash
HOSTINGER_HOST=187.77.75.48 HOSTINGER_USERS="root yossi" APP_PORT=8080 ./scripts/run_docker_setup.sh
```

בדיקת סטטוס:

```bash
HOSTINGER_HOST=187.77.75.48 ./scripts/check_stage2_status.sh
```

זהו. אחרי זה האתר אמור להיות באוויר.
