<?php
// Configuración de errores
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Configurar cabeceras
header('Content-Type: text/plain; charset=utf-8');

// Incluir configuración CORS
require_once __DIR__ . '/cors_config.php';

// Configuración de la base de datos
define('DB_HOST', 'localhost');
define('DB_NAME', 'labvirtual');  // Ajusta esto al nombre de tu base de datos
define('DB_USER', 'root');           // Ajusta al usuario de tu base de datos
define('DB_PASS', '');               // Ajusta la contraseña de tu base de datos

// Iniciar sesión para manejar autenticación si es necesario
session_start();

// Verificar si el usuario está autenticado (opcional, descomentar si es necesario)
/*
if (!isset($_SESSION['usuario_id'])) {
    die("Acceso no autorizado");
}
*/

try {
    // Obtener conexión PDO
    $db = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    
    // Verificar si la tabla de irradiancia existe
    $tableCheck = $db->query("SHOW TABLES LIKE 'datos_irradiancia'");
    if ($tableCheck->rowCount() === 0) {
        die("ERROR: La tabla 'datos_irradiancia' no existe en la base de datos.\n");
    }
    
    // Obtener información de la estructura de la tabla
    echo "=== INFORMACIÓN DE LA TABLA DATOS_IRRADIANCIA ===\n";
    $columns = $db->query("SHOW COLUMNS FROM datos_irradiancia");
    echo "Columnas en la tabla datos_irradiancia:\n";
    foreach ($columns as $col) {
        echo "- {$col['Field']} ({$col['Type']})\n";
    }
    
    // Verificar la columna de fecha/hora
    $fechaColumn = 'fecha_hora';
    $dateColumns = $db->query("SHOW COLUMNS FROM datos_irradiancia WHERE Type LIKE '%date%' OR Type LIKE '%time%'");
    if ($dateColumns->rowCount() > 0) {
        $fechaColumn = $dateColumns->fetch()['Field'];
    }
    echo "\nColumna de fecha/hora detectada: $fechaColumn\n\n";
    
    // Obtener el rango de fechas disponible
    $dateRange = $db->query("SELECT MIN($fechaColumn) as min_date, MAX($fechaColumn) as max_date, COUNT(*) as total FROM datos_irradiancia");
    $range = $dateRange->fetch();
    
    echo "=== RANGO DE DATOS DISPONIBLES ===\n";
    echo "Primer registro: " . ($range['min_date'] ?? 'Ningún dato') . "\n";
    echo "Último registro: " . ($range['max_date'] ?? 'Ningún dato') . "\n";
    echo "Total de registros: " . ($range['total'] ?? 0) . "\n\n";
    
    // Si no hay datos, terminar
    if (empty($range['total'])) {
        die("No hay datos de irradiancia en la base de datos.\n");
    }
    
    // Obtener los últimos 5 registros como muestra
    echo "=== MUESTRA DE DATOS RECIENTES ===\n";
    $recentData = $db->query("SELECT * FROM datos_irradiancia ORDER BY $fechaColumn DESC LIMIT 5");
    foreach ($recentData as $i => $row) {
        echo "\nRegistro #" . ($i + 1) . " (" . $row[$fechaColumn] . "):\n";
        foreach ($row as $key => $value) {
            if ($key !== $fechaColumn) {
                echo "  $key: $value\n";
            }
        }
    }
    
    // Verificar si hay datos de irradiancia para las últimas 24 horas
    $last24h = $db->query("SELECT 
        COUNT(*) as total,
        MIN($fechaColumn) as min_date,
        MAX($fechaColumn) as max_date,
        AVG(temperatura) as avg_temp,
        AVG(irradiancia) as avg_irrad
        FROM datos_irradiancia 
        WHERE $fechaColumn >= NOW() - INTERVAL 24 HOUR");
    $stats24h = $last24h->fetch();
    
    echo "\n=== ESTADÍSTICAS DE LAS ÚLTIMAS 24 HORAS ===\n";
    echo "Registros: " . ($stats24h['total'] ?? 0) . "\n";
    echo "Desde: " . ($stats24h['min_date'] ?? 'Ningún dato') . "\n";
    echo "Hasta: " . ($stats24h['max_date'] ?? 'Ningún dato') . "\n";
    echo "Temperatura promedio: " . round($stats24h['avg_temp'] ?? 0, 2) . "°C\n";
    echo "Irradiancia promedio: " . round($stats24h['avg_irrad'] ?? 0, 2) . " W/m²\n";
    
    // Verificar si hay datos coincidentes con los del inversor
    $inversorData = $db->query("SELECT 
        COUNT(*) as total,
        MIN(fecha_hora) as min_date,
        MAX(fecha_hora) as max_date
        FROM datos_inversor 
        WHERE fecha_hora >= NOW() - INTERVAL 24 HOUR")->fetch();
    
    echo "\n=== DATOS DEL INVERSOR (ÚLTIMAS 24H) ===\n";
    echo "Registros: " . ($inversorData['total'] ?? 0) . "\n";
    echo "Desde: " . ($inversorData['min_date'] ?? 'Ningún dato') . "\n";
    echo "Hasta: " . ($inversorData['max_date'] ?? 'Ningún dato') . "\n";
    
    // Verificar si hay coincidencias de fechas
    if (!empty($inversorData['total']) && !empty($stats24h['total'])) {
        echo "\n=== PRUEBA DE COINCIDENCIA DE DATOS ===\n";
        
        // Probar con los últimos 5 registros del inversor
        $testStmt = $db->prepare("SELECT 
            i.fecha_hora as inversor_fecha,
            (SELECT temperatura FROM datos_irradiancia WHERE $fechaColumn <= i.fecha_hora ORDER BY $fechaColumn DESC LIMIT 1) as temperatura,
            (SELECT irradiancia FROM datos_irradiancia WHERE $fechaColumn <= i.fecha_hora ORDER BY $fechaColumn DESC LIMIT 1) as irradiancia
            FROM datos_inversor i
            WHERE i.fecha_hora >= NOW() - INTERVAL 24 HOUR
            ORDER BY i.fecha_hora DESC
            LIMIT 5");
        $testStmt->execute();
        $testResults = $testStmt->fetchAll();
        
        echo "\nÚltimos 5 registros del inversor con datos de irradiancia:\n";
        foreach ($testResults as $row) {
            echo "\nFecha: " . $row['inversor_fecha'] . "\n";
            echo "Temperatura: " . ($row['temperatura'] ?? 'NULL') . "°C\n";
            echo "Irradiancia: " . ($row['irradiancia'] ?? 'NULL') . " W/m²\n";
        }
    }
    
} catch (PDOException $e) {
    die("Error en la base de datos: " . $e->getMessage() . "\n");
}

echo "\n=== FIN DEL DIAGNÓSTICO ===\n";
?>
