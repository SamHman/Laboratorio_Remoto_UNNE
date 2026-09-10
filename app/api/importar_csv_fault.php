<?php
/**
 * API para importar archivos CSV de la carpeta Interrupciones a la tabla datos_fault
 * Ubicación: D:\xampp\htdocs\LabVirtualUNNE\app\api\importar_csv_fault.php
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

// Ruta a la carpeta de interrupciones
$interrupcionesDir = 'D:/xampp/htdocs/mediciones/Interrupciones/';

if (!is_dir($interrupcionesDir)) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => "No se encontró la carpeta de interrupciones: $interrupcionesDir",
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_PRETTY_PRINT);
    exit;
}

try {
    // Conectar a la base de datos
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Buscar archivos CSV en la carpeta Interrupciones
    $pattern = $interrupcionesDir . "*.csv";
    $csvFiles = glob($pattern);
    
    if (empty($csvFiles)) {
        echo json_encode([
            'status' => 'warning',
            'message' => 'No se encontraron archivos CSV en la carpeta de interrupciones',
            'search_pattern' => $pattern,
            'timestamp' => date('Y-m-d H:i:s')
        ], JSON_PRETTY_PRINT);
        exit;
    }
    
    $results = [];
    $totalImported = 0;
    $totalSkipped = 0;
    $totalErrors = 0;
    
    foreach ($csvFiles as $csvFile) {
        $filename = basename($csvFile);
        $fileResult = processCsvFault($csvFile, $pdo);
        $results[$filename] = $fileResult;
        
        $totalImported += $fileResult['imported_rows'];
        $totalSkipped += $fileResult['skipped_rows'];
        $totalErrors += count($fileResult['errors']);
    }
    
    echo json_encode([
        'status' => 'success',
        'message' => 'Importación de archivos CSV de interrupciones completada',
        'summary' => [
            'processed_files' => count($csvFiles),
            'total_imported_rows' => $totalImported,
            'total_skipped_rows' => $totalSkipped,
            'total_errors' => $totalErrors
        ],
        'results' => $results,
        'search_pattern' => $pattern,
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

function processCsvFault($filePath, $pdo) {
    $filename = basename($filePath);
    
    // Obtener la última fecha/hora importada para este archivo
    $stmt = $pdo->prepare("
        SELECT MAX(fecha_hora) as last_import_time 
        FROM datos_fault 
        WHERE archivo_origen = :filename
    ");
    $stmt->execute([':filename' => $filename]);
    $lastImportTime = $stmt->fetchColumn();
    
    // Leer el archivo CSV
    $handle = fopen($filePath, 'r');
    if ($handle === false) {
        throw new Exception("No se pudo abrir el archivo CSV: $filename");
    }
    
    $importedRows = 0;
    $skippedRows = 0;
    $errors = [];
    $lineNumber = 0;
    
    // Leer la primera línea (encabezado)
    $header = fgetcsv($handle, 0, ',', '"', '\\');
    $lineNumber++;
    
    if ($header === false || empty($header)) {
        fclose($handle);
        throw new Exception("El archivo CSV no tiene encabezado: $filename");
    }
    
    // Mapeo de columnas del CSV
    // Fecha_Hora,Vpv1,Vpv2,Ipv1,Ipv2,Vac1,Vac2,Vac3,Iac1,Iac2,Iac3,Fac1,Fac2,Fac3,Pac,E_Today,E_Total,H_total
    $columnMap = [
        'Fecha_Hora' => 0,
        'Vpv1' => 1,
        'Vpv2' => 2,
        'Ipv1' => 3,
        'Ipv2' => 4,
        'Vac1' => 5,
        'Vac2' => 6,
        'Vac3' => 7,
        'Iac1' => 8,
        'Iac2' => 9,
        'Iac3' => 10,
        'Fac1' => 11,
        'Fac2' => 12,
        'Fac3' => 13,
        'Pac' => 14,
        'E_Today' => 15,
        'E_Total' => 16,
        'H_total' => 17
    ];
    
    // Procesar cada línea de datos
    while (($data = fgetcsv($handle, 0, ',', '"', '\\')) !== false) {
        $lineNumber++;
        
        // Saltar líneas vacías
        if (empty($data) || (count($data) === 1 && empty($data[0]))) {
            continue;
        }
        
        try {
            // Verificar que tenemos suficientes columnas
            if (count($data) < 18) {
                $skippedRows++;
                $errors[] = "Línea $lineNumber: Número insuficiente de columnas (" . count($data) . " de 18)";
                continue;
            }
            
            // Obtener fecha y hora
            $fechaHora = trim($data[$columnMap['Fecha_Hora']]);
            
            if (empty($fechaHora)) {
                $skippedRows++;
                $errors[] = "Línea $lineNumber: Fecha/hora vacía";
                continue;
            }
            
            // Validar formato de fecha/hora
            $datetime = parseDateTime($fechaHora);
            
            // Saltar si ya fue importado
            if ($lastImportTime && $datetime <= $lastImportTime) {
                $skippedRows++;
                continue;
            }
            
            // Recopilar datos de la fila
            $rowData = [
                'fecha_hora' => $datetime,
                'Vpv1' => parseNumericValue($data[$columnMap['Vpv1']]),
                'Vpv2' => parseNumericValue($data[$columnMap['Vpv2']]),
                'Ipv1' => parseNumericValue($data[$columnMap['Ipv1']]),
                'Ipv2' => parseNumericValue($data[$columnMap['Ipv2']]),
                'Vac1' => parseNumericValue($data[$columnMap['Vac1']]),
                'Vac2' => parseNumericValue($data[$columnMap['Vac2']]),
                'Vac3' => parseNumericValue($data[$columnMap['Vac3']]),
                'Iac1' => parseNumericValue($data[$columnMap['Iac1']]),
                'Iac2' => parseNumericValue($data[$columnMap['Iac2']]),
                'Iac3' => parseNumericValue($data[$columnMap['Iac3']]),
                'Fac1' => parseNumericValue($data[$columnMap['Fac1']]),
                'Fac2' => parseNumericValue($data[$columnMap['Fac2']]),
                'Fac3' => parseNumericValue($data[$columnMap['Fac3']]),
                'Pac' => parseNumericValue($data[$columnMap['Pac']]),
                'EnergyToday' => parseNumericValue($data[$columnMap['E_Today']]),
                'EnergyTotal' => parseNumericValue($data[$columnMap['E_Total']]),
                'HourTotal' => parseNumericValue($data[$columnMap['H_total']])
            ];
            
            // Descartar filas completamente nulas (todos los campos numéricos en null)
            $numericFields = ['Vpv1','Vpv2','Ipv1','Ipv2','Vac1','Vac2','Vac3','Iac1','Iac2','Iac3','Fac1','Fac2','Fac3','Pac','EnergyToday','EnergyTotal','HourTotal'];
            $nonNullCount = 0;
            foreach ($numericFields as $nf) {
                if ($rowData[$nf] !== null) { $nonNullCount++; }
            }
            if ($nonNullCount === 0) {
                $skippedRows++;
                $errors[] = "Línea $lineNumber: Fila descartada por estar completamente nula";
                continue;
            }
            
            // Validar y filtrar valores absurdos (8426, 8516, 999.99, etc.)
            if (hasAbsurdValues($rowData)) {
                $skippedRows++;
                $errors[] = "Línea $lineNumber: Fila descartada por contener valores absurdos (8426, 8516, 999.99, 9999.99, 202510)";
                continue;
            }
            
            // Insertar en la base de datos
            insertFaultData($pdo, $rowData, $filename);
            $importedRows++;
            
        } catch (Exception $e) {
            $errors[] = "Línea $lineNumber: " . $e->getMessage();
        }
    }
    
    fclose($handle);
    
    return [
        'imported_rows' => $importedRows,
        'skipped_rows' => $skippedRows,
        'errors' => $errors,
        'last_import_time' => $lastImportTime,
        'file_size' => filesize($filePath),
        'total_lines' => $lineNumber
    ];
}

function parseNumericValue($value) {
    $value = trim($value);
    if ($value === '' || $value === null) {
        return null;
    }
    return is_numeric($value) ? (float)$value : null;
}

function hasAbsurdValues($rowData) {
    // Valores absurdos a detectar: 8426, 8516, 999.99, 9999.99, 202510 (valores de error típicos)
    $absurdValues = [8426, 8426.0, 8516, 8516.0, 999.99, 9999.99, 202510, 202510.0];
    
    // Campos a verificar (excluir fecha_hora)
    $fieldsToCheck = ['Vpv1', 'Vpv2', 'Ipv1', 'Ipv2', 'Vac1', 'Vac2', 'Vac3',
                      'Iac1', 'Iac2', 'Iac3', 'Fac1', 'Fac2', 'Fac3', 'Pac',
                      'EnergyToday', 'EnergyTotal', 'HourTotal'];
    
    // Contar cuántos campos tienen valores absurdos
    $absurdCount = 0;
    foreach ($fieldsToCheck as $field) {
        $value = $rowData[$field];
        if ($value !== null) {
            // Verificar si el valor coincide con algún valor absurdo (con tolerancia para flotantes)
            if (abs($value - 8426) < 0.01 || 
                abs($value - 8516) < 0.01 || 
                abs($value - 999.99) < 0.01 || 
                abs($value - 9999.99) < 0.01 ||
                abs($value - 202510) < 0.01) {
                $absurdCount++;
            }
        }
    }
    
    // Si más de 5 campos tienen valores absurdos, considerar la fila como inválida
    // Esto permite cierta flexibilidad pero descarta filas claramente erróneas
    return $absurdCount >= 5;
}

function parseDateTime($timeValue) {
    // Verificar si el valor es nulo o vacío
    if ($timeValue === null || $timeValue === '') {
        throw new Exception("El valor de fecha/hora está vacío");
    }
    
    // Limpiar el valor
    $timeValue = trim($timeValue);
    
    // Formatos de fecha/hora comunes a probar
    $formats = [
        'Y-m-d H:i:s',  // 2025-10-08 19:16:52
        'Y.m.d H:i:s',  // 2025.10.08 19:16:52
        'd/m/Y H:i:s',  // 08/10/2025 19:16:52
        'm/d/Y H:i:s',  // 10/08/2025 19:16:52
        'Y-m-d H:i',    // 2025-10-08 19:16
        'd/m/Y H:i',    // 08/10/2025 19:16
        'm/d/Y H:i',    // 10/08/2025 19:16
    ];
    
    // Intentar parsear con cada formato
    foreach ($formats as $format) {
        $date = DateTime::createFromFormat($format, $timeValue);
        if ($date !== false) {
            // Verificar si la fecha es válida
            $errors = DateTime::getLastErrors();
            if (is_array($errors) && $errors['warning_count'] === 0 && $errors['error_count'] === 0) {
                return $date->format('Y-m-d H:i:s');
            }
        }
    }
    
    // Intentar con strtotime como último recurso
    $timestamp = strtotime($timeValue);
    if ($timestamp !== false) {
        return date('Y-m-d H:i:s', $timestamp);
    }
    
    // Si llegamos aquí, no se pudo parsear la fecha
    throw new Exception("No se pudo interpretar la fecha/hora: '$timeValue'");
}

function insertFaultData($pdo, $data, $filename) {
    $sql = "INSERT INTO datos_fault (
        fecha_hora, Vpv1, Vpv2, Ipv1, Ipv2, Vac1, Vac2, Vac3,
        Iac1, Iac2, Iac3, Fac1, Fac2, Fac3, Pac,
        EnergyToday, EnergyTotal, HourTotal, archivo_origen, fecha_importacion
    ) VALUES (
        :fecha_hora, :Vpv1, :Vpv2, :Ipv1, :Ipv2, :Vac1, :Vac2, :Vac3,
        :Iac1, :Iac2, :Iac3, :Fac1, :Fac2, :Fac3, :Pac,
        :EnergyToday, :EnergyTotal, :HourTotal, :archivo_origen, NOW()
    ) ON DUPLICATE KEY UPDATE
        Vpv1 = VALUES(Vpv1),
        Vpv2 = VALUES(Vpv2),
        Ipv1 = VALUES(Ipv1),
        Ipv2 = VALUES(Ipv2),
        Vac1 = VALUES(Vac1),
        Vac2 = VALUES(Vac2),
        Vac3 = VALUES(Vac3),
        Iac1 = VALUES(Iac1),
        Iac2 = VALUES(Iac2),
        Iac3 = VALUES(Iac3),
        Fac1 = VALUES(Fac1),
        Fac2 = VALUES(Fac2),
        Fac3 = VALUES(Fac3),
        Pac = VALUES(Pac),
        EnergyToday = VALUES(EnergyToday),
        EnergyTotal = VALUES(EnergyTotal),
        HourTotal = VALUES(HourTotal),
        fecha_importacion = NOW()";
        
    $stmt = $pdo->prepare($sql);
    
    $params = $data;
    $params['archivo_origen'] = $filename;
    
    $stmt->execute($params);
}
?>
