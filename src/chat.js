// src/chat.js
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db.js";
import { buildSystemPrompt } from "./prompt.js";
import { getCliente } from "./clientes.js";

const client = new Anthropic();

function extractLeadData(text) {
  const match = text.match(/\[LEAD:([^\]]+)\]/);
  if (!match) return null;
  const data = {};
  match[1].split(/,(?=\w+=)/).forEach((pair) => {
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) data[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
  });
  return data;
}

function cleanMessage(text) {
  return text.replace(/\[LEAD:[^\]]+\]/g, "").trim();
}

/** Convierte "si"/"no" (y variantes) a boolean. Devuelve null si es ambiguo. */
function toBool(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  if (["si", "sí", "yes", "true", "1"].includes(s)) return true;
  if (["no", "false", "0"].includes(s)) return false;
  return null;
}

/**
 * Normaliza los campos crudos del tag [LEAD:...] al esquema de la tabla leads.
 * - vehiculo      -> vehiculo_interes (text)
 * - permuta       -> permuta (boolean)
 * - financiacion  -> financiacion_solicitada (boolean)
 * Los campos de inmobiliaria (nombre, telefono, horario, resumen, email) pasan tal cual,
 * por lo que es 100% backward compatible.
 */
function normalizeLeadData(raw) {
  const { vehiculo, permuta, financiacion, ...rest } = raw;
  const data = { ...rest };
  if (vehiculo !== undefined) data.vehiculo_interes = vehiculo;
  if (permuta !== undefined) data.permuta = toBool(permuta);
  if (financiacion !== undefined) data.financiacion_solicitada = toBool(financiacion);
  return data;
}

export async function chatHandler(req, res) {
  const { sessionId, message, token } = req.body;
  if (!sessionId || !message) return res.status(400).json({ error: "sessionId y message son requeridos" });
  if (message.length > 1000) return res.status(400).json({ error: "Mensaje demasiado largo" });

  const clienteToken = token || "DEMO-TOKEN-001";
  const cliente = await getCliente(clienteToken);
  if (!cliente) return res.status(404).json({ error: "Token no encontrado" });

  try {
    db.addMessage(sessionId, "user", message);
    const response = await client.messages.create({
      model: "claude-sonnet-4-5", // NO CAMBIAR — debe quedar claude-sonnet-4-5 siempre
      max_tokens: 500,
      // buildSystemPrompt elige el prompt según cliente.rubro
      // (inmobiliaria por defecto, concesionaria si rubro === "concesionaria")
      system: buildSystemPrompt(cliente),
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
    console.error("Error en chatHandler:", error.message);
    res.status(500).json({ error: "Error procesando el mensaje" });
  }
}
