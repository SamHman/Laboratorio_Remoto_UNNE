import bcryptjs from "bcryptjs";
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import db from "../db.js";

dotenv.config();

async function login(req,res){
  try {
    const user = req.body.user;
    const password = req.body.password;
    if(!user || !password){
      return res.status(400).send({status:"Error",message:"Los campos están incompletos"})
    }
    // Buscar usuario en la base de datos
    const [rows] = await db.query('SELECT * FROM usuarios WHERE user = ?', [user]);
    if(rows.length === 0){
      return res.status(400).send({status:"Error",message:"Error durante login"})
    }
    const usuarioAResvisar = rows[0];
    const loginCorrecto = await bcryptjs.compare(password,usuarioAResvisar.password);
    if(!loginCorrecto){
      return res.status(400).send({status:"Error",message:"Error durante login"})
    }
    const token = jsonwebtoken.sign(
      {user:usuarioAResvisar.user},
      process.env.JWT_SECRET,
      {expiresIn:process.env.JWT_EXPIRATION});

      const cookieOption = {
        expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRES * 24 * 60 * 60 * 1000),
        path: "/"
      }
      res.cookie("jwt",token,cookieOption);
      res.send({status:"ok",message:"Usuario loggeado",redirect:"/SCADA"});
  } catch (error) {
    console.error("[login] Error:", error);
    return res.status(500).send({status:"Error",message:"Error interno en el servidor"});
  }
}

async function register(req,res){
  try {
    const user = req.body.user;
    const password = req.body.password;
    if(!user || !password ){
      return res.status(400).send({status:"Error",message:"Los campos están incompletos"})
    }
    // Verificar si el usuario ya existe en la base de datos
    const [rows] = await db.query('SELECT * FROM usuarios WHERE user = ?', [user]);
    if(rows.length > 0){
      return res.status(400).send({status:"Error",message:"Este usuario ya existe"})
    }
    const salt = await bcryptjs.genSalt(5);
    const hashPassword = await bcryptjs.hash(password,salt);
    // Insertar nuevo usuario en la base de datos
    await db.query('INSERT INTO usuarios (user, password) VALUES (?, ?)', [user, hashPassword]);
    return res.status(201).send({status:"ok",message:`Usuario ${user} agregado`,redirect:"/login"})
  } catch (error) {
    console.error("[register] Error:", error);
    return res.status(500).send({status:"Error",message:"Error interno en el servidor"});
  }
}

function whoami(req, res) {
  try {
    const token = req.cookies.jwt;
    const decodificada = jsonwebtoken.verify(token, process.env.JWT_SECRET);
    return res.send({ status: "ok", username: decodificada.user });
  } catch (error) {
    return res.status(401).send({ status: "Error", message: "No autenticado" });
  }
}

export const methods = {
  login,
  register,
  whoami
}