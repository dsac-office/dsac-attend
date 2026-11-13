@echo off
rem Opens the attendance site in its own app window (Edge, then Chrome as backup)
start "" msedge --app=https://dsac-attend.web.app/ 2>nul
if errorlevel 1 start "" chrome --app=https://dsac-attend.web.app/ 2>nul
if errorlevel 1 start "" https://dsac-attend.web.app/
