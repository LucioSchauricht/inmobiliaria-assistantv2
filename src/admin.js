import { Router } from "express";
import { randomUUID, timingSafeEqual } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { supabase } from "./supabase.js";
import rateLimit from "express-rate-limit";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const adminRouter = Router();

if (!process.env.ADMIN_SECRET) {
  console.error("❌ FATAL: ADMIN_SECRET no está configurado.");
  process.exit(1);
}

// ── Session store (reemplaza HMAC determinístico) ──────────────
const SESSION_TTL = 24 * 60 * 60 * 1000;
const adminSessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of adminSessions) {
    if (s.exp < now) adminSessions.delete(id);
  }
}, 60 * 60 * 1000);

// ── Helpers ────────────────────────────────────────────────────
const CSS_COLOR_RE = /^#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?$/;
function isValidColor(c) {
  return typeof c === "string" && CSS_COLOR_RE.test(c);
}

function safeEq(a, b) {
  const A = Buffer.from(String(a || ""));
  const B = Buffer.from(String(b || ""));
  if (A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || "").split(";").forEach((c) => {
    const [k, ...v] = c.trim().split("=");
    if (k) {
      try { cookies[k.trim()] = decodeURIComponent(v.join("=")); }
      catch { cookies[k.trim()] = v.join("="); }
    }
  });
  return cookies;
}

function requireAdmin(req, res, next) {
  const { admin_sid } = parseCookies(req);
  const session = adminSessions.get(admin_sid);
  if (session && session.exp > Date.now()) return next();
  res.status(401).json({ error: "No autorizado" });
}

const RUBROS_VALIDOS = ["inmobiliaria", "concesionaria"];

function normalizeRubro(value) {
  const rubro = String(value || "inmobiliaria").toLowerCase().trim();
  return RUBROS_VALIDOS.includes(rubro) ? rubro : null;
}

function sanitizeStringArray(value) {
  if (value === undefined || value === null) return [];
  const arr = Array.isArray(value) ? value : String(value).split("\n");
  return arr
    .map((item) => String(item).replace(/[\r\n]/g, " ").trim().slice(0, 300))
    .filter((item) => item.length > 0)
    .slice(0, 200);
}

function sanitizeStr(val, max = 200) {
  return String(val ?? "").replace(/[\r\n]/g, " ").trim().slice(0, max);
}

function toBoolStrict(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "si" || value === "1" || value === 1) return true;
  if (value === "false" || value === "no" || value === "0" || value === 0) return false;
  return fallback;
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos, esperá 15 minutos" },
});

// ── HTML ────────────────────────────────────────────────────────
adminRouter.get("/", (req, res) => {
  res.sendFile(join(__dirname, "admin.html"));
});

// ── Auth ────────────────────────────────────────────────────────
adminRouter.post("/api/login", loginLimiter, (req, res) => {
  const { password } = req.body;
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return res.status(500).json({ error: "Configuración incompleta" });
  if (!safeEq(password, pass)) return res.status(401).json({ error: "Contraseña incorrecta" });
  const sid = randomUUID();
  adminSessions.set(sid, { exp: Date.now() + SESSION_TTL });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `admin_sid=${sid}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=86400${secure}`);
  res.json({ ok: true });
});

adminRouter.post("/api/logout", (req, res) => {
  const { admin_sid } = parseCookies(req);
  if (admin_sid) adminSessions.delete(admin_sid);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `admin_sid=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0${secure}`);
  res.json({ ok: true });
});

adminRouter.get("/api/check", (req, res) => {
  const { admin_sid } = parseCookies(req);
  const session = adminSessions.get(admin_sid);
  if (session && session.exp > Date.now()) return res.json({ ok: true });
  res.status(401).json({ error: "No autorizado" });
});

// ── Clientes API ─────────────────────────────────────────────────
adminRouter.get("/api/clientes", requireAdmin, async (req, res) => {
  const [{ data: clientes, error: e1 }, { data: leads }] = await Promise.all([
    supabase.from("clientes").select("*").order("created_at", { ascending: false }),
    supabase.from("leads").select("token"),
  ]);
  if (e1) {
    console.error("Error listando clientes:", e1.message);
    return res.status(500).json({ error: "Error al procesar la solicitud" });
  }
  const counts = {};
  (leads || []).forEach((l) => { counts[l.token] = (counts[l.token] || 0) + 1; });
  res.json((clientes || []).map((c) => ({ ...c, lead_count: counts[c.token] || 0 })));
});

