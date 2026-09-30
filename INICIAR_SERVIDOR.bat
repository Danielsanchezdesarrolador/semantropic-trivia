@echo off
title Semantropic Trivia Online Alpha 0.2.6
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js no esta instalado o no esta en PATH.
  pause
  exit /b 1
)
if not exist node_modules\\pg (
  echo Instalando dependencias...
  call npm install
)
node server.js
pause
