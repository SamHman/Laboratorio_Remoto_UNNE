<?php
// /app/api/diagnostico.php
// Herramienta de diagnóstico, adaptarla porque ahora sacamos datos de dos tablas 
// Cargar el autoloader de Composer para usar Dotenv
require __DIR__ . '/../../vendor/autoload.php';

// Establecer encabezados para una salida de texto plano clara
header('Content-Type: text/plain; charset=utf-8');

// Función para detener la ejecución y mostrar un error
function terminate_with_error($message, $code = 400) {
    http_response_code($code );
    die("ERROR: " . $message);
}

try {
    // 1. Cargar variables de entorno
    try {
        $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../../');
        $dotenv->load();
    } catch (\Exception $e) {
        terminate_with_error("No se pudo cargar el archivo .env. Asegúrese de que exista y sea legible.", 500);
    }

    // 2. Obtener y validar parámetros de fecha de la URL
    $start_str = $_GET['start'] ?? null;
    $end_str = $_GET['end'] ?? null;

    if (!$start_str || !$end_str) {
        terminate_with_error("Faltan los parámetros 'start' o 'end' en la URL. Ejemplo de uso: diagnostico.php?start=2023-10-03T14:00&end=2023-10-03T22:00");
    }

    // Reemplazar 'T' con un espacio para que sea un formato DATETIME válido para MySQL
    $start = str_replace('T', ' ', $start_str);
    $end = str_replace('T', ' ', $end_str);

    echo "--- SCRIPT DE DIAGNÓSTICO DE BASE DE DATOS ---\n\n";
    echo "Rango de fechas solicitado (formateado para MySQL):\n";
    echo "Inicio: " . htmlspecialchars($start) . "\n";
    echo "Fin:    " . htmlspecialchars($end) . "\n\n";

    // 3. Conexión a la Base de Datos
    $host = $_ENV['DB_HOST'] ?? 'localhost';
    $dbname = $_ENV['DB_NAME'] ?? 'labvirtual';
    $user = $_ENV['DB_USER'] ?? 'root';
    $pass = $_ENV['DB_PASSWORD'] ?? '';

    $pdo = new PDO(
        "mysql:host=$host;dbname=$dbname;charset=utf8mb4",
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );

    // 4. Establecer la zona horaria de la conexión (¡Punto clave!)
    $pdo->exec("SET time_zone = '-03:00'");
    echo "Zona horaria de la conexión MySQL establecida a '-03:00' (Argentina).\n\n";

    // 5. Ejecutar la consulta de conteo
    echo "Ejecutando consulta para contar registros...\n";
    $countStmt = $pdo->prepare("SELECT COUNT(*) as total FROM datos_experimento WHERE fecha_hora BETWEEN :start AND :end");
    $countStmt->execute([':start' => $start, ':end' => $end]);
    $totalRows = $countStmt->fetchColumn();

    echo "--- RESULTADOS ---\n\n";
    echo "Número total de registros encontrados en la base de datos: " . $totalRows . "\n\n";

    // 6. Ejecutar consulta para ver el primer y último registro encontrado
    if ($totalRows > 0) {
        echo "Buscando la primera y última fecha/hora de los registros encontrados...\n";
        $rangeStmt = $pdo->prepare("SELECT MIN(fecha_hora) as primera_fecha, MAX(fecha_hora) as ultima_fecha FROM datos_experimento WHERE fecha_hora BETWEEN :start AND :end");
        $rangeStmt->execute([':start' => $start, ':end' => $end]);
        $date_range = $rangeStmt->fetch();

        echo "Primera fecha/hora encontrada en el rango: " . $date_range['primera_fecha'] . "\n";
        echo "Última fecha/hora encontrada en el rango:  " . $date_range['ultima_fecha'] . "\n\n";
    } else {
        echo "No se encontraron registros, por lo que no se puede determinar el rango de fechas.\n\n";
    }

    echo "--- FIN DEL DIAGNÓSTICO ---\n";

} catch (\PDOException $e) {
    terminate_with_error("Error de base de datos: " . $e->getMessage(), 500);
} catch (\Exception $e) {
    terminate_with_error("Error inesperado: " . $e->getMessage(), 500);
}

?>
