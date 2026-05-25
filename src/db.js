const sessions = new Map();
const leads = [];

export const db = {
  getSession(sessionId) {
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        messages: [],
        leadData: { nombre: null, telefono: null, email: null },
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

  updateLead(sessionId, data, token = "DEMO-TOKEN-001") {
    const session = this.getSession(sessionId);
    session.leadData = { ...session.leadData, ...data };

    if (session.leadData.nombre && session.leadData.telefono) {
      const existing = leads.find((l) => l.sessionId === sessionId);
      if (existing) {
        Object.assign(existing, session.leadData, { updatedAt: new Date() });
      } else {
        leads.push({
          id: leads.length + 1,
          sessionId,
          token,                      // qué cliente generó este lead
          ...session.leadData,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(`📋 Nuevo lead [${token}]: ${session.leadData.nombre} - ${session.leadData.telefono}`);
      }
    }
  },

  getAllLeads(token = null) {
    const all = leads.sort((a, b) => b.createdAt - a.createdAt);
    // Si se pasa un token, filtra solo los leads de ese cliente
    return token ? all.filter((l) => l.token === token) : all;
  },
};
