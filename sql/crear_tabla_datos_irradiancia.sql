-- Script SQL para crear la tabla datos_irradiancia
-- Almacena las lecturas del sensor ESP32 (irradiancia y temperatura) que
-- consumen los endpoints de telemetría/exportación del dashboard.
-- Ejecutar en phpMyAdmin o MySQL Workbench
-- Mantener en sync con sql/init/03_datos_irradiancia.sql (fuente de verdad para Docker)

CREATE DATABASE IF NOT EXISTS labvirtual;
USE labvirtual;

CREATE TABLE IF NOT EXISTS datos_irradiancia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_hora DATETIME NOT NULL COMMENT 'Fecha y hora de la lectura (año-mes-día horas:minutos:segundos)',
    temperatura DECIMAL(6,2) NULL COMMENT 'Temperatura ambiente en °C',
    irradiancia DECIMAL(8,2) NULL COMMENT 'Irradiancia solar en W/m2',
    fecha_importacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de inserción del registro',

    -- Clave única para evitar duplicados: una fecha_hora es un único punto en el tiempo
    UNIQUE KEY uq_datos_irradiancia_fecha_hora (fecha_hora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Lecturas de irradiancia y temperatura del sensor ESP32';
