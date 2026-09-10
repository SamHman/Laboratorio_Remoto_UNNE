<?php
/**
 * API para combinar datos de las tablas datos_fault y datos_inversor
 * Los datos se combinan ordenadamente por fecha y hora
 * Ubicación: D:\xampp\htdocs\LabVirtualUNNE\app\api\combinar_datos_fault_inversor.php
 */

header('Content-Type: application/json; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET');
header('Access-Control-Allow-Headers: Content-Type');

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

try {
    // Conectar a la base de datos
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Obtener estadísticas antes de la combinación
    $statsBefore = getTableStats($pdo);
    
    // Realizar la combinación de datos
    $result = mergeFaultAndInversorData($pdo);
    
    // Obtener estadísticas después de la combinación
    $statsAfter = getTableStats($pdo);
    
    echo json_encode([
        'status' => 'success',
        'message' => 'Combinación de datos completada exitosamente',
        'statistics' => [
            'before' => $statsBefore,
            'after' => $statsAfter,
            'changes' => [
                'datos_inversor_added' => $statsAfter['datos_inversor']['total_records'] - $statsBefore['datos_inversor']['total_records'],
                'datos_fault_processed' => $result['fault_records_processed']
            ]
        ],
        'result' => $result,
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_PRETTY_PRINT);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage(),
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_PRETTY_PRINT);
}

function getTableStats($pdo) {
    $stats = [];
    
    // Estadísticas de datos_inversor
    $stmt = $pdo->query("SELECT COUNT(*) as total, MIN(fecha_hora) as min_date, MAX(fecha_hora) as max_date FROM datos_inversor");
    $inversorStats = $stmt->fetch(PDO::FETCH_ASSOC);
    $stats['datos_inversor'] = [
        'total_records' => (int)$inversorStats['total'],
        'min_date' => $inversorStats['min_date'],
        'max_date' => $inversorStats['max_date']
    ];
    
    // Estadísticas de datos_fault
    $stmt = $pdo->query("SELECT COUNT(*) as total, MIN(fecha_hora) as min_date, MAX(fecha_hora) as max_date FROM datos_fault");
    $faultStats = $stmt->fetch(PDO::FETCH_ASSOC);
    $stats['datos_fault'] = [
        'total_records' => (int)$faultStats['total'],
        'min_date' => $faultStats['min_date'],
        'max_date' => $faultStats['max_date']
    ];
    
    return $stats;
}

