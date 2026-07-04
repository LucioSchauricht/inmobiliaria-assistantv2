import { sendLeadNotification } from "./email.js";
import { supabase } from "./supabase.js";

const sessions = new Map();
const sessionTokenMap = new Map(); // sessionId → token (binding)
const MAX_SESSIONS = 10_000;

// Campos de concesionaria que disparan re-notificación cuando aparecen después del primer email
const CONC_FIELDS = ["vehiculo_interes", "permuta", "financiacion_solicitada"];

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (session.createdAt.getTime() < cutoff) {
      sessions.delete(id);
      sessionTokenMap.delete(id);
    }
  }
}, 60 * 60 * 1000);

export const db = {
  // Vincula un sessionId al token que lo creó (llamado desde POST /session)
  bindSession(sessionId, token) {
    sessionTokenMap.set(sessionId, token);
  },

  // Valida que el sessionId pertenece al token. Si no hay binding, permite (compatibilidad).
  validateSession(sessionId, token) {
    const bound = sessionTokenMap.get(sessionId);
    if (!bound) return true;
    return bound === token;
  },

  getSession(sessionId) {
    if (!sessions.has(sessionId)) {
      // Evitar memory exhaustion: eliminar la sesión más antigua si se supera el límite
      if (sessions.size >= MAX_SESSIONS) {
        const oldest = sessions.keys().next().value;
        sessions.delete(oldest);
        sessionTokenMap.delete(oldest);
      }
      sessions.set(sessionId, {
        messages: [],
        leadData: {
          nombre: null,
          telefono: null,
          email: null,
          horario: null,
          resumen: null,
          vehiculo_interes: null,
          permuta: null,
          financiacion_solicitada: null,
          notifiedFields: new Set(),
        },
        createdAt: new Date(),
      });
    }
    return sessions.get(sessionId);
  },

  addMessage(sessionId, role, content) {
    const session = this.getSession(sessionId);
    session.messages.push({ role, content });
    supabase
      .from("conversaciones")
      .insert({ session_id: sessionId, role, content })
      .then(({ error }) => {
        if (error) console.error("Error guardando mensaje:", error.message);
      });
  },

  getMessages(sessionId) {
    return this.getSession(sessionId).messages;
  },

  async updateLead(sessionId, data, token = "DEMO-TOKEN-001", clienteInfo = null) {
    const session = this.getSession(sessionId);

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined || value === "") continue;
      if (key === "resumen") {
        const existing = session.leadData.resumen;
        if (!existing || String(value).length > String(existing).length) {
          session.leadData.resumen = value;
        }
        continue;
      }
      session.leadData[key] = value;
    }

    const {
      nombre, telefono, email, horario, resumen,
      vehiculo_interes, permuta, financiacion_solicitada,
      notifiedFields,
    } = session.leadData;

    if (!nombre || !telefono) return;

    const { error: upsertError } = await supabase.from("leads").upsert(
      {
        session_id: sessionId,
        token,
        nombre,
        telefono,
        email: email || null,
        horario: horario || null,
        resumen: resumen || null,
        vehiculo_interes: vehiculo_interes || null,
        permuta: typeof permuta === "boolean" ? permuta : null,
        financiacion_solicitada:
          typeof financiacion_solicitada === "boolean" ? financiacion_solicitada : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" }
    );
    if (upsertError) console.error("Error guardando lead:", upsertError.message);

    if (clienteInfo?.email_contacto) {
      const isInitial = notifiedFields.size === 0;
      const newConcFields = CONC_FIELDS.filter(
        (k) => session.leadData[k] != null && !notifiedFields.has(k)
      );

      if (isInitial || newConcFields.length > 0) {
        if (isInitial) notifiedFields.add("_initial");
        newConcFields.forEach((k) => notifiedFields.add(k));

        await sendLeadNotification({
          clienteNombre: clienteInfo.nombre,
          clienteEmail: clienteInfo.email_contacto,
          rubro: clienteInfo.rubro || "inmobiliaria",
          lead: { nombre, telefono, horario, resumen, vehiculo_interes, permuta, financiacion_solicitada },
        });
      }
    }
  },

  async getAllLeads(token) {
    if (!token) return [];
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("token", token)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error obteniendo leads:", error.message);
      return [];
    }
    return data.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      token: row.token,
      nombre: row.nombre,
      telefono: row.telefono,
      email: row.email,
      horario: row.horario,
      resumen: row.resumen,
      vehiculoInteres: row.vehiculo_interes ?? null,
      permuta: row.permuta ?? null,
      financiacionSolicitada: row.financiacion_solicitada ?? null,
      contactado: row.contactado,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },
};
