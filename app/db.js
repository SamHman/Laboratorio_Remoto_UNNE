import mysql from 'mysql2/promise';
import dotenv from "dotenv";
import path from 'path';
import { fileURLToPath } from 'url';

// Configuración de rutas
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Configuración de la conexión
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1', // Usar 127.0.0.1 en lugar de localhost
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'labvirtual',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  // Importante para compatibilidad con XAMPP/MariaDB
  timezone: 'local',
  charset: 'utf8mb4',
  connectTimeout: 10000
};

// Crear el pool de conexiones
const db = mysql.createPool(dbConfig);

// Función para probar la conexión
export async function testConnection() {
  let connection;
  try {
    connection = await db.getConnection();
    console.log('✓ Conexión exitosa a MySQL');
    return true;
  } catch (error) {
    console.error('✗ Error de conexión:', error.message);
    console.error('Configuración usada:', {
      ...dbConfig,
      password: dbConfig.password ? '***' : '(vacía)'
    });
    return false;
  } finally {
    if (connection) await connection.release();
  }
}

// Exportar el pool para usarlo en otros archivos
export default db;

// Ejecutar prueba de conexión al cargar el módulo
if (process.env.NODE_ENV !== 'test') {
  testConnection().then(success => {
    if (!success) {
      console.log('Por favor verifica:');
      console.log('1. Que el servidor MySQL esté en ejecución');
      console.log('2. Que las credenciales en .env sean correctas');
      console.log('3. Que el usuario tenga permisos para acceder a la base de datos');
    }
  });
}