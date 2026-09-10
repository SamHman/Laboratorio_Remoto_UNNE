<?php
// API para gestionar la creación diferida del archivo InversorFault.txt
// Estructura basada en crear_orden_relay.php (versión estable)

require_once __DIR__ . '/cors_config.php';

// --- Debug logging ---------------------------------------------------------
$rootDir = realpath(__DIR__ . '/../../');
$logDir  = $rootDir !== false ? $rootDir . DIRECTORY_SEPARATOR . 'logs' : __DIR__ . '/../../logs';
@mkdir($logDir, 0777, true);
$debugLog = $logDir . DIRECTORY_SEPARATOR . 'crear_fault_relay_debug.log';

$reqInfo = [
    'time'        => date('c'),
    'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
    'method'      => $_SERVER['REQUEST_METHOD'] ?? 'unknown',
    'request_uri' => $_SERVER['REQUEST_URI'] ?? '',
    'headers'     => function_exists('getallheaders') ? getallheaders() : [],
];
@file_put_contents($debugLog, json_encode($reqInfo, JSON_UNESCAPED_UNICODE) . PHP_EOL, FILE_APPEND | LOCK_EX);
// --------------------------------------------------------------------------

// Ruta donde se creará el archivo de fault
$directory = realpath(__DIR__ . '/..') . DIRECTORY_SEPARATOR . 'Acciones';
if ($directory === false) {
    $directory = __DIR__ . '/../Acciones';
}
$filename = $directory . DIRECTORY_SEPARATOR . 'InversorFault.txt';

// Duración del contador (en segundos)
$COUNTER_SECONDS = 320;

// Permitir que el script siga corriendo aunque el cliente cierre la conexión
ignore_user_abort(true);
set_time_limit($COUNTER_SECONDS + 30); // margen extra

// Registrar inicio del contador en el log
@file_put_contents($debugLog, 'Contador iniciado (' . $COUNTER_SECONDS . 's)' . PHP_EOL, FILE_APPEND | LOCK_EX);

sleep($COUNTER_SECONDS);

$created = false;
if (!file_exists($filename)) {
    if (!is_dir($directory)) {
        @mkdir($directory, 0777, true);
    }
    $content = 'Fault detectado a las ' . date('c') . PHP_EOL;
    $created = @file_put_contents($filename, $content, FILE_APPEND | LOCK_EX) !== false;
}

// Registrar resultado
@file_put_contents($debugLog, ($created ? 'Archivo creado: ' : 'Archivo ya existente: ') . $filename . PHP_EOL, FILE_APPEND | LOCK_EX);

// Respuesta al cliente (json)
echo json_encode([
    'status'        => 'success',
    'counter_secs'  => $COUNTER_SECONDS,
    'file_created'  => $created,
    'file'          => $filename,
]);
?>
