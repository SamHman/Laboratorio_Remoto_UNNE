# Guía de Logs para Debugging - LabVirtual UNNE

Esta guía documenta todos los archivos de log generados por las APIs y scripts del sistema LabVirtual UNNE. Utiliza esta información para diagnosticar problemas y monitorear el funcionamiento del sistema.

---

## 📂 Estructura de Directorios de Logs

```
D:\xampp\htdocs\LabVirtualUNNE\logs\
├── export_debug.log          # Logs detallados de exportación de datos
├── export_errors.log          # Errores durante exportación
├── crear_orden_relay_debug.log # Debug de órdenes de relay
└── sensor_service.log         # Logs del servicio de sensor WebSocket

D:\xampp\htdocs\BOTGOODWE\logs\
├── Bot\
│   └── bot_YYYYMMDD.txt      # Logs diarios del bot principal (por día)
└── instaBot\
    └── instabot_YYYYMMDD.txt # Logs diarios del instabot (por día)
```

---

## 🔍 APIs con Sistema de Logs

### 1. **exportar_datos_dashboard.php**
**Ubicación:** `D:\xampp\htdocs\LabVirtualUNNE\app\api\exportar_datos_dashboard.php`

**Archivos de Log:**
- **`logs/export_debug.log`** - Log detallado de depuración
- **`logs/export_errors.log`** - Log de errores PHP

**Información que proporciona:**
- ✅ Inicio y fin de cada exportación
- ✅ Método de petición (POST/GET)
- ✅ Parámetros de fecha recibidos (start/end)
- ✅ Estado de conexión a base de datos
- ✅ Verificación de existencia de tablas
- ✅ Total de registros encontrados
- ✅ Progreso de procesamiento por lotes (batch size: 1000)
- ✅ Datos de irradiancia mapeados
- ✅ Errores detallados con stack trace

**Formato de Log:**
```
[YYYY-MM-DD HH:MM:SS] Mensaje | Data: {"key": "value"}
```

**Ejemplo:**
```
[2025-10-15 23:05:12] === INICIO DE EXPORTACIÓN ===
[2025-10-15 23:05:13] Método de petición | Data: "POST"
[2025-10-15 23:05:13] Total de registros encontrados | Data: 3002
[2025-10-15 23:05:22] === EXPORTACIÓN COMPLETADA EXITOSAMENTE ===
```

---

### 2. **sensor_websocket_service.php**
**Ubicación:** `D:\xampp\htdocs\LabVirtualUNNE\app\api\sensor_websocket_service.php`

**Archivos de Log:**
- **`logs/sensor_service.log`** - Log del servicio WebSocket

**Información que proporciona:**
- ✅ Inicio del servicio con URL del sensor
- ✅ Estado de conexión a base de datos
- ✅ Intentos de conexión al WebSocket
- ✅ Handshake WebSocket (éxito/fallo)
- ✅ Datos guardados (temperatura e irradiancia)
- ✅ Errores de conexión con código de error
- ✅ Intentos de reconexión automática
- ✅ Timeouts y advertencias

**Formato de Log:**
```
[YYYY-MM-DD HH:MM:SS] Mensaje
```

**Ejemplo:**
```
[2025-10-20 14:04:10] === Servicio de sensor WebSocket iniciado ===
[2025-10-20 14:04:10] URL del sensor: ws://10.40.131.224:81/
[2025-10-20 14:04:10] Conexión a base de datos establecida
[2025-10-20 14:04:10] Handshake WebSocket exitoso. Conexión establecida.
[2025-10-20 14:05:15] Datos guardados: T=25.3°C, I=850.2 W/m²
```

---

### 3. **crear_orden_relay.php**
**Ubicación:** `D:\xampp\htdocs\LabVirtualUNNE\app\api\crear_orden_relay.php`

**Archivos de Log:**
- **`logs/crear_orden_relay_debug.log`** - Debug de peticiones

**Información que proporciona:**
- ✅ Timestamp de cada petición
- ✅ IP remota del cliente
- ✅ Método HTTP (POST/GET)
- ✅ URI de la petición
- ✅ Headers HTTP completos
- ✅ Preview del body raw (primeros 200 caracteres)

