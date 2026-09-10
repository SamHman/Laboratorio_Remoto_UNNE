@echo off
REM Script para ejecutar la combinación de datos_fault con datos_inversor
REM Ubicación: D:\xampp\htdocs\LabVirtualUNNE\scripts\ejecutar_combinacion_fault_inversor.bat

setlocal enabledelayedexpansion

echo ========================================
echo  COMBINACION DATOS FAULT E INVERSOR
echo  Lab Virtual UNNE
echo  %date% %time%
echo ========================================
echo.

REM Configuración de rutas
set XAMPP_PATH=D:\xampp
set PHP_PATH=%XAMPP_PATH%\php\php.exe
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%
set HTDOCS_PATH=%SCRIPT_DIR%..\

REM Verificar si PHP está instalado
if not exist "%PHP_PATH%" (
    echo ERROR: No se encontró PHP en %PHP_PATH%
    echo Verifique que XAMPP esté instalado correctamente.
    exit /b 1
)

REM Normalizar rutas (eliminar dobles barras y barras finales)
set "HTDOCS_PATH=%HTDOCS_PATH:\=\%"
set "HTDOCS_PATH=%HTDOCS_PATH:\\=\%"
set "PROJECT_ROOT=%PROJECT_ROOT:\=\%"
set "PROJECT_ROOT=%PROJECT_ROOT:\\=\%"

REM Ruta de la API
set "API_FILE=%SCRIPT_DIR%..\app\api\combinar_datos_fault_inversor.php"

if not exist "%API_FILE%" (
    echo ERROR: No se encontró el archivo de la API en:
    echo %API_FILE%
    echo.
    echo Por favor verifique que el archivo exista en la ubicación correcta.
    exit /b 1
)

echo [DEBUG] Directorio del script: %SCRIPT_DIR%
echo [DEBUG] Directorio del proyecto: %PROJECT_ROOT%
echo [DEBUG] Ruta de la API: %API_FILE%
echo.

echo Configuración verificada correctamente.
echo.
echo Ruta de PHP: %PHP_PATH%
echo Archivo API: %API_FILE%
echo.

echo Ejecutando combinación de datos fault e inversor...
echo Esta operación combinará los datos de la tabla datos_fault
echo con la tabla datos_inversor ordenados por fecha y hora.
echo.

REM Ejecutar la API de combinación
"%PHP_PATH%" "%API_FILE%"
set EXIT_CODE=!ERRORLEVEL!

echo.
if !EXIT_CODE! EQU 0 (
    echo Combinación completada exitosamente.
) else (
    echo ERROR: La combinación falló con código de salida !EXIT_CODE!.
    echo Revise los mensajes de error anteriores.
)
echo ========================================
exit
