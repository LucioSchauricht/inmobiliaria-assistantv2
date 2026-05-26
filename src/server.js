import "dotenv/config";
import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { chatHandler } from "./chat.js";
import { leadsRouter } from "./leads.js";
import { getCliente } from "./clientes.js";
import { adminRouter } from "./admin.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "Asistente IA Inmobiliaria" });
});

// Servir el widget.js (con el origen correcto del servidor)
app.get("/widget.js", (req, res) => {
  const code = readFileSync(join(__dirname, "widget.js"), "utf8");
  res.setHeader("Content-Type", "application/javascript");
  res.send(code);
});

// Página de prueba para ver el widget en el navegador
app.get("/demo", (req, res) => {
  const token = req.query.token || "DEMO-TOKEN-001";
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Demo — Asistente IA</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #FAFAFA; color: #09090B; min-height: 100vh;
      display: flex; align-items: center; justify-content: center; padding: 40px 24px;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      background: #fff; border: 1px solid #E4E4E7; border-radius: 12px;
      padding: 40px; max-width: 480px; width: 100%;
    }
    .mark {
      width: 36px; height: 36px; border-radius: 8px; background: #18181B;
      display: flex; align-items: center; justify-content: center; margin-bottom: 20px;
    }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 8px; }
    p { color: #71717A; font-size: .9rem; line-height: 1.6; margin-bottom: 6px; }
    .token-row {
      display: flex; align-items: center; gap: 10px;
      background: #FAFAFA; border: 1px solid #E4E4E7; border-radius: 7px;
      padding: 10px 14px; margin-top: 20px;
    }
    .token-label { font-size: .72rem; font-weight: 600; color: #A1A1AA; text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; }
    .token-value { font-family: monospace; font-size: .875rem; color: #3F3F46; }
    .hint { margin-top: 20px; font-size: .8125rem; color: #A1A1AA; }
  </style>
</head>
<body>
  <div class="card">
    <div class="mark">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </div>
    <h1>Página de demo</h1>
    <p>Esta es una página de prueba del widget de chat para inmobiliarias.</p>
    <div class="token-row">
      <span class="token-label">Token</span>
      <span class="token-value">${token}</span>
    </div>
    <p class="hint">El widget aparece en la esquina inferior derecha.</p>
  </div>
  <script src="/widget.js?token=${token}"></script>
</body>
</html>`);
});

// Dashboard
app.get("/dashboard", (req, res) => {
  res.sendFile(join(__dirname, "dashboard.html"));
});

// Info de cliente por token (para el dashboard de leads)
app.get("/cliente", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "token requerido" });
  const cliente = await getCliente(token);
  if (!cliente) return res.status(404).json({ error: "token inválido" });
  res.json({ nombre: cliente.nombre, ciudad: cliente.ciudad });
});

// Admin
app.use("/admin", adminRouter);

// Chat
app.post("/chat", chatHandler);

// Leads
app.use("/leads", leadsRouter);

// Nueva sesión
app.post("/session", (req, res) => {
  res.json({ sessionId: uuidv4() });
});

app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🎯 Demo widget: http://localhost:${PORT}/demo`);
  console.log(`🎯 Demo cliente A: http://localhost:${PORT}/demo?token=TOKEN-CLIENTE-A`);
});