function mergeFaultAndInversorData($pdo) {
    // Obtener todos los registros de datos_fault ordenados por fecha_hora
    $stmt = $pdo->query("
        SELECT 
            fecha_hora, Vpv1, Vpv2, Ipv1, Ipv2, Vac1, Vac2, Vac3,
            Iac1, Iac2, Iac3, Fac1, Fac2, Fac3, Pac,
            EnergyToday, EnergyTotal, HourTotal, archivo_origen
        FROM datos_fault
        ORDER BY fecha_hora ASC
    ");
    
    $faultRecords = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $totalFaultRecords = count($faultRecords);
    
    if ($totalFaultRecords === 0) {
        return [
            'fault_records_processed' => 0,
            'records_inserted' => 0,
            'records_updated' => 0,
            'message' => 'No hay registros en datos_fault para combinar'
        ];
    }
    
    $recordsInserted = 0;
    $recordsUpdated = 0;
    $recordsUnchanged = 0;
    $skippedRows = 0;
    $errors = [];
    
    // Preparar consultas: actualización e inserción (sin UPSERT)
    $updateSql = "UPDATE datos_inversor SET
        Vpv1 = :Vpv1,
        Vpv2 = :Vpv2,
        Ipv1 = :Ipv1,
        Ipv2 = :Ipv2,
        Vac1 = :Vac1,
        Vac2 = :Vac2,
        Vac3 = :Vac3,
        Iac1 = :Iac1,
        Iac2 = :Iac2,
        Iac3 = :Iac3,
        Fac1 = :Fac1,
        Fac2 = :Fac2,
        Fac3 = :Fac3,
        Pac = :Pac,
        EnergyToday = :EnergyToday,
        EnergyTotal = :EnergyTotal,
        HourTotal = :HourTotal,
        archivo_origen = :archivo_origen,
        fecha_importacion = NOW()
        WHERE fecha_hora = :fecha_hora";
    $updateStmt = $pdo->prepare($updateSql);

    $insertSql = "INSERT INTO datos_inversor (
        fecha_hora, Vpv1, Vpv2, Ipv1, Ipv2, Vac1, Vac2, Vac3,
        Iac1, Iac2, Iac3, Fac1, Fac2, Fac3, Pac,
        EnergyToday, EnergyTotal, HourTotal, archivo_origen, fecha_importacion
    ) VALUES (
        :fecha_hora, :Vpv1, :Vpv2, :Ipv1, :Ipv2, :Vac1, :Vac2, :Vac3,
        :Iac1, :Iac2, :Iac3, :Fac1, :Fac2, :Fac3, :Pac,
        :EnergyToday, :EnergyTotal, :HourTotal, :archivo_origen, NOW()
    )";
    $insertStmt = $pdo->prepare($insertSql);
    
    // Procesar cada registro de datos_fault
    foreach ($faultRecords as $record) {
        try {
            // Validar que fecha_hora exista y no esté vacía
            if (empty($record['fecha_hora']) || $record['fecha_hora'] === null) {
                $skippedRows++;
                $errors[] = "Registro descartado: fecha_hora vacía o nula";
                continue;
            }
            
            // Filtrar registros con valores fallidos (999.99, 9999.99, 8426, 8516, 202510)
            $fieldsToCheck = ['Vpv1', 'Vpv2', 'Ipv1', 'Ipv2', 'Vac1', 'Vac2', 'Vac3',
                              'Iac1', 'Iac2', 'Iac3', 'Fac1', 'Fac2', 'Fac3', 'Pac',
                              'EnergyToday', 'EnergyTotal', 'HourTotal'];
            
            // FILTRO: Descartar solo si todos los campos son NULL o 0.00
            $allNullOrZero = true;
            foreach ($fieldsToCheck as $nf) {
                $value = $record[$nf] ?? null;
                if (!is_null($value)) {
                    $numericValue = is_numeric($value) ? (float)$value : null;
                    if ($numericValue === null) {
                        // Si no es numérico, tratamos la fila como inválida
                        $allNullOrZero = false;
                        break;
                    }
                    if (abs($numericValue) > 1e-6) {
                        $allNullOrZero = false;
                        break;
                    }
                }
            }

            if ($allNullOrZero) {
                $skippedRows++;
                $errors[] = "Registro con fecha_hora {$record['fecha_hora']} descartado: todos los campos numéricos son 0.00 o NULL";
                continue;
            }

            // Contar cuántos campos tienen valores fallidos
            $failedCount = 0;
            foreach ($fieldsToCheck as $field) {
                if (isset($record[$field])) {
                    $value = $record[$field];
                    // Verificar valores de error: 999.99, 9999.99, 8426, 8516, 202510
                    if (abs($value - 999.99) < 0.01 || 
                        abs($value - 9999.99) < 0.01 || 
                        abs($value - 8426) < 0.01 ||
                        abs($value - 8516) < 0.01 ||
                        abs($value - 202510) < 0.01) {
                        $failedCount++;
                    }
                }
            }
            
            // Si más de 5 campos tienen valores fallidos, considerar el registro como inválido
            if ($failedCount >= 5) {
                $skippedRows++;
                $errors[] = "Registro con fecha_hora {$record['fecha_hora']} descartado por contener valores fallidos (999.99, 9999.99, 8426, 8516, 202510)";
                continue;
            }
            
            // Evitar duplicados con transacción y bloqueo
            $pdo->beginTransaction();
            
            try {
                // Verificar existencia con bloqueo FOR UPDATE para evitar race conditions
                $checkStmt = $pdo->prepare("
                    SELECT id FROM datos_inversor 
                    WHERE fecha_hora = :fecha_hora 
                    LIMIT 1 FOR UPDATE
                ");
                $checkStmt->execute([':fecha_hora' => $record['fecha_hora']]);
                $existingId = $checkStmt->fetchColumn();
                
                // Armar parámetros para UPDATE/INSERT
                $params = $record;
                if (!array_key_exists('archivo_origen', $params)) {
                    $params['archivo_origen'] = null;
                }
                
                if ($existingId) {
                    // Ya existe: actualizar solo si los valores son diferentes
                    $updateStmt->execute($params);
                    if ($updateStmt->rowCount() > 0) {
                        $recordsUpdated++;
                    } else {
                        $recordsUnchanged++;
                    }
                } else {
                    // No existe: insertar
                    $insertStmt->execute($params);
                    $recordsInserted++;
                }
                
                $pdo->commit();
                
            } catch (Exception $txException) {
                $pdo->rollBack();
                throw $txException;
            }
            
        } catch (Exception $e) {
            $errors[] = "Error al procesar registro con fecha_hora {$record['fecha_hora']}: " . $e->getMessage();
        }
    }
    
    return [
        'fault_records_processed' => $totalFaultRecords,
        'records_inserted' => $recordsInserted,
        'records_updated' => $recordsUpdated,
        'records_unchanged' => $recordsUnchanged,
        'records_skipped' => $skippedRows,
        'errors' => $errors,
        'message' => "Se procesaron $totalFaultRecords registros de datos_fault: $recordsInserted insertados, $recordsUpdated actualizados, $recordsUnchanged sin cambios, $skippedRows descartados por valores fallidos"
    ];
}
?>
