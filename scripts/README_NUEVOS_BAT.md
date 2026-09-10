# Scripts y Servicios para LabVirtual UNNE

Este documento describe los nuevos scripts y servicios creados para resolver problemas de conectividad con el ESP32 y mejorar la gestión de datos del sensor de irradiancia/temperatura.

## 📁 Archivos Creados

### 1. Scripts para Conectividad con ESP32

#### `configurar_firewall_websocket.bat`
**Ubicación**: `D:\xampp\htdocs\LabVirtualUNNE\scripts\configurar_firewall_websocket.bat`

**Propósito**: Configura el Firewall de Windows para permitir conexiones WebSocket salientes al ESP32 (puerto 81).

**¿Cuándo usarlo?**:
- Cuando recibes errores como `WebSocket connection to 'ws://10.40.131.223:81/' failed`
- Cuando el ESP32 funciona desde otras PCs pero no desde tu servidor
- Problemas de conectividad de red o firewall bloqueando la conexión

**Uso**:
1. Haz clic derecho en el archivo
2. Selecciona "Ejecutar como administrador"
3. Confirma la creación de las reglas

**Reglas creadas**:
- Permite conexiones WebSocket desde Chrome al puerto 81 del ESP32
- Permite conexiones WebSocket desde PHP al puerto 81 del ESP32

#### `diagnosticar_conexion_esp32.bat`
**Ubicación**: `D:\xampp\htdocs\LabVirtualUNNE\scripts\diagnosticar_conexion_esp32.bat`

**Propósito**: Realiza un diagnóstico completo de la conexión con el ESP32.

**¿Cuándo usarlo?**:
- Antes de intentar conectar al ESP32
- Cuando tienes problemas de conectividad
- Para identificar si el problema es de red, firewall o configuración

**Pruebas realizadas**:
- ✅ Configuración de red del servidor
- ✅ Test de ping al ESP32
- ✅ Test de conectividad al puerto 81
- ✅ Verificación de reglas de firewall existentes
- ✅ Verificación de instalación de PHP

**Uso**: Ejecuta el script y sigue las instrucciones en pantalla.

### 2. Servicio de Sensor Independiente

#### `sensor_websocket_service.php`
**Ubicación**: `D:\xampp\htdocs\LabVirtualUNNE\app\api\sensor_websocket_service.php`

**Propósito**: Servicio PHP independiente que se conecta directamente al WebSocket del sensor ESP32 y guarda los datos automáticamente en la base de datos **sin depender de usuarios loggeados**.

**Características**:
- Se ejecuta en segundo plano 24/7
- Reconexión automática si pierde conexión
- Guarda datos de temperatura e irradiancia en `datos_irradiancia`
- Logs detallados en `D:\xampp\htdocs\LabVirtualUNNE\logs\sensor_service.log`

**Uso**: Ejecutar mediante los scripts .bat correspondientes.

#### `ejecutar_sensor_service.bat`
**Ubicación**: `D:\xampp\htdocs\LabVirtualUNNE\scripts\ejecutar_sensor_service.bat`

**Propósito**: Ejecuta el servicio de sensor **en primer plano** (con logs visibles en tiempo real).

**Ventajas**:
- ✅ Ves logs en tiempo real en la ventana de comandos
- ✅ Fácil de detener (Ctrl+C o cerrar ventana)
- ✅ Ideal para debugging y pruebas

**Desventajas**:
- ❌ Debe mantener la ventana abierta
- ❌ Si cierras la ventana, el servicio se detiene

#### `ejecutar_sensor_service_background.bat`
**Ubicación**: `D:\xampp\htdocs\LabVirtualUNNE\scripts\ejecutar_sensor_service_background.bat`

**Propósito**: Ejecuta el servicio de sensor **en segundo plano** (sin ventana visible).

**Ventajas**:
- ✅ Corre 24/7 sin necesidad de ventana abierta
- ✅ Sigue corriendo aunque cierres todas las ventanas
- ✅ Ideal para producción

**Desventajas**:
- ❌ No ves logs en tiempo real (debes revisar el archivo de log)
- ❌ Más difícil de detener (requiere script de detención)

#### `detener_sensor_service.bat`
**Ubicación**: `D:\xampp\htdocs\LabVirtualUNNE\scripts\detener_sensor_service.bat`

**Propósito**: Detiene el servicio de sensor de forma segura.

**Uso**:
1. Ejecuta el script
2. Confirma que deseas detener el servicio
3. El servicio se detendrá automáticamente

