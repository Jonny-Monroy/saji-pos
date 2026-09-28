@echo off
title POS Grupo SAJI Bogota SAS
cd /d "%~dp0"
echo Iniciando servidor POS...
start "" http://localhost:3000
node server.js
pause
