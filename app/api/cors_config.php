<?php
/**
 * Configuración CORS simplificada para APIs
 * Permite acceso desde cualquier origen para evitar problemas de CORS
 */

// Headers CORS básicos
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Max-Age: 3600");

// Manejar solicitudes OPTIONS (preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Headers básicos de seguridad
header("X-Content-Type-Options: nosniff");

// Establecer tipo de contenido JSON por defecto
header('Content-Type: application/json; charset=utf-8');
?>