**Formato de Log:**
```json
{
  "time": "2025-10-20T14:30:00-03:00",
  "remote_addr": "127.0.0.1",
  "method": "POST",
  "request_uri": "/app/api/crear_orden_relay.php",
  "headers": {...},
  "raw_body_preview": "..."
}
```

---

### 4. **guardar_datos.php**
**Ubicación:** `D:\xampp\htdocs\LabVirtualUNNE\app\api\guardar_datos.php`

**Archivos de Log:**
- **Error log de PHP** (configurado por servidor)

**Información que proporciona:**
- ✅ Datos recibidos (raw input)
- ✅ Datos decodificados (JSON parsed)
- ✅ Validación de temperatura e irradiancia
- ✅ Errores de validación con tipo de dato y valor

**Formato:**
```
Datos recibidos: {"temperatura":25.5,"irradiancia":850}
Datos decodificados: Array(...)
```

---

### 5. **APIs sin logs específicos**

Las siguientes APIs **NO** generan archivos de log propios, pero pueden mostrar errores en el error_log de PHP:

- `importar_csv_fault.php` - Importación de CSV de interrupciones
- `importar_excel_dtu.php` - Importación de Excel DTU
- `combinar_datos_fault_inversor.php` - Combinación de datos fault/inversor
- `borrar_ultimos_datos_inversor.php` - Borrado de datos
- `obtener_datos_inversor.php` - Obtención de datos del inversor
- `obtener_datos_irradiancia.php` - Obtención de datos de irradiancia
- `diagnostico.php` - Diagnóstico del sistema
- `diagnostico_avanzado.php` - Diagnóstico avanzado

---

## 🔧 Scripts BAT con Sistema de Logs

### 1. **run_bot.bat**
**Ubicación:** `D:\xampp\htdocs\LabVirtualUNNE\scripts\run_bot.bat`

**Archivos de Log:**
- **`D:\xampp\htdocs\BOTGOODWE\logs\Bot\bot_YYYYMMDD.txt`** (por día)

**Información que proporciona:**
- ✅ Directorio de trabajo
- ✅ Ruta del archivo de log
- ✅ Detección de Python (py launcher o python.exe)
- ✅ Creación de virtual environment
- ✅ Activación del venv
- ✅ Versión de Python activa
- ✅ Versión de pip
- ✅ Lista de paquetes instalados
- ✅ Instalación de requirements.txt
- ✅ Ejecución de main.py con output completo
- ✅ Exit code del proceso

**Características:**
- 📅 **Un archivo por día** (no por ejecución)
- 📝 Todas las ejecuciones del mismo día se agregan al mismo archivo
- 🔄 Formato: `bot_20251020.txt`

---

### 2. **run_instabot.bat**
**Ubicación:** `D:\xampp\htdocs\LabVirtualUNNE\scripts\run_instabot.bat`

**Archivos de Log:**
- **`D:\xampp\htdocs\BOTGOODWE\logs\instaBot\instabot_YYYYMMDD.txt`** (por día)

**Información que proporciona:**
- ✅ Misma información que run_bot.bat
- ✅ Ejecuta `instabot.py` en lugar de `main.py`

**Características:**
- 📅 **Un archivo por día** (no por ejecución)
- 📝 Todas las ejecuciones del mismo día se agregan al mismo archivo
- 🔄 Formato: `instabot_20251020.txt`

---

### 3. **ejecutar_sensor_service.bat**
**Ubicación:** `D:\xampp\htdocs\LabVirtualUNNE\scripts\ejecutar_sensor_service.bat`

**Archivos de Log:**
- **`D:\xampp\htdocs\LabVirtualUNNE\logs\sensor_service.log`**

**Información que proporciona:**
- ✅ Configuración de rutas (PHP, servicio, log)
- ✅ Verificación de PHP y servicio
- ✅ Output en tiempo real del servicio PHP
- ✅ Logs del sensor WebSocket (ver sensor_websocket_service.php)

**Características:**
- 🖥️ Ejecución en **primer plano** (ventana visible)
- 📺 Muestra logs en tiempo real en consola

---

