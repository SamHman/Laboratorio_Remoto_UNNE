import db from "../db.js";




// Insertar datos del inversor
async function insertInversorData(req, res) {
    try {
        const {
            fecha_hora,
            Vpv1, Vpv2, Ipv1, Ipv2,
            Vac1, Vac2, Vac3, Iac1, Iac2, Iac3,
            Fac1, Fac2, Fac3, Pac, EnergyToday, EnergyTotal, HourTotal
        } = req.body;

        const query = `
            INSERT INTO datos_inversor (
                fecha_hora, Vpv1, Vpv2, Ipv1, Ipv2, 
                Vac1, Vac2, Vac3, Iac1, Iac2, Iac3,
                Fac1, Fac2, Fac3, Pac, EnergyToday, EnergyTotal, HourTotal
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            fecha_hora || new Date(),
            Vpv1, Vpv2, Ipv1, Ipv2,
            Vac1, Vac2, Vac3, Iac1, Iac2, Iac3,
            Fac1, Fac2, Fac3, Pac, EnergyToday, EnergyTotal, HourTotal
        ];

        await db.query(query, values);
        res.json({ status: "ok", message: "Datos del inversor insertados correctamente" });
    } catch (error) {
        console.error("[insertInversorData] Error:", error);
        res.status(500).json({ status: "Error", message: "Error al insertar datos del inversor" });
    }
}

// Insertar datos de irradiancia
async function insertIrradianciaData(req, res) {
    try {
        const { fecha_hora, temperatura, irradiancia } = req.body;

        const query = 'INSERT INTO datos_irradiancia (fecha_hora, temperatura, irradiancia) VALUES (?, ?, ?)';
        const values = [fecha_hora || new Date(), temperatura, irradiancia];

        await db.query(query, values);
        res.json({ status: "ok", message: "Datos de irradiancia insertados correctamente" });
    } catch (error) {
        console.error("[insertIrradianciaData] Error:", error);
        res.status(500).json({ status: "Error", message: "Error al insertar datos de irradiancia" });
    }
}



// ⚠️ ADVERTENCIA (2026-09-25): esta ruta (POST /api/save-sensor-data) no tiene NINGÚN
// middleware de autorización en index.js — ni JWT ni API key. Cualquiera puede postear
// datos falsos a datos_irradiancia. Además, nada la llama hoy (bridge-agent manda por
// WS, no HTTP). Candidata a borrar junto con insertInversorData/insertIrradianciaData
// de este archivo, que tampoco tienen consumidor — pendiente para la próxima conversación.
// Función para guardar datos de sensores
async function saveSensorData(req, res) {
    try {
        console.log('[saveSensorData] Datos recibidos:', JSON.stringify(req.body));
        
        const { temperatura, irradiancia, fecha_hora } = req.body;
        
        // Validar datos de entrada
        if (temperatura === undefined || irradiancia === undefined) {
            console.error('[saveSensorData] Error: Datos incompletos');
            return res.status(400).json({ 
                status: 'error', 
                message: 'Datos incompletos. Se requieren temperatura e irradiancia.' 
            });
        }
        
        const tempNum = parseFloat(temperatura);
        const irradNum = parseFloat(irradiancia);
        
        if (isNaN(tempNum) || isNaN(irradNum)) {
            console.error('[saveSensorData] Error: Datos numéricos inválidos', { temperatura, irradiancia });
            return res.status(400).json({ 
                status: 'error', 
                message: 'Los datos de temperatura e irradiancia deben ser números válidos.' 
            });
        }
        
        // Usar la fecha/hora recibida o la fecha/hora actual
        const fechaHora = fecha_hora || new Date().toISOString().slice(0, 19).replace('T', ' ');
        
        console.log('[saveSensorData] Insertando en la base de datos:', { 
            temperatura: tempNum, 
            irradiancia: irradNum,
            fecha_hora: fechaHora
        });
        
        // Insertar en la base de datos
        const [result] = await db.query(
            'INSERT INTO datos_irradiancia (temperatura, irradiancia, fecha_hora) VALUES (?, ?, ?)',
            [tempNum, irradNum, fechaHora]
        );
        
        console.log('[saveSensorData] Datos guardados correctamente, ID:', result.insertId);
        
        res.json({
            status: 'success',
            message: 'Datos guardados correctamente',
            data: {
                id: result.insertId,
                temperatura: tempNum,
                irradiancia: irradNum,
                fecha_hora: fechaHora
            }
        });
        
    } catch (error) {
        console.error('[saveSensorData] Error al guardar en la base de datos:', error);
        console.error('[saveSensorData] Error stack:', error.stack);
        
        res.status(500).json({ 
            status: 'error', 
            message: 'Error al guardar los datos en la base de datos',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// Exportar todas las funciones individualmente
export {
    insertInversorData,
    insertIrradianciaData,
    saveSensorData
};