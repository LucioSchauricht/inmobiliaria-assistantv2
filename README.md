# Asistente IA para Inmobiliarias

Backend del asistente conversacional con IA para captura de leads en páginas web de inmobiliarias. Incluye widget embebible, panel de administración multi-cliente y dashboard de leads.

---

## Arquitectura

```
src/
├── server.js      Servidor Express, middlewares, rutas principales
├── admin.js       Panel de administración (CRUD de clientes)
├── chat.js        Handler del chat con Claude (Anthropic)
├── db.js          Capa de datos (Supabase + sesiones en memoria)
├── leads.js       API de leads y conversaciones
├── email.js       Notificaciones de leads por email (Resend)
├── prompt.js      System prompt dinámico por cliente
├── widget.js      Widget JS embebible (se sirve desde /widget.js)
├── admin.html     SPA del panel admin
└── dashboard.html SPA del dashboard de leads por cliente
```

---

## Requisitos

- Node.js >= 18
- Cuenta en [Supabase](https://supabase.com) (base de datos)
- API Key de [Anthropic](https://console.anthropic.com) (IA)
- API Key de [Resend](https://resend.com) (emails, opcional)

---

## Instalación local

```bash
git clone <repo>
cd inmobiliaria-assistant
npm install
cp .env.example .env
# Completar .env con tus credenciales (ver sección Variables de entorno)
npm run dev
```

---

## Variables de entorno

Copiar `.env.example` como `.env` y completar:

| Variable | Obligatoria | Descripción |
|---|---|---|
| `ANTHROPIC_API_KEY` | Recomendada | API key de Anthropic. Sin ella, activa modo simulado. |
| `SUPABASE_URL` | ✅ Sí | URL del proyecto Supabase |
| `SUPABASE_KEY` | ✅ Sí | Clave anon/service de Supabase |
| `ADMIN_PASSWORD` | ✅ Sí | Contraseña del panel `/admin`. Usar mínimo 16 caracteres. |
| `ADMIN_SECRET` | ✅ Sí | Secreto HMAC para firmar sesiones admin. Generar con `openssl rand -hex 32` |
| `ALLOWED_ORIGINS` | ✅ Sí | Dominios permitidos para CORS, separados por coma. Ej: `https://midominio.com` |
| `RESEND_API_KEY` | Opcional | Para enviar emails de notificación al capturar leads |
| `RESEND_FROM` | Opcional | Dirección remitente de los emails |
| `PORT` | Opcional | Puerto del servidor (default: 3000) |
| `NODE_ENV` | Opcional | `production` activa la flag `Secure` en cookies |

> **Nunca commitear `.env` al repositorio.** Está en `.gitignore`.

---

## Endpoints

### Públicos (widget / dashboard)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/session` | Crea una sesión nueva de chat |
| `POST` | `/chat` | Envía mensaje al asistente IA |
| `GET` | `/cliente?token=X` | Info básica del cliente (nombre, ciudad) |
| `GET` | `/cliente-config?token=X` | Colores del widget |
| `GET` | `/leads?token=X` | Lista leads del cliente |
| `PATCH` | `/leads/:id/contactado` | Marca/desmarca lead como contactado |
| `GET` | `/leads/conversacion?session_id=X&token=Y` | Conversación de un lead |
| `GET` | `/widget.js?token=X` | Sirve el widget JS |
| `GET` | `/demo?token=X` | Página de demo del widget |
| `GET` | `/dashboard` | Dashboard de leads |

### Admin (requiere cookie de sesión)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/admin` | Panel de administración |
| `POST` | `/admin/api/login` | Login (rate limited: 5/15min) |
| `POST` | `/admin/api/logout` | Logout |
| `GET` | `/admin/api/check` | Verificar sesión activa |
| `GET` | `/admin/api/clientes` | Listar todos los clientes |
| `POST` | `/admin/api/clientes` | Crear cliente |
| `PATCH` | `/admin/api/clientes/:token` | Editar cliente |
| `DELETE` | `/admin/api/clientes/:token` | Eliminar cliente |

---

## Embeber el widget

Agregar al HTML del cliente (antes de `</body>`):

```html
<script src="https://tu-servidor.railway.app/widget.js?token=TOKEN-DEL-CLIENTE"></script>
```

---

## Deploy en Railway

1. Crear cuenta en [railway.app](https://railway.app)
2. Nuevo proyecto → **Deploy from GitHub**
3. En **Variables** del proyecto, agregar todas las variables de `.env`
4. Railway detecta Node.js automáticamente y usa `npm start`

---

## Base de datos (Supabase)

El proyecto requiere tres tablas en Supabase:

**`clientes`** — configuración por cliente
```sql
id, token (unique), nombre, ciudad, telefono, horario,
propiedades (jsonb), email_contacto, color_primario,
color_secundario, created_at
```

**`leads`** — contactos capturados
```sql
id, session_id (unique), token, nombre, telefono, email,
horario, resumen, contactado (bool), created_at, updated_at
```

**`conversaciones`** — historial de mensajes
```sql
id, session_id, role, content, created_at
```

---

## Seguridad

- Rate limiting en `/chat` (20 req/min) y `/admin/api/login` (5 req/15min)
- Cookies admin: `HttpOnly`, `SameSite=Strict`, `Secure` en producción
- CORS restringido a `ALLOWED_ORIGINS`
- CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- HTML escaping en todas las vistas
- Colores CSS validados contra regex `#RRGGBB`
- `ADMIN_SECRET` obligatorio en runtime (el proceso falla si no está definido)

### Rotar credenciales

```bash
# Generar nuevo ADMIN_SECRET
openssl rand -hex 32

# Generar nuevo ADMIN_PASSWORD
openssl rand -base64 16
```

Actualizar en `.env` local y en las variables de Railway.

---

## Auditoría de dependencias

```bash
npm run audit:deps   # Solo vulnerabilidades moderadas o superiores
npm run audit:full   # Reporte completo
```

---

## Limitaciones conocidas

| Limitación | Impacto | Solución futura |
|---|---|---|
| Sesiones de chat en memoria (`Map`) | Se pierden al reiniciar el proceso | Migrar a Redis o tabla Supabase |
| Un solo proceso Node.js | No escala horizontalmente | Agregar Redis para sesiones compartidas |
| Sin tests automáticos | Regressions manuales | Agregar Vitest o Jest |
| Autenticación admin básica | Un solo admin global | Migrar a tabla de usuarios con bcrypt |

---

## Mantenimiento

### Checklist mensual

- [ ] Ejecutar `npm run audit:deps` y aplicar fixes
- [ ] Rotar `ADMIN_SECRET` y `ADMIN_PASSWORD`
- [ ] Verificar logs de Railway por errores o respuestas lentas (>2s)
- [ ] Revisar uso de la API de Anthropic (costos y cuota)
- [ ] Verificar que Supabase esté dentro del plan gratuito o pago

### Monitoreo

El servidor logea automáticamente:
- Todas las requests con método, ruta, status y tiempo de respuesta
- Warnings para respuestas lentas (>2 segundos)
- Sesiones expiradas eliminadas de memoria (cada hora)
- Errores de Supabase y del servicio de email
