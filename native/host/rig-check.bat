@echo off
REM Stage 1 rig check for xrb-host: one interactive page on the rig's 3D display.
REM Sit in front of the display (about 50-70 cm away) and answer with the mouse.
REM The log and the recorded hand stream are kept in build\rig-check\. The page is tests\rig-check;
REM the control panel runs it as a test project. Display and input come from its xrb-project.json.
setlocal
cd /d "%~dp0"
set HOST=build\Release\xrb-host.exe
set PAGE=%~dp0..\..\tests\rig-check
set OUT=build\rig-check
if not exist "%HOST%" (echo Build the host first: see README.md & exit /b 1)
if not exist %OUT% mkdir %OUT%
"%HOST%" --app-dir="%PAGE%" --config="%PAGE%\xrb-project.json" --record-hands=%OUT%\touch.hands
copy /y "%LOCALAPPDATA%\XRBuild\logs\xrb-host.log" %OUT%\rig-check.log >nul
endlocal
