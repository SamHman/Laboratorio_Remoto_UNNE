import db from "../db.js";

const INVERSOR_FIELDS = [
    "Vpv1", "Vpv2", "Ipv1", "Ipv2",
    "Vac1", "Vac2", "Vac3", "Iac1", "Iac2", "Iac3",
    "Fac1", "Fac2", "Fac3", "Pac", "EnergyToday", "EnergyTotal", "HourTotal"
];

// Ingesta HTTP del script que reemplazó al bot de captura del DTU.
// Reproduce el contrato de la vieja importar_excel_dtu.php: los mismos 17 campos
// eléctricos + fecha_hora + un identificador de origen, con upsert sobre el único
// índice único que tiene la tabla ahora (fecha_hora), ver sql/init/02_datos_inversor.sql.
async function ingestInversor(req, res) {
    try {
        const { fecha_hora, origen } = req.body || {};
        if (!fecha_hora) {
            return res.status(400).json({ status: "error", message: "fecha_hora es requerido" });
        }

        const columns = ["fecha_hora", ...INVERSOR_FIELDS, "origen"];
        const values = [fecha_hora, ...INVERSOR_FIELDS.map((f) => req.body[f] ?? null), origen || "script-dtu"];
        const placeholders = columns.map(() => "?").join(", ");
        const updateClause = [...INVERSOR_FIELDS, "origen"].map((c) => `${c} = VALUES(${c})`).join(", ");

        await db.query(
            `INSERT INTO datos_inversor (${columns.join(", ")}, fecha_importacion)
             VALUES (${placeholders}, NOW())
             ON DUPLICATE KEY UPDATE ${updateClause}, fecha_importacion = NOW()`,
            values
        );

        res.json({ status: "ok", message: "Datos del inversor ingresados correctamente" });
    } catch (error) {
        console.error("[telemetry.controller] Error en ingestInversor:", error);
        res.status(500).json({ status: "error", message: "Error al ingresar datos del inversor" });
    }
}

export { ingestInversor };
