# Guía de Diagnóstico - Problemas Resueltos

## Problema 1: run_bot.bat no se reconoce ✅ RESUELTO

### Causa Raíz
El archivo `ciclo_automatizado.bat` llamaba a otros archivos `.bat` usando solo el nombre del archivo (ej: `call run_bot.bat`). Cuando Windows no encuentra el archivo en el directorio actual o en el PATH, falla con el error "no se reconoce ningún comando".

### Solución Implementada
Se modificó `ciclo_automatizado.bat` para usar **rutas absolutas** con la variable especial `%~dp0`:

```batch
call "%~dp0run_bot.bat"
```

La variable `%~dp0` se expande a la ruta del directorio donde está ubicado el script actual, garantizando que siempre encuentre los archivos `.bat` en el mismo directorio.

### Mejoras Adicionales
- Se agregó verificación de códigos de error después de cada llamada
- Los errores ahora se muestran en consola con el código de salida
- Ejemplo: `if errorlevel 1 echo [ERROR] run_bot.bat fallo con codigo: %errorlevel%`

### Archivos Modificados
- `d:\xampp\htdocs\LabVirtualUNNE\scripts\ciclo_automatizado.bat`

---

## Problema 2: Exportación a Excel no funciona ✅ DIAGNÓSTICO HABILITADO

### Causa Probable
Sin logs detallados era imposible determinar dónde fallaba el proceso (frontend, backend, red, base de datos, etc.)

### Solución Implementada

#### A. Frontend (SCADA.js)
Se agregaron logs comprehensivos con el prefijo `[EXPORT]` que rastrean:

1. **Inicio del proceso**
   ```javascript
   console.log('[EXPORT] Iniciando proceso de exportación...');
   ```

2. **Validación de fechas**
   ```javascript
   console.log('[EXPORT] Valores de fecha:', { startTime, endTime });
   ```

3. **Construcción de URL y payload**
   ```javascript
   console.log('[EXPORT] URL de API:', apiUrl);
   console.log('[EXPORT] Payload:', JSON.stringify({ start, end }));
   ```

4. **Respuesta del servidor**
   ```javascript
   console.log('[EXPORT] Status:', response.status, response.statusText);
   console.log('[EXPORT] Content-Type:', contentType);
   ```

5. **Proceso de descarga**
   ```javascript
   console.log('[EXPORT] Blob creado, tamaño:', blob.size, 'bytes');
   ```

6. **Errores detallados**
   ```javascript
   console.error('[EXPORT] Error capturado:', error);
   console.error('[EXPORT] Stack trace:', error.stack);
   ```

#### B. Backend (exportar_datos_dashboard.php)
Se creó un sistema de logging que escribe en archivos:

**Ubicación de logs:**
- `d:\xampp\htdocs\LabVirtualUNNE\logs\export_debug.log` - Log detallado de cada paso
- `d:\xampp\htdocs\LabVirtualUNNE\logs\export_errors.log` - Errores PHP

**Información registrada:**
1. Parámetros recibidos (fechas, método HTTP)
2. Conexión a base de datos
3. Conteo de registros
4. Procesamiento por lotes
5. Creación y envío del archivo Excel
6. Errores con stack trace completo

### Cómo Diagnosticar Problemas

#### Paso 1: Abrir la Consola del Navegador
1. Presiona `F12` en tu navegador
2. Ve a la pestaña "Console"
3. Intenta exportar datos
4. Busca mensajes con el prefijo `[EXPORT]`

#### Paso 2: Revisar los Logs del Servidor
1. Abre el archivo: `d:\xampp\htdocs\LabVirtualUNNE\logs\export_debug.log`
2. Busca la última entrada con `=== INICIO DE EXPORTACIÓN ===`
3. Lee cada paso para identificar dónde falla

#### Paso 3: Identificar el Tipo de Error

**Si ves en la consola del navegador:**
- `[EXPORT] Error: Fechas no válidas` → El usuario no seleccionó fechas
- `[EXPORT] Status: 500` → Error en el servidor PHP
- `[EXPORT] Status: 404` → La URL del API es incorrecta
- `[EXPORT] Error capturado: NetworkError` → Problema de red o CORS
- `[EXPORT] Respuesta no es Excel` → El servidor devolvió un error en JSON

**Si ves en export_debug.log:**
- `ERROR: Faltan parámetros de fecha` → Los datos no llegaron al servidor
- `ERROR: Fallo al conectar a BD` → Problema con la base de datos
- `Total de registros encontrados | Data: 0` → No hay datos en ese rango
- `=== ERROR EN EXPORTACIÓN ===` → Error durante el procesamiento

### Archivos Modificados
- `d:\xampp\htdocs\LabVirtualUNNE\app\public\SCADA.js`
- `d:\xampp\htdocs\LabVirtualUNNE\app\api\exportar_datos_dashboard.php`

---

## Pruebas Recomendadas

### Para ciclo_automatizado.bat
1. Ejecuta el script manualmente desde cualquier directorio
2. Verifica que no aparezca el error "no se reconoce ningún comando"
3. Revisa que los mensajes de error (si hay) muestren el código de salida

### Para la Exportación a Excel
1. Abre la consola del navegador (F12)
2. Intenta exportar datos con un rango de fechas válido
3. Observa los logs en la consola con prefijo `[EXPORT]`
4. Revisa el archivo `logs/export_debug.log` para ver el proceso completo
5. Si hay error, compara los logs del frontend y backend para identificar dónde falla

---

## Comandos Útiles

### Ver logs en tiempo real (PowerShell)
```powershell
# Ver log de debug
Get-Content "d:\xampp\htdocs\LabVirtualUNNE\logs\export_debug.log" -Wait -Tail 50

# Ver log de errores
Get-Content "d:\xampp\htdocs\LabVirtualUNNE\logs\export_errors.log" -Wait -Tail 50
```

### Limpiar logs antiguos
```powershell
# Limpiar logs de exportación
Remove-Item "d:\xampp\htdocs\LabVirtualUNNE\logs\export_*.log"
```

---

## Próximos Pasos

Si después de revisar los logs encuentras un error específico:

1. **Error de conexión a BD**: Verifica credenciales en el archivo `.env`
2. **Error de memoria**: Aumenta `memory_limit` en `php.ini`
3. **Error de timeout**: Aumenta `max_execution_time` en `php.ini`
4. **Error de permisos**: Verifica que el directorio `logs/` tenga permisos de escritura
5. **Error de CORS**: Verifica que Apache tenga configurados los headers CORS correctamente

---

## Resumen de Cambios

### ciclo_automatizado.bat
- ✅ Uso de rutas absolutas con `%~dp0`
- ✅ Verificación de códigos de error
- ✅ Mensajes de error informativos

### SCADA.js
- ✅ 15+ puntos de logging en el proceso de exportación
- ✅ Captura de errores con stack trace
- ✅ Logging de headers y respuestas del servidor

### exportar_datos_dashboard.php
- ✅ Sistema de logging a archivo
- ✅ Tracking de cada paso del proceso
- ✅ Captura detallada de excepciones
- ✅ Creación automática del directorio de logs

---

**Fecha de implementación**: 2025-10-15
**Autor**: Cascade AI Assistant
