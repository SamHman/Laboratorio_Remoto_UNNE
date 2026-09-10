@echo off
REM Script para ejecutar la importación de archivos Excel DTU
REM Ubicación: D:\xampp\htdocs\LabVirtualUNNE\ejecutar_importacion_dtu.bat

setlocal enabledelayedexpansion

echo ========================================
echo  IMPORTACION DE ARCHIVOS EXCEL DTU
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

REM Corregir la ruta de API_FILE para que apunte correctamente a app\api\importar_excel_dtu.php
set "API_FILE=%SCRIPT_DIR%..\app\api\importar_excel_dtu.php"

if not exist "%API_FILE%" (
    echo ERROR: No se encontró el archivo de la API en:
    echo %API_FILE%
    echo.
    echo Directorios verificados:
    echo Directorio del script: %~dp0
    echo Ruta completa: %API_FILE%
    echo.
    echo Por favor verifique que el archivo exista en la ubicación correcta.
    exit /b 1
)

REM Verificar si la carpeta mediciones existe
set "MEDICIONES_PATH=D:\xampp\htdocs\mediciones"

echo [DEBUG] Directorio del script: %SCRIPT_DIR%
echo [DEBUG] Directorio del proyecto: %PROJECT_ROOT%
echo [DEBUG] Ruta de la API: %API_FILE%
echo [DEBUG] Ruta de mediciones: %MEDICIONES_PATH%
echo.
if not exist "%MEDICIONES_PATH%" (
    echo ADVERTENCIA: No se encontró la carpeta mediciones en:
    echo %MEDICIONES_PATH%
    echo Creando la carpeta...
    mkdir "%MEDICIONES_PATH%"
)

echo Configuración verificada correctamente.
echo.
echo Ruta de PHP: %PHP_PATH%
echo Archivo API: %API_FILE%
echo Carpeta mediciones: %MEDICIONES_PATH%
echo.

echo Archivos DTU disponibles en la carpeta mediciones:
dir "%MEDICIONES_PATH%\*DTU*.xls" /b 2>nul
if errorlevel 1 (
    echo No se encontraron archivos DTU en la carpeta mediciones.
    echo Copie los archivos Excel DTU a la carpeta %MEDICIONES_PATH%
    echo.
)

echo.
echo Ejecutando importación...
echo.

REM Ejecutar la API de importación
"%PHP_PATH%" "%API_FILE%"
set EXIT_CODE=!ERRORLEVEL!

echo.
if !EXIT_CODE! EQU 0 (
    echo Importación completada exitosamente.
) else (
    echo ERROR: La importación falló con código de salida !EXIT_CODE!.
    echo Revise los mensajes de error anteriores.
)
echo ========================================
REM Borrar el rem de pause para debugging
REM pause
exit /b %EXITCODE% 
