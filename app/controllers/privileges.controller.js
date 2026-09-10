import db from "../db.js";
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

// Función para obtener el usuario desde el token JWT
function getUserFromToken(req) {
    try {
        if (!req.headers.cookie) {
            return null;
        }
        const cookieJWT = req.headers.cookie.split("; ").find(cookie => cookie.startsWith("jwt="));
        if (!cookieJWT) {
            return null;
        }
        const token = cookieJWT.slice(4);
        const decodificada = jsonwebtoken.verify(token, process.env.JWT_SECRET);
        return decodificada.user;
    } catch (e) {
        console.log("[getUserFromToken] Error al verificar JWT:", e.message);
        return null;
    }
}

// Función para verificar si los privilegios han expirado
function hasPrivilegesExpired(privilegios_expira) {
    if (!privilegios_expira) return true;
    const now = new Date();
    const expirationDate = new Date(privilegios_expira);
    return now > expirationDate;
}

// Endpoint para verificar el estado de privilegios del usuario actual
async function checkPrivileges(req, res) {
    try {
        const username = getUserFromToken(req);
        if (!username) {
            return res.status(401).send({
                status: "Error",
                message: "Usuario no autenticado",
                hasPrivileges: false
            });
        }

        // Buscar usuario en la base de datos
        const [rows] = await db.query(
            'SELECT privilegios, privilegios_expira FROM usuarios WHERE user = ?', 
            [username]
        );

        if (rows.length === 0) {
            return res.status(404).send({
                status: "Error",
                message: "Usuario no encontrado",
                hasPrivileges: false
            });
        }

        const usuario = rows[0];
        const hasPrivileges = usuario.privilegios === 1 || usuario.privilegios === true;
        const isExpired = hasPrivilegesExpired(usuario.privilegios_expira);

        // Si los privilegios han expirado, revocarlos automáticamente
        if (hasPrivileges && isExpired) {
            await db.query(
                'UPDATE usuarios SET privilegios = 0, privilegios_expira = NULL WHERE user = ?',
                [username]
            );
            
            return res.send({
                status: "ok",
                hasPrivileges: false,
                expired: true,
                message: "Privilegios expirados y revocados automáticamente"
            });
        }

        return res.send({
            status: "ok",
            hasPrivileges: hasPrivileges && !isExpired,
            expired: false,
            expiresAt: usuario.privilegios_expira,
            username: username
        });

    } catch (error) {
        console.error("[checkPrivileges] Error:", error);
        return res.status(500).send({
            status: "Error",
            message: "Error interno en el servidor",
            hasPrivileges: false
        });
    }
}

// Función para otorgar privilegios (para uso manual del administrador)
async function grantPrivileges(req, res) {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).send({
                status: "Error",
                message: "Nombre de usuario requerido"
            });
        }

        // Calcular fecha de expiración (48 horas desde ahora)
        const expirationDate = new Date();
        expirationDate.setHours(expirationDate.getHours() + 48);

        // Actualizar privilegios del usuario
        const [result] = await db.query(
            'UPDATE usuarios SET privilegios = 1, privilegios_expira = ? WHERE user = ?',
            [expirationDate, username]
        );

        if (result.affectedRows === 0) {
            return res.status(404).send({
                status: "Error",
                message: "Usuario no encontrado"
            });
        }

        return res.send({
            status: "ok",
            message: `Privilegios otorgados a ${username}`,
            expiresAt: expirationDate
        });

    } catch (error) {
        console.error("[grantPrivileges] Error:", error);
        return res.status(500).send({
            status: "Error",
            message: "Error interno en el servidor"
        });
    }
}

// Función para revocar privilegios (para uso manual del administrador)
async function revokePrivileges(req, res) {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).send({
                status: "Error",
                message: "Nombre de usuario requerido"
            });
        }

        // Revocar privilegios del usuario
        const [result] = await db.query(
            'UPDATE usuarios SET privilegios = 0, privilegios_expira = NULL WHERE user = ?',
            [username]
        );

        if (result.affectedRows === 0) {
            return res.status(404).send({
                status: "Error",
                message: "Usuario no encontrado"
            });
        }

        return res.send({
            status: "ok",
            message: `Privilegios revocados para ${username}`
        });

    } catch (error) {
        console.error("[revokePrivileges] Error:", error);
        return res.status(500).send({
            status: "Error",
            message: "Error interno en el servidor"
        });
    }
}

export const methods = {
    checkPrivileges,
    grantPrivileges,
    revokePrivileges
};

