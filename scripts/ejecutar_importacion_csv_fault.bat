@echo off
REM Script para ejecutar la importación de archivos CSV de interrupciones a datos_fault
REM Ubicación: D:\xampp\htdocs\LabVirtualUNNE\scripts\ejecutar_importacion_csv_fault.bat

setlocal enabledelayedexpansion

echo ========================================
echo  IMPORTACION DE CSV FAULT
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
set "API_FILE=%SCRIPT_DIR%..\app\api\importar_csv_fault.php"

if not exist "%API_FILE%" (
    echo ERROR: No se encontró el archivo de la API en:
    echo %API_FILE%
    echo.
    echo Por favor verifique que el archivo exista en la ubicación correcta.
    exit /b 1
)

REM Verificar si la carpeta Interrupciones existe
set "INTERRUPCIONES_PATH=D:\xampp\htdocs\mediciones\Interrupciones"

echo [DEBUG] Directorio del script: %SCRIPT_DIR%
echo [DEBUG] Directorio del proyecto: %PROJECT_ROOT%
echo [DEBUG] Ruta de la API: %API_FILE%
echo [DEBUG] Ruta de interrupciones: %INTERRUPCIONES_PATH%
echo.

if not exist "%INTERRUPCIONES_PATH%" (
    echo ERROR: No se encontró la carpeta Interrupciones en:
    echo %INTERRUPCIONES_PATH%
    echo Por favor cree la carpeta y coloque los archivos CSV.
    exit /b 1
)

echo Configuración verificada correctamente.
echo.
echo Ruta de PHP: %PHP_PATH%
echo Archivo API: %API_FILE%
echo Carpeta Interrupciones: %INTERRUPCIONES_PATH%
echo.

echo Archivos CSV disponibles en la carpeta Interrupciones:
dir "%INTERRUPCIONES_PATH%\*.csv" /b 2>nul
if errorlevel 1 (
    echo No se encontraron archivos CSV en la carpeta Interrupciones.
    echo Copie los archivos CSV a la carpeta %INTERRUPCIONES_PATH%
    echo.
)

echo.
echo Ejecutando importación de CSV fault...
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
exit /b %EXITCODE% 
