// Widget del asistente IA — se embebe en cualquier página con:
// <script src="https://tu-servidor.com/widget.js?token=TOKEN-CLIENTE-A"></script>

(function () {
  const scriptTag = document.currentScript;
  const token = scriptTag?.src
    ? new URL(scriptTag.src).searchParams.get("token") || "DEMO-TOKEN-001"
    : "DEMO-TOKEN-001";

  const SERVER_URL = scriptTag?.src
    ? new URL(scriptTag.src).origin
    : "http://localhost:3000";

  let sessionId = null;
  let isOpen = false;
  let isTyping = false;

  // ─── Íconos SVG ──────────────────────────────────────────────────────────────
  const ICON_CHAT = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  const ICON_CLOSE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const ICON_SEND = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none"/></svg>`;
  const ICON_HOME = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;

  // ─── Estilos ──────────────────────────────────────────────────────────────────
  const styles = `
    #ai-widget-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      width: 52px; height: 52px; border-radius: 50%;
      background: var(--wc-primary); color: #fff; border: none; cursor: pointer;
      box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.1);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    #ai-widget-btn:hover {
      transform: scale(1.06);
      box-shadow: 0 4px 18px rgba(0,0,0,0.24);
    }

    #ai-widget-box {
      position: fixed; bottom: 88px; right: 24px; z-index: 9998;
      width: 352px; height: 504px; border-radius: 12px;
      background: #fff;
      border: 1px solid #E4E4E7;
      box-shadow: 0 8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06);
      display: flex; flex-direction: column; overflow: hidden;
      transform: scale(0.97) translateY(8px); opacity: 0;
      transition: transform 0.22s cubic-bezier(0.16,1,0.3,1), opacity 0.22s ease;
      pointer-events: none;
    }
    #ai-widget-box.open {
      transform: scale(1) translateY(0); opacity: 1; pointer-events: all;
    }

    #ai-widget-header {
      background: #fff; border-bottom: 1px solid #E4E4E7;
      padding: 13px 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; align-items: center; gap: 10px;
      flex-shrink: 0;
    }
    .ai-avatar {
      width: 30px; height: 30px; border-radius: 7px;
      background: var(--wc-primary);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .ai-info { flex: 1; min-width: 0; }
    .ai-name { font-weight: 600; font-size: 13.5px; color: #09090B; }
    .ai-status {
      display: flex; align-items: center; gap: 5px;
      font-size: 11.5px; color: #71717A; margin-top: 1px;
    }
    .ai-dot { width: 6px; height: 6px; border-radius: 50%; background: #16A34A; flex-shrink: 0; }
    .ai-close-btn {
      background: none; border: none; color: #A1A1AA; cursor: pointer;
      padding: 5px; border-radius: 6px; display: flex; align-items: center;
      transition: background 0.12s, color 0.12s; flex-shrink: 0;
    }
    .ai-close-btn:hover { background: #F4F4F5; color: #09090B; }

    #ai-widget-messages {
      flex: 1; overflow-y: auto; padding: 14px;
      display: flex; flex-direction: column; gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13.5px; line-height: 1.5;
      scrollbar-width: thin; scrollbar-color: #E4E4E7 transparent;
    }
    #ai-widget-messages::-webkit-scrollbar { width: 4px; }
    #ai-widget-messages::-webkit-scrollbar-thumb { background: #E4E4E7; border-radius: 4px; }

    .ai-msg { display: flex; }
    .ai-msg.user { justify-content: flex-end; }
    .ai-bubble {
      max-width: 80%; padding: 9px 13px; border-radius: 14px;
      word-break: break-word; line-height: 1.5;
    }
    .ai-msg.bot .ai-bubble {
      background: #F4F4F5; color: #09090B; border-bottom-left-radius: 4px;
    }
    .ai-msg.user .ai-bubble {
      background: var(--wc-primary); color: #fff; border-bottom-right-radius: 4px;
    }

    .ai-typing-bubble {
      background: #F4F4F5; border-radius: 14px; border-bottom-left-radius: 4px;
      padding: 12px 14px; display: flex; gap: 4px; align-items: center;
    }
    .ai-typing-dot {
      width: 5px; height: 5px; border-radius: 50%; background: #A1A1AA;
      animation: ai-pulse 1.3s ease infinite;
    }
    .ai-typing-dot:nth-child(2) { animation-delay: 0.18s; }
    .ai-typing-dot:nth-child(3) { animation-delay: 0.36s; }
    @keyframes ai-pulse {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
      30% { transform: translateY(-4px); opacity: 1; }
    }

    #ai-widget-input {
      display: flex; gap: 7px; padding: 10px 12px;
      border-top: 1px solid #E4E4E7; align-items: center;
      background: #fff; flex-shrink: 0;
    }
    #ai-widget-input input {
      flex: 1; border: 1px solid #E4E4E7; border-radius: 8px;
      padding: 8px 12px; font-size: 13.5px; outline: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #09090B; background: #FAFAFA;
      transition: border-color 0.15s, background 0.15s;
    }
    #ai-widget-input input::placeholder { color: #A1A1AA; }
    #ai-widget-input input:focus { border-color: var(--wc-primary); background: #fff; }
    #ai-send-btn {
      width: 34px; height: 34px; border-radius: 8px;
      background: var(--wc-accent); color: #fff; border: none;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: opacity 0.15s;
    }
    #ai-send-btn:hover { opacity: 0.82; }
    #ai-send-btn:disabled { background: #E4E4E7; cursor: default; opacity: 1; }

    .ai-lead-card {
      background: #fff; border-left: 3px solid #2563EB;
      border-radius: 10px; padding: 10px 13px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12.5px; max-width: 88%;
    }
    .ai-lead-card-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 8px;
    }
    .ai-lead-card-title {
      font-weight: 700; font-size: 13px; color: #09090B;
    }
    .ai-lead-card-time {
      font-size: 11px; color: #71717A;
    }
    .ai-lead-card-row {
      display: flex; gap: 6px; margin-bottom: 4px; line-height: 1.4;
    }
    .ai-lead-card-row:last-child { margin-bottom: 0; }
    .ai-lead-card-label {
      color: #71717A; font-weight: 500; flex-shrink: 0; min-width: 62px;
    }
    .ai-lead-card-value { color: #09090B; }

    @media (max-width: 420px) {
      #ai-widget-box { width: calc(100vw - 32px); right: 16px; }
      #ai-widget-btn { right: 16px; bottom: 16px; }
    }
  `;

  // ─── HTML ─────────────────────────────────────────────────────────────────────
  const html = `
    <div id="ai-widget-btn">${ICON_CHAT}</div>
    <div id="ai-widget-box">
      <div id="ai-widget-header">
        <div class="ai-avatar">${ICON_HOME}</div>
        <div class="ai-info">
          <div class="ai-name">Asistente Virtual</div>
          <div class="ai-status"><span class="ai-dot"></span>En línea</div>
        </div>
        <button class="ai-close-btn">${ICON_CLOSE}</button>
      </div>
      <div id="ai-widget-messages"></div>
      <div id="ai-widget-input">
        <input type="text" placeholder="Escribí tu consulta..." />
        <button id="ai-send-btn">${ICON_SEND}</button>
      </div>
    </div>
  `;

  // ─── Montar en el DOM ─────────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.appendChild(style);

  const container = document.createElement("div");
  container.style.cssText = "--wc-primary:#18181B;--wc-accent:#2563EB";
  container.innerHTML = html;
  document.body.appendChild(container);

  // Cargar colores del cliente y aplicarlos
  fetch(`${SERVER_URL}/cliente-config?token=${encodeURIComponent(token)}`)
    .then((r) => r.json())
    .then((cfg) => {
      container.style.setProperty("--wc-primary", cfg.color_primario);
      container.style.setProperty("--wc-accent",  cfg.color_secundario);
    })
    .catch(() => {});

  const btn      = document.getElementById("ai-widget-btn");
  const box      = document.getElementById("ai-widget-box");
  const messages = document.getElementById("ai-widget-messages");
  const input    = document.querySelector("#ai-widget-input input");
  const sendBtn  = document.getElementById("ai-send-btn");
  const closeBtn = document.querySelector(".ai-close-btn");

  // ─── Funciones ────────────────────────────────────────────────────────────────
  async function initSession() {
    const res = await fetch(`${SERVER_URL}/session`, { method: "POST" });
    const data = await res.json();
    sessionId = data.sessionId;
  }

  function addMessage(text, role) {
    const div = document.createElement("div");
    div.className = `ai-msg ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "ai-bubble";
    bubble.textContent = text;
    div.appendChild(bubble);
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function addLeadCard(lead) {
    const now = new Date();
    const time = now.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });

    const rows = [
      { label: "Nombre:", value: lead.nombre },
      { label: "Teléfono:", value: lead.telefono },
      { label: "Horario:", value: lead.horario || "No especificado" },
      { label: "Interés:", value: lead.resumen || "Consulta general" },
    ];

    const rowsHtml = rows
      .map(
        (r) =>
          `<div class="ai-lead-card-row">` +
          `<span class="ai-lead-card-label">${r.label}</span>` +
          `<span class="ai-lead-card-value">${r.value}</span>` +
          `</div>`
      )
      .join("");

    const card = document.createElement("div");
    card.className = "ai-msg bot";
    card.innerHTML =
      `<div class="ai-lead-card">` +
      `<div class="ai-lead-card-header">` +
      `<span class="ai-lead-card-title">✅ Lead capturado</span>` +
      `<span class="ai-lead-card-time">${time}</span>` +
      `</div>` +
      rowsHtml +
      `</div>`;

    messages.appendChild(card);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping() {
    const div = document.createElement("div");
    div.className = "ai-msg bot";
    div.id = "ai-typing";
    div.innerHTML = `<div class="ai-typing-bubble"><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span></div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() {
    document.getElementById("ai-typing")?.remove();
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isTyping) return;

    input.value = "";
    addMessage(text, "user");
    isTyping = true;
    sendBtn.disabled = true;
    showTyping();

    try {
      const res = await fetch(`${SERVER_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text, token }),
      });
      const data = await res.json();
      hideTyping();
      addMessage(data.message, "bot");
      if (data.leadCaptured && data.leadData) {
        addLeadCard(data.leadData);
      }
    } catch {
      hideTyping();
      addMessage("Hubo un error, intentá de nuevo.", "bot");
    }

    isTyping = false;
    sendBtn.disabled = false;
    input.focus();
  }

  async function openChat() {
    if (!sessionId) await initSession();
    isOpen = true;
    box.classList.add("open");
    btn.innerHTML = ICON_CLOSE;
    if (messages.children.length === 0) {
      addMessage("Hola, ¿en qué puedo ayudarte?", "bot");
    }
    input.focus();
  }

  function closeChat() {
    isOpen = false;
    box.classList.remove("open");
    btn.innerHTML = ICON_CHAT;
  }

  // ─── Eventos ──────────────────────────────────────────────────────────────────
  btn.addEventListener("click", () => (isOpen ? closeChat() : openChat()));
  closeBtn.addEventListener("click", closeChat);
  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
})();
