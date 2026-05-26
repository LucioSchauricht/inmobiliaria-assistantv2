
import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { chatHandler } from "./chat.js";
import { leadsRouter } from "./leads.js";
import { getCliente } from "./clientes.js";

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
  <title>Demo Asistente IA</title>
  <style>
    body { font-family: sans-serif; padding: 40px; background: #f8fafc; color: #1e293b; }
    h1 { color: #2563eb; }
    .token { background: #e0e7ff; padding: 4px 10px; border-radius: 6px; font-family: monospace; }
  </style>
</head>
<body>
  <h1>🏠 Página demo de inmobiliaria</h1>
  <p>Esta es una página de prueba. El widget está cargado con token: <span class="token">${token}</span></p>
  <p>Hacé click en el botón azul 💬 en la esquina inferior derecha.</p>
  <script src="/widget.js?token=${token}"></script>
</body>
</html>`);
});

// Dashboard
app.get("/dashboard", (req, res) => {
  res.sendFile(join(__dirname, "dashboard.html"));
});

// Info de cliente por token (para el dashboard)
app.get("/cliente", (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "token requerido" });
  const cliente = getCliente(token);
  if (!cliente) return res.status(404).json({ error: "token inválido" });
  res.json({ nombre: cliente.nombre, ciudad: cliente.ciudad });
});

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
