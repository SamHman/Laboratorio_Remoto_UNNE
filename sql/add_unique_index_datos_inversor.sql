-- Script para agregar índice único en fecha_hora de datos_inversor
-- Esto previene duplicados a nivel de base de datos
-- Ubicación: D:\xampp\htdocs\LabVirtualUNNE\database\add_unique_index_datos_inversor.sql

-- PASO 1: Primero, eliminar duplicados existentes si los hay
-- Mantener solo el registro más reciente (mayor id) por cada fecha_hora

DELETE t1 FROM datos_inversor t1
INNER JOIN datos_inversor t2 
WHERE 
    t1.fecha_hora = t2.fecha_hora 
    AND t1.id < t2.id;

-- PASO 2: Agregar índice único en fecha_hora
-- Esto garantiza que no se puedan insertar duplicados

ALTER TABLE datos_inversor
ADD UNIQUE INDEX uq_datos_inversor_fecha_hora (fecha_hora);

-- VERIFICACIÓN: Contar registros por fecha_hora para confirmar que no hay duplicados
SELECT 
    fecha_hora, 
    COUNT(*) as cantidad,
    GROUP_CONCAT(id) as ids
FROM datos_inversor
GROUP BY fecha_hora
HAVING COUNT(*) > 1;

-- Si la consulta anterior no devuelve resultados, no hay duplicados
-- Si devuelve resultados, ejecutar nuevamente el PASO 1
