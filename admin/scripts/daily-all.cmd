@echo off
REM Tarea diaria autónoma: genera + publica 6 videos por canal (faceless + SabiKids).
REM Modo DIARIO (no LAUNCH): reparte en las franjas de Miami 6,9,12,15,18,21 vía
REM publishAt + cursor por canal. Robusto a la hora en que corra la máquina.
cd /d C:\Users\alain\Desktop\viralytic\admin
echo ===== %DATE% %TIME% ===== >> data\output\_admin_daily.log
call npx tsx scripts/admin.ts all 6 >> data\output\_admin_daily.log 2>&1
REM Puente de métricas: refresca vistas/likes de todos los canales en Supabase.
call npx tsx scripts/collect-stats.ts >> data\output\_admin_daily.log 2>&1
echo ===== FIN %DATE% %TIME% ===== >> data\output\_admin_daily.log
