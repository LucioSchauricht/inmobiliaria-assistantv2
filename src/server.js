import "dotenv/config";
import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import rateLimit from "express-rate-limit";
import { chatHandler } from "./chat.js";
import { leadsRouter } from "./leads.js";
import { getCliente } from "./clientes.js";
import { adminRouter } from "./admin.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes, intentá en un momento" },
});

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin requests (no Origin header) and explicitly listed origins.
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "10kb" }));

// ── Security headers ────────────────────────────────────────
app.use((req, res, next) => {
  // Prevent MIME sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Deny iframe embedding from foreign origins
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  // Limit referrer information leakage
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Disable browser features not needed
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // Content-Security-Policy
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",   // unsafe-inline requerido por los HTML inline de admin/dashboard
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  // Remove fingerprinting header
  res.removeHeader("X-Powered-By");
  next();
});

// ── Request timing / basic performance logging ───────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
    // Only log non-static, non-health-check requests
    if (req.path !== "/" && req.path !== "/favicon.ico") {
      console.log(`[${level}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
    }
    // Warn on slow responses (>2s)
    if (ms > 2000) {
      console.warn(`[PERF] Respuesta lenta: ${req.method} ${req.path} tardó ${ms}ms`);
    }
  });
  next();
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "Asistente IA Inmobiliaria" });
});

// Servir el widget.js (con el origen correcto del servidor)
app.get("/widget.js", (req, res) => {
  const code = readFileSync(join(__dirname, "widget.js"), "utf8");
  res.setHeader("Content-Type", "application/javascript");
  res.send(code);
});

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// Página de prueba para ver el widget en el navegador
app.get("/demo", (req, res) => {
  const token = req.query.token || "DEMO-TOKEN-001";
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Demo — Asistente IA</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #FAFAFA; color: #09090B; min-height: 100vh;
      display: flex; align-items: center; justify-content: center; padding: 40px 24px;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      background: #fff; border: 1px solid #E4E4E7; border-radius: 12px;
      padding: 40px; max-width: 480px; width: 100%;
    }
    .mark {
      width: 36px; height: 36px; border-radius: 8px; background: #18181B;
      display: flex; align-items: center; justify-content: center; margin-bottom: 20px;
    }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 8px; }
    p { color: #71717A; font-size: .9rem; line-height: 1.6; margin-bottom: 6px; }
    .token-row {
      display: flex; align-items: center; gap: 10px;
      background: #FAFAFA; border: 1px solid #E4E4E7; border-radius: 7px;
      padding: 10px 14px; margin-top: 20px;
    }
    .token-label { font-size: .72rem; font-weight: 600; color: #A1A1AA; text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; }
    .token-value { font-family: monospace; font-size: .875rem; color: #3F3F46; }
    .hint { margin-top: 20px; font-size: .8125rem; color: #A1A1AA; }
  </style>
</head>
<body>
  <div class="card">
    <div class="mark">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </div>
    <h1>Página de demo</h1>
    <p>Esta es una página de prueba del widget de chat para inmobiliarias.</p>
    <div class="token-row">
      <span class="token-label">Token</span>
      <span class="token-value">${escHtml(token)}</span>
    </div>
    <p class="hint">El widget aparece en la esquina inferior derecha.</p>
  </div>
  <script src="/widget.js?token=${encodeURIComponent(token)}"></script>
</body>
</html>`);
});

// Dashboard
app.get("/dashboard", (req, res) => {
  res.sendFile(join(__dirname, "dashboard.html"));
});

// Info de cliente por token (para el dashboard de leads)
app.get("/cliente", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "token requerido" });
  const cliente = await getCliente(token);
  if (!cliente) return res.status(404).json({ error: "token inválido" });
  res.json({ nombre: cliente.nombre, ciudad: cliente.ciudad });
});

// Configuración visual del widget
app.get("/cliente-config", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "token requerido" });
  const cliente = await getCliente(token);
  if (!cliente) return res.status(404).json({ error: "token inválido" });
  res.json({
    color_primario:   cliente.color_primario   || "#18181B",
    color_secundario: cliente.color_secundario || "#2563EB",
  });
});

// Admin
app.use("/admin", adminRouter);

// Chat
app.post("/chat", chatLimiter, chatHandler);

// Leads
app.use("/leads", leadsRouter);

// Nueva sesión
app.post("/session", (req, res) => {
  res.json({ sessionId: uuidv4() });
});

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// ── Global error handler ─────────────────────────────────────
app.use((err, req, res, _next) => {
  // CORS errors
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Origen no permitido" });
  }
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Error interno del servidor" });
});

// ── Startup checks ───────────────────────────────────────────
const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_KEY", "ADMIN_PASSWORD", "ADMIN_SECRET"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Variables de entorno faltantes: ${missing.join(", ")}`);
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("⚠️  ANTHROPIC_API_KEY no configurado — modo simulado activo");
}
if (!process.env.RESEND_API_KEY) {
  console.warn("⚠️  RESEND_API_KEY no configurado — emails de notificación deshabilitados");
}

const server = app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🔒 Admin panel:  http://localhost:${PORT}/admin`);
  console.log(`📊 Dashboard:    http://localhost:${PORT}/dashboard`);
  console.log(`🎯 Demo widget:  http://localhost:${PORT}/demo`);
});

// ── Graceful shutdown ────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[${signal}] Cerrando servidor...`);
  server.close(() => {
    console.log("✅ Servidor cerrado correctamente.");
    process.exit(0);
  });
  // Force exit after 10s if connections hang
  setTimeout(() => {
    console.error("❌ Cierre forzado tras timeout.");
    process.exit(1);
  }, 10_000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
