# Changelog

Todos los cambios relevantes del proyecto están documentados aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [1.1.0] — 2026-06-05

### Seguridad
- **ADMIN_SECRET obligatorio:** el servidor falla al iniciar si la variable no está definida. Eliminado el fallback hardcodeado `"admin-session-v1"`.
- **CORS restringido:** reemplazado `cors()` wildcard por lista explícita de orígenes permitidos via `ALLOWED_ORIGINS`.
- **Cookie de logout mejorado:** agrega `SameSite=Strict` y `Secure` (en producción) al cookie de invalidación de sesión.
- **Validación de colores CSS:** `color_primario` y `color_secundario` ahora se validan contra el patrón `#RRGGBB` antes de persistirse. Valores inválidos son reemplazados por defaults seguros.
- **CSP agregado:** `Content-Security-Policy` header en todas las respuestas.
- **Permissions-Policy agregado:** deshabilita cámara, micrófono y geolocalización.
- **X-Powered-By eliminado:** evita fingerprinting del framework.
- **Contraseña admin fortalecida:** reemplazada contraseña débil por una generada criptográficamente (20 caracteres).

### Añadido
- Middleware de logging de performance: logea método, ruta, status y tiempo de respuesta.
- Alerta automática para respuestas lentas (>2 segundos).
- Garbage collector de sesiones en memoria: limpia sesiones con más de 2 horas de antigüedad cada hora.
- Graceful shutdown: `SIGTERM`/`SIGINT` cierran el servidor ordenadamente.
- Startup checks: el proceso falla rápido si faltan variables de entorno críticas.
- Handler global de errores 404 y 500.
- `npm run audit:deps` y `npm run audit:full` en scripts.
- `engines` en `package.json` (Node.js >= 18).

### Mejorado
- `README.md` reescrito con arquitectura, endpoints, variables de entorno, deploy, seguridad y checklist de mantenimiento.
- `.gitignore` expandido: cubre `.env.*`, logs, builds, archivos de IDE y OS.
- `CHANGELOG.md` creado (este archivo).

---

## [1.0.0] — 2026-05-25

### Lanzamiento inicial
- Widget JS embebible con chat IA (Anthropic Claude).
- Captura automática de leads desde la conversación.
- Panel de administración multi-cliente (`/admin`).
- Dashboard de leads por cliente (`/dashboard`).
- Notificaciones por email al capturar un lead (Resend).
- Rate limiting en endpoints de chat y login.
- Persistencia en Supabase (clientes, leads, conversaciones).
- Deploy en Railway con `nixpacks.toml`.
