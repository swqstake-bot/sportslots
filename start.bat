@echo off
title StakeSportsElectron
echo ==========================================
echo Starting StakeSportsElectron...
echo ==========================================
cd /d "%~dp0"

REM Check if node_modules exists, if not install dependencies
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo Starting development server...
call npm run dev
pause
