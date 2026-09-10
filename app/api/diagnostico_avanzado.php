<?php
// diagnostico_avanzado.php - Script para diagnosticar el problema de pérdida de datos

// Herramienta de diagnóstico, adaptarla porque ahora sacamos datos de dos tablas 

require __DIR__ . '/../../vendor/autoload.php';
header('Content-Type: text/plain; charset=utf-8');

function terminate_with_error($message, $code = 400) {
    http_response_code($code);
    die("ERROR: " . $message);
}

try {
    // Cargar variables de entorno
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../../');
    $dotenv->load();

    // Obtener parámetros
    $start_str = $_GET['start'] ?? '2025-07-26T14:00';
    $end_str = $_GET['end'] ?? '2025-07-26T22:00';
    
    $start = str_replace('T', ' ', $start_str);
    $end = str_replace('T', ' ', $end_str);

    echo "=== DIAGNÓSTICO AVANZADO DE PÉRDIDA DE DATOS ===\n\n";
    echo "Rango solicitado: $start hasta $end\n\n";

    // Conexión a la base de datos
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

    $pdo->exec("SET time_zone = '-03:00'");

    // 1. Análisis de distribución temporal
    echo "1. ANÁLISIS DE DISTRIBUCIÓN TEMPORAL\n";
    echo "=====================================\n";
    
    $hourlyStmt = $pdo->prepare("
        SELECT 
            HOUR(fecha_hora) as hora,
            COUNT(*) as cantidad_registros,
            MIN(fecha_hora) as primer_registro,
            MAX(fecha_hora) as ultimo_registro
        FROM datos_experimento 
        WHERE fecha_hora BETWEEN :start AND :end 
        GROUP BY HOUR(fecha_hora)
        ORDER BY hora
    ");
    $hourlyStmt->execute([':start' => $start, ':end' => $end]);
    $hourlyData = $hourlyStmt->fetchAll();

    foreach ($hourlyData as $row) {
        echo sprintf("Hora %02d:xx - %d registros (desde %s hasta %s)\n", 
            $row['hora'], 
            $row['cantidad_registros'],
            $row['primer_registro'],
            $row['ultimo_registro']
        );
    }

    // 2. Análisis de gaps temporales
    echo "\n2. ANÁLISIS DE GAPS TEMPORALES\n";
    echo "===============================\n";
    
    $gapStmt = $pdo->prepare("
        SELECT 
            fecha_hora,
            LAG(fecha_hora) OVER (ORDER BY fecha_hora) as fecha_anterior,
            TIMESTAMPDIFF(SECOND, LAG(fecha_hora) OVER (ORDER BY fecha_hora), fecha_hora) as gap_segundos
        FROM datos_experimento 
        WHERE fecha_hora BETWEEN :start AND :end 
        ORDER BY fecha_hora
    ");
    $gapStmt->execute([':start' => $start, ':end' => $end]);
    $gaps = $gapStmt->fetchAll();

    $largeGaps = array_filter($gaps, function($row) {
        return $row['gap_segundos'] > 60; // Gaps mayores a 1 minuto
    });

    if (count($largeGaps) > 0) {
        echo "Gaps significativos encontrados (>60 segundos):\n";
        foreach (array_slice($largeGaps, 0, 10) as $gap) {
            echo sprintf("Gap de %d segundos entre %s y %s\n", 
                $gap['gap_segundos'], 
                $gap['fecha_anterior'], 
                $gap['fecha_hora']
            );
        }
        if (count($largeGaps) > 10) {
            echo "... y " . (count($largeGaps) - 10) . " gaps más.\n";
        }
    } else {
        echo "No se encontraron gaps significativos en los datos.\n";
    }

    // 3. Simulación del procesamiento por lotes
    echo "\n3. SIMULACIÓN DEL PROCESAMIENTO POR LOTES\n";
    echo "==========================================\n";
    
    $batchSize = 1000;
    $offset = 0;
    $totalProcessed = 0;
    $batchCount = 0;

    do {
        $batchStmt = $pdo->prepare("
            SELECT COUNT(*) as count 
            FROM datos_experimento 
            WHERE fecha_hora BETWEEN :start AND :end 
            ORDER BY fecha_hora ASC 
            LIMIT :offset, :batchSize
        ");
        $batchStmt->bindValue(':start', $start, PDO::PARAM_STR);
        $batchStmt->bindValue(':end', $end, PDO::PARAM_STR);
        $batchStmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $batchStmt->bindValue(':batchSize', $batchSize, PDO::PARAM_INT);
        $batchStmt->execute();

        $currentBatchSize = $batchStmt->fetchColumn();
        $totalProcessed += $currentBatchSize;
        $batchCount++;
        
        echo "Lote $batchCount: $currentBatchSize registros (Total procesado: $totalProcessed)\n";
        
        $offset += $batchSize;
        
    } while ($currentBatchSize === $batchSize);

    echo "\nTotal de registros procesados por lotes: $totalProcessed\n";

    // 4. Verificación de duplicados
    echo "\n4. VERIFICACIÓN DE DUPLICADOS\n";
    echo "==============================\n";
    
    $duplicateStmt = $pdo->prepare("
        SELECT fecha_hora, COUNT(*) as duplicados
        FROM datos_experimento 
        WHERE fecha_hora BETWEEN :start AND :end 
        GROUP BY fecha_hora
        HAVING COUNT(*) > 1
        ORDER BY duplicados DESC
        LIMIT 10
    ");
    $duplicateStmt->execute([':start' => $start, ':end' => $end]);
    $duplicates = $duplicateStmt->fetchAll();

    if (count($duplicates) > 0) {
        echo "Registros duplicados encontrados:\n";
        foreach ($duplicates as $dup) {
            echo "Fecha/hora: {$dup['fecha_hora']} - {$dup['duplicados']} registros\n";
        }
    } else {
        echo "No se encontraron registros duplicados.\n";
    }

    // 5. Resumen final
    echo "\n5. RESUMEN FINAL\n";
    echo "=================\n";
    
    $totalStmt = $pdo->prepare("SELECT COUNT(*) FROM datos_experimento WHERE fecha_hora BETWEEN :start AND :end");
    $totalStmt->execute([':start' => $start, ':end' => $end]);
    $totalInDB = $totalStmt->fetchColumn();
    
    echo "Total de registros en base de datos: $totalInDB\n";
    echo "Total procesado por simulación de lotes: $totalProcessed\n";
    echo "Diferencia: " . ($totalInDB - $totalProcessed) . "\n";

} catch (\Exception $e) {
    terminate_with_error("Error: " . $e->getMessage(), 500);
}
?>