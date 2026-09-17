-- Tabla de usuarios del SCADA. No existía un script propio (se creaba a mano en XAMPP);
-- para el docker-compose de producción queda definida acá, con las columnas de
-- privilegios ya incluidas (el sistema de privilegios está deshabilitado en el código
-- pero las columnas no molestan si en algún momento se reactiva).
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    privilegios BOOLEAN DEFAULT 0,
    privilegios_expira DATETIME NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
