@echo off
rem Start the local site-building assistant (Jianzhan Zhushou)
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js not found. Please install Node.js 20 or newer. & pause & exit /b 1)
start "" http://127.0.0.1:4520
node server\index.js
pause
