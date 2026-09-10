<?php
/**
 * Servicio independiente para recibir datos del sensor WebSocket
 * Este script se ejecuta en segundo plano sin depender de usuarios loggeados
 * Ubicación: D:\xampp\htdocs\LabVirtualUNNE\app\api\sensor_websocket_service.php
 * 
 * Uso: php sensor_websocket_service.php
 */

header('Content-Type: application/json; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Cargar variables de entorno desde .env si existe
$envFile = __DIR__ . '/../../.env';
$env = [];

if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        
        list($key, $value) = explode('=', $line, 2);
        $env[trim($key)] = trim($value, "'\" \t\n\r\0\x0B");
    }
}

// Configuración de la base de datos
$host = $env['DB_HOST'] ?? 'localhost';
$dbname = $env['DB_NAME'] ?? 'labvirtual';
$username = $env['DB_USER'] ?? 'root';
$password = $env['DB_PASSWORD'] ?? '';

// Configuración del sensor WebSocket
// IMPORTANTE: Actualizar esta IP según la red donde esté el sensor ESP32
// Si el sensor ESP32 está en 10.40.131.224, usar esa IP
$sensorWebSocketUrl = 'ws://10.40.131.230:81/'; // IP actualizada del sensor ESP32
$reconnectDelay = 5; // segundos
$maxReconnectAttempts = 999999; // Intentos infinitos

// Log de inicio
logMessage("=== Servicio de sensor WebSocket iniciado ===");
logMessage("URL del sensor: $sensorWebSocketUrl");

// Conectar a la base de datos
try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    logMessage("Conexión a base de datos establecida");
} catch (PDOException $e) {
    logMessage("ERROR: No se pudo conectar a la base de datos: " . $e->getMessage());
    exit(1);
}

// Contador de reconexiones
$reconnectAttempts = 0;

// Bucle principal - Mantener el servicio corriendo
while (true) {
    try {
        logMessage("Iniciando conexión al sensor WebSocket...");
        connectToSensorWebSocket($sensorWebSocketUrl, $pdo);
        
        // Si llegamos aquí, la conexión se cerró
        $reconnectAttempts++;
        logMessage("Conexión WebSocket cerrada. Intento de reconexión $reconnectAttempts/$maxReconnectAttempts");
        
        if ($reconnectAttempts >= $maxReconnectAttempts) {
            logMessage("ERROR: Máximo número de intentos de reconexión alcanzado");
            exit(1);
        }
        
        logMessage("Esperando $reconnectDelay segundos antes de reconectar...");
        sleep($reconnectDelay);
        
    } catch (Exception $e) {
        logMessage("ERROR: " . $e->getMessage());
        $reconnectAttempts++;
        
        if ($reconnectAttempts >= $maxReconnectAttempts) {
            logMessage("ERROR: Máximo número de intentos de reconexión alcanzado");
            exit(1);
        }
        
        logMessage("Esperando $reconnectDelay segundos antes de reconectar...");
        sleep($reconnectDelay);
    }
}

/**
 * Conectar al WebSocket del sensor y procesar datos
 */
function connectToSensorWebSocket($url, $pdo) {
    // Parsear la URL del WebSocket
    $urlParts = parse_url($url);
    $host = $urlParts['host'];
    $port = $urlParts['port'] ?? 80;
    $path = $urlParts['path'] ?? '/';
    
    logMessage("Conectando a $host:$port$path");
    
    // Crear socket TCP
    $socket = @fsockopen($host, $port, $errno, $errstr, 30);
    
    if (!$socket) {
        throw new Exception("No se pudo conectar al WebSocket: $errstr ($errno)");
    }
    
    logMessage("Socket TCP establecido");
    
    // Enviar handshake WebSocket
    $key = base64_encode(openssl_random_pseudo_bytes(16));
    $handshake = "GET $path HTTP/1.1\r\n" .
                 "Host: $host:$port\r\n" .
                 "Upgrade: websocket\r\n" .
                 "Connection: Upgrade\r\n" .
                 "Sec-WebSocket-Key: $key\r\n" .
                 "Sec-WebSocket-Version: 13\r\n" .
                 "\r\n";
    
    fwrite($socket, $handshake);
    
    // Leer respuesta del handshake
    $response = '';
    while ($line = fgets($socket)) {
        $response .= $line;
        if (trim($line) === '') break;
    }
    
    if (strpos($response, '101 Switching Protocols') === false) {
        fclose($socket);
        throw new Exception("Handshake WebSocket falló. Respuesta: " . substr($response, 0, 200));
    }
    
    logMessage("Handshake WebSocket exitoso. Conexión establecida.");
    
    // Configurar socket como no bloqueante
    stream_set_blocking($socket, false);
    
    // Leer datos continuamente
    $buffer = '';
    $lastDataTime = time();
    $heartbeatInterval = 30; // segundos
    
    while (!feof($socket)) {
        // Leer datos del socket
        $data = fread($socket, 8192);
        
        if ($data !== false && strlen($data) > 0) {
            $buffer .= $data;
            $lastDataTime = time();
            
            // Procesar frames WebSocket completos
            while (strlen($buffer) >= 2) {
                $frame = decodeWebSocketFrame($buffer);
                
                if ($frame === null) {
                    // Frame incompleto, esperar más datos
                    break;
                }
                
                if ($frame === false) {
                    // Error en el frame, limpiar buffer
                    logMessage("ADVERTENCIA: Frame WebSocket inválido, limpiando buffer");
                    $buffer = '';
                    break;
                }
                
                // Procesar el frame
                if ($frame['opcode'] === 0x1) { // Text frame
                    processJsonData($frame['payload'], $pdo);
                } elseif ($frame['opcode'] === 0x8) { // Close frame
                    logMessage("Frame de cierre recibido del servidor");
                    fclose($socket);
                    return;
                } elseif ($frame['opcode'] === 0x9) { // Ping frame
                    // Responder con Pong
                    $pongFrame = encodeWebSocketFrame($frame['payload'], 0xA);
                    fwrite($socket, $pongFrame);
                }
            }
        }
        
        // Verificar timeout (si no hay datos en 60 segundos, reconectar)
        if (time() - $lastDataTime > 60) {
            logMessage("ADVERTENCIA: No se han recibido datos en 60 segundos. Reconectando...");
            fclose($socket);
            return;
        }
        
        // Enviar ping cada 30 segundos para mantener la conexión viva
        if (time() % $heartbeatInterval === 0) {
            $pingFrame = encodeWebSocketFrame('ping', 0x9);
            @fwrite($socket, $pingFrame);
        }
        
        // Pequeña pausa para no consumir 100% CPU
        usleep(100000); // 100ms
    }
    
    fclose($socket);
    logMessage("Conexión WebSocket cerrada");
}

