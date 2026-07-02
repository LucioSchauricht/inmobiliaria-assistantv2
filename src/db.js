// src/db.js — sesiones en memoria + Supabase
// Cambios v1.2: campos de lead para concesionarias (vehiculo_interes, permuta,
// financiacion_solicitada). Backward compatible: para inmobiliarias esos campos
// simplemente quedan en null.
import { sendLeadNotification } from "./email.js";
import { supabase } from "./supabase.js";

const sessions = new Map();

// Limpieza cada hora
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (session.createdAt.getTime() < cutoff) sessions.delete(id);
  }
}, 60 * 60 * 1000);

export const db = {
  getSession(sessionId) {
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        messages: [],
        leadData: {
          nombre: null,
          telefono: null,
          email: null,
          horario: null,
          resumen: null,
          // Campos de concesionaria (null para inmobiliarias)
          vehiculo_interes: null,
          permuta: null,
          financiacion_solicitada: null,
          emailSent: false,
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
    // Merge sin pisar datos previos con null/undefined (el modelo puede omitir
    // campos ya capturados en turnos anteriores).
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined && value !== "") {
        session.leadData[key] = value;
      }
    }

    const {
      nombre,
      telefono,
      email,
      horario,
      resumen,
      vehiculo_interes,
      permuta,
      financiacion_solicitada,
      emailSent,
    } = session.leadData;

    if (!nombre || !telefono) return;

    await supabase.from("leads").upsert(
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

    if (!emailSent && clienteInfo?.email_contacto) {
      session.leadData.emailSent = true;
      await sendLeadNotification({
        clienteNombre: clienteInfo.nombre,
        clienteEmail: clienteInfo.email_contacto,
        rubro: clienteInfo.rubro || "inmobiliaria",
        lead: {
          nombre,
          telefono,
          horario,
          resumen,
          // Extras de concesionaria: el template de email puede ignorarlos
          // (inmobiliaria) o renderizarlos (concesionaria).
          vehiculo_interes,
          permuta,
          financiacion_solicitada,
        },
      });
    }
  },

  async getAllLeads(token) {
    if (!token) return [];
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("token", token)
      .order("created_at", { ascending: false });
    if (error) return [];
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
