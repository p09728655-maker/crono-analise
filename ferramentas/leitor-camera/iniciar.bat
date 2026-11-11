@echo off
rem Inicia o leitor e o reinicia se ele fechar por qualquer motivo.
rem Codigo 2 = falta configurar algo (ffmpeg, config.json): para e mostra o motivo.
cd /d "%~dp0"
:inicio
python leitor_camera.py
if errorlevel 2 goto configurar
echo Leitor fechou. Reiniciando em 10 segundos...
timeout /t 10 /nobreak >nul
goto inicio
:configurar
echo.
echo Corrija o item acima e abra o iniciar.bat de novo.
pause
