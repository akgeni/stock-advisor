@echo off
echo ========================================
echo   Stock Advisor - Starting Server
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Navigate to project directory
cd /d "%~dp0"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    echo.
)

REM Check if watchlist.csv exists
if not exist "watchlist.csv" (
    echo WARNING: watchlist.csv not found!
    echo Please add your stock watchlist CSV file.
    echo.
)

echo Starting Stock Advisor server...
echo.
echo ========================================
echo   Open in browser: http://localhost:3001
echo   Press Ctrl+C to stop the server
echo ========================================
echo.

node server.js