/**
 * Decodificar un frame WebSocket
 */
function decodeWebSocketFrame(&$buffer) {
    if (strlen($buffer) < 2) {
        return null; // Frame incompleto
    }
    
    $byte1 = ord($buffer[0]);
    $byte2 = ord($buffer[1]);
    
    $opcode = $byte1 & 0x0F;
    $masked = ($byte2 & 0x80) !== 0;
    $payloadLength = $byte2 & 0x7F;
    
    $offset = 2;
    
    // Leer longitud extendida si es necesario
    if ($payloadLength === 126) {
        if (strlen($buffer) < 4) return null;
        $payloadLength = unpack('n', substr($buffer, 2, 2))[1];
        $offset = 4;
    } elseif ($payloadLength === 127) {
        if (strlen($buffer) < 10) return null;
        $payloadLength = unpack('J', substr($buffer, 2, 8))[1];
        $offset = 10;
    }
    
    // Leer máscara si está presente
    $maskingKey = '';
    if ($masked) {
        if (strlen($buffer) < $offset + 4) return null;
        $maskingKey = substr($buffer, $offset, 4);
        $offset += 4;
    }
    
    // Verificar si tenemos el payload completo
    if (strlen($buffer) < $offset + $payloadLength) {
        return null; // Frame incompleto
    }
    
    // Extraer payload
    $payload = substr($buffer, $offset, $payloadLength);
    
    // Desenmascar si es necesario
    if ($masked) {
        for ($i = 0; $i < strlen($payload); $i++) {
            $payload[$i] = chr(ord($payload[$i]) ^ ord($maskingKey[$i % 4]));
        }
    }
    
    // Remover el frame procesado del buffer
    $buffer = substr($buffer, $offset + $payloadLength);
    
    return [
        'opcode' => $opcode,
        'payload' => $payload
    ];
}

/**
 * Codificar un frame WebSocket
 */
function encodeWebSocketFrame($payload, $opcode = 0x1) {
    $frame = chr(0x80 | $opcode); // FIN + opcode
    
    $payloadLength = strlen($payload);
    
    if ($payloadLength <= 125) {
        $frame .= chr($payloadLength);
    } elseif ($payloadLength <= 65535) {
        $frame .= chr(126) . pack('n', $payloadLength);
    } else {
        $frame .= chr(127) . pack('J', $payloadLength);
    }
    
    $frame .= $payload;
    
    return $frame;
}

/**
 * Procesar datos JSON del sensor
 */
function processJsonData($jsonString, $pdo) {
    try {
        $data = json_decode($jsonString, true);
        
        if ($data === null) {
            logMessage("ADVERTENCIA: No se pudo decodificar JSON: " . substr($jsonString, 0, 100));
            return;
        }
        
        // Verificar si contiene datos de temperatura o irradiancia
        if (isset($data['temperatura']) || isset($data['irradiancia'])) {
            saveSensorData($data, $pdo);
        } else {
            // Log de datos recibidos que no son de sensor
            // logMessage("INFO: Datos recibidos (no son de sensor): " . substr($jsonString, 0, 100));
        }
        
    } catch (Exception $e) {
        logMessage("ERROR procesando JSON: " . $e->getMessage());
    }
}

/**
 * Guardar datos del sensor en la base de datos
 */
function saveSensorData($data, $pdo) {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO datos_irradiancia (temperatura, irradiancia, fecha_hora) 
            VALUES (:temperatura, :irradiancia, NOW())
        ");
        
        $temperatura = isset($data['temperatura']) && is_numeric($data['temperatura']) 
                      ? floatval($data['temperatura']) 
                      : null;
        
        $irradiancia = isset($data['irradiancia']) && is_numeric($data['irradiancia']) 
                      ? floatval($data['irradiancia']) 
                      : null;
        
        $stmt->execute([
            ':temperatura' => $temperatura,
            ':irradiancia' => $irradiancia
        ]);
        
        logMessage("Datos guardados: T=" . ($temperatura ?? 'null') . "°C, I=" . ($irradiancia ?? 'null') . " W/m²");
        
    } catch (PDOException $e) {
        logMessage("ERROR guardando datos: " . $e->getMessage());
    }
}

/**
 * Función de logging con timestamp
 */
function logMessage($message) {
    $timestamp = date('Y-m-d H:i:s');
    echo "[$timestamp] $message\n";
    
    // También guardar en archivo de log
    $logFile = __DIR__ . '/../../logs/sensor_service.log';
    $logDir = dirname($logFile);
    
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0777, true);
    }
    
    @file_put_contents($logFile, "[$timestamp] $message\n", FILE_APPEND);
}
?>
