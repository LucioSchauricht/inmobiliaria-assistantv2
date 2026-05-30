import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { db } from "./db.js";

export const leadsRouter = Router();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

leadsRouter.get("/", async (req, res) => {
  const { token } = req.query;
  const leads = await db.getAllLeads(token || null);
  res.json({ total: leads.length, leads });
});

leadsRouter.patch("/:id/contactado", async (req, res) => {
  const { id } = req.params;
  const { token } = req.body;
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
    .update({ contactado: true })
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

leadsRouter.get("/conversacion", async (req, res) => {
  const { session_id, token } = req.query;
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

  if (error) return res.status(500).json({ error: error.message });
  res.json({ mensajes: mensajes || [] });
});
