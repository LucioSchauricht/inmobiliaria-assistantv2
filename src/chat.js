```javascript
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db.js";
import { buildSystemPrompt } from "./prompt.js";
import { getCliente } from "./clientes.js";

const client = new Anthropic();
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const sessionLeadCaptured = new Map();

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

function sanitizeField(val, max) {
  return String(val ?? "").replace(/[\r\n\t]/g, " ").trim().slice(0, max);
}

function normalizeLeadData(raw) {
  const lower = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k.toLowerCase().trim(), v])
  );
  const { vehiculo, permuta, financiacion, nombre, telefono, email, resumen, horario, ...rest } = lower;
  const data = {};
  if (nombre) data.nombre = sanitizeField(nombre, 80);
  if (telefono) {
    const cleaned = String(telefono).replace(/[^\d+\-\s]/g, "").trim();
    if (cleaned.replace(/\D/g, "").length >= 7) data.telefono = cleaned.slice(0, 30);
  }
  if (email) {
    const e = sanitizeField(email, 254);
    if (EMAIL_RE.test(e)) data.email = e;
  }
  if (horario) data.horario = sanitizeField(horario, 100);
  if (resumen) data.resumen = sanitizeField(resumen, 500);
  if (vehiculo !== undefined) data.vehiculo_interes = sanitizeField(vehiculo, 120);
  if (permuta !== undefined) data.permuta = toBool(permuta);
  if (financiacion !== undefined) data.financiacion_solicitada = toBool(financiacion);
  return Object.keys(data).length ? data : null;
}

export async function chatHandler(req, res) {
  const { sessionId, message, token } = req.body;
  if (typeof sessionId !== "string" || !sessionId || sessionId.length > 100)
    return res.status(400).json({ error: "sessionId inválido" });
  if (typeof message !== "string" || !message)
    return res.status(400).json({ error: "message es requerido" });
  if (message.length > 1000) return res.status(400).json({ error: "Mensaje demasiado largo" });

  const clienteToken = typeof token === "string" ? token.trim() : "DEMO-TOKEN-001";

  if (!db.validateSession(sessionId, clienteToken)) {
    return res.status(403).json({ error: "Sesión no válida para este token" });
  }

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
    const alreadyCaptured = sessionLeadCaptured.get(sessionId) || false;
    const leadData = rawLead && !alreadyCaptured ? normalizeLeadData(rawLead) : null;

    if (leadData) {
      await db.updateLead(sessionId, leadData, clienteToken, {
        nombre: cliente.nombre,
        email_contacto: cliente.email_contacto,
        rubro: cliente.rubro || "inmobiliaria",
      });
      sessionLeadCaptured.set(sessionId, true);
    }

    const cleanText = cleanMessage(rawText);
    db.addMessage(sessionId, "assistant", cleanText);
    res.json({ message: cleanText, leadCaptured: !!leadData, leadData: leadData || null });
  } catch (error) {
    console.error("Error en chatHandler:", error.message, error.status);
    const status = error?.status;
    if (status === 429 || status === 529) {
      return res.status(503).json({ error: "Servicio ocupado, intentá en unos segundos" });
    }
    res.status(500).json({ error: "Error procesando el mensaje" });
  }
}
```
