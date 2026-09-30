@echo off
title Semantropic Trivia Online Alpha 0.2.3
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js no esta instalado o no esta en PATH.
  echo Instala Node.js LTS y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)
echo Iniciando Semantropic Trivia Online...
echo.
node server.js
pause
