<?php
// Configurar CORS de forma segura usando configuración centralizada
//API para crear un .txt de registro de acciones
require_once __DIR__ . '/cors_config.php';

// --- Debug logging: registrar petición entrante para diagnosticar problemas desde el navegador
// Intentamos escribir en el directorio logs/ en la raíz del proyecto
$rootDir = realpath(__DIR__ . '/../../');
$logDir = $rootDir !== false ? $rootDir . DIRECTORY_SEPARATOR . 'logs' : __DIR__ . '/../../logs';
@mkdir($logDir, 0777, true);
$debugLog = $logDir . DIRECTORY_SEPARATOR . 'crear_orden_relay_debug.log';
$requestInfo = [
    'time' => date('c'),
    'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
    'method' => $_SERVER['REQUEST_METHOD'] ?? 'unknown',
    'request_uri' => $_SERVER['REQUEST_URI'] ?? '',
    'headers' => function_exists('getallheaders') ? getallheaders() : [],
    'raw_body_preview' => substr(file_get_contents('php://input'), 0, 200)
];
@file_put_contents($debugLog, json_encode($requestInfo, JSON_UNESCAPED_UNICODE) . PHP_EOL, FILE_APPEND | LOCK_EX);
// --- fin logging

// Obtener los datos del cuerpo de la solicitud
// Leer cuerpo raw y decodificar JSON
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

// Si no vino JSON intentar parsear _POST (por compatibilidad)
if ($data === null && !empty($_POST)) {
    $data = $_POST;
}

// Validar los datos
if (!isset($data['relayNum']) || !isset($data['action']) || !isset($data['timestamp'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Datos incompletos', 'received' => $data, 'raw' => substr($raw,0,200)]);
    exit;
}

$relayNum = $data['relayNum'];
$action = $data['action'];
$timestamp = $data['timestamp'];

// Crear el contenido del archivo
$content = "Relay {$relayNum} {$action} - {$timestamp}" . PHP_EOL;

// Directorio donde se guardarán los archivos

// Asegurarse de usar la ruta correcta (carpeta Acciones junto a app/)
$directory = realpath(__DIR__ . '/..') . DIRECTORY_SEPARATOR . 'Acciones';
if ($directory === false) {
    $directory = __DIR__ . '/../Acciones';
}
$filename = $directory . DIRECTORY_SEPARATOR . 'OrdenRelay.txt';

// Asegurarse de que el directorio existe
if (!is_dir($directory)) {
    if (!mkdir($directory, 0777, true)) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'No se pudo crear el directorio', 'dir' => $directory]);
        exit;
    }
}

// Escribir en el archivo
// Intentar escribir con LOCK_EX
$writeResult = @file_put_contents($filename, $content, FILE_APPEND | LOCK_EX);
if ($writeResult === false) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Error al escribir en el archivo', 'file' => $filename]);
    exit;
}

// También escribir en la carpeta RegistroDeAcciones dentro de Acciones como copia de seguridad.
//Esto debido a que el .bat de ciclo_automatizado al registrar el .txt lo eliminará a propósito
$registroDir = $directory . DIRECTORY_SEPARATOR . 'RegistroDeAcciones';
$registroFile = $registroDir . DIRECTORY_SEPARATOR . 'OrdenRelay.txt';
if (!is_dir($registroDir)) {
    @mkdir($registroDir, 0777, true);
}
@file_put_contents($registroFile, $content, FILE_APPEND | LOCK_EX);

// Responder con éxito
echo json_encode([
    'status' => 'success', 
    'message' => 'Orden registrada correctamente',
    'file' => $filename,
    'content' => trim($content)
]);
?>