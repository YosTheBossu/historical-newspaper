# גיבוי מלא ל-VPS (הורדה למחשב המקומי)

קובץ זה נותן דרך מהירה לקחת גיבוי מלא מהשרת ישירות למחשב שלך.

## פקודה מהירה

```bash
VPS_HOST=76.13.145.150 ./scripts/backup_vps_to_local.sh
```

הסקריפט:
1. מנסה להתחבר לפי סדר משתמשים `root` ואז `yossi`.
2. דוחס על השרת עם `zstd`.
3. מזרים ישירות לקובץ מקומי (`vps-full-backup-YYYY-MM-DD.tar.zst`).
4. בודק תקינות (`zstd -t`) אם הכלי מותקן.

## התאמות חשובות

```bash
VPS_HOST=76.13.145.150 \
VPS_USERS="root yossi" \
BACKUP_NAME=my-vps-backup.tar.zst \
COMPRESS_LEVEL=1 \
./scripts/backup_vps_to_local.sh
```

- `COMPRESS_LEVEL=1` = הכי מהיר (פחות דחיסה).
- ברירת מחדל מדלגת על נתיבי מערכת זמניים כמו `/proc`, `/sys`, `/dev`, `/run`, `/tmp`.

## גיבוי מסד נתונים (מומלץ בנוסף)

### PostgreSQL
```bash
ssh root@76.13.145.150 "sudo -u postgres pg_dumpall | zstd -T0 -1" > postgres-all-$(date +%F).sql.zst
```

### MySQL/MariaDB
```bash
ssh root@76.13.145.150 "mysqldump --all-databases --single-transaction --quick | zstd -T0 -1" > mysql-all-$(date +%F).sql.zst
```
