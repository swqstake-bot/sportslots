@echo off
title StakeSportsElectron Builder
echo ==========================================
echo Building StakeSportsElectron...
echo ==========================================
cd /d "%~dp0"

echo Running build process...
call npm run build

if %errorlevel% neq 0 (
    echo.
    echo Build failed! Please check the errors above.
) else (
    echo.
    echo Build successful!
    echo You can find the executable in the 'release/win-unpacked' directory.
    echo.
    if exist "release\win-unpacked\StakeSportsElectron.exe" (
        echo Launching built application...
        start "" "release\win-unpacked\StakeSportsElectron.exe"
    )
)
pause
