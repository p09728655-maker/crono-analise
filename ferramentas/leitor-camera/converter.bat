@echo off
rem Converte o .dav do gravador em .mp4 que o app abre.
rem Uso: arraste um ou mais .dav em cima deste arquivo. O .mp4 sai ao lado do .dav.
python "%~dp0converter.py" %*
echo.
pause
