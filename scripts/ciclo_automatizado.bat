@echo off
setlocal enabledelayedexpansion

REM Modificar la cantidad de segundos aquí 
set "FLAG_FILE=D:\xampp\htdocs\LabVirtualUNNE\app\Acciones\OrdenRelay.txt"
set "INVERSOR_FAULT=D:\xampp\htdocs\LabVirtualUNNE\app\Acciones\InversorFault.txt"
set "MAX_COUNT=300"
REM Modificar donde se guarda este archivo temporal
set "COUNTER_SAVE_FILE=D:\xampp\htdocs\LabVirtualUNNE\scripts\ContadorCicloAutomatizado\LAST_COUNT.tmp"
set FLAG_DETECTED_DURING_COUNT=0

REM Bucle infinito
:main_loop
    REM Cargar el último valor del contador si existe
    set "START_COUNT=1"
    if exist "%COUNTER_SAVE_FILE%" (
        set /p START_COUNT=<"%COUNTER_SAVE_FILE%"
        if not defined START_COUNT set "START_COUNT=1"
    )

    echo.
    echo ========================================================
    echo INICIANDO CICLO DE ESPERA Y COMPROBACION (Max. %MAX_COUNT% segundos)
    echo ========================================================

    REM Contador con comprobación constante
    <nul set /p="Esperando:"
    for /L %%i in (!START_COUNT!,1,%MAX_COUNT%) do (
        <nul set /p="%%i sec "
        
        REM Guardar el contador actual para persistencia
        echo %%i > "%COUNTER_SAVE_FILE%"

        if exist "%FLAG_FILE%" (
            goto flag_detected
        )
        if exist "%INVERSOR_FAULT%" (
            goto flag_detected
        ) 
        timeout /t 1 /nobreak >nul
    )

    if "!FLAG_DETECTED_DURING_COUNT!"=="1" (
                echo [!] Sub rutina POST interrupción
                goto flag_still_present
            ) else (
                echo [*] No se detectó la FLAG durante el conteo.
                goto no_flag
        )

:flag_detected
    REM === A. FLAG DETECTADA (Interrupción del tiempo) ===
    echo [!] Iniciando SUB-RUTINA 1 (Inicializacion FAULT).
    call "%~dp0run_instabot.bat"
    if errorlevel 1 echo [ERROR] run_instabot.bat fallo con codigo: %errorlevel%
    call "%~dp0ejecutar_importacion_csv_fault.bat"
    if errorlevel 1 echo [ERROR] ejecutar_importacion_csv_fault.bat fallo con codigo: %errorlevel%
    start "" "%~dp0ejecutar_combinacion_fault_inversor.bat"
    echo [!] SUB-RUTINA 1 finalizada. La bandera se mantiene activa para el siguiente ciclo.
    del /f "%FLAG_FILE%"
    del /f "%INVERSOR_FAULT%"
    set FLAG_DETECTED_DURING_COUNT=0
    goto main_loop


:no_flag
    REM === C. CONTEO TERMINADO Y NO HAY FLAG (Línea de Tiempo Principal) ===
    echo [*] Conteo finalizado. Ejecutando LÍNEA DE TIEMPO PRINCIPAL (Normal).
    call "%~dp0run_bot.bat"
    if errorlevel 1 echo [ERROR] run_bot.bat fallo con codigo: %errorlevel%
    call "%~dp0ejecutar_importacion_dtu.bat"
    if errorlevel 1 echo [ERROR] ejecutar_importacion_dtu.bat fallo con codigo: %errorlevel%
    echo [*] Linea de Tiempo Principal finalizada. Reiniciando ciclo.
    
    REM Eliminar el archivo de persistencia después de un ciclo normal
    if exist "%COUNTER_SAVE_FILE%" del /f "%COUNTER_SAVE_FILE%"
    goto main_loop

REM Al final del archivo, fuera del ciclo:
echo [!] El ciclo principal terminó inesperadamente.
pause
exit /b
