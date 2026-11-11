@echo off
rem Inicia o leitor e o reinicia se ele fechar por qualquer motivo.
cd /d "%~dp0"
:inicio
python leitor_camera.py
echo Leitor fechou. Reiniciando em 10 segundos...
timeout /t 10 /nobreak >nul
goto inicio
