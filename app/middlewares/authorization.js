import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";


dotenv.config();

function soloAdmin(req,res,next){
  console.log("[soloAdmin] Ejecutando para ruta:", req.url);
  const logueado = revisarCookie(req);
  console.log("[soloAdmin] logueado:", logueado);
  if(logueado) return next();
  console.log("[soloAdmin] Redirigiendo a /login");
  return res.redirect("/login")
}

function soloPublico(req,res,next){
  console.log("[soloPublico] Ejecutando para ruta:", req.url);
  const logueado = revisarCookie(req);
  console.log("[soloPublico] logueado:", logueado);
  if(!logueado) return next();
  console.log("[soloPublico] Redirigiendo a /SCADA");
  return res.redirect("/SCADA")
}

function revisarCookie(req){
  try{
    if (!req.headers.cookie) {
      console.log("[revisarCookie] No hay cookies en la petición");
      return false;
    }
    const cookieJWT = req.headers.cookie.split("; ").find(cookie => cookie.startsWith("jwt="));
    if (!cookieJWT) {
      console.log("[revisarCookie] No se encontró la cookie JWT");
      return false;
    }
    const token = cookieJWT.slice(4);
    const decodificada = jsonwebtoken.verify(token,process.env.JWT_SECRET);
    console.log("Token decodificado:", decodificada);
    return true;
  }
  catch(e){
    console.log("[revisarCookie] Error al verificar JWT:", e.message);
    return false;
  }
}

function soloApiKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (key && key === process.env.INGEST_API_KEY) return next();
  return res.status(401).json({ status: "error", message: "API key inválida o ausente" });
}

export const methods = {
  soloAdmin,
  soloPublico,
  soloApiKey
}