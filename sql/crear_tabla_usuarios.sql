-- Script SQL para crear la tabla usuarios
-- Solo usuario y contraseña: el sistema de privilegios (multiusuario con
-- expiración) se descartó del proyecto.
-- Ejecutar en phpMyAdmin o MySQL Workbench
-- Mantener en sync con sql/init/01_usuarios.sql (fuente de verdad para Docker)

CREATE DATABASE IF NOT EXISTS labvirtual;
USE labvirtual;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL COMMENT 'Hash bcrypt, nunca texto plano',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Usuarios con acceso al panel de control';
