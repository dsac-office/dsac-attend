@echo off
chcp 65001 >nul
rem 근무관리 팝업 빌드 (Windows .NET Framework csc 사용)
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
"%CSC%" /target:winexe /win32icon:"..\launcher\근무관리.ico" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Security.dll /out:"DSAC-Popup.exe" Popup.cs
if exist DSAC-Popup.exe (echo Done: DSAC-Popup.exe) else (echo Build failed. Check the messages above.)
pause
