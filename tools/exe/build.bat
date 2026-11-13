@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Writes the IExpress settings file, then builds DSAC-Attend.exe from launcher.bat
> DSAC-Attend-build.sed echo [Version]
>>DSAC-Attend-build.sed echo Class=IEXPRESS
>>DSAC-Attend-build.sed echo SEDVersion=3
>>DSAC-Attend-build.sed echo [Options]
>>DSAC-Attend-build.sed echo PackagePurpose=InstallApp
>>DSAC-Attend-build.sed echo ShowInstallProgramWindow=0
>>DSAC-Attend-build.sed echo HideExtractAnimation=1
>>DSAC-Attend-build.sed echo UseLongFileName=1
>>DSAC-Attend-build.sed echo InsideCompressed=0
>>DSAC-Attend-build.sed echo CAB_FixedSize=0
>>DSAC-Attend-build.sed echo CAB_ResvCodeSigning=0
>>DSAC-Attend-build.sed echo RebootMode=N
>>DSAC-Attend-build.sed echo InstallPrompt=
>>DSAC-Attend-build.sed echo DisplayLicense=
>>DSAC-Attend-build.sed echo FinishMessage=
>>DSAC-Attend-build.sed echo TargetName=%~dp0DSAC-Attend.exe
>>DSAC-Attend-build.sed echo FriendlyName=DSAC Attend
>>DSAC-Attend-build.sed echo AppLaunched=cmd /c launcher.bat
>>DSAC-Attend-build.sed echo PostInstallCmd=^<None^>
>>DSAC-Attend-build.sed echo AdminQuietInstCmd=
>>DSAC-Attend-build.sed echo UserQuietInstCmd=
>>DSAC-Attend-build.sed echo SourceFiles=SourceFiles
>>DSAC-Attend-build.sed echo [SourceFiles]
>>DSAC-Attend-build.sed echo SourceFiles0=%~dp0
>>DSAC-Attend-build.sed echo [SourceFiles0]
>>DSAC-Attend-build.sed echo %%FILE0%%=
>>DSAC-Attend-build.sed echo [Strings]
>>DSAC-Attend-build.sed echo FILE0="launcher.bat"
iexpress /N /Q DSAC-Attend-build.sed
if exist DSAC-Attend.exe (echo Done: DSAC-Attend.exe) else (echo Build failed. Check the messages above.)
pause
