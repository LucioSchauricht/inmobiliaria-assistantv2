import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db.js";
import { buildSystemPrompt } from "./prompt.js";
import { getCliente } from "./clientes.js";

const MOCK_MODE = !process.env.ANTHROPIC_API_KEY;
const client = MOCK_MODE ? null : new Anthropic();

if (MOCK_MODE) {
  console.log("⚠️  Modo simulado activo — sin API key. Las respuestas son ficticias.");
}

// Respuestas simuladas para probar el flujo sin API key
const MOCK_RESPONSES = [
  "¡Hola! Soy el asistente de {{NOMBRE}}. ¿En qué te puedo ayudar? Tenemos apartamentos y casas disponibles.",
  "Tenemos varias opciones disponibles. ¿Buscás algo para alquilar o comprar?",
  "Buena elección. Para darte más detalles y coordinar una visita, ¿me podés dejar tu nombre y número de teléfono?",
  "¡Perfecto! Un asesor te va a contactar a la brevedad. ¿Tenés alguna otra consulta?",
  "Claro, cualquier duda estoy acá. ¡Que tengas un buen día!",
];

let mockIndex = 0;

function getMockResponse(message, cliente) {
  const hasPhone = /\d{8,9}/.test(message);
  const hasName = /me llamo|soy |mi nombre/i.test(message);

  if (hasPhone || hasName) {
    const nombre = message.match(/(?:me llamo|soy )\s*(\w+)/i)?.[1] || "Usuario";
    const telefono = message.match(/\d{8,9}/)?.[0] || "099000000";
    return `¡Gracias! Un asesor de ${cliente.nombre} te va a contactar a la brevedad. [LEAD:nombre=${nombre},telefono=${telefono}]`;
  }

  const response = MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length]
    .replace("{{NOMBRE}}", cliente.nombre);
  mockIndex++;
  return response;
}

function extractLeadData(text) {
  const match = text.match(/\[LEAD:([^\]]+)\]/);
  if (!match) return null;

  const data = {};
  // Split only at commas immediately followed by a key= pattern,
  // so commas inside values (e.g. resumen) are preserved.
  match[1].split(/,(?=\w+=)/).forEach((pair) => {
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) {
      data[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
    }
  });
  return data;
}

function cleanMessage(text) {
  return text.replace(/\[LEAD:[^\]]+\]/g, "").trim();
}

export async function chatHandler(req, res) {
  const { sessionId, message, token } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: "sessionId y message son requeridos" });
  }
  if (message.length > 1000) {
    return res.status(400).json({ error: "Mensaje demasiado largo (máx. 1000 caracteres)" });
  }

  // Cargar configuración del cliente por token
  const clienteToken = token || "DEMO-TOKEN-001";
  const cliente = await getCliente(clienteToken);

  if (!cliente) {
    return res.status(404).json({ error: `Token de cliente no encontrado: ${clienteToken}` });
  }

  try {
    db.addMessage(sessionId, "user", message);

    let rawText;

    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 600));
      rawText = getMockResponse(message, cliente);
    } else {
      const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 500,
        system: buildSystemPrompt(cliente),
        messages: db.getMessages(sessionId),
      });
      console.log("Respuesta API:", JSON.stringify(response.content));
rawText = response.content[0]?.text || "Error al leer respuesta";
    }

    const leadData = extractLeadData(rawText);
    if (leadData) {
      await db.updateLead(sessionId, leadData, clienteToken, {
        nombre: cliente.nombre,
        email_contacto: cliente.email_contacto,
      });
    }

    const cleanText = cleanMessage(rawText);
    db.addMessage(sessionId, "assistant", cleanText);

    res.json({
      message: cleanText,
      leadCaptured: !!leadData,
      leadData: leadData || null,
      mock: MOCK_MODE,
    });
  } catch (error) {
    console.error("Error en chatHandler:", error.message);
    res.status(500).json({ error: "Error procesando el mensaje" });
  }
}
