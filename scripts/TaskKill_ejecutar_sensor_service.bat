@echo off
setlocal enabledelayedexpansion

REM --- La ruta COMPLETA del script que queremos cerrar ---
set "SCRIPT_PATH=D:\xampp\htdocs\LabVirtualUNNE\scripts\ejecutar_sensor_service.bat"
set "SCRIPT_NAME=ejecutar_sensor_service.bat"

REM --- Preparamos la ruta para la consulta WMIC (D:\... -> D:\\...) ---
set "WMIC_PATH=%SCRIPT_PATH:\=\\%"
set "PID_A_MATAR="

echo Buscando PID para: %SCRIPT_NAME%
echo (Ruta: %SCRIPT_PATH%)
echo.

REM --- Busca el PID de cmd.exe cuya linea de comando contenga la RUTA COMPLETA ---
for /f "tokens=2 delims==" %%p in (
    'wmic process where "name='cmd.exe' and commandline like '%%%WMIC_PATH%%%' and not commandline like '%%wmic%%'" get processid /value'
) do (
    set "PID_A_MATAR=%%p"
    goto :encontrado
)

echo [ERROR] No se encontro ningun proceso activo para "%SCRIPT_NAME%".
echo.
echo Posibles causas:
echo 1. El script no se esta ejecutando.
echo 2. La ruta en la variable SCRIPT_PATH de este archivo es incorrecta.
goto :fin

:encontrado
echo [EXITO] Proceso encontrado con PID: %PID_A_MATAR%.
echo Intentando terminar el proceso y todos sus subprocesos (ej. php.exe)...
echo.

taskkill /F /T /PID %PID_A_MATAR%

if !errorlevel! equ 0 (
    echo [EXITO] El proceso %PID_A_MATAR% ha sido terminado.
) else (
    echo [ERROR] No se pudo terminar el proceso %PID_A_MATAR%.
)

:fin
echo.
exit /b %EXITCODE% 