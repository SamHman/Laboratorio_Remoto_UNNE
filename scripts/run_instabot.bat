@echo off
setlocal enabledelayedexpansion

rem Change to the fixed project directory
cd /d "D:\xampp\htdocs\BOTGOODWE"

rem Ensure logs directory exists
if not exist "D:\xampp\htdocs\BOTGOODWE\logs\instaBot" mkdir "D:\xampp\htdocs\BOTGOODWE\logs\instaBot"

rem Build date-only timestamp via PowerShell
for /f %%i in ('powershell -NoProfile -Command "(Get-Date).ToString(\"yyyyMMdd\")"') do set ts=%%i
set "LOGFILE=D:\xampp\htdocs\BOTGOODWE\logs\instaBot\instabot_!ts!.txt"

echo [1/8] Starting BOTGOODWE runner in: %cd% >> "%LOGFILE%"
echo [2/8] Log file: %cd%\%LOGFILE% >> "%LOGFILE%"

echo =============================== >  "%LOGFILE%"
echo BOTGOODWE run start: %date% %time% >> "%LOGFILE%"
echo Working directory: %cd%           >> "%LOGFILE%"
echo =============================== >> "%LOGFILE%"

rem Locate Python launcher or python.exe
echo [3/8] Checking for Python on PATH... >> "%LOGFILE%"
where py >nul 2>&1
if %errorlevel%==0 (
  set "PY=py -3"
  echo Using Python launcher: %PY% >> "%LOGFILE%"
) else (
  where python >nul 2>&1
  if %errorlevel%==0 (
    set "PY=python"
    echo Using python executable: %PY% >> "%LOGFILE%"
  ) else (
    echo [ERROR] Python not found on PATH. >> "%LOGFILE%"
    echo Install Python and ensure it is on PATH. See "%LOGFILE%" for details. >> "%LOGFILE%"
    echo [ERROR] Python not found on PATH. Please install Python and retry. >> "%LOGFILE%"
    exit /b 1
  )
)

rem Create virtual environment if missing
if not exist "venv\Scripts\python.exe" (
  echo [4/8] Creating virtual environment... >> "%LOGFILE%"
  echo Creating virtual environment... >> "%LOGFILE%"
  %PY% -m venv venv >> "%LOGFILE%" 2>&1
  if errorlevel 1 (
    echo [ERROR] Failed to create virtual environment. See log: %LOGFILE% >> "%LOGFILE%"
    echo [ERROR] Failed to create virtual environment. >> "%LOGFILE%"
    exit /b 1
  )
)

rem Activate venv
echo [5/8] Activating virtual environment... >> "%LOGFILE%"
call "venv\Scripts\activate.bat" >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo [ERROR] Failed to activate virtual environment. See log: %LOGFILE% >> "%LOGFILE%"
  echo [ERROR] Failed to activate virtual environment. >> "%LOGFILE%"
  exit /b 1
)
set "VENV_PY=%cd%\venv\Scripts\python.exe"
if not exist "%VENV_PY%" (
  echo [ERROR] venv python not found at "%VENV_PY%". >> "%LOGFILE%"
  echo [ERROR] venv python not found at "%VENV_PY%". >> "%LOGFILE%"
  exit /b 1
)
"%VENV_PY%" --version >> "%LOGFILE%" 2>&1
echo     Active python: %VENV_PY% >> "%LOGFILE%"
"%VENV_PY%" -m pip --version >> "%LOGFILE%" 2>&1
echo     Pip (venv): >> "%LOGFILE%"
"%VENV_PY%" -m pip --version >> "%LOGFILE%" 2>&1
echo     Pip list (short): >> "%LOGFILE%"
"%VENV_PY%" -m pip list >> "%LOGFILE%" 2>&1

rem Install dependencies only if requirements.txt exists (also upgrade pip then)
if exist "requirements.txt" (
  echo [6/8] Installing requirements from requirements.txt ... >> "%LOGFILE%"
  echo Upgrading pip and installing requirements... >> "%LOGFILE%"
  "%VENV_PY%" -m pip install --upgrade pip >> "%LOGFILE%" 2>&1
  "%VENV_PY%" -m pip install -r requirements.txt >> "%LOGFILE%" 2>&1
  if errorlevel 1 (
    echo [ERROR] Failed to install requirements. See log: %LOGFILE% >> "%LOGFILE%"
    echo [ERROR] Failed to install requirements. >> "%LOGFILE%"
    exit /b 1
  )
) else (
  echo [6/8] No requirements.txt found, skipping dependency install. >> "%LOGFILE%"
  echo No requirements.txt found, skipping dependency install. >> "%LOGFILE%"
)

rem Ensure critical runtime deps exist in venv even without requirements.txt
echo Checking for pyautogui in venv... >> "%LOGFILE%"
"%VENV_PY%" -c "import pyautogui" 1>nul 2>nul
if errorlevel 1 (
  echo pyautogui not found in venv, attempting install... >> "%LOGFILE%"
  "%VENV_PY%" -m pip install pyautogui >> "%LOGFILE%" 2>&1
)

rem Run the bot from a fixed path
set "EXITCODE=0"
set "MAIN_PATH=D:\xampp\htdocs\BOTGOODWE\instabot.py"
echo [7/8] Executing: "%MAIN_PATH%" with venv python (output to log) >> "%LOGFILE%"
echo Running "%MAIN_PATH%" ... >> "%LOGFILE%"
echo   Using interpreter: %VENV_PY% >> "%LOGFILE%"
"%VENV_PY%" "%MAIN_PATH%" >> "%LOGFILE%" 2>&1
set "EXITCODE=!ERRORLEVEL!"

echo ------------------------------- >> "%LOGFILE%"
echo Exit code: !EXITCODE!            >> "%LOGFILE%"
echo Log file: %cd%\%LOGFILE%        >> "%LOGFILE%"
echo ------------------------------- >> "%LOGFILE%"
echo [8/8] Process finished with exit code: !EXITCODE! >> "%LOGFILE%"

endlocal & set "EXITCODE=%EXITCODE%" & set "LOGFILE=%LOGFILE%"

exit /b %EXITCODE%
