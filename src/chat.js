import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db.js";
import { buildSystemPrompt } from "./prompt.js";
import { getCliente } from "./clientes.js";

const client = new Anthropic();

// resumen siempre es el último campo del bracket — parsearlo aparte evita que
// comas dentro del texto partan mal los otros campos.
function extractLeadData(text) {
  const match = text.match(/\[LEAD:([^\]]+)\]/);
  if (!match) return null;
  const body = match[1];
  const data = {};
  const resumenMatch = body.match(/(?:^|,)\s*resumen=(.+)$/);
  let head = body;
  if (resumenMatch) {
    data.resumen = resumenMatch[1].trim();
    head = body.slice(0, resumenMatch.index);
  }
  head.split(",").forEach((pair) => {
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) {
      const k = pair.slice(0, eqIdx).trim();
      const v = pair.slice(eqIdx + 1).trim();
      if (k) data[k] = v;
    }
  });
  return Object.keys(data).length ? data : null;
}

function cleanMessage(text) {
  return text.replace(/\[LEAD:[^\]]+\]/g, "").trim();
}

function toBool(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  if (["si", "sí", "yes", "true", "1"].includes(s)) return true;
  if (["no", "false", "0"].includes(s)) return false;
  return null;
}

function normalizeLeadData(raw) {
  // Normalizar keys a minúsculas por si el modelo capitaliza alguna
  const lower = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k.toLowerCase().trim(), v])
  );
  const { vehiculo, permuta, financiacion, nombre, telefono, ...rest } = lower;
  const data = { ...rest };
  if (nombre) data.nombre = String(nombre).trim().slice(0, 80);
  if (telefono) {
    const cleaned = String(telefono).replace(/[^\d+\-\s]/g, "").trim();
    if (cleaned.replace(/\D/g, "").length >= 7) data.telefono = cleaned.slice(0, 30);
  }
  if (vehiculo !== undefined) data.vehiculo_interes = String(vehiculo).trim().slice(0, 120);
  if (permuta !== undefined) data.permuta = toBool(permuta);
  if (financiacion !== undefined) data.financiacion_solicitada = toBool(financiacion);
  return data;
}

export async function chatHandler(req, res) {
  const { sessionId, message, token } = req.body;
  if (typeof sessionId !== "string" || !sessionId || sessionId.length > 100)
    return res.status(400).json({ error: "sessionId inválido" });
  if (typeof message !== "string" || !message)
    return res.status(400).json({ error: "message es requerido" });
  if (message.length > 1000) return res.status(400).json({ error: "Mensaje demasiado largo" });

  const clienteToken = token || "DEMO-TOKEN-001";
  const cliente = await getCliente(clienteToken);
  if (!cliente) return res.status(404).json({ error: "Token no encontrado" });

  try {
    db.addMessage(sessionId, "user", message);
    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
      max_tokens: 500,
      system: [{ type: "text", text: buildSystemPrompt(cliente), cache_control: { type: "ephemeral" } }],
      messages: db.getMessages(sessionId),
    });
    const rawText = response.content[0]?.text || "";
    const rawLead = extractLeadData(rawText);
    const leadData = rawLead ? normalizeLeadData(rawLead) : null;
    if (leadData) {
      await db.updateLead(sessionId, leadData, clienteToken, {
        nombre: cliente.nombre,
        email_contacto: cliente.email_contacto,
        rubro: cliente.rubro || "inmobiliaria",
      });
    }
    const cleanText = cleanMessage(rawText);
    db.addMessage(sessionId, "assistant", cleanText);
    res.json({ message: cleanText, leadCaptured: !!leadData, leadData: leadData || null });
  } catch (error) {
    console.error("Error en chatHandler:", error);
    const status = error?.status;
    if (status === 429 || status === 529) {
      return res.status(503).json({ error: "Servicio ocupado, intentá en unos segundos" });
    }
    res.status(500).json({ error: "Error procesando el mensaje" });
  }
}
