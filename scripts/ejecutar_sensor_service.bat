@echo off
REM ============================================================================
REM Script para ejecutar el servicio de sensor WebSocket en segundo plano
REM Ubicación: D:\xampp\htdocs\LabVirtualUNNE\scripts\ejecutar_sensor_service.bat
REM 
REM Este script inicia el servicio PHP que se conecta al sensor WebSocket
REM y guarda los datos automáticamente en la base de datos sin depender
REM de usuarios loggeados en la página web.
REM ============================================================================

echo ============================================================================
echo Servicio de Sensor WebSocket - LabVirtual UNNE
echo ============================================================================
echo.

REM Configuración de rutas
set PHP_PATH=D:\xampp\php\php.exe
set SERVICE_PATH=D:\xampp\htdocs\LabVirtualUNNE\app\api\sensor_websocket_service.php
set LOG_PATH=D:\xampp\htdocs\LabVirtualUNNE\logs\sensor_service.log

REM Verificar que PHP existe
if not exist "%PHP_PATH%" (
    echo ERROR: No se encontró PHP en %PHP_PATH%
    echo Por favor, verifica la ruta de instalación de XAMPP
    pause
    exit /b 1
)

REM Verificar que el servicio existe
if not exist "%SERVICE_PATH%" (
    echo ERROR: No se encontró el servicio en %SERVICE_PATH%
    pause
    exit /b 1
)

REM Crear carpeta de logs si no existe
if not exist "D:\xampp\htdocs\LabVirtualUNNE\logs" (
    mkdir "D:\xampp\htdocs\LabVirtualUNNE\logs"
    echo Carpeta de logs creada
)

echo Iniciando servicio de sensor WebSocket...
echo.
echo Configuración:
echo - PHP: %PHP_PATH%
echo - Servicio: %SERVICE_PATH%
echo - Log: %LOG_PATH%
echo.
echo El servicio se está ejecutando. Los datos se guardarán automáticamente.
echo Para detener el servicio, cierra esta ventana o presiona Ctrl+C
echo.
echo ============================================================================
echo Logs del servicio:
echo ============================================================================
echo.

REM Ejecutar el servicio PHP
REM El servicio se ejecutará en primer plano para ver los logs en tiempo real
"%PHP_PATH%" "%SERVICE_PATH%"

REM Si el servicio termina, mostrar mensaje
echo.
echo ============================================================================
echo El servicio ha finalizado
echo ============================================================================
exit /b %EXITCODE% 
