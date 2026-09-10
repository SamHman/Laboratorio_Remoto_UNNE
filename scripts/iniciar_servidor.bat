@echo off
setlocal enableextensions enabledelayedexpansion
title LabVirtualUNNE - Iniciar servidor

REM Ir al directorio raiz del proyecto (padre del directorio del script)
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%.."

REM Preparar archivo de log (deshabilitado)
REM set "LOGFILE=%TEMP%\LabVirtualUNNE_start_%RANDOM%.log"
set "LOGFILE=NUL"
REM echo ============================================== > "%LOGFILE%"
REM echo   LabVirtualUNNE - Inicio del servidor >> "%LOGFILE%"
REM echo   Fecha/Hora: %DATE% %TIME% >> "%LOGFILE%"
REM echo   Directorio: %CD% >> "%LOGFILE%"
REM echo ============================================== >> "%LOGFILE%"

REM Helper para loguear en consola y archivo
goto :_after_log_def
:log
REM setlocal
REM set "_MSG=%~1"
REM echo [%DATE% %TIME%] !_MSG!>> "%LOGFILE%"
REM echo [%DATE% %TIME%] !_MSG!
goto :eof
:_after_log_def

REM echo ==============================================
REM echo   LabVirtualUNNE - Inicio del servidor
REM echo   Directorio: %CD%
REM echo ==============================================

REM Verificar Node.js
call :log "Verificando Node.js en PATH"
where node >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  call :log "[ERROR] Node.js no esta instalado o no esta en el PATH"
  echo Descargalo desde: https://nodejs.org/
  pause
  exit /b 1
)
for /f "delims=" %%P in ('where node 2^>^&1') do set "NODE_BIN=%%P"
call :log "Node encontrado: %NODE_BIN%"

REM Establecer PORT por defecto si no viene del entorno
if "%PORT%"=="" set PORT=4000
call :log "Variables: PORT=%PORT%, NODE_ENV=%NODE_ENV%"

REM Intentar iniciar servicio MySQL si existe (XAMPP/MariaDB/Windows Service)
set "_mysql_started="
call :log "Buscando servicios MySQL (mysql, MySQL, MySQL80, xamppmysql, mariadb)"
for %%S in (mysql MySQL MySQL80 xamppmysql mariadb) do (
  sc query "%%S" >> "%LOGFILE%" 2>&1
  if not errorlevel 1 (
    for /f "tokens=3 delims=: " %%H in ('sc query "%%S" ^| find "STATE"') do (
      if /I not "%%H"=="RUNNING" (
        call :log "Iniciando servicio MySQL: %%S"
        net start "%%S" >> "%LOGFILE%" 2>&1
        if errorlevel 1 (
          call :log "[AVISO] No se pudo iniciar el servicio %%S (puede requerir permisos de administrador)"
        ) else (
          call :log "Servicio MySQL iniciado: %%S"
          set "_mysql_started=1"
        )
      ) else (
        call :log "MySQL ya esta en ejecucion: %%S"
        set "_mysql_started=1"
      )
    )
    goto :mysql_checked
  )
)
:mysql_checked
if not defined _mysql_started (
  call :log "[AVISO] No se detecto un servicio MySQL conocido. Verifica XAMPP/MySQL."
)

REM Instalar dependencias si falta node_modules
if not exist node_modules (
  call :log "Instalando dependencias (npm install)"
  call npm install --no-audit --no-fund >> "%LOGFILE%" 2>&1
  if errorlevel 1 (
    call :log "[ERROR] Fallo la instalacion de dependencias"
    pause
    exit /b 1
  )
  call :log "Dependencias instaladas correctamente"
)

REM Abrir el navegador a la pantalla de login (ruta publica)
REM call :log "Abriendo navegador en http://localhost:%PORT%/login"
REM start "" http://localhost:%PORT%/login

REM Lanzar servidor: intentar con nodemon (npx) y si falla, usar node directamente
set "NODE_ENV=development"
call :log "Iniciando servidor en puerto %PORT% (NODE_ENV=development)"

REM Intento con npx nodemon (no interactivo)
call :log "Ejecutando: npx --yes nodemon --exec node app/index.js --signal SIGTERM"
call npx --yes nodemon --exec node app/index.js --signal SIGTERM
if not errorlevel 1 goto :eof

call :log "[AVISO] nodemon no disponible o fallo. Probando con node app/index.js"
node app/index.js

popd
endlocal
goto :eof
