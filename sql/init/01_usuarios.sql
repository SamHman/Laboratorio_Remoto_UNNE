-- Tabla de usuarios del SCADA. No existía un script propio (se creaba a mano en XAMPP);
-- para el docker-compose de producción queda definida acá. Solo usuario y contraseña:
-- el sistema de privilegios (multiusuario con expiración) se descartó del proyecto.
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
