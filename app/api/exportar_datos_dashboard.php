<?php
// app/api/exportar_datos_dashboard.php
// Endpoint para exportar datos del dashboard (inversor + irradiancia) a Excel según rango de fechas

// Habilitar logging de errores
error_reporting(E_ALL);
ini_set('display_errors', '0'); // No mostrar en pantalla
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../logs/export_errors.log');

// Crear directorio de logs si no existe
if (!file_exists(__DIR__ . '/../../logs')) {
    mkdir(__DIR__ . '/../../logs', 0755, true);
}

// Función de logging personalizada
function logExport($message, $data = null) {
    $logFile = __DIR__ . '/../../logs/export_debug.log';
    $timestamp = date('Y-m-d H:i:s');
    $logMessage = "[$timestamp] $message";
    if ($data !== null) {
        $logMessage .= " | Data: " . json_encode($data, JSON_UNESCAPED_UNICODE);
    }
    $logMessage .= "\n";
    file_put_contents($logFile, $logMessage, FILE_APPEND);
}

logExport('=== INICIO DE EXPORTACIÓN ===');

require __DIR__ . '/../../vendor/autoload.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    logExport('Petición OPTIONS recibida');
    http_response_code(200);
    exit();
}

logExport('Método de petición', $_SERVER['REQUEST_METHOD']);

