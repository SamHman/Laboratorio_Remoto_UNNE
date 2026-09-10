<?php
/**
 * Este archivo es un endpoint de API REST que recibe y guarda datos de
 * medidos por el sensor de temperatura e irradiancia en una base de datos
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Cargar variables de entorno desde .env si existe
$envFile = __DIR__ . '/../../.env';
$env = [];

if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue; // Saltar comentarios
        
        list($key, $value) = explode('=', $line, 2);
        $env[trim($key)] = trim($value, "'\" \t\n\r\0\x0B");
    }
}

// Configuración de la base de datos - Usar valores de .env o valores por defecto
$host = $env['DB_HOST'] ?? 'localhost';
$dbname = $env['DB_NAME'] ?? 'labvirtual';
$username = $env['DB_USER'] ?? 'root';
$password = $env['DB_PASSWORD'] ?? '';

try {
    // Crear conexión PDO
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Obtener datos del cuerpo de la petición
    $rawInput = file_get_contents('php://input');
    
    // Validar que se recibieron datos
    if (empty($rawInput)) {
        throw new Exception('No se recibieron datos en la petición');
    }
    
    // Decodificar el JSON
    $input = json_decode($rawInput, true);
    
    // Verificar si hubo un error al decodificar el JSON
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Error al decodificar JSON: ' . json_last_error_msg() . '. Datos recibidos: ' . $rawInput);
    }
    
    // Verificar que $input es un array
    if (!is_array($input)) {
        throw new Exception('Los datos recibidos no son un JSON válido. Se esperaba un objeto JSON.');
    }
    
    // Log para depuración
    error_log("Datos recibidos: " . $rawInput);
    error_log("Datos decodificados: " . print_r($input, true));
    
    // Validar datos de entrada
    if (!isset($input['temperatura']) || !is_numeric($input['temperatura'])) {
        $errorMsg = 'Datos de temperatura no válidos. ';
        $errorMsg .= 'Tipo de dato: ' . (isset($input['temperatura']) ? gettype($input['temperatura']) : 'no definido') . '. ';
        $errorMsg .= 'Valor: ' . (isset($input['temperatura']) ? $input['temperatura'] : 'no definido');
        error_log($errorMsg);
        throw new Exception($errorMsg);
    }
    
    if (!isset($input['irradiancia']) || !is_numeric($input['irradiancia'])) {
        throw new Exception('Datos de irradiancia no válidos');
    }
    
    // Preparar y ejecutar la consulta SQL
    $stmt = $pdo->prepare("
        INSERT INTO datos_irradiancia (fecha, temperatura, irradiancia, fecha_importacion) 
        VALUES (NOW(), :temperatura, :irradiancia, NOW())
    ");
    
    $stmt->execute([
        ':temperatura' => floatval($input['temperatura']),
        ':irradiancia' => intval($input['irradiancia'])
    ]);
    
    // Respuesta de éxito
    echo json_encode([
        'status' => 'success',
        'message' => 'Datos guardados correctamente',
        'data' => [
            'fecha' => date('Y-m-d H:i:s'),
            'temperatura' => floatval($input['temperatura']),
            'irradiancia' => intval($input['irradiancia'])
        ]
    ]);
    
} catch (PDOException $e) {
    // Error de base de datos
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Error en la base de datos: ' . $e->getMessage()
    ]);
    
} catch (Exception $e) {
    // Otros errores
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ]);
}
