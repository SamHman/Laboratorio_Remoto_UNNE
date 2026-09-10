@echo off
REM ============================================================================
REM Script de diagnóstico de conexión al ESP32
REM Ubicación: D:\xampp\htdocs\LabVirtualUNNE\scripts\diagnosticar_conexion_esp32.bat
REM ============================================================================

echo ============================================================================
echo Diagnóstico de Conexión al ESP32 - LabVirtual UNNE
echo ============================================================================
echo.

REM IP del ESP32 (actualizar según sea necesario)
set ESP32_IP=10.40.131.223
set ESP32_PORT=81

echo Configuración:
echo - IP del ESP32: %ESP32_IP%
echo - Puerto: %ESP32_PORT%
echo.
echo ============================================================================
echo 1. Verificando configuración de red de este servidor
echo ============================================================================
echo.

ipconfig | findstr /C:"IPv4"
echo.

echo ============================================================================
echo 2. Verificando conectividad con el ESP32 (Ping)
echo ============================================================================
echo.

ping -n 4 %ESP32_IP%

if %errorLevel% EQU 0 (
    echo.
    echo [OK] El ESP32 responde a ping
    echo.
) else (
    echo.
    echo [ERROR] El ESP32 NO responde a ping
    echo Posibles causas:
    echo - El ESP32 está apagado
    echo - El ESP32 está en una red diferente
    echo - Hay un firewall bloqueando ICMP
    echo.
)

echo ============================================================================
echo 3. Verificando si el puerto %ESP32_PORT% está abierto
echo ============================================================================
echo.

powershell -Command "Test-NetConnection -ComputerName %ESP32_IP% -Port %ESP32_PORT% -InformationLevel Detailed"

echo.
echo ============================================================================
echo 4. Verificando reglas de firewall
echo ============================================================================
echo.

echo Reglas de firewall para WebSocket:
netsh advfirewall firewall show rule name="LabVirtual WebSocket Saliente" >nul 2>&1
if %errorLevel% EQU 0 (
    echo [OK] Regla de firewall para WebSocket existe
    netsh advfirewall firewall show rule name="LabVirtual WebSocket Saliente"
) else (
    echo [ADVERTENCIA] No existe regla de firewall para WebSocket
    echo Ejecuta: configurar_firewall_websocket.bat (como Administrador)
)

echo.
echo Reglas de firewall para PHP:
netsh advfirewall firewall show rule name="LabVirtual PHP WebSocket Saliente" >nul 2>&1
if %errorLevel% EQU 0 (
    echo [OK] Regla de firewall para PHP existe
    netsh advfirewall firewall show rule name="LabVirtual PHP WebSocket Saliente"
) else (
    echo [ADVERTENCIA] No existe regla de firewall para PHP
    echo Ejecuta: configurar_firewall_websocket.bat (como Administrador)
)

echo.
echo ============================================================================
echo 5. Verificando si PHP puede ejecutarse
echo ============================================================================
echo.

set PHP_PATH=D:\xampp\php\php.exe
if exist "%PHP_PATH%" (
    echo [OK] PHP encontrado en: %PHP_PATH%
    "%PHP_PATH%" -v
) else (
    echo [ERROR] PHP no encontrado en: %PHP_PATH%
)

echo.
echo ============================================================================
echo Resumen del Diagnóstico
echo ============================================================================
echo.
echo Si el ping funciona pero el puerto %ESP32_PORT% no está abierto:
echo   - Verifica que el ESP32 esté corriendo el servidor WebSocket
echo   - Verifica que no haya firewall en el ESP32 bloqueando el puerto
echo.
echo Si el ping NO funciona:
echo   - Verifica que el ESP32 esté encendido
echo   - Verifica que ambos dispositivos estén en la misma red
echo   - Verifica la IP del ESP32 (puede haber cambiado)
echo.
echo Si todo funciona desde otra PC pero no desde este servidor:
echo   - Ejecuta configurar_firewall_websocket.bat como Administrador
echo   - Verifica que no haya software antivirus bloqueando la conexión
echo.
pause
