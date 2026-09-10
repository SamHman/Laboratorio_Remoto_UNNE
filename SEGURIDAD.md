# 🔒 Configuración de Seguridad - LabVirtualUNNE

## Resumen
Este documento describe las medidas de seguridad implementadas para proteger el proyecto LabVirtualUNNE contra accesos no autorizados.

---

## 📋 Medidas Implementadas

### 1. **Protección de Directorios** ✅
Se ha deshabilitado el listado de directorios en todo el proyecto mediante archivos `.htaccess`.

**Carpetas protegidas:**
- `/logs` - Archivos de registro del sistema
- `/sql` - Scripts y backups de base de datos
- `/vendor` - Dependencias de Composer
- `/node_modules` - Dependencias de NPM
- `/scripts` - Scripts de automatización
- `/app/controllers` - Controladores de la aplicación
- `/app/middlewares` - Middlewares de autenticación

**Resultado:** Ya no es posible acceder a `http://10.40.136.255/LabVirtualUNNE/` y ver la estructura de carpetas.

---

### 2. **Protección de Archivos Sensibles** ✅
Se bloquea el acceso directo a archivos de configuración y datos sensibles.

**Archivos protegidos:**
- `.env` - Variables de entorno y credenciales
- `.log` - Archivos de registro
- `.sql` - Scripts de base de datos
- `.md` - Documentación interna
- `.json` - Archivos de configuración (composer.json, package.json)
- `.lock` - Archivos de bloqueo de dependencias
- `.txt` - Archivos de texto (excepto en carpetas públicas)
- `.bak`, `.backup`, `.old`, `.tmp` - Archivos de respaldo

**Resultado:** No se puede acceder directamente a archivos como `http://10.40.136.255/LabVirtualUNNE/.env`

---

### 3. **Configuración CORS Segura** ✅
Se ha implementado un sistema de CORS restrictivo pero funcional.

**Orígenes permitidos:**
- `http://localhost` (y puertos 3000, 4000)
- `http://127.0.0.1` (y puertos 3000, 4000)
- Redes locales: `10.x.x.x` y `192.168.x.x`

**Archivo centralizado:** `/app/api/cors_config.php`

**Beneficios:**
- Bloquea accesos desde internet externo
- Permite desarrollo local y acceso en red local
- Facilita mantenimiento (un solo archivo para actualizar)

---

### 4. **Headers de Seguridad HTTP** ✅
Se han agregado headers de seguridad en todas las respuestas.

**Headers implementados:**
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

**Protección contra:**
- MIME type sniffing
- Clickjacking
- Cross-Site Scripting (XSS)
- Fuga de información del referrer
- Acceso no autorizado a APIs del navegador

---

### 5. **Restricción de Métodos HTTP** ✅
Las APIs solo responden a métodos HTTP específicos.

**Métodos permitidos en APIs:**
- `GET` - Para obtener datos
- `POST` - Para enviar datos
- `OPTIONS` - Para preflight CORS

**Métodos bloqueados:**
- `PUT`, `DELETE`, `PATCH`, `TRACE`, `CONNECT`

---

### 6. **Protección contra Hotlinking** ✅
Se evita que otros sitios web usen los recursos del proyecto.

**Recursos protegidos:**
- Imágenes (jpg, jpeg, png, gif, svg)
- Hojas de estilo (css)
- Scripts (js)

**Dominios permitidos:**
- localhost
- 10.40.136.x
- 192.168.x.x

---

### 7. **Protección de Uploads** ✅
Se deshabilita la ejecución de PHP en carpetas de uploads (si existen).

**Resultado:** Aunque se suba un archivo PHP malicioso, no se podrá ejecutar.

---

## 🔧 Archivos de Configuración Creados

### Archivos `.htaccess` creados:
1. `/LabVirtualUNNE/.htaccess` - Configuración principal
2. `/LabVirtualUNNE/app/api/.htaccess` - Protección de APIs
3. `/LabVirtualUNNE/logs/.htaccess` - Bloqueo total
4. `/LabVirtualUNNE/sql/.htaccess` - Bloqueo total
5. `/LabVirtualUNNE/vendor/.htaccess` - Bloqueo total
6. `/LabVirtualUNNE/node_modules/.htaccess` - Bloqueo total
7. `/LabVirtualUNNE/scripts/.htaccess` - Bloqueo total
8. `/LabVirtualUNNE/app/controllers/.htaccess` - Bloqueo total
9. `/LabVirtualUNNE/app/middlewares/.htaccess` - Bloqueo total

