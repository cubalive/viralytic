@echo off
REM Tarea diaria autónoma: genera + publica 5 videos por canal (los 4 motores).
cd /d C:\Users\alain\kids-music-studio
echo ===== %DATE% %TIME% ===== >> data\output\_admin_daily.log
call npx tsx scripts/admin.ts all 5 >> data\output\_admin_daily.log 2>&1
echo ===== FIN %DATE% %TIME% ===== >> data\output\_admin_daily.log
