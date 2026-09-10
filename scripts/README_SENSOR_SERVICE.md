# Servicio de Sensor WebSocket - LabVirtual UNNE

## Descripción

Este servicio PHP se ejecuta en segundo plano y se conecta automáticamente al sensor WebSocket (`ws://----------:81/`) para recibir datos de temperatura e irradiancia y guardarlos en la base de datos **sin depender de usuarios loggeados** en la página web.

## Archivos Creados

1. **`sensor_websocket_service.php`** - Servicio principal que se conecta al WebSocket
2. **`ejecutar_sensor_service.bat`** - Ejecuta el servicio en primer plano (con logs visibles)
3. **`ejecutar_sensor_service_background.bat`** - Ejecuta el servicio en segundo plano
4. **`detener_sensor_service.bat`** - Detiene el servicio

## Cómo Usar

### Opción 1: Ejecutar en Primer Plano (Recomendado para pruebas)

1. Haz doble clic en `ejecutar_sensor_service.bat`
2. Verás los logs en tiempo real en la ventana de comandos
3. Para detener, cierra la ventana o presiona `Ctrl+C`

**Ventajas:**
- Ves los logs en tiempo real
- Fácil de detener
- Ideal para debugging

**Desventajas:**
- La ventana debe permanecer abierta
- Si cierras la ventana, el servicio se detiene

### Opción 2: Ejecutar en Segundo Plano (Recomendado para producción)

1. Haz doble clic en `ejecutar_sensor_service_background.bat`
2. El servicio se iniciará en segundo plano
3. Puedes cerrar la ventana de comandos
4. El servicio seguirá corriendo

**Ventajas:**
- No necesitas mantener una ventana abierta
- El servicio corre en segundo plano
- Ideal para producción

**Desventajas:**
- No ves los logs en tiempo real (debes revisar el archivo de log)
- Más difícil de detener (requiere el script de detención)

### Detener el Servicio

1. Haz doble clic en `detener_sensor_service.bat`
2. Confirma que deseas detener el servicio
3. El servicio se detendrá

**Alternativa manual:**
1. Abre el Administrador de Tareas (`Ctrl+Shift+Esc`)
2. Busca el proceso `php.exe`
3. Finaliza el proceso relacionado con `sensor_websocket_service`

## Logs

Los logs se guardan automáticamente en:
```
D:\xampp\htdocs\LabVirtualUNNE\logs\sensor_service.log
```

Para ver los logs en tiempo real:
```cmd
type D:\xampp\htdocs\LabVirtualUNNE\logs\sensor_service.log
```

O usa el comando `tail` si tienes Git Bash instalado:
```bash
tail -f D:\xampp\htdocs\LabVirtualUNNE\logs\sensor_service.log
```

## Funcionamiento

1. El servicio se conecta al WebSocket del sensor (`ws://------:81/`)
2. Realiza el handshake WebSocket
3. Escucha continuamente los mensajes del sensor
4. Cuando recibe datos JSON con `temperatura` o `irradiancia`, los guarda en la tabla `datos_irradiancia`
5. Si la conexión se pierde, intenta reconectar automáticamente cada 5 segundos
6. Envía pings cada 30 segundos para mantener la conexión viva

## Estructura de Datos Esperada

El sensor debe enviar datos en formato JSON:
```json
{
  "temperatura": 25.5,
  "irradiancia": 850
}
```

## Tabla de Base de Datos

Los datos se guardan en la tabla `datos_irradiancia`:
```sql
INSERT INTO datos_irradiancia (temperatura, irradiancia, fecha_hora) 
VALUES (:temperatura, :irradiancia, NOW())
```

## Solución de Problemas

### El servicio no se conecta al sensor

1. Verifica que el sensor esté encendido y accesible en `-----:81`
2. Revisa los logs en `D:\xampp\htdocs\LabVirtualUNNE\logs\sensor_service.log`
3. Verifica que no haya firewall bloqueando la conexión

### El servicio se detiene solo

1. Revisa los logs para ver el error
2. Verifica que MySQL esté corriendo
3. Verifica que las credenciales de base de datos en `.env` sean correctas

### No se guardan datos en la base de datos

1. Verifica que la tabla `datos_irradiancia` exista
2. Revisa los logs para ver si hay errores de SQL
3. Verifica que el sensor esté enviando datos en el formato correcto

## Configuración Avanzada

Para cambiar la configuración del sensor, edita el archivo `sensor_websocket_service.php`:

```php
// Línea 30
$sensorWebSocketUrl = 'ws://-----/'; // Cambiar IP/puerto aquí

// Línea 31
$reconnectDelay = 5; // Cambiar tiempo de reconexión (segundos)
```

## Inicio Automático con Windows

Para que el servicio se inicie automáticamente al arrancar Windows:

1. Presiona `Win+R` y escribe `shell:startup`
2. Crea un acceso directo a `ejecutar_sensor_service_background.bat`
3. Copia el acceso directo a la carpeta que se abrió

Ahora el servicio se iniciará automáticamente al encender la computadora.

## Notas Importantes

- El servicio es **independiente de la página web** - no necesita usuarios loggeados
- Los datos se guardan **automáticamente** cada vez que el sensor envía información
- El servicio se **reconecta automáticamente** si pierde la conexión
- Los logs se guardan tanto en pantalla como en archivo para facilitar el debugging
- El servicio usa la misma estructura de base de datos que el resto del sistema

## Soporte

Si tienes problemas, revisa:
1. Los logs en `D:\xampp\htdocs\LabVirtualUNNE\logs\sensor_service.log`
2. Que XAMPP esté corriendo (Apache y MySQL)
3. Que el archivo `.env` tenga las credenciales correctas de base de datos
4. Que el sensor esté accesible en la red
