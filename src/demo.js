// src/demo.js
// Página de demo multi-vertical: GET /demo?token=TOK-XXXX
// Renderiza branding y copy según cliente.rubro (inmobiliaria | concesionaria)
// y embebe el widget con el token del cliente.
//
// Montaje en server.js:
//   import { demoHandler } from "./demo.js";
//   app.get("/demo", demoHandler);
import { getCliente } from "./clientes.js";

const COPY = {
  inmobiliaria: {
    icono: "🏠",
    titulo: (c) => `${c.nombre} — Tu próxima propiedad te espera`,
    subtitulo: (c) =>
      `Compra, venta y alquiler de propiedades en ${c.ciudad}. Consultá disponibilidad las 24 horas con nuestro asistente.`,
    inventarioTitulo: "Propiedades destacadas",
    ctaWidget: "¿Buscás propiedad? ¡Preguntame!",
    inventario: (c) => c.propiedades || [],
    badge: "Inmobiliaria",
  },
  concesionaria: {
    icono: "🚗",
    titulo: (c) => `${c.nombre} — Tu próximo auto está acá`,
    subtitulo: (c) =>
      `0km y usados seleccionados en ${c.ciudad}. Consultá precios, permutas y financiación las 24 horas con nuestro asistente.`,
    inventarioTitulo: "Vehículos disponibles",
    ctaWidget: "¿Buscás auto? ¡Preguntame!",
    inventario: (c) => c.vehiculos || [],
    badge: "Concesionaria",
  },
};

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function demoHandler(req, res) {
  const token = req.query.token || "DEMO-TOKEN-001";
  const cliente = await getCliente(token);
  if (!cliente) return res.status(404).send("Token no encontrado");

  const rubro = COPY[cliente.rubro] ? cliente.rubro : "inmobiliaria";
  const copy = COPY[rubro];
  const primario = escapeHtml(cliente.color_primario || "#1a56db");
  const secundario = escapeHtml(cliente.color_secundario || "#ffffff");
  const items = copy
    .inventario(cliente)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("\n          ");

  const extraConcesionaria =
    rubro === "concesionaria" && cliente.financiacion_disponible
      ? `<div class="pill">✅ Financiación disponible — consultá en el chat</div>`
      : "";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(cliente.nombre)} — Demo</title>
  <style>
    :root { --primario: ${primario}; --secundario: ${secundario}; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f5f7fa; color: #1f2937; }
    header { background: var(--primario); color: var(--secundario); padding: 48px 24px; text-align: center; }
    header .badge { display: inline-block; background: rgba(255,255,255,.18); border-radius: 999px; padding: 4px 14px; font-size: 13px; margin-bottom: 14px; letter-spacing: .04em; text-transform: uppercase; }
    header h1 { font-size: 30px; margin-bottom: 10px; }
    header p { opacity: .92; max-width: 640px; margin: 0 auto; line-height: 1.5; }
    main { max-width: 760px; margin: 32px auto; padding: 0 24px 96px; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.08); padding: 24px; margin-bottom: 20px; }
    .card h2 { font-size: 18px; margin-bottom: 14px; color: var(--primario); }
    .card ul { list-style: none; }
    .card li { padding: 10px 0; border-bottom: 1px solid #eef1f5; font-size: 15px; }
    .card li:last-child { border-bottom: none; }
    .card li::before { content: "${copy.icono}"; margin-right: 10px; }
    .pill { display: inline-block; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; border-radius: 999px; padding: 6px 16px; font-size: 14px; font-weight: 600; margin-bottom: 20px; }
    .contacto { font-size: 14px; color: #6b7280; line-height: 1.7; }
    .hint { position: fixed; bottom: 96px; right: 28px; background: #111827; color: #fff; padding: 8px 14px; border-radius: 8px; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,.25); }
    .hint::after { content: ""; position: absolute; bottom: -6px; right: 22px; border: 6px solid transparent; border-top-color: #111827; border-bottom: none; }
  </style>
</head>
<body>
  <header>
    <div class="badge">${copy.badge} · Demo</div>
    <h1>${escapeHtml(copy.titulo(cliente))}</h1>
    <p>${escapeHtml(copy.subtitulo(cliente))}</p>
  </header>
  <main>
    ${extraConcesionaria}
    <div class="card">
      <h2>${copy.inventarioTitulo}</h2>
      <ul>
          ${items || "<li>Stock en actualización — consultá por el chat</li>"}
      </ul>
    </div>
    <div class="card">
      <h2>Contacto</h2>
      <p class="contacto">
        📞 ${escapeHtml(cliente.telefono || "-")}<br/>
        🕐 ${escapeHtml(cliente.horario || "-")}<br/>
        📍 ${escapeHtml(cliente.ciudad)}
      </p>
    </div>
  </main>
  <div class="hint">${copy.ctaWidget} 👉</div>
  <!-- Widget embebido: una sola línea, igual que en la web del cliente -->
  <script src="/widget.js" data-token="${escapeHtml(token)}" defer></script>
</body>
</html>`);
}
