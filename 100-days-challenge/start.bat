@echo off
title 100 Days Challenge Web App
cd /d "%~dp0"
echo ===================================================
echo Starting 100 Days Challenge Local Server...
echo ===================================================
start "" "http://localhost:5000"
node server.js
pause