### 4. **ejecutar_sensor_service_background.bat**
**Ubicación:** `D:\xampp\htdocs\LabVirtualUNNE\scripts\ejecutar_sensor_service_background.bat`

**Archivos de Log:**
- **`D:\xampp\htdocs\LabVirtualUNNE\logs\sensor_service.log`**

**Información que proporciona:**
- ✅ Misma información que ejecutar_sensor_service.bat
- ✅ Verificación de procesos PHP corriendo

**Características:**
- 🔇 Ejecución en **segundo plano** (sin ventana)
- 📄 Output redirigido completamente al archivo de log
- ⚠️ Para ver logs: `type "D:\xampp\htdocs\LabVirtualUNNE\logs\sensor_service.log"`

---

### 5. **iniciar_servidor.bat**
**Ubicación:** `D:\xampp\htdocs\LabVirtualUNNE\scripts\iniciar_servidor.bat`

**Archivos de Log:**
- **Logs deshabilitados** (redirige a NUL)

**Información:**
- ❌ No genera logs actualmente
- 💡 Logs comentados en el código (líneas 10-14)

---

### 6. **Scripts sin logs específicos**

Los siguientes scripts **NO** generan archivos de log propios:

- `ciclo_automatizado.bat` - Ciclo automatizado
- `configurar_firewall_websocket.bat` - Configuración de firewall
- `detener_sensor_service.bat` - Detener servicio de sensor
- `diagnosticar_conexion_esp32.bat` - Diagnóstico de conexión ESP32
- `ejecutar_borrado_ultimos_datos_inversor.bat` - Borrado de datos
- `ejecutar_combinacion_fault_inversor.bat` - Combinación de datos
- `ejecutar_importacion_csv_fault.bat` - Importación CSV
- `ejecutar_importacion_dtu.bat` - Importación DTU

---

## 🛠️ Cómo Usar Esta Guía para Debugging

### Problema: Exportación de datos falla
1. Revisar `logs/export_debug.log` para ver el flujo completo
2. Revisar `logs/export_errors.log` para errores PHP
3. Buscar el timestamp del error
4. Verificar datos de entrada y estado de BD

### Problema: Sensor no guarda datos
1. Revisar `logs/sensor_service.log`
2. Verificar conexión WebSocket
3. Buscar errores de timeout o conexión
4. Verificar IP del sensor ESP32

### Problema: Bot no ejecuta correctamente
1. Revisar `D:\xampp\htdocs\BOTGOODWE\logs\Bot\bot_YYYYMMDD.txt`
2. Verificar instalación de dependencias
3. Buscar exit code diferente de 0
4. Verificar errores de Python

### Problema: Relay no responde
1. Revisar `logs/crear_orden_relay_debug.log`
2. Verificar peticiones recibidas
3. Comprobar headers y body
4. Verificar IP del cliente

---

## 📊 Resumen de Logs por Ubicación

| Ubicación | Archivo | Tipo | Rotación |
|-----------|---------|------|----------|
| `LabVirtualUNNE/logs/` | `export_debug.log` | API | Manual |
| `LabVirtualUNNE/logs/` | `export_errors.log` | API | Manual |
| `LabVirtualUNNE/logs/` | `crear_orden_relay_debug.log` | API | Manual |
| `LabVirtualUNNE/logs/` | `sensor_service.log` | Servicio | Manual |
| `BOTGOODWE/logs/Bot/` | `bot_YYYYMMDD.txt` | Script | Diaria |
| `BOTGOODWE/logs/instaBot/` | `instabot_YYYYMMDD.txt` | Script | Diaria |

---

## 💡 Recomendaciones

1. **Limpieza periódica**: Los logs pueden crecer mucho. Implementar rotación o limpieza manual.
2. **Monitoreo**: Revisar logs regularmente para detectar problemas temprano.
3. **Backup**: Considerar backup de logs importantes antes de limpiar.
4. **Timestamps**: Todos los logs usan timestamps para correlacionar eventos.
5. **Permisos**: Verificar que las carpetas de logs tengan permisos de escritura.

---

**Última actualización:** 2025-10-20  
**Versión:** 1.0
