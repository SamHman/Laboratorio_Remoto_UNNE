<?php
//Endpoint de la dashboard
// Habilitar visualización de errores
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);

/**
 * Endpoint para obtener datos del inversor
 * Devuelve los datos más recientes de la tabla datos_inversor
 */

header('Content-Type: application/json');

// Configurar CORS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

// Manejar solicitudes OPTIONS para CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

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
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);

    // Obtener el último timestamp recibido (si existe)
    $ultimoTimestamp = isset($_GET['ultimo_timestamp']) ? $_GET['ultimo_timestamp'] : null;
    
    // Obtener el límite de registros (por defecto 100, pero configurable por GET)
    $limit = isset($_GET['limit']) && is_numeric($_GET['limit']) ? intval($_GET['limit']) : 100;
    
    // Construir la consulta para traer los más nuevos primero
    $query = "
        SELECT 
            fecha_hora,
            Vpv1, Vpv2, Ipv1, Ipv2, 
            Vac1, Vac2, Vac3, 
            Iac1, Iac2, Iac3, 
            Fac1, Fac2, Fac3, 
            Pac, EnergyToday, EnergyTotal, HourTotal,
            UNIX_TIMESTAMP(fecha_hora) as timestamp
        FROM datos_inversor
    ";
    
    $params = [];
    
    if ($ultimoTimestamp) {
        $query .= " WHERE fecha_hora > FROM_UNIXTIME(:ultimo_timestamp)";
        $params[':ultimo_timestamp'] = $ultimoTimestamp;
    }
    
    $query .= " ORDER BY fecha_hora DESC LIMIT $limit";
    
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $datos = $stmt->fetchAll();
    
    // Invertir el array para mostrar del más viejo al más nuevo
    $datos = array_reverse($datos);
    
    // Obtener el último timestamp para la próxima solicitud
    $nuevoTimestamp = null;
    if (!empty($datos)) {
        $ultimoRegistro = end($datos);
        $nuevoTimestamp = $ultimoRegistro['timestamp'];
    }
    
    // Formatear fechas para el frontend
    foreach ($datos as &$dato) {
        $dato['fecha_hora_formatted'] = date('H:i:s', strtotime($dato['fecha_hora']));
        unset($dato['timestamp']); // No es necesario enviar esto al frontend
    }
    
    echo json_encode([
        'status' => 'ok',
        'success' => true,
        'data' => $datos,
        'ultimo_timestamp' => $nuevoTimestamp,
        'timestamp_actual' => time(),
        'total_registros' => count($datos)
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'success' => false,
        'message' => 'Error al obtener datos del inversor: ' . $e->getMessage(),
        'error' => [
            'code' => $e->getCode(),
            'file' => $e->getFile(),
            'line' => $e->getLine()
        ]
    ]);
}
?>
