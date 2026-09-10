<?php

/**
 * API para importar archivos Excel DTU con datos de inversor
 * Solución optimizada con procesamiento por lotes (Batch Processing)
 * 
 * CAMBIOS v4.1 (Optimizado por Manus AI):
 * - Corrección del error Fatal: Call to undefined method PhpOffice\PhpSpreadsheet\Worksheet\Worksheet::getCellByColumnAndRow()
 * - Sustitución de getCellByColumnAndRow() por getCell() para compatibilidad con PhpSpreadsheet moderno.
 * - Búsqueda estricta de archivos Excel solo para el mes actual.
 * - Implementación de un log de ejecución y un log de errores detallado.
 * - Manejo robusto de excepciones y registro de errores específicos.
 */

// ✅ CAMBIO 1 — Sobreescribir límites de php.ini desde el propio script
ini_set("memory_limit", "2048M"); // Aumentado a 2GB para mayor seguridad con archivos muy grandes
ini_set("max_execution_time", "1200"); // 20 minutos
ini_set("max_input_time", "1200");
date_default_timezone_set('America/Argentina/Buenos_Aires');
// Incluir el autoloader de Composer
require __DIR__ . "/../../vendor/autoload.php";

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Reader\IReadFilter;

header("Content-Type: application/json; charset=utf-8");
error_reporting(E_ALL);
ini_set("display_errors", 1);
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET");
header("Access-Control-Allow-Headers: Content-Type");

// --- Configuración y Variables de Entorno ---
$envFile = __DIR__ . "/../../.env";
$env = [];

if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), "#") === 0) continue;
        list($key, $value) = explode("=", $line, 2);
        $env[trim($key)] = trim($value, "'\" \t\n\r\0\x0B");
    }
}

$host     = $env["DB_HOST"]     ?? "localhost";
$dbname   = $env["DB_NAME"]     ?? "labvirtual";
$username = $env["DB_USER"]     ?? "root";
$password = $env["DB_PASSWORD"] ?? "";

$medicionesDir = "D:/xampp/htdocs/mediciones/"; // Ajustar según el entorno
if (!is_dir($medicionesDir)) {
    mkdir($medicionesDir, 0777, true);
}

// ✅ CAMBIO 2 — Rutas de los archivos de log
$logDir = "D:/xampp/htdocs/LabVirtualUNNE/logs/";
if (!is_dir($logDir)) {
    mkdir($logDir, 0777, true);
}
$executionLogFile = $logDir . "execution.log";
$errorLogFile     = $logDir . "error.log";

// Función auxiliar para escribir en los logs
function writeToLog($logFile, $message) {
    $timestamp = date("Y-m-d H:i:s");
    file_put_contents($logFile, "[$timestamp] " . $message . PHP_EOL, FILE_APPEND);
}

$currentMonth = date("Ym");

// Mapeo de columnas (0-based)
$columnMap = [
    "Time"        => 0,
    "Vpv1"        => 1,
    "Vpv2"        => 2,
    "Ipv1"        => 3,
    "Ipv2"        => 4,
    "Vac1"        => 5,
    "Vac2"        => 6,
    "Vac3"        => 7,
    "Iac1"        => 8,
    "Iac2"        => 9,
    "Iac3"        => 10,
    "Fac1"        => 11,
    "Fac2"        => 12,
    "Fac3"        => 13,
    "Pac"         => 14,
    "EnergyToday" => 18,
    "EnergyTotal" => 19,
    "HourTotal"   => 20,
];

const BATCH_SIZE = 500;
const CHUNK_SIZE = 1000; // Tamaño del trozo para lectura

// --- Clases Auxiliares ---

/**
 * Filtro de lectura para PhpSpreadsheet que permite leer por trozos.
 */
class ChunkReadFilter implements IReadFilter
{
    private $startRow = 0;
    private $endRow   = 0;
    private $columns  = [];

    public function __construct(int $startRow, int $endRow, array $columnMap)
    {
        $this->startRow = $startRow;
        $this->endRow   = $endRow;
        $this->columns  = array_values($columnMap);
    }

    public function readCell(string $columnAddress, int $row, string $worksheetName = ""): bool
    {
        // Solo leer filas dentro del rango y columnas mapeadas
        if ($row >= $this->startRow && $row <= $this->endRow) {
            $columnIndex = Coordinate::columnIndexFromString($columnAddress) - 1;
            return in_array($columnIndex, $this->columns);
        }
        return false;
    }
}

