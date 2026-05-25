// Widget del asistente IA — se embebe en cualquier página con:
// <script src="https://tu-servidor.com/widget.js?token=TOKEN-CLIENTE-A"></script>

(function () {
  // Leer token desde el script tag
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

  // ─── Estilos ────────────────────────────────────────────────────────────────
  const styles = `
    #ai-widget-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      width: 56px; height: 56px; border-radius: 50%;
      background: #2563eb; color: white; border: none;
      cursor: pointer; box-shadow: 0 4px 16px rgba(37,99,235,0.4);
      font-size: 24px; display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #ai-widget-btn:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(37,99,235,0.5); }

    #ai-widget-box {
      position: fixed; bottom: 90px; right: 24px; z-index: 9998;
      width: 340px; height: 480px; border-radius: 16px;
      background: white; box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      display: flex; flex-direction: column; overflow: hidden;
      transform: scale(0.95) translateY(10px); opacity: 0;
      transition: all 0.25s ease; pointer-events: none;
    }
    #ai-widget-box.open { transform: scale(1) translateY(0); opacity: 1; pointer-events: all; }

    #ai-widget-header {
      background: #2563eb; color: white;
      padding: 14px 16px; font-family: sans-serif;
      display: flex; align-items: center; gap: 10px;
    }
    #ai-widget-header .avatar {
      width: 32px; height: 32px; border-radius: 50%;
      background: rgba(255,255,255,0.25);
      display: flex; align-items: center; justify-content: center; font-size: 16px;
    }
    #ai-widget-header .info { flex: 1; }
    #ai-widget-header .name { font-weight: 600; font-size: 14px; }
    #ai-widget-header .status { font-size: 11px; opacity: 0.85; }
    #ai-widget-header .close-btn {
      background: none; border: none; color: white;
      cursor: pointer; font-size: 18px; opacity: 0.8; padding: 0;
    }

    #ai-widget-messages {
      flex: 1; overflow-y: auto; padding: 14px;
      display: flex; flex-direction: column; gap: 10px;
      font-family: sans-serif; font-size: 13px;
    }
    .ai-msg { display: flex; gap: 8px; align-items: flex-end; }
    .ai-msg.user { flex-direction: row-reverse; }
    .ai-bubble {
      max-width: 80%; padding: 9px 13px; border-radius: 16px;
      line-height: 1.45; word-break: break-word;
    }
    .ai-msg.bot .ai-bubble { background: #f1f5f9; color: #1e293b; border-bottom-left-radius: 4px; }
    .ai-msg.user .ai-bubble { background: #2563eb; color: white; border-bottom-right-radius: 4px; }
    .ai-typing { display: flex; gap: 4px; align-items: center; padding: 10px 14px; }
    .ai-typing span {
      width: 7px; height: 7px; border-radius: 50%; background: #94a3b8;
      animation: bounce 1.2s infinite;
    }
    .ai-typing span:nth-child(2) { animation-delay: 0.2s; }
    .ai-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }

    #ai-widget-input {
      display: flex; gap: 8px; padding: 10px 12px;
      border-top: 1px solid #e2e8f0;
    }
    #ai-widget-input input {
      flex: 1; border: 1px solid #e2e8f0; border-radius: 20px;
      padding: 8px 14px; font-size: 13px; outline: none; font-family: sans-serif;
    }
    #ai-widget-input input:focus { border-color: #2563eb; }
    #ai-widget-input button {
      width: 36px; height: 36px; border-radius: 50%;
      background: #2563eb; color: white; border: none;
      cursor: pointer; font-size: 16px; display: flex;
      align-items: center; justify-content: center; flex-shrink: 0;
    }
    #ai-widget-input button:disabled { background: #94a3b8; cursor: default; }
  `;

  // ─── HTML ────────────────────────────────────────────────────────────────────
  const html = `
    <div id="ai-widget-btn">💬</div>
    <div id="ai-widget-box">
      <div id="ai-widget-header">
        <div class="avatar">🏠</div>
        <div class="info">
          <div class="name">Asistente Virtual</div>
          <div class="status">● En línea</div>
        </div>
        <button class="close-btn">✕</button>
      </div>
      <div id="ai-widget-messages"></div>
      <div id="ai-widget-input">
        <input type="text" placeholder="Escribí tu consulta..." />
        <button id="ai-send-btn">➤</button>
      </div>
    </div>
  `;

  // ─── Montar en el DOM ────────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.appendChild(style);

  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);

  const btn = document.getElementById("ai-widget-btn");
  const box = document.getElementById("ai-widget-box");
  const messages = document.getElementById("ai-widget-messages");
  const input = document.querySelector("#ai-widget-input input");
  const sendBtn = document.getElementById("ai-send-btn");
  const closeBtn = document.querySelector(".close-btn");

  // ─── Funciones ───────────────────────────────────────────────────────────────
  async function initSession() {
    const res = await fetch(`${SERVER_URL}/session`, { method: "POST" });
    const data = await res.json();
    sessionId = data.sessionId;
  }

  function addMessage(text, role) {
    const div = document.createElement("div");
    div.className = `ai-msg ${role}`;
    div.innerHTML = `<div class="ai-bubble">${text}</div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping() {
    const div = document.createElement("div");
    div.className = "ai-msg bot";
    div.id = "ai-typing";
    div.innerHTML = `<div class="ai-bubble ai-typing"><span></span><span></span><span></span></div>`;
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
    btn.textContent = "✕";
    if (messages.children.length === 0) {
      addMessage("¡Hola! 👋 ¿En qué te puedo ayudar hoy?", "bot");
    }
    input.focus();
  }

  function closeChat() {
    isOpen = false;
    box.classList.remove("open");
    btn.textContent = "💬";
  }

  // ─── Eventos ─────────────────────────────────────────────────────────────────
  btn.addEventListener("click", () => (isOpen ? closeChat() : openChat()));
  closeBtn.addEventListener("click", closeChat);
  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
})();