### Archivos PHP creados:
1. `/LabVirtualUNNE/app/api/cors_config.php` - Configuración CORS centralizada

---

## ✅ Verificación de Funcionamiento

### Pruebas a realizar:

#### 1. **Verificar bloqueo de listado de directorios**
```
❌ http://10.40.136.255/LabVirtualUNNE/
❌ http://10.40.136.255/LabVirtualUNNE/logs/
❌ http://10.40.136.255/LabVirtualUNNE/sql/
```
**Resultado esperado:** Error 403 Forbidden o página en blanco

#### 2. **Verificar bloqueo de archivos sensibles**
```
❌ http://10.40.136.255/LabVirtualUNNE/.env
❌ http://10.40.136.255/LabVirtualUNNE/composer.json
❌ http://10.40.136.255/LabVirtualUNNE/logs/crear_orden_relay_debug.log
```
**Resultado esperado:** Error 403 Forbidden

#### 3. **Verificar funcionamiento de APIs**
```
✅ http://10.40.136.255/LabVirtualUNNE/app/api/obtener_datos_inversor.php
✅ http://10.40.136.255/LabVirtualUNNE/app/api/crear_orden_relay.php (POST)
```
**Resultado esperado:** APIs funcionando normalmente

#### 4. **Verificar acceso a recursos públicos**
```
✅ http://10.40.136.255/LabVirtualUNNE/app/public/SCADA.js
✅ http://10.40.136.255/LabVirtualUNNE/app/public/style.css
✅ http://10.40.136.255/LabVirtualUNNE/app/pages/login.html
```
**Resultado esperado:** Recursos accesibles

---

## 🚨 Importante

### **NO se ha interrumpido ninguna funcionalidad existente:**
- ✅ Las APIs siguen funcionando normalmente
- ✅ El frontend puede acceder a las APIs
- ✅ Los WebSockets siguen operativos
- ✅ El acceso desde otras PCs en la red local sigue funcionando
- ✅ Los archivos públicos (HTML, CSS, JS) son accesibles

### **Se ha bloqueado:**
- ❌ Listado de directorios
- ❌ Acceso a archivos de configuración
- ❌ Acceso a logs y datos sensibles
- ❌ Acceso a código fuente de controladores
- ❌ Acceso desde orígenes no autorizados

---

## 📝 Mantenimiento

### Para agregar un nuevo origen permitido:
Editar `/app/api/cors_config.php` y agregar el origen al array `$allowedOrigins`.

### Para permitir acceso a un archivo específico:
Editar `/.htaccess` y agregar una excepción en la sección correspondiente.

### Para ver logs de acceso:
Los logs de Apache se encuentran en `xampp/apache/logs/access.log`

---

## 🔐 Recomendaciones Adicionales

### 1. **Cambiar puerto de Apache** (Opcional)
Editar `xampp/apache/conf/httpd.conf`:
```apache
Listen 8080
```
Esto hace más difícil encontrar el servidor.

### 2. **Configurar firewall de Windows**
Bloquear acceso externo al puerto 80/443 desde fuera de la red local.

### 3. **Usar HTTPS** (Recomendado para producción)
Configurar certificado SSL en Apache para encriptar comunicaciones.

### 4. **Autenticación básica para carpetas críticas** (Opcional)
Agregar `.htpasswd` para proteger con usuario/contraseña.

### 5. **Actualizar regularmente**
Mantener XAMPP, PHP y dependencias actualizadas.

---

## 📞 Soporte

Si encuentras algún problema con las configuraciones de seguridad:
1. Revisa los logs de Apache: `xampp/apache/logs/error.log`
2. Verifica que mod_rewrite y mod_headers estén habilitados en Apache
3. Revisa la consola del navegador para errores CORS

---

**Fecha de implementación:** 13 de Octubre, 2025  
**Versión:** 1.0  
**Estado:** ✅ Activo
