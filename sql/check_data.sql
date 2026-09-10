-- Verificar datos en datos_inversor
SELECT 
    'datos_inversor' as tabla,
    COUNT(*) as total_registros,
    MIN(fecha_hora) as primer_registro,
    MAX(fecha_hora) as ultimo_registro
FROM datos_inversor
UNION ALL
-- Verificar datos en datos_irradiancia
SELECT 
    'datos_irradiancia' as tabla,
    COUNT(*) as total_registros,
    MIN(fecha_hora) as primer_registro,
    MAX(fecha_hora) as ultimo_registro
FROM datos_irradiancia
UNION ALL
-- Verificar datos en datos_experimento
SELECT 
    'datos_experimento' as tabla,
    COUNT(*) as total_registros,
    MIN(fecha_hora) as primer_registro,
    MAX(fecha_hora) as ultimo_registro
FROM datos_experimento;