// --- Lógica Principal ---
try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);

    // ✅ CAMBIO 3 — Patrón de búsqueda estricto: solo busca .xls y .xlsx del mes actual
    $patterns = [
        $medicionesDir . "*DTU*_{$currentMonth}.xlsx",
        $medicionesDir . "*DTU*_{$currentMonth}.xls",
    ];

    $excelFiles = [];
    foreach ($patterns as $pattern) {
        $found = glob($pattern);
        if (!empty($found)) {
            $excelFiles = array_merge($excelFiles, $found);
        }
    }
    $excelFiles = array_unique($excelFiles);

    if (empty($excelFiles)) {
        $errorMessage = "No se encontraron archivos Excel DTU para el mes actual ({$currentMonth}) en: {$medicionesDir}. Patrones buscados: " . implode(", ", $patterns);
        writeToLog($errorLogFile, "Error de Archivo: " . $errorMessage);
        throw new Exception($errorMessage);
    }

    $results      = [];
    $totalImported = 0;
    $totalSkipped  = 0;
    $totalErrors   = 0;

    foreach ($excelFiles as $excelFile) {
        $filename           = basename($excelFile);
        $fileResult         = processExcelDTUOptimized($excelFile, $pdo, $columnMap, $errorLogFile);
        $results[$filename] = $fileResult;

        $totalImported += $fileResult["imported_rows"];
        $totalSkipped  += $fileResult["skipped_rows"];
        $totalErrors   += count($fileResult["errors"]);
    }

    // ✅ CAMBIO 4 — Escribir en el log de ejecución
    writeToLog($executionLogFile, "Importación completada. Archivos procesados: " . count($excelFiles) . ", Filas importadas: " . $totalImported . ", Filas saltadas: " . $totalSkipped . ", Errores: " . $totalErrors);

    echo json_encode([
        "status"  => "success",
        "message" => "Importación de archivos DTU completada (v4.1 Estricta)",
        "summary" => [
            "processed_files"    => count($excelFiles),
            "total_imported_rows" => $totalImported,
            "total_skipped_rows"  => $totalSkipped,
            "total_errors"        => $totalErrors,
            "memory_peak_mb"      => round(memory_get_peak_usage(true) / 1024 / 1024, 2),
        ],
        "results"   => $results,
        "timestamp" => date("Y-m-d H:i:s"),
    ], JSON_PRETTY_PRINT);

} catch (PDOException $e) {
    http_response_code(500);
    $errorMessage = "Error de Conexión/Base de Datos: " . $e->getMessage();
    writeToLog($errorLogFile, "Error de Conexión/Base de Datos: " . $errorMessage);
    echo json_encode([
        "status"    => "error",
        "message"   => $errorMessage,
        "timestamp" => date("Y-m-d H:i:s"),
    ], JSON_PRETTY_PRINT);
} catch (Exception $e) {
    http_response_code(500);
    $errorMessage = "Error General: " . $e->getMessage();
    writeToLog($errorLogFile, "Error General: " . $errorMessage);
    echo json_encode([
        "status"    => "error",
        "message"   => $errorMessage,
        "timestamp" => date("Y-m-d H:i:s"),
    ], JSON_PRETTY_PRINT);
}

// --- Funciones de Procesamiento ---

