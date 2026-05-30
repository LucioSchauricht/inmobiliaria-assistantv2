import { createClient } from "@supabase/supabase-js";
import { sendLeadNotification } from "./email.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const sessions = new Map();

export const db = {
  getSession(sessionId) {
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        messages: [],
        leadData: { nombre: null, telefono: null, email: null, horario: null, resumen: null, emailSent: false },
        createdAt: new Date(),
      });
    }
    return sessions.get(sessionId);
  },

  addMessage(sessionId, role, content) {
    const session = this.getSession(sessionId);
    session.messages.push({ role, content });
  },

  getMessages(sessionId) {
    return this.getSession(sessionId).messages;
  },

  async updateLead(sessionId, data, token = "DEMO-TOKEN-001", clienteInfo = null) {
    const session = this.getSession(sessionId);
    session.leadData = { ...session.leadData, ...data };

    const { nombre, telefono, email, horario, resumen, emailSent } = session.leadData;
    if (!nombre || !telefono) return;

    const { error } = await supabase.from("leads").upsert(
      {
        session_id: sessionId,
        token,
        nombre,
        telefono,
        email: email || null,
        horario: horario || null,
        resumen: resumen || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" }
    );

    if (error) {
      console.error("❌ Error guardando lead en Supabase:", error.message);
      return;
    }

    console.log(`📋 Lead guardado [${token}]: ${nombre} - ${telefono}`);

    if (!emailSent && clienteInfo?.email_contacto) {
      session.leadData.emailSent = true;
      await sendLeadNotification({
        clienteNombre: clienteInfo.nombre,
        clienteEmail: clienteInfo.email_contacto,
        lead: { nombre, telefono, horario, resumen },
      });
    }
  },

  async getAllLeads(token = null) {
    let query = supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (token) query = query.eq("token", token);

    const { data, error } = await query;

    if (error) {
      console.error("❌ Error leyendo leads de Supabase:", error.message);
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },
};
