@echo off
REM Motor automatico getvirality — corre diario (respeta el toggle en data/youtube/cron.json)
cd /d C:\Users\alain\Desktop\viralytic\admin
python py\daily_cron.py >> data\youtube\cron.log 2>&1
