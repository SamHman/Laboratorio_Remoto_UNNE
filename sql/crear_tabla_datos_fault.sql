-- Script SQL para crear la tabla datos_inversor
-- Ejecutar en phpMyAdmin o MySQL Workbench

CREATE DATABASE IF NOT EXISTS labvirtual;
USE labvirtual;

CREATE TABLE IF NOT EXISTS datos_fault (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_hora DATETIME NOT NULL,
    Vpv1 DECIMAL(10,3) NULL COMMENT 'Voltaje PV1',
    Vpv2 DECIMAL(10,3) NULL COMMENT 'Voltaje PV2',
    Ipv1 DECIMAL(10,3) NULL COMMENT 'Corriente PV1',
    Ipv2 DECIMAL(10,3) NULL COMMENT 'Corriente PV2',
    Vac1 DECIMAL(10,3) NULL COMMENT 'Voltaje AC1',
    Vac2 DECIMAL(10,3) NULL COMMENT 'Voltaje AC2',
    Vac3 DECIMAL(10,3) NULL COMMENT 'Voltaje AC3',
    Iac1 DECIMAL(10,3) NULL COMMENT 'Corriente AC1',
    Iac2 DECIMAL(10,3) NULL COMMENT 'Corriente AC2',
    Iac3 DECIMAL(10,3) NULL COMMENT 'Corriente AC3',
    Fac1 DECIMAL(10,3) NULL COMMENT 'Frecuencia AC1',
    Fac2 DECIMAL(10,3) NULL COMMENT 'Frecuencia AC2',
    Fac3 DECIMAL(10,3) NULL COMMENT 'Frecuencia AC3',
    Pac DECIMAL(10,3) NULL COMMENT 'Potencia AC',
    EnergyToday DECIMAL(10,3) NULL COMMENT 'Energía del día',
    EnergyTotal DECIMAL(10,3) NULL COMMENT 'Energía total',
    HourTotal DECIMAL(10,3) NULL COMMENT 'Horas totales',
    archivo_origen VARCHAR(255) NOT NULL COMMENT 'Nombre del archivo Excel origen',
    fecha_importacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de importación',
    
    -- Índices para mejorar el rendimiento
    INDEX idx_fecha_hora (fecha_hora),
    INDEX idx_archivo_origen (archivo_origen),
    INDEX idx_fecha_importacion (fecha_importacion),
    
    -- Clave única para evitar duplicados
    UNIQUE KEY unique_record (fecha_hora, archivo_origen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Datos de inversores solares DTU';

-- Crear un usuario específico para la aplicación (opcional)
-- CREATE USER 'labvirtual_user'@'localhost' IDENTIFIED BY 'password123';
-- GRANT SELECT, INSERT, UPDATE ON labvirtual.datos_inversor TO 'labvirtual_user'@'localhost';
-- FLUSH PRIVILEGES;

