-- Historial de maniobras de relé. Reemplaza al mecanismo de archivos de texto
-- app/Acciones/OrdenRelay.txt / InversorFault.txt (ya sin consumidor: el .bat
-- que los leía, ciclo_automatizado.bat, se retiró junto con el bot viejo).
CREATE TABLE IF NOT EXISTS historial_relay (
    id INT AUTO_INCREMENT PRIMARY KEY,
    relay_num TINYINT NOT NULL,
    accion ENUM('encendido', 'apagado') NOT NULL,
    fault_detectado BOOLEAN NOT NULL DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_creado_en (creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