function processExcelDTUOptimized($filePath, $pdo, $columnMap, $errorLogFile)
{
    $filename     = basename($filePath);
    $importedRows = 0;
    $skippedRows  = 0;
    $errors       = [];
    $batchData    = [];
    $totalRows    = 0;

    // Obtener la última fecha/hora importada una sola vez por archivo
    $lastImportTime = getLastImportTime($pdo, $filename);

    try {
        $reader = IOFactory::createReaderForFile($filePath);
        $reader->setReadDataOnly(true); // No cargar estilos, fórmulas, etc.
        // ✅ CAMBIO 5 — Desactivar el motor de cálculo para mayor rendimiento
        if (method_exists($reader, 'setReadEmptyCells')) {
            $reader->setReadEmptyCells(false); // No leer celdas vacías
        }
        if (method_exists($reader, 'setLoadSheetsOnly')) {
            $reader->setLoadSheetsOnly(null); // Cargar todas las hojas si no se especifica
        }
        
        // Obtener el número total de filas para iterar por trozos
        // Esto requiere cargar solo la información básica del archivo, no todo el contenido
        $spreadsheetInfo = IOFactory::createReaderForFile($filePath);
        $spreadsheetInfo->setReadDataOnly(true);
        if (method_exists($spreadsheetInfo, 'setReadEmptyCells')) {
            $spreadsheetInfo->setReadEmptyCells(false);
        }
        if (method_exists($spreadsheetInfo, 'setLoadSheetsOnly')) {
            $spreadsheetInfo->setLoadSheetsOnly(null);
        }
        $highestRow = $spreadsheetInfo->listWorksheetInfo($filePath)[0]['totalRows'];
        unset($spreadsheetInfo);

        // Iterar por trozos
        for ($startRow = 1; $startRow <= $highestRow; $startRow += CHUNK_SIZE) {
            $endRow = min($startRow + CHUNK_SIZE - 1, $highestRow);
            
            // Crear un filtro de lectura para el trozo actual
            $chunkFilter = new ChunkReadFilter($startRow, $endRow, $columnMap);
            $reader->setReadFilter($chunkFilter);

            $spreadsheet = $reader->load($filePath);
            $worksheet   = $spreadsheet->getActiveSheet();

            // Iterar sobre las filas del trozo actual
            // Empezar desde la fila 2 para saltar el encabezado, pero solo si estamos en el primer trozo
            $rowStart = ($startRow == 1) ? 2 : $startRow;

            for ($rowIndex = $rowStart; $rowIndex <= $endRow; ++$rowIndex) {
                // Asegurarse de que la fila existe en el trozo cargado
                // ✅ CORRECCIÓN: Usar getCell() en lugar de getCellByColumnAndRow()
                // y verificar si la celda existe antes de intentar obtener su valor
                $cellA = $worksheet->getCell('A' . $rowIndex);
                if (!$worksheet->getRowDimension($rowIndex)->getVisible() || ($cellA === null || $cellA->getValue() === null)) {
                    continue; // Saltar filas ocultas o completamente vacías en la columna A
                }

                $totalRows++;
                $rowData   = [];
                $timeValue = null;

                try {
                    // Recopilar datos de la fila según el mapeo de columnas
                    foreach ($columnMap as $columnName => $columnIndex) {
                        $columnLetter = Coordinate::stringFromColumnIndex($columnIndex + 1);
                        $cell = $worksheet->getCell($columnLetter . $rowIndex);
                        $cellValue = $cell ? $cell->getValue() : null; // Usar getValue()

                        if ($columnName === "Time") {
                            $timeValue = $cellValue !== null ? trim((string)$cellValue) : null;
                        } else {
                            $rowData[$columnName] = is_numeric($cellValue) ? (float)$cellValue : null;
                        }
                    }

                    // Validar fecha/hora
                    if ($timeValue === null || $timeValue === "") {
                        $skippedRows++;
                        $errorMsg = "Línea {$rowIndex}: Valor de fecha/hora faltante o vacío.";
                        $errors[] = $errorMsg;
                        writeToLog($errorLogFile, "Error de Datos (Archivo: {$filename}): " . $errorMsg);
                        continue;
                    }

                    $datetime = parseDateTime($timeValue, $errorLogFile, $filename, $rowIndex);

                    $year = (int)substr($datetime, 0, 4);
                    if ($year < 2000 || $year > 2100) {
                        $skippedRows++;
                        $errorMsg = "Línea {$rowIndex}: Año fuera de rango ({$year}).";
                        $errors[] = $errorMsg;
                        writeToLog($errorLogFile, "Error de Datos (Archivo: {$filename}): " . $errorMsg);
                        continue;
                    }

                    // Saltar duplicados/registros ya importados
                    if ($lastImportTime && $datetime <= $lastImportTime) {
                        $skippedRows++;
                        continue;
                    }

                    $rowData["fecha_hora"]     = $datetime;
                    $rowData["archivo_origen"] = $filename;

                    $batchData[] = $rowData;

                    // Insertar con transacción por batch
                    if (count($batchData) >= BATCH_SIZE) {
                        $importedRows += insertInverterDataBatch($pdo, $batchData, $errorLogFile, $filename);
                        $batchData = [];
                        gc_collect_cycles(); // Liberar memoria entre batches
                    }

                } catch (Exception $e) {
                    $skippedRows++;
                    $errorMsg = "Línea {$rowIndex}: " . $e->getMessage();
                    $errors[] = $errorMsg;
                    writeToLog($errorLogFile, "Error de Procesamiento de Fila (Archivo: {$filename}): " . $errorMsg);
                }
            }

            // Limpiar la memoria de PhpSpreadsheet para el trozo actual
            $spreadsheet->disconnectWorksheets();
            unset($spreadsheet);
            gc_collect_cycles();
        }

        // Insertar el lote restante
        if (!empty($batchData)) {
            $importedRows += insertInverterDataBatch($pdo, $batchData, $errorLogFile, $filename);
        }

    } catch (Exception $e) {
        $errorMsg = "Error fatal al procesar el archivo {$filename}: " . $e->getMessage();
        $errors[] = $errorMsg;
        writeToLog($errorLogFile, "Error de Lectura/Procesamiento de Archivo: " . $errorMsg);
    }

    return [
        "imported_rows"    => $importedRows,
        "skipped_rows"     => $skippedRows,
        "errors"           => array_slice($errors, 0, 50), // Máximo 50 errores para no saturar el JSON
        "total_errors"     => count($errors),
        "last_import_time" => $lastImportTime,
        "file_size_mb"     => round(filesize($filePath) / 1024 / 1024, 2),
        "total_lines"      => $totalRows,
    ];
}

