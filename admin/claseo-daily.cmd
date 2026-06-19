@echo off
REM ClaseoShow — diario: genera 5 videos (rota subtemas) + los programa en franjas de Miami (5/dia).
cd /d C:\Users\alain\Desktop\viralytic\admin
for /f "tokens=1,* delims==" %%a in ('findstr /b "OPENAI_API_KEY=" .env') do set OPENAI_API_KEY=%%b
echo ===== %date% %time% ===== >> data\output\claseo\daily.log
npx tsx scripts/gen-claseo.ts 5 >> data\output\claseo\daily.log 2>&1
npx tsx scripts/claseo-publish.ts 5 >> data\output\claseo\daily.log 2>&1