try {
    // Leer parámetros de fecha
    $rawInput = file_get_contents('php://input');
    logExport('Raw input recibido', substr($rawInput, 0, 200));
    
    $input = json_decode($rawInput, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        logExport('Error al decodificar JSON', json_last_error_msg());
    }
    
    $start = $input['start'] ?? $_GET['start'] ?? null;
    $end = $input['end'] ?? $_GET['end'] ?? null;
    
    logExport('Parámetros de fecha recibidos', ['start' => $start, 'end' => $end]);

    if (!$start || !$end) {
        logExport('ERROR: Faltan parámetros de fecha');
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Faltan parámetros de fecha.']);
        exit();
    }

    // Cargar variables de entorno desde .env
    logExport('Cargando variables de entorno...');
    try {
        $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../../');
        $dotenv->load();
        logExport('Variables de entorno cargadas correctamente');
    } catch (Exception $envError) {
        logExport('Error al cargar .env', $envError->getMessage());
    }

    $host = $_ENV['DB_HOST'] ?? 'localhost';
    $dbname = $_ENV['DB_NAME'] ?? 'labvirtual';
    $user = $_ENV['DB_USER'] ?? 'root';
    $pass = $_ENV['DB_PASSWORD'] ?? '';
    
    logExport('Configuración de BD', ['host' => $host, 'dbname' => $dbname, 'user' => $user]);

    // Aumentar los límites de memoria y tiempo de ejecución
    ini_set('memory_limit', '512M');
    set_time_limit(300); // 5 minutos
    logExport('Límites configurados', ['memory_limit' => '512M', 'time_limit' => 300]);

    // Configuración de conexión PDO
    logExport('Intentando conectar a la base de datos...');
    try {
        $pdo = new PDO(
            "mysql:host=$host;dbname=$dbname;charset=utf8mb4",
            $user,
            $pass,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => true,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
        logExport('Conexión a BD exitosa');
    } catch (PDOException $dbError) {
        logExport('ERROR: Fallo al conectar a BD', $dbError->getMessage());
        throw $dbError;
    }

    // Establecer la zona horaria de Argentina
    $pdo->exec("SET time_zone = '-03:00'");

    // Columnas del dashboard (inversor + irradiancia)
    $columns = [
        'fecha_hora', 'Vpv1', 'Vpv2', 'Ipv1', 'Ipv2',
        'Vac1', 'Vac2', 'Vac3',
        'Iac1', 'Iac2', 'Iac3',
        'Fac1', 'Fac2', 'Fac3',
        'Pac', 'EnergyToday',
        'temperatura', 'irradiancia',
        'fecha_irradiancia'  // Columna de depuración
    ];
    
    // Columnas que se mostrarán en el Excel (excluyendo las de depuración)
    $excelColumns = [
        'fecha_hora', 'Vpv1', 'Vpv2', 'Ipv1', 'Ipv2',
        'Vac1', 'Vac2', 'Vac3',
        'Iac1', 'Iac2', 'Iac3',
        'Fac1', 'Fac2', 'Fac3',
        'Pac', 'EnergyToday',
        'temperatura', 'irradiancia'
    ];

    // Verificar que las tablas existan
    logExport('Verificando existencia de tablas...');
    $checkInversor = $pdo->query("SHOW TABLES LIKE 'datos_inversor'");
    $checkIrradiancia = $pdo->query("SHOW TABLES LIKE 'datos_irradiancia'");
    
    logExport('Tabla datos_inversor existe', $checkInversor->rowCount() > 0);
    logExport('Tabla datos_irradiancia existe', $checkIrradiancia->rowCount() > 0);
    
    if ($checkInversor->rowCount() === 0) {
        logExport('ERROR: Tabla datos_inversor no existe');
        throw new Exception("La tabla datos_inversor no existe");
    }

    // Detectar el nombre de la columna de fecha en datos_irradiancia
    $fechaColumnIrradiancia = 'fecha_hora';
    if ($checkIrradiancia->rowCount() > 0) {
        $columnsQuery = $pdo->query("SHOW COLUMNS FROM datos_irradiancia");
        $irradColumns = $columnsQuery->fetchAll(PDO::FETCH_COLUMN);
        $fechaColumnIrradiancia = in_array('fecha_hora', $irradColumns) ? 'fecha_hora' : 'fecha';
    }

    // Primero, obtener el conteo total de registros del inversor
    logExport('Contando registros en el rango de fechas...');
    $countStmt = $pdo->prepare("SELECT COUNT(*) as total FROM datos_inversor WHERE fecha_hora BETWEEN :start AND :end");
    $countStmt->execute([':start' => $start, ':end' => $end]);
    $totalRows = $countStmt->fetch()['total'];
    logExport('Total de registros encontrados', $totalRows);

    // Si no hay datos, buscar el dato más cercano anterior o posterior
    if ($totalRows === 0) {
        logExport('No hay datos en el rango, buscando datos cercanos...');
        $getNearestStmt = $pdo->prepare("
            (SELECT 
                fecha_hora, Vpv1, Vpv2, Ipv1, Ipv2,
                Vac1, Vac2, Vac3,
                Iac1, Iac2, Iac3,
                Fac1, Fac2, Fac3,
                Pac, EnergyToday,
                1 as source
             FROM datos_inversor
             WHERE fecha_hora <= :start ORDER BY fecha_hora DESC LIMIT 1)
            UNION ALL
            (SELECT 
                fecha_hora, Vpv1, Vpv2, Ipv1, Ipv2,
                Vac1, Vac2, Vac3,
                Iac1, Iac2, Iac3,
                Fac1, Fac2, Fac3,
                Pac, EnergyToday,
                2 as source
             FROM datos_inversor
             WHERE fecha_hora >= :end ORDER BY fecha_hora ASC LIMIT 1)
            ORDER BY source
        ");
        $getNearestStmt->execute([':start' => $start, ':end' => $end]);
        $nearestData = $getNearestStmt->fetchAll();
        
        if (!empty($nearestData)) {
            logExport('Datos cercanos encontrados', count($nearestData));
            // Agregar datos de irradiancia si existen
            if ($checkIrradiancia->rowCount() > 0) {
                $irradStmt = $pdo->prepare("
                    SELECT temperatura, irradiancia 
                    FROM datos_irradiancia 
                    ORDER BY {$fechaColumnIrradiancia} DESC 
                    LIMIT 1
                ");
                $irradStmt->execute();
                $irradData = $irradStmt->fetch();
                
                foreach ($nearestData as &$row) {
                    $row['temperatura'] = $irradData['temperatura'] ?? null;
                    $row['irradiancia'] = $irradData['irradiancia'] ?? null;
                }
            } else {
                foreach ($nearestData as &$row) {
                    $row['temperatura'] = null;
                    $row['irradiancia'] = null;
                }
            }
            
            $spreadsheet = new Spreadsheet();
            $sheet = $spreadsheet->getActiveSheet();
            
            // Escribir encabezados
            foreach ($excelColumns as $i => $col) {
                $sheet->setCellValue(chr(65 + $i) . '1', $col);
            }
            
            // Escribir datos cercanos
            foreach ($nearestData as $rowIdx => $row) {
                foreach ($excelColumns as $colIdx => $col) {
                    $sheet->setCellValue(chr(65 + $colIdx) . ($rowIdx + 2), $row[$col]);
                }
            }
            
            // Enviar archivo con datos cercanos
            logExport('Enviando archivo Excel con datos cercanos');
            header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            header('Content-Disposition: attachment;filename="datos_dashboard_cercanos_'.date('Y-m-d_His').'.xlsx"');
            $writer = new Xlsx($spreadsheet);
            $writer->save('php://output');
            logExport('Archivo Excel enviado exitosamente');
            exit();
        }
        
        // Si no hay datos cercanos
        logExport('No se encontraron datos cercanos');
        http_response_code(200);
        echo json_encode(['success' => false, 'message' => 'No existen datos en el intervalo seleccionado.']);
        exit();
    }

    // Crear Excel
    logExport('Creando archivo Excel...');
    $spreadsheet = new Spreadsheet();
    $sheet = $spreadsheet->getActiveSheet();
    logExport('Spreadsheet creado');
    
    // Escribir encabezados
    foreach ($excelColumns as $i => $col) {
        $sheet->setCellValue(chr(65 + $i) . '1', $col);
    }

    // Obtener datos de irradiancia para el rango (si la tabla existe)
    logExport('Obteniendo datos de irradiancia...');
    $irradianciaMap = [];
    if ($checkIrradiancia->rowCount() > 0) {
        $irradQuery = "
            SELECT 
                {$fechaColumnIrradiancia} as fecha_hora,
                temperatura,
                irradiancia
            FROM datos_irradiancia
            WHERE {$fechaColumnIrradiancia} BETWEEN :start AND :end
            ORDER BY {$fechaColumnIrradiancia} ASC
        ";
        $irradStmt = $pdo->prepare($irradQuery);
        $irradStmt->execute([':start' => $start, ':end' => $end]);
        $irradData = $irradStmt->fetchAll();
        
        // Crear un mapa de fecha_hora => datos de irradiancia
        foreach ($irradData as $row) {
            $irradianciaMap[$row['fecha_hora']] = [
                'temperatura' => $row['temperatura'],
                'irradiancia' => $row['irradiancia']
            ];
        }
        logExport('Datos de irradiancia mapeados', count($irradianciaMap));
        
        // Si no hay datos de irradiancia en el rango, obtener el último valor disponible
        if (empty($irradianciaMap)) {
            $lastIrradStmt = $pdo->prepare("
                SELECT temperatura, irradiancia 
                FROM datos_irradiancia 
                ORDER BY {$fechaColumnIrradiancia} DESC 
                LIMIT 1
            ");
            $lastIrradStmt->execute();
            $lastIrrad = $lastIrradStmt->fetch();
            if ($lastIrrad) {
                $defaultIrrad = [
                    'temperatura' => $lastIrrad['temperatura'],
                    'irradiancia' => $lastIrrad['irradiancia']
                ];
            }
        }
    }

    // Consulta optimizada con promediado cada 5 minutos
    // Columnas NO acumulativas se promedian, columnas acumulativas usan valor más cercano al centro del intervalo
    $rowNumber = 2; // Comenzar desde la fila 2 (después de los encabezados)
    logExport('Iniciando procesamiento con promediado selectivo: promedio para no-acumulativas, valor cercano para acumulativas');
    
    // Último valor de irradiancia conocido (para rellenar cuando no hay coincidencia exacta)
    $lastKnownIrrad = isset($defaultIrrad) ? $defaultIrrad : ['temperatura' => null, 'irradiancia' => null];

    // Consulta que agrupa datos en intervalos de 5 minutos con límite superior del intervalo como fecha
    // Primero obtenemos los datos del inversor agrupados
    $query = "
        SELECT 
            -- Formatear la fecha sin segundos
            DATE_FORMAT(MAX(di.fecha_hora), '%Y-%m-%d %H:%i:00') as fecha_hora,
            
            -- Promedio de columnas NO acumulativas
            AVG(di.Vpv1) as Vpv1, AVG(di.Vpv2) as Vpv2, AVG(di.Ipv1) as Ipv1, AVG(di.Ipv2) as Ipv2,
            AVG(di.Vac1) as Vac1, AVG(di.Vac2) as Vac2, AVG(di.Vac3) as Vac3,
            AVG(di.Iac1) as Iac1, AVG(di.Iac2) as Iac2, AVG(di.Iac3) as Iac3,
            AVG(di.Fac1) as Fac1, AVG(di.Fac2) as Fac2, AVG(di.Fac3) as Fac3,
            AVG(di.Pac) as Pac,
                        
            -- Valores acumulativos: tomar el último valor del intervalo (MAX fecha_hora)
            SUBSTRING_INDEX(GROUP_CONCAT(di.EnergyToday ORDER BY di.fecha_hora DESC), ',', 1) as EnergyToday,
            
            -- Obtener la temperatura e irradiancia más cercana al punto medio del intervalo
            (
                SELECT dir.temperatura 
                FROM datos_irradiancia dir 
                WHERE dir.fecha_hora <= MAX(di.fecha_hora)
                ORDER BY ABS(TIMESTAMPDIFF(SECOND, dir.fecha_hora, MAX(di.fecha_hora)))
                LIMIT 1
            ) as temperatura,
            (
                SELECT dir.irradiancia 
                FROM datos_irradiancia dir 
                WHERE dir.fecha_hora <= MAX(di.fecha_hora)
                ORDER BY ABS(TIMESTAMPDIFF(SECOND, dir.fecha_hora, MAX(di.fecha_hora)))
                LIMIT 1
            ) as irradiancia,
            
            -- Para depuración: mostrar la fecha de los datos de irradiancia
            (
                SELECT dir.fecha_hora 
                FROM datos_irradiancia dir 
                WHERE dir.fecha_hora <= MAX(di.fecha_hora)
                ORDER BY ABS(TIMESTAMPDIFF(SECOND, dir.fecha_hora, MAX(di.fecha_hora)))
                LIMIT 1
            ) as fecha_irradiancia,
                                    
            -- Campos auxiliares para depuración
            COUNT(*) as total_valores_en_intervalo,
            MIN(di.fecha_hora) as fecha_minima,
            MAX(di.fecha_hora) as fecha_maxima
        FROM datos_inversor di
        WHERE di.fecha_hora BETWEEN :start AND :end
        GROUP BY
            YEAR(di.fecha_hora), 
            MONTH(di.fecha_hora), 
            DAY(di.fecha_hora), 
            HOUR(di.fecha_hora),
            FLOOR(MINUTE(di.fecha_hora) / 5)
        ORDER BY fecha_hora ASC
    ";
    
    $stmt = $pdo->prepare($query);
    $stmt->bindValue(':start', $start, PDO::PARAM_STR);
    $stmt->bindValue(':end', $end, PDO::PARAM_STR);
    $stmt->execute();

    $data = $stmt->fetchAll();
    $dataCount = count($data);
    logExport('Datos promediados obtenidos', [
        'count' => $dataCount, 
        'original_count' => $totalRows,
        'reduccion' => $totalRows > 0 ? round((1 - $dataCount / $totalRows) * 100, 2) . '%' : '0%'
    ]);

    // Procesar los datos
    $rowNumber = 2;
    foreach ($data as $row) {
        // Buscar datos de irradiancia correspondientes
        if (isset($irradianciaMap[$row['fecha_hora']])) {
            $lastKnownIrrad = $irradianciaMap[$row['fecha_hora']];
        }
        
        // Combinar datos del inversor con irradiancia
        $row['temperatura'] = $lastKnownIrrad['temperatura'];
        $row['irradiancia'] = $lastKnownIrrad['irradiancia'];
        
        // Escribir en Excel
        foreach ($excelColumns as $colIdx => $col) {
            $columnLetter = chr(65 + $colIdx);
            $value = $row[$col] ?? '';
            
            // Formatear fechas si es necesario
            if ($col === 'fecha_hora') {
                $value = date('Y-m-d H:i:00', strtotime($value));
            }
            
            // Redondear valores numéricos a 2 decimales
            if (is_numeric($value) && $col !== 'fecha_hora') {
                $value = round($value, 2);
            }
            
            $sheet->setCellValue($columnLetter . $rowNumber, $value);
        }
        
        // Log para depuración
        logExport(sprintf(
            'Fila %d - Fecha: %s, Temp: %s, Irrad: %s, Fecha Irrad: %s',
            $rowNumber - 1,
            $row['fecha_hora'] ?? 'N/A',
            $row['temperatura'] ?? 'N/A',
            $row['irradiancia'] ?? 'N/A',
            $row['fecha_irradiancia'] ?? 'N/A'
        ));
        
        $rowNumber++;
    }
    
    // Liberar memoria
    unset($data);
    
    logExport('Procesamiento completado con promedio selectivo (promedio para no-acumulativas, valor cercano para acumulativas)', ['totalRowsWritten' => $rowNumber - 2]);

    // Configurar el tipo de contenido para descarga de Excel
    logExport('Preparando envío de archivo Excel...');
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment;filename="datos_dashboard_'.date('Y-m-d_His').'.xlsx"');
    header('Cache-Control: max-age=0');
    
    // Crear el archivo Excel y enviarlo al navegador
    $writer = new Xlsx($spreadsheet);
    logExport('Guardando archivo Excel y enviando al navegador...');
    $writer->save('php://output');
    logExport('=== EXPORTACIÓN COMPLETADA EXITOSAMENTE ===');
    exit();

} catch (\Exception $e) {
    logExport('=== ERROR EN EXPORTACIÓN ===', [
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString()
    ]);
    error_log('Error en exportar_datos_dashboard.php: ' . $e->getMessage());
    error_log('Trace completo: ' . $e->getTraceAsString());
    
    // Verificar si los headers ya fueron enviados
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json');
    }
    
    // Solo enviar el mensaje de error, no el trace completo por seguridad
    echo json_encode([
        'success' => false, 
        'message' => 'Error al exportar los datos del dashboard. Por favor, intente nuevamente.',
        'debug' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : null
    ]);
    
    // Registrar error detallado en el log del servidor
    error_log('Error detallado: ' . print_r([
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString()
    ], true));
    
    logExport('=== FIN CON ERROR ===');
}
