import { Router } from "express";
import { createHmac, randomUUID } from "crypto";

const CSS_COLOR_RE = /^#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?$/;
function isValidColor(c) {
  return typeof c === "string" && CSS_COLOR_RE.test(c);
}

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { supabase } from "./supabase.js";
import rateLimit from "express-rate-limit";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const adminRouter = Router();

const HMAC_SECRET = process.env.ADMIN_SECRET;
if (!HMAC_SECRET) {
  console.error("❌ FATAL: ADMIN_SECRET no está configurado.");
  process.exit(1);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos, esperá 15 minutos" },
});

function makeSessionToken(pass) {
  return createHmac("sha256", HMAC_SECRET).update(pass).digest("hex");
}

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || "").split(";").forEach((c) => {
    const [k, ...v] = c.trim().split("=");
    if (k) cookies[k.trim()] = decodeURIComponent(v.join("="));
  });
  return cookies;
}

function requireAdmin(req, res, next) {
  const { admin_tok } = parseCookies(req);
  const pass = process.env.ADMIN_PASSWORD;
  if (pass && admin_tok === makeSessionToken(pass)) return next();
  res.status(401).json({ error: "No autorizado" });
}

// ── Helpers multi-vertical ───────────────────────────────────
const RUBROS_VALIDOS = ["inmobiliaria", "concesionaria"];

function normalizeRubro(value) {
  const rubro = String(value || "inmobiliaria").toLowerCase().trim();
  return RUBROS_VALIDOS.includes(rubro) ? rubro : null;
}

function sanitizeStringArray(value) {
  if (value === undefined || value === null) return [];
  const arr = Array.isArray(value) ? value : String(value).split("\n");
  return arr.map((item) => String(item).trim()).filter((item) => item.length > 0).slice(0, 200);
}

function toBoolStrict(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "si" || value === "1" || value === 1) return true;
  if (value === "false" || value === "no" || value === "0" || value === 0) return false;
  return fallback;
}

// ── HTML ────────────────────────────────────────────────────
adminRouter.get("/", (req, res) => {
  res.sendFile(join(__dirname, "admin.html"));
});

// ── Auth ────────────────────────────────────────────────────
adminRouter.post("/api/login", loginLimiter, (req, res) => {
  const { password } = req.body;
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return res.status(500).json({ error: "ADMIN_PASSWORD no configurado" });
  if (password !== pass) return res.status(401).json({ error: "Contraseña incorrecta" });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `admin_tok=${makeSessionToken(pass)}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=86400${secure}`);
  res.json({ ok: true });
});

adminRouter.post("/api/logout", (req, res) => {
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `admin_tok=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0${secureFlag}`);
  res.json({ ok: true });
});

adminRouter.get("/api/check", (req, res) => {
  const { admin_tok } = parseCookies(req);
  const pass = process.env.ADMIN_PASSWORD;
  if (pass && admin_tok === makeSessionToken(pass)) return res.json({ ok: true });
  res.status(401).json({ error: "No autorizado" });
});

// ── Clientes API ─────────────────────────────────────────────
adminRouter.get("/api/clientes", requireAdmin, async (req, res) => {
  const [{ data: clientes, error: e1 }, { data: leads }] = await Promise.all([
    supabase.from("clientes").select("*").order("created_at", { ascending: false }),
    supabase.from("leads").select("token"),
  ]);
  if (e1) return res.status(500).json({ error: e1.message });
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

  const token = "TOKEN-" + randomUUID().split("-")[0].toUpperCase();
  const { error } = await supabase.from("clientes").insert({
    token, nombre, ciudad, telefono, horario,
    email_contacto: email_contacto || null,
    color_primario:   isValidColor(color_primario)   ? color_primario   : "#18181B",
    color_secundario: isValidColor(color_secundario) ? color_secundario : "#2563EB",
    rubro,
    propiedades: rubro === "inmobiliaria" ? sanitizeStringArray(propiedades) : [],
    vehiculos:   rubro === "concesionaria" ? sanitizeStringArray(vehiculos)  : [],
    financiacion_disponible: rubro === "concesionaria" ? toBoolStrict(financiacion_disponible, false) : false,
  });

  if (error) return res.status(500).json({ error: error.message });
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
    nombre, ciudad, telefono, horario,
    email_contacto:   email_contacto   || null,
    color_primario:   isValidColor(color_primario)   ? color_primario   : "#18181B",
    color_secundario: isValidColor(color_secundario) ? color_secundario : "#2563EB",
    rubro,
    propiedades: rubro === "inmobiliaria" ? sanitizeStringArray(propiedades) : [],
    vehiculos:   rubro === "concesionaria" ? sanitizeStringArray(vehiculos)  : [],
    financiacion_disponible: rubro === "concesionaria" ? toBoolStrict(financiacion_disponible, false) : false,
  }).eq("token", req.params.token);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

adminRouter.delete("/api/clientes/:token", requireAdmin, async (req, res) => {
  const { error } = await supabase.from("clientes").delete().eq("token", req.params.token);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});
