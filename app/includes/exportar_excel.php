<?php
// app/includes/exportar_excel.php
// Código compartido por app/api/exportar_datos_dashboard.php y exportar_datos_tabla.php
// (2026-11-25). Vive fuera de app/api/ a propósito: nginx solo publica /app/api/, así que
// este archivo no es alcanzable desde internet.
//
// Exportación POR MESES y en STREAMING:
// - El rango pedido se recorre mes calendario por mes calendario: se consulta la base
//   de a un mes, se escriben esas filas y se liberan antes de pasar al mes siguiente.
// - El Excel se escribe con OpenSpout fila por fila (no arma el archivo entero en
//   memoria como hacía PhpSpreadsheet). La RAM queda acotada a ~1 mes de datos
//   (decenas de MB) sin importar si se exporta 1 mes o 5 años.
// - Cada mes va en su propia hoja del Excel, nombrada "AAAA-MM".
// Consecuencia: una vez que empezó a salir el archivo ya no se puede responder un
// error en JSON; si algo falla a mitad de camino se registra en el log de PHP y el
// archivo queda cortado.

require_once __DIR__ . '/../../vendor/autoload.php';

use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer;

// Excel admite 1.048.576 filas por hoja (encabezado incluido). Un mes a 1 fila por
// minuto son como mucho 44.640, así que no debería alcanzarse nunca; si pasara, el
// mes sigue en otra hoja "AAAA-MM (2)".
const EXPORTAR_FILAS_POR_HOJA = 1000000;

function responderJson(int $codigo, string $mensaje, ?string $debug = null): void
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => $mensaje, 'debug' => $debug]);
    exit();
}

function conectar(): PDO
{
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../../');
    $dotenv->safeLoad();

    $host = $_ENV['DB_HOST'] ?? 'localhost';
    $dbname = $_ENV['DB_NAME'] ?? 'labvirtual';
    $user = $_ENV['DB_USER'] ?? 'root';
    $pass = $_ENV['DB_PASSWORD'] ?? '';

    return new PDO(
        "mysql:host=$host;dbname=$dbname;charset=utf8mb4",
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
}

// Cabeceras CORS / preflight comunes a los dos endpoints
function prepararEndpoint(): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }
    // Con streaming un mes ocupa decenas de MB; 512M deja margen amplio. El tiempo sí
    // puede ser largo en rangos de años (ver también proxy_read_timeout de nginx).
    ini_set('memory_limit', '512M');
    set_time_limit(1800);
}

// Lee start/end del body JSON (o de la query string) y los valida.
// Llegan como "AAAA-MM-DD HH:MM" (datetime-local del navegador).
// Devuelve [DateTimeImmutable $inicio, DateTimeImmutable $fin].
function leerRango(array $input): array
{
    $start = $input['start'] ?? $_GET['start'] ?? null;
    $end = $input['end'] ?? $_GET['end'] ?? null;
    if (!$start || !$end) {
        responderJson(400, 'Faltan parámetros de fecha.');
    }
    $inicio = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $start)
        ?: DateTimeImmutable::createFromFormat('!Y-m-d H:i', $start);
    $fin = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $end)
        ?: DateTimeImmutable::createFromFormat('!Y-m-d H:i', $end);
    if (!$inicio || !$fin) {
        responderJson(400, 'Formato de fecha inválido.');
    }
    return [$inicio, $fin];
}

// Parte [inicio, fin] en meses calendario. Cada tramo: ['desde', 'hasta', 'etiqueta'],
// con 'desde'/'hasta' en formato DATETIME de MySQL (para BETWEEN, ambos incluidos) y
// 'etiqueta' = "AAAA-MM". El primer y el último tramo respetan las horas pedidas.
function mesesDelRango(DateTimeImmutable $inicio, DateTimeImmutable $fin): array
{
    $tramos = [];
    $cursor = $inicio;
    while ($cursor <= $fin) {
        $proximoMes = $cursor->modify('first day of next month')->setTime(0, 0, 0);
        $finDelMes = $proximoMes->modify('-1 second');
        $hasta = $finDelMes < $fin ? $finDelMes : $fin;
        $tramos[] = [
            'desde' => $cursor->format('Y-m-d H:i:s'),
            'hasta' => $hasta->format('Y-m-d H:i:s'),
            'etiqueta' => $cursor->format('Y-m'),
        ];
        $cursor = $proximoMes;
    }
    return $tramos;
}

// ¿Hay al menos una fila en la tabla para el rango? Se pregunta ANTES de empezar a
// mandar el Excel, para poder responder "sin datos" en JSON (exportar.js lo distingue).
function hayDatos(PDO $pdo, string $tabla, string $desde, string $hasta): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM $tabla WHERE fecha_hora BETWEEN :d AND :h LIMIT 1");
    $stmt->execute([':d' => $desde, ':h' => $hasta]);
    return (bool) $stmt->fetchColumn();
}

// Escribe un .xlsx directo a la respuesta HTTP, de a una hoja por mes.
final class ExcelPorMeses
{
    private Writer $writer;
    private array $encabezados;
    private bool $hayHoja = false;
    private string $etiquetaHoja = '';
    private int $parteHoja = 1;
    private int $filasEnHoja = 0;

    public function __construct(array $encabezados, string $nombreArchivo)
    {
        $this->encabezados = $encabezados;
        $this->writer = new Writer();
        // Manda Content-Type de Excel + Content-Disposition (exportar.js reconoce el
        // archivo por el Content-Type "spreadsheetml.sheet")
        $this->writer->openToBrowser($nombreArchivo);
    }

    public function nuevaHoja(string $etiqueta): void
    {
        $this->etiquetaHoja = $etiqueta;
        $this->parteHoja = 1;
        $this->abrirHoja($etiqueta);
    }

    // $fila: array asociativo con las mismas claves que los encabezados. Mismo formato
    // que la exportación anterior: fecha_hora como texto, el resto como número
    // redondeado a 2 decimales, y null como 0.
    public function agregarFila(array $fila): void
    {
        if ($this->filasEnHoja >= EXPORTAR_FILAS_POR_HOJA) {
            $this->parteHoja++;
            $this->abrirHoja($this->etiquetaHoja . ' (' . $this->parteHoja . ')');
        }
        $valores = [];
        foreach ($this->encabezados as $columna) {
            $valores[] = $columna === 'fecha_hora'
                ? (string) $fila[$columna]
                : ($fila[$columna] === null ? 0 : round((float) $fila[$columna], 2));
        }
        $this->writer->addRow(Row::fromValues($valores));
        $this->filasEnHoja++;
    }

    public function cerrar(): void
    {
        $this->writer->close();
        exit();
    }

    private function abrirHoja(string $nombre): void
    {
        $hoja = $this->hayHoja
            ? $this->writer->addNewSheetAndMakeItCurrent()
            : $this->writer->getCurrentSheet();
        $hoja->setName($nombre);
        $this->hayHoja = true;
        $this->writer->addRow(Row::fromValues($this->encabezados));
        $this->filasEnHoja = 0;
    }
}

// Manejo de errores común: si todavía no salió nada, responde JSON 500; si el Excel
// ya estaba saliendo, solo queda registrarlo (el archivo llega cortado).
function fallarExportacion(\Throwable $e, string $origen, string $mensaje): void
{
    error_log("$origen: " . $e->getMessage() . "\n" . $e->getTraceAsString());
    if (headers_sent()) {
        exit();
    }
    $debug = ($_ENV['APP_DEBUG'] ?? '') === 'true' ? $e->getMessage() : null;
    responderJson(500, $mensaje, $debug);
}
