@echo off
cd /d "%~dp0..\.."
node tools/song-import/add-song.js
pause