adminRouter.post("/api/clientes", requireAdmin, async (req, res) => {
  const {
    nombre, ciudad, telefono, horario, email_contacto,
    color_primario, color_secundario,
    rubro: rubroRaw, propiedades, vehiculos, financiacion_disponible,
  } = req.body;

  if (!nombre || !ciudad || !telefono || !horario) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  const rubro = normalizeRubro(rubroRaw);
  if (!rubro) {
    return res.status(400).json({ error: `rubro inválido. Valores permitidos: ${RUBROS_VALIDOS.join(", ")}` });
  }

  // Token de 128 bits (UUID completo sin guiones)
  const token = "TOKEN-" + randomUUID().replace(/-/g, "").toUpperCase();

  const { error } = await supabase.from("clientes").insert({
    token,
    nombre:           sanitizeStr(nombre, 150),
    ciudad:           sanitizeStr(ciudad, 100),
    telefono:         sanitizeStr(telefono, 30),
    horario:          sanitizeStr(horario, 100),
    email_contacto:   email_contacto ? sanitizeStr(email_contacto, 254) : null,
    color_primario:   isValidColor(color_primario)   ? color_primario   : "#18181B",
    color_secundario: isValidColor(color_secundario) ? color_secundario : "#2563EB",
    rubro,
    propiedades: rubro === "inmobiliaria" ? sanitizeStringArray(propiedades) : [],
    vehiculos:   rubro === "concesionaria" ? sanitizeStringArray(vehiculos)  : [],
    financiacion_disponible: rubro === "concesionaria" ? toBoolStrict(financiacion_disponible, false) : false,
  });

  if (error) {
    console.error("Error creando cliente:", error.message);
    return res.status(500).json({ error: "Error al procesar la solicitud" });
  }
  res.json({ ok: true, token });
});

adminRouter.patch("/api/clientes/:token", requireAdmin, async (req, res) => {
  const {
    nombre, ciudad, telefono, horario, email_contacto,
    color_primario, color_secundario,
    rubro: rubroRaw, propiedades, vehiculos, financiacion_disponible,
  } = req.body;

  if (!nombre || !ciudad || !telefono || !horario) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  const rubro = normalizeRubro(rubroRaw);
  if (!rubro) {
    return res.status(400).json({ error: `rubro inválido. Valores permitidos: ${RUBROS_VALIDOS.join(", ")}` });
  }

  const { error } = await supabase.from("clientes").update({
    nombre:           sanitizeStr(nombre, 150),
    ciudad:           sanitizeStr(ciudad, 100),
    telefono:         sanitizeStr(telefono, 30),
    horario:          sanitizeStr(horario, 100),
    email_contacto:   email_contacto ? sanitizeStr(email_contacto, 254) : null,
    color_primario:   isValidColor(color_primario)   ? color_primario   : "#18181B",
    color_secundario: isValidColor(color_secundario) ? color_secundario : "#2563EB",
    rubro,
    propiedades: rubro === "inmobiliaria" ? sanitizeStringArray(propiedades) : [],
    vehiculos:   rubro === "concesionaria" ? sanitizeStringArray(vehiculos)  : [],
    financiacion_disponible: rubro === "concesionaria" ? toBoolStrict(financiacion_disponible, false) : false,
  }).eq("token", req.params.token);

  if (error) {
    console.error("Error actualizando cliente:", error.message);
    return res.status(500).json({ error: "Error al procesar la solicitud" });
  }
  res.json({ ok: true });
});

adminRouter.delete("/api/clientes/:token", requireAdmin, async (req, res) => {
  const { error } = await supabase.from("clientes").delete().eq("token", req.params.token);
  if (error) {
    console.error("Error eliminando cliente:", error.message);
    return res.status(500).json({ error: "Error al procesar la solicitud" });
  }
  res.json({ ok: true });
});
