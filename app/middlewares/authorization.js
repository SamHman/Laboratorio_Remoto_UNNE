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

// Gate de sesión para los PHP de /app/api/ (2026-11-20). nginx no deja pasar ningún
// request a PHP sin antes preguntarle acá (directiva auth_request, ver
// nginx/conf.d/labvirtualunne.conf): 204 = tiene sesión, pasa a PHP; 401 = nginx
// corta y PHP nunca se ejecuta. Es el ÚNICO lugar que decide si hay sesión para
// los PHP: cuando se migre a PLAT-LR (Plan_Integracion/PLAN_INTEGRACION_PLATLR.md) solo cambia
// lo de adentro de esta función, nginx y los PHP quedan igual.
// Sin logs: se llama en cada request a PHP (polling del dashboard cada 30 s).
function verificarSesionApi(req, res) {
  return revisarCookie(req, { silencioso: true }) ? res.sendStatus(204) : res.sendStatus(401);
}

function revisarCookie(req, { silencioso = false } = {}){
  const log = silencioso ? () => {} : console.log;
  try{
    if (!req.headers.cookie) {
      log("[revisarCookie] No hay cookies en la petición");
      return false;
    }
    const cookieJWT = req.headers.cookie.split("; ").find(cookie => cookie.startsWith("jwt="));
    if (!cookieJWT) {
      log("[revisarCookie] No se encontró la cookie JWT");
      return false;
    }
    const token = cookieJWT.slice(4);
    const decodificada = jsonwebtoken.verify(token,process.env.JWT_SECRET);
    log("Token decodificado:", decodificada);
    return true;
  }
  catch(e){
    log("[revisarCookie] Error al verificar JWT:", e.message);
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
  soloApiKey,
  verificarSesionApi
}