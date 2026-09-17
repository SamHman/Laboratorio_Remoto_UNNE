-- Tabla de datos del inversor GoodWe (DTU).
-- Reemplaza a sql/crear_tabla_datos_inversor.sql para la instalación en Docker:
-- el índice único queda SOLO sobre fecha_hora (antes había dos índices únicos
-- redundantes entre crear_tabla_datos_inversor.sql y add_unique_index_datos_inversor.sql,
-- uno compuesto con archivo_origen y otro solo con fecha_hora). Con el nuevo endpoint de
-- ingesta HTTP no tiene sentido el compuesto: una fecha_hora es un único punto en el tiempo,
-- sin importar qué la generó. `origen` reemplaza a `archivo_origen` como metadato informativo
-- (ya no es un nombre de archivo Excel, sino un tag del origen del dato, ej. "script-dtu").
CREATE TABLE IF NOT EXISTS datos_inversor (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_hora DATETIME NOT NULL,
    Vpv1 DECIMAL(10,3) NULL,
    Vpv2 DECIMAL(10,3) NULL,
    Ipv1 DECIMAL(10,3) NULL,
    Ipv2 DECIMAL(10,3) NULL,
    Vac1 DECIMAL(10,3) NULL,
    Vac2 DECIMAL(10,3) NULL,
    Vac3 DECIMAL(10,3) NULL,
    Iac1 DECIMAL(10,3) NULL,
    Iac2 DECIMAL(10,3) NULL,
    Iac3 DECIMAL(10,3) NULL,
    Fac1 DECIMAL(10,3) NULL,
    Fac2 DECIMAL(10,3) NULL,
    Fac3 DECIMAL(10,3) NULL,
    Pac DECIMAL(10,3) NULL,
    EnergyToday DECIMAL(10,3) NULL,
    EnergyTotal DECIMAL(10,3) NULL,
    HourTotal DECIMAL(10,3) NULL,
    origen VARCHAR(100) NOT NULL DEFAULT 'script-dtu',
    fecha_importacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fecha_hora (fecha_hora),
    UNIQUE KEY uq_datos_inversor_fecha_hora (fecha_hora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Datos de inversor solar DTU';
