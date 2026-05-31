import { Router } from "express";
import { createHmac, randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const adminRouter = Router();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function makeSessionToken(pass) {
  return createHmac("sha256", "admin-session-v1").update(pass).digest("hex");
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

// ── HTML ────────────────────────────────────────────────────
adminRouter.get("/", (req, res) => {
  res.sendFile(join(__dirname, "admin.html"));
});

// ── Auth ────────────────────────────────────────────────────
adminRouter.post("/api/login", (req, res) => {
  const { password } = req.body;
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return res.status(500).json({ error: "ADMIN_PASSWORD no configurado" });
  if (password !== pass) return res.status(401).json({ error: "Contraseña incorrecta" });

  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `admin_tok=${makeSessionToken(pass)}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=86400${secure}`
  );
  res.json({ ok: true });
});

adminRouter.post("/api/logout", (req, res) => {
  res.setHeader("Set-Cookie", "admin_tok=; HttpOnly; Path=/admin; Max-Age=0");
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
  const { nombre, ciudad, telefono, horario, propiedades, email_contacto, color_primario, color_secundario } = req.body;
  if (!nombre || !ciudad || !telefono || !horario) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  const token = "TOKEN-" + randomUUID().split("-")[0].toUpperCase();
  const { error } = await supabase.from("clientes").insert({
    token,
    nombre,
    ciudad,
    telefono,
    horario,
    propiedades: Array.isArray(propiedades) ? propiedades.filter(Boolean) : [],
    email_contacto: email_contacto || null,
    color_primario:   color_primario   || "#18181B",
    color_secundario: color_secundario || "#2563EB",
  });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, token });
});

adminRouter.patch("/api/clientes/:token", requireAdmin, async (req, res) => {
  const { nombre, ciudad, telefono, horario, propiedades, email_contacto, color_primario, color_secundario } = req.body;
  if (!nombre || !ciudad || !telefono || !horario) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }
  const { error } = await supabase
    .from("clientes")
    .update({
      nombre,
      ciudad,
      telefono,
      horario,
      propiedades: Array.isArray(propiedades) ? propiedades.filter(Boolean) : [],
      email_contacto:   email_contacto   || null,
      color_primario:   color_primario   || "#18181B",
      color_secundario: color_secundario || "#2563EB",
    })
    .eq("token", req.params.token);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

adminRouter.delete("/api/clientes/:token", requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from("clientes")
    .delete()
    .eq("token", req.params.token);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});
