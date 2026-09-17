-- Tabla de datos del sensor de irradiancia/temperatura (ESP32).
-- No existía script de creación propio en el repo original (se creaba a mano),
-- lo que llevó a esquemas divergentes (columna `fecha` vs `fecha_hora` según el
-- endpoint que la haya creado). Para Docker queda una sola columna: fecha_hora.
CREATE TABLE IF NOT EXISTS datos_irradiancia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_hora DATETIME NOT NULL,
    temperatura DECIMAL(6,2) NULL,
    irradiancia DECIMAL(8,2) NULL,
    fecha_importacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_datos_irradiancia_fecha_hora (fecha_hora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
