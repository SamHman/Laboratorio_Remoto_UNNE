<?php
// 1. INCLUIR CORS Y CONFIGURACIÓN CENTRALIZADA (Obligatorio para lectura cross-origin)
require_once __DIR__ . '/cors_config.php';

// El archivo cors_config.php ya establece el Content-Type: application/json

// --- RUTAS DE ARCHIVOS ---
// 1. Archivo de bandera creado por el bot Python
$ruta_archivo_flag = "D:/xampp/htdocs/LabVirtualUNNE/app/Acciones/BotFuncionando/estado_bot.txt";
// 2. Archivo de contador automatizado
$ruta_archivo_count = "D:/xampp/htdocs/LabVirtualUNNE/scripts/ContadorCicloAutomatizado/LAST_COUNT.tmp";
// -------------------------

// Iniciamos los indicadores por separado
$flagActivo   = false; // Indica si el archivo de bandera señala Funcionando=1
$countActivo  = false; // Indica si el archivo de contador tiene el valor 300

try {
    /* ----------------------------------------------------
     * 1) Verificar archivo de bandera (estado_bot.txt)
     * --------------------------------------------------*/
    if (file_exists($ruta_archivo_flag) && is_readable($ruta_archivo_flag)) {
        $contenidoFlag = file_get_contents($ruta_archivo_flag);
        if (strpos($contenidoFlag, 'Funcionando=1') !== false) {
            $flagActivo = true;
        }
    }

    /* ----------------------------------------------------
     * 2) Verificar archivo de contador (LAST_COUNT.tmp)
     *    Si existe y su contenido está entre 295 y 300 por los posibles retrazos al realizar la orden
     * --------------------------------------------------*/
    if (file_exists($ruta_archivo_count) && is_readable($ruta_archivo_count)) {
        $contenidoCount = trim(file_get_contents($ruta_archivo_count));
        $valor = intval($contenidoCount);
        if ($valor >= 295 && $valor <= 300) {
            $countActivo = true;
        }
    }

    /* ----------------------------------------------------
     * 3) Lógica OR: si cualquiera de los dos indicadores
     *    está activo, entonces Funcionando = 1.
     * --------------------------------------------------*/
    $estado_funcionando = ($flagActivo || $countActivo) ? 1 : 0;

    // Preparamos la respuesta JSON
    $respuesta = [
        'status'      => 'success',
        'Funcionando' => $estado_funcionando
    ];

} catch (Exception $e) {
    // Manejo de errores de lectura
    http_response_code(500);
    $respuesta = [
        'status' => 'error',
        'message' => 'Error interno del servidor al verificar el estado.',
        'detail' => $e->getMessage()
    ];
}

// Imprimimos la respuesta en formato JSON
// NOTA: El Content-Type: application/json ya fue enviado por cors_config.php
echo json_encode($respuesta);

// Es crucial salir del script si se envía un error, 
// aunque en este caso la lógica maneja el éxito/error dentro del JSON.
exit;

?>