function getLastImportTime($pdo, $filename)
{
    try {
        $stmt = $pdo->prepare("
            SELECT MAX(fecha_hora) as last_import_time 
            FROM datos_inversor 
            WHERE archivo_origen = :filename
        ");
        $stmt->execute([':filename' => $filename]);
        return $stmt->fetchColumn();
    } catch (PDOException $e) {
        // Este error debería ser capturado por el bloque principal, pero lo logueamos aquí también
        writeToLog($GLOBALS['errorLogFile'], "Error de Base de Datos al obtener lastImportTime para {$filename}: " . $e->getMessage());
        return false; // Indicar que no se pudo obtener la última fecha
    }
}

function insertInverterDataBatch($pdo, $batchData, $errorLogFile, $filename)
{
    if (empty($batchData)) return 0;

    $columns     = array_keys($batchData[0]);
    $columnNames = implode(", ", $columns);
    $placeholders = [];
    $values      = [];
    $updates     = [];

    foreach ($batchData as $row) {
        $rowPlaceholders = [];
        foreach ($columns as $col) {
            $rowPlaceholders[] = "?";
            $values[]          = $row[$col];
        }
        $placeholders[] = "(" . implode(", ", $rowPlaceholders) . ", NOW())";
    }

    $updateColumns = array_filter($columns, fn($col) => !in_array($col, ["fecha_hora", "archivo_origen"]));
    foreach ($updateColumns as $col) {
        $updates[] = "$col = VALUES($col)";
    }
    $updates[] = "fecha_importacion = NOW()";

    $sql = "INSERT INTO datos_inversor ($columnNames, fecha_importacion) VALUES "
         . implode(", ", $placeholders)
         . " ON DUPLICATE KEY UPDATE "
         . implode(", ", $updates);

    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare($sql);
        $stmt->execute($values);
        $pdo->commit();
    } catch (PDOException $e) {
        $pdo->rollBack();
        $errorMsg = "Error al insertar batch en la tabla 'datos_inversor' (Archivo: {$filename}): " . $e->getMessage();
        writeToLog($errorLogFile, "Error de Base de Datos: " . $errorMsg);
        throw new Exception($errorMsg); // Relanzar para que sea capturado por el proceso principal
    }

    return count($batchData);
}

function parseDateTime($timeValue, $errorLogFile, $filename, $rowIndex)
{
    if ($timeValue === null || $timeValue === "") {
        throw new Exception("El valor de fecha/hora está vacío");
    }

    $timeValue = trim((string)$timeValue);

    // Valor numérico de Excel (días desde 1900-01-01)
    if (is_numeric($timeValue) && $timeValue > 1) {
        if (ExcelDate::isExcelDate((float)$timeValue)) {
            $dateTime = ExcelDate::excelToDateTimeObject((float)$timeValue);
            return $dateTime->format("Y-m-d H:i:s");
        }
    }

    // Convertir formato con puntos a guiones
    if (preg_match("/^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):(\d{2})$/", $timeValue, $m)) {
        $timeValue = "$m[1]-$m[2]-$m[3] $m[4]:$m[5]:$m[6]";
    }

    $formats = [
        "Y.m.d H:i:s", "Y-m.d H:i:s", "d/m/Y H:i:s", "m/d/Y H:i:s",
        "Y-m-d H:i",   "d/m/Y H:i",   "m/d/Y H:i",
        "Y-m-d",       "Y.m.d",        "d/m/Y",        "m/d/Y",
        "H:i:s",       "H:i",
    ];

    foreach ($formats as $format) {
        $date = DateTime::createFromFormat($format, $timeValue);
        if ($date !== false) {
            $errs = DateTime::getLastErrors();
            if (is_array($errs) && $errs["warning_count"] === 0 && $errs["error_count"] === 0) {
                return $date->format("Y-m-d H:i:s");
            }
        }
    }

    $timestamp = strtotime($timeValue);
    if ($timestamp !== false) {
        return date("Y-m-d H:i:s", $timestamp);
    }

    $short = strlen($timeValue) > 50 ? substr($timeValue, 0, 50) . "..." : $timeValue;
    $errorMsg = sprintf(
        "No se pudo interpretar la fecha/hora: \"%s\" (tipo: %s, longitud: %d). Archivo: %s, Línea: %d",
        $short, gettype($timeValue), strlen($timeValue), $filename, $rowIndex
    );
    writeToLog($errorLogFile, "Error de Datos (Parseo de Fecha): " . $errorMsg);
    throw new Exception($errorMsg);
}

?>
