import "dotenv/config";
import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import rateLimit from "express-rate-limit";
import { chatHandler } from "./chat.js";
import { leadsRouter } from "./leads.js";
import { getCliente } from "./clientes.js";
import { adminRouter } from "./admin.js";
import { demoHandler } from "./demo.js";
import { db } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === "production";

// Cachear widget.js en memoria para no bloquear el event loop en cada request
const widgetCode = readFileSync(join(__dirname, "widget.js"), "utf8");

// ── Rate limiters ─────────────────────────────────────────────
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes, intentá en un momento" },
});

// Limitar endpoints de lookup de token para dificultar enumeración
const tokenLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes" },
});

// ── CORS ─────────────────────────────────────────────────────
const ADMIN_ORIGINS = process.env.ADMIN_ORIGINS
  ? process.env.ADMIN_ORIGINS.split(",").map((o) => o.trim())
  : [];

function makeOriginCheck(allowedList) {
  return function (origin, cb) {
    if (allowedList.length === 0) {
      // En producción, bloquear si no hay orígenes configurados
      if (IS_PROD) return cb(new Error("Not allowed by CORS"));
      return cb(null, true);
    }
    if (!origin || allowedList.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  };
}

const widgetCors = cors({ origin: true, credentials: true });
const adminCors  = cors({ origin: makeOriginCheck(ADMIN_ORIGINS), credentials: true });

// ── Middlewares ───────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));

app.use((req, res, next) => {
  if (IS_PROD) {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  res.removeHeader("X-Powered-By");
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
    if (req.path !== "/" && req.path !== "/favicon.ico") {
      // Solo loguear req.path (sin query string) para no exponer tokens en logs
      console.log(`[${level}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
    }
    if (ms > 2000) {
      console.warn(`[PERF] Respuesta lenta: ${req.method} ${req.path} tardó ${ms}ms`);
    }
  });
  next();
});

// ── Rutas públicas ────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "Asistente IA Inmobiliaria" });
});

app.get("/widget.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(widgetCode);
});

app.get("/demo", tokenLookupLimiter, demoHandler);

app.get("/dashboard", (req, res) => {
  res.sendFile(join(__dirname, "dashboard.html"));
});

app.get("/cliente", tokenLookupLimiter, async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "token requerido" });
  const cliente = await getCliente(token);
  if (!cliente) return res.status(404).json({ error: "token inválido" });
  res.json({ nombre: cliente.nombre, ciudad: cliente.ciudad, rubro: cliente.rubro || "inmobiliaria" });
});

app.get("/cliente-config", tokenLookupLimiter, widgetCors, async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "token requerido" });
  const cliente = await getCliente(token);
  if (!cliente) return res.status(404).json({ error: "token inválido" });
  res.json({
    color_primario:   cliente.color_primario   || "#18181B",
    color_secundario: cliente.color_secundario || "#2563EB",
    nombre: cliente.nombre,
    rubro:  cliente.rubro || "inmobiliaria",
  });
});

app.use("/admin", adminCors, adminRouter);
app.use("/leads", adminCors, leadsRouter);

app.post("/chat",    widgetCors, chatLimiter, chatHandler);

// Crea sesión vinculada al token del widget
app.post("/session", widgetCors, (req, res) => {
  const sessionId = randomUUID();
  const token = req.body?.token;
  if (typeof token === "string" && token.trim()) {
    db.bindSession(sessionId, token.trim());
  }
  res.json({ sessionId });
});

// ── 404 / Error handlers ──────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

app.use((err, req, res, _next) => {
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Origen no permitido" });
  }
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Error interno del servidor" });
});

// ── Validación de entorno ─────────────────────────────────────
const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_KEY", "ADMIN_PASSWORD", "ADMIN_SECRET"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Variables de entorno faltantes: ${missing.join(", ")}`);
  process.exit(1);
}
if (!process.env.ADMIN_ORIGINS && IS_PROD) {
  console.warn("⚠️  ADMIN_ORIGINS no configurado — panel admin bloqueado por CORS en producción");
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("⚠️  ANTHROPIC_API_KEY no configurado — modo simulado activo");
}
if (!process.env.RESEND_API_KEY) {
  console.warn("⚠️  RESEND_API_KEY no configurado — emails de notificación deshabilitados");
}

// ── Arranque ─────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🔒 Admin panel:  http://localhost:${PORT}/admin`);
  console.log(`📊 Dashboard:    http://localhost:${PORT}/dashboard`);
  console.log(`🎯 Demo widget:  http://localhost:${PORT}/demo`);
});

function shutdown(signal) {
  console.log(`\n[${signal}] Cerrando servidor...`);
  server.close(() => {
    console.log("✅ Servidor cerrado correctamente.");
    process.exit(0);
  });
  setTimeout(() => {
    console.error("❌ Cierre forzado tras timeout.");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