**Alternativa manual**:
- Abre Administrador de Tareas → Busca `php.exe` → Finaliza el proceso

### 3. Documentación

#### `README_SENSOR_SERVICE.md`
**Ubicación**: `D:\xampp\htdocs\LabVirtualUNNE\scripts\README_SENSOR_SERVICE.md`

**Propósito**: Documentación completa del servicio de sensor independiente.

**Contenido**:
- Instrucciones detalladas de instalación y configuración
- Solución de problemas comunes
- Arquitectura del sistema
- Configuración avanzada

## 🚀 Flujo de Trabajo Recomendado

### Paso 1: Resolver Problemas de Conectividad
```cmd
# Ejecutar diagnóstico
diagnosticar_conexion_esp32.bat

# Si es problema de firewall
configurar_firewall_websocket.bat  # Como Administrador
```

### Paso 2: Configurar Servicio de Sensor
```cmd
# Para pruebas (primer plano)
ejecutar_sensor_service.bat

# Para producción (segundo plano)
ejecutar_sensor_service_background.bat
```

### Paso 3: Verificar Funcionamiento
```cmd
# Ver logs en tiempo real
type D:\xampp\htdocs\LabVirtualUNNE\logs\sensor_service.log

# O usar tail si tienes Git Bash
tail -f D:\xampp\htdocs\LabVirtualUNNE\logs\sensor_service.log
```

## 🛠️ Solución de Problemas Comunes

### Problema: "WebSocket connection failed"
**Solución**: Ejecutar `diagnosticar_conexion_esp32.bat` y `configurar_firewall_websocket.bat`

### Problema: Servicio no guarda datos
**Solución**:
1. Verificar que el ESP32 esté encendido y accesible
2. Revisar logs: `D:\xampp\htdocs\LabVirtualUNNE\logs\sensor_service.log`
3. Verificar credenciales de base de datos en `.env`

### Problema: Servicio se detiene solo
**Solución**:
1. Verificar logs para errores
2. Usar modo background: `ejecutar_sensor_service_background.bat`
3. Configurar inicio automático con Windows

### Problema: Datos no aparecen en dashboard
**Solución**:
1. Verificar que el servicio esté corriendo
2. Esperar 30 segundos (polling cada 30s)
3. Verificar que haya datos en `datos_irradiancia`

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    ESP32 WebSocket                           │
│                 (ws://10.40.131.223:81/)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓ (Conexión directa)
┌─────────────────────────────────────────────────────────────┐
│         sensor_websocket_service.php (Servicio PHP)         │
│         - Corre en segundo plano 24/7                       │
│         - Guarda datos automáticamente en MySQL             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓ (Base de datos)
┌─────────────────────────────────────────────────────────────┐
│              Base de Datos MySQL                            │
│              Tabla: datos_irradiancia                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓ (API REST)
┌─────────────────────────────────────────────────────────────┐
│         obtener_datos_irradiancia.php (API)                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓ (Polling cada 30s)
┌─────────────────────────────────────────────────────────────┐
│              SCADA.js (Frontend)                            │
│         - Solo obtiene y muestra datos                      │
│         - No guarda datos (ya lo hace el servicio)         │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Notas Importantes

- ✅ **Independiente de usuarios**: El servicio funciona sin necesidad de usuarios loggeados
- ✅ **Reconexión automática**: Si pierde conexión, reintenta cada 5 segundos
- ✅ **Logs detallados**: Todos los eventos se registran en archivo y consola
- ✅ **Configuración flexible**: IPs y puertos se pueden cambiar fácilmente
- ✅ **Compatibilidad**: Usa la misma estructura de base de datos que el resto del sistema

## 🔧 Inicio Automático con Windows

Para que el servicio se inicie automáticamente al arrancar Windows:

1. Presiona `Win+R` y escribe `shell:startup`
2. Crea un acceso directo a `ejecutar_sensor_service_background.bat`
3. Copia el acceso directo a la carpeta de inicio automático

Ahora el servicio se iniciará automáticamente al encender la computadora.

## 📞 Soporte

Si tienes problemas:
1. Ejecuta `diagnosticar_conexion_esp32.bat` primero
2. Revisa los logs en `D:\xampp\htdocs\LabVirtualUNNE\logs\sensor_service.log`
3. Consulta este README o el README específico del servicio

---
*Este README fue generado automáticamente como parte de la solución para problemas de conectividad con el ESP32 en LabVirtual UNNE.*
