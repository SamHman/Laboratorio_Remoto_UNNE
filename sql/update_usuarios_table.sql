-- Script SQL para actualizar la tabla usuarios con columnas de privilegios
-- Ejecutar en phpMyAdmin o MySQL Workbench

USE labvirtual;

-- Verificar si las columnas ya existen antes de agregarlas
SET @sql = '';

-- Agregar columna privilegios si no existe
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.columns 
WHERE table_schema = 'labvirtual' 
AND table_name = 'usuarios' 
AND column_name = 'privilegios';

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE usuarios ADD COLUMN privilegios BOOLEAN DEFAULT 0 COMMENT "Privilegios para controlar relés"',
    'SELECT "La columna privilegios ya existe" as mensaje'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Agregar columna privilegios_expira si no existe
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.columns 
WHERE table_schema = 'labvirtual' 
AND table_name = 'usuarios' 
AND column_name = 'privilegios_expira';

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE usuarios ADD COLUMN privilegios_expira DATETIME NULL COMMENT "Fecha de expiración de privilegios"',
    'SELECT "La columna privilegios_expira ya existe" as mensaje'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Mostrar la estructura actualizada de la tabla
DESCRIBE usuarios;

-- Ejemplo de cómo otorgar privilegios manualmente (comentado)
-- UPDATE usuarios SET privilegios = 1, privilegios_expira = DATE_ADD(NOW(), INTERVAL 48 HOUR) WHERE user = 'nombre_usuario';

-- Ejemplo de cómo revocar privilegios manualmente (comentado)
-- UPDATE usuarios SET privilegios = 0, privilegios_expira = NULL WHERE user = 'nombre_usuario';

