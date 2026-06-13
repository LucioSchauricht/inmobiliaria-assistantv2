import { sendLeadNotification } from "./email.js";
import { supabase } from "./supabase.js";

/**
 * Almacenamiento en memoria de sesiones activas.
 * ⚠️  LIMITACIÓN: los datos se pierden al reiniciar el proceso.
 *    Para producción con múltiples instancias o reinicio frecuente,
 *    migrar a Redis o una tabla "sesiones" en Supabase.
 * @type {Map<string, {messages: Array, leadData: Object, createdAt: Date}>}
 */
const sessions = new Map();

// Limpiar sesiones antiguas cada hora (evitar memory leak en procesos de larga duración)
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2 horas
  let removed = 0;
  for (const [id, session] of sessions) {
    if (session.createdAt.getTime() < cutoff) {
      sessions.delete(id);
      removed++;
    }
  }
  if (removed > 0) console.log(`[SESSION GC] ${removed} sesiones expiradas eliminadas de memoria`);
}, 60 * 60 * 1000);

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
    supabase.from("conversaciones")
      .insert({ session_id: sessionId, role, content })
      .then(({ error }) => { if (error) console.error("❌ Error guardando mensaje:", error.message); });
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

    console.log(`📋 Lead guardado [${token}]`);

    if (!emailSent && clienteInfo?.email_contacto) {
      session.leadData.emailSent = true;
      await sendLeadNotification({
        clienteNombre: clienteInfo.nombre,
        clienteEmail: clienteInfo.email_contacto,
        lead: { nombre, telefono, horario, resumen },
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
      contactado: row.contactado,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },
};
