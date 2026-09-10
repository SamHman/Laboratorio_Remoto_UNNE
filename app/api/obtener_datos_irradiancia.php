<?php
// Habilitar visualización de errores
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);

/**
 * Endpoint para obtener datos de irradiancia y temperatura
 * Devuelve los datos más recientes de la tabla datos_irradiancia
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
    
    // Verificar si la tabla existe
    $checkTable = $pdo->query("SHOW TABLES LIKE 'datos_irradiancia'");
    if ($checkTable->rowCount() === 0) {
        // La tabla no existe, devolver datos vacíos
        echo json_encode([
            'status' => 'ok',
            'success' => true,
            'data' => [],
            'ultimo_timestamp' => null,
            'timestamp_actual' => time(),
            'total_registros' => 0,
            'message' => 'Tabla datos_irradiancia no existe'
        ]);
        exit();
    }
    
    // Detectar el nombre de la columna de fecha (puede ser 'fecha' o 'fecha_hora')
    $columnsQuery = $pdo->query("SHOW COLUMNS FROM datos_irradiancia");
    $columns = $columnsQuery->fetchAll(PDO::FETCH_COLUMN);
    $fechaColumn = in_array('fecha_hora', $columns) ? 'fecha_hora' : 'fecha';
    
    // Construir la consulta para traer los más nuevos primero
    $query = "
        SELECT 
            {$fechaColumn} as fecha_hora,
            temperatura,
            irradiancia,
            UNIX_TIMESTAMP({$fechaColumn}) as timestamp
        FROM datos_irradiancia
    ";
    
    $params = [];
    
    if ($ultimoTimestamp) {
        $query .= " WHERE {$fechaColumn} > FROM_UNIXTIME(:ultimo_timestamp)";
        $params[':ultimo_timestamp'] = $ultimoTimestamp;
    }
    
    $query .= " ORDER BY {$fechaColumn} DESC LIMIT $limit";
    
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $datos = $stmt->fetchAll();
    
    // Si no hay datos, devolver array vacío (el frontend manejará los ceros)
    if (empty($datos)) {
        echo json_encode([
            'status' => 'ok',
            'success' => true,
            'data' => [],
            'ultimo_timestamp' => null,
            'timestamp_actual' => time(),
            'total_registros' => 0,
            'message' => 'No hay datos de irradiancia disponibles'
        ]);
        exit();
    }
    
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
    // Si hay un error de columna o tabla, devolver datos vacíos en lugar de error
    if (strpos($e->getMessage(), 'Column not found') !== false || 
        strpos($e->getMessage(), "doesn't exist") !== false ||
        strpos($e->getMessage(), 'Unknown column') !== false) {
        
        echo json_encode([
            'status' => 'ok',
            'success' => true,
            'data' => [],
            'ultimo_timestamp' => null,
            'timestamp_actual' => time(),
            'total_registros' => 0,
            'message' => 'Tabla o columna no encontrada, devolviendo datos vacíos'
        ]);
    } else {
        // Para otros errores, devolver el error
        http_response_code(500);
        echo json_encode([
            'status' => 'error',
            'success' => false,
            'message' => 'Error al obtener datos de irradiancia: ' . $e->getMessage(),
            'error' => [
                'code' => $e->getCode(),
                'file' => $e->getFile(),
                'line' => $e->getLine()
            ]
        ]);
    }
}
?>
