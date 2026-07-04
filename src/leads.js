import { Router } from "express";
import { supabase } from "./supabase.js";
import { db } from "./db.js";

export const leadsRouter = Router();

function getToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.query.token || req.body?.token || null;
}

leadsRouter.get("/", async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(400).json({ error: "token es requerido" });
  const leads = await db.getAllLeads(token);
  res.json({ total: leads.length, leads });
});

leadsRouter.patch("/:id/contactado", async (req, res) => {
  const { id } = req.params;
  const token = getToken(req);
  const { contactado = true } = req.body;
  if (!token) return res.status(400).json({ error: "token es requerido" });

  const { data: lead, error: findError } = await supabase
    .from("leads")
    .select("id")
    .eq("id", id)
    .eq("token", token)
    .single();

  if (findError || !lead) return res.status(404).json({ error: "Lead no encontrado" });

  const { error } = await supabase
    .from("leads")
    .update({ contactado: Boolean(contactado) })
    .eq("id", id)
    .eq("token", token);

  if (error) {
    console.error("Error actualizando lead:", error.message);
    return res.status(500).json({ error: "Error al procesar la solicitud" });
  }
  res.json({ ok: true });
});

leadsRouter.get("/conversacion", async (req, res) => {
  const token = getToken(req);
  const { session_id } = req.query;
  if (!session_id || !token) {
    return res.status(400).json({ error: "session_id y token son requeridos" });
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("session_id")
    .eq("session_id", session_id)
    .eq("token", token)
    .single();

  if (leadError || !lead) {
    return res.status(404).json({ error: "Conversación no encontrada" });
  }

  const { data: mensajes, error } = await supabase
    .from("conversaciones")
    .select("role, content, created_at")
    .eq("session_id", session_id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error cargando conversación:", error.message);
    return res.status(500).json({ error: "Error al procesar la solicitud" });
  }
  res.json({ mensajes: mensajes || [] });
});
