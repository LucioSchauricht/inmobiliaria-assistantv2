import { Resend } from "resend";

const DASHBOARD_URL = "https://inmobiliaria-assistantv2-production.up.railway.app/dashboard";

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendLeadNotification({ clienteNombre, clienteEmail, rubro, lead }) {
  if (!process.env.RESEND_API_KEY) {
    console.log("⚠️  RESEND_API_KEY no configurado — email omitido");
    return;
  }
  if (!clienteEmail) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM || "Asistente IA <notificaciones@resend.dev>";

  const esConcesionaria = (rubro || "").toLowerCase() === "concesionaria";

  const rows = [
    { label: "Nombre",    value: lead.nombre },
    { label: "Teléfono",  value: lead.telefono },
    ...(lead.horario             ? [{ label: "Horario preferido",   value: lead.horario }] : []),
    ...(esConcesionaria && lead.vehiculo_interes
                                 ? [{ label: "Vehículo de interés", value: lead.vehiculo_interes }] : []),
    ...(esConcesionaria && lead.permuta !== null && lead.permuta !== undefined
                                 ? [{ label: "Permuta",             value: lead.permuta ? "Sí" : "No" }] : []),
    ...(esConcesionaria && lead.financiacion_solicitada !== null && lead.financiacion_solicitada !== undefined
                                 ? [{ label: "Financiación",        value: lead.financiacion_solicitada ? "Sí" : "No" }] : []),
    ...(lead.resumen             ? [{ label: "Resumen",             value: lead.resumen }] : []),
  ];

  const rowsHtml = rows.map((r, i) => `
    <tr>
      <td style="padding:12px 16px;${i < rows.length - 1 ? "border-bottom:1px solid #E4E4E7;" : ""}">
        <span style="display:block;font-size:11px;font-weight:600;color:#A1A1AA;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;">${escHtml(r.label)}</span>
        <span style="font-size:14px;font-weight:500;color:#09090B;">${escHtml(r.value)}</span>
      </td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#FFFFFF;border:1px solid #E4E4E7;border-radius:12px;overflow:hidden;">

        <tr><td style="padding:20px 28px;border-bottom:1px solid #E4E4E7;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="width:28px;height:28px;background:#18181B;border-radius:6px;text-align:center;vertical-align:middle;line-height:28px;">
              <span style="font-size:10px;font-weight:700;color:#FFFFFF;letter-spacing:-.02em;">IA</span>
            </td>
            <td style="padding-left:10px;font-size:15px;font-weight:600;color:#09090B;vertical-align:middle;">Asistente IA</td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:28px 28px 24px;">
          <p style="margin:0 0 4px;font-size:18px;font-weight:600;color:#09090B;line-height:1.3;">Nuevo lead capturado</p>
          <p style="margin:0 0 24px;font-size:14px;color:#71717A;line-height:1.5;">
            Un visitante del widget de <strong style="color:#3F3F46;">${clienteNombre}</strong> dejó sus datos de contacto.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAFA;border:1px solid #E4E4E7;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            ${rowsHtml}
          </table>

          <a href="${DASHBOARD_URL}" style="display:block;background:#18181B;color:#FFFFFF;text-align:center;padding:11px 20px;border-radius:7px;font-size:14px;font-weight:500;text-decoration:none;">
            Ver todos los leads
          </a>
        </td></tr>

        <tr><td style="padding:16px 28px;border-top:1px solid #E4E4E7;text-align:center;">
          <p style="margin:0;font-size:12px;color:#A1A1AA;">${esConcesionaria ? "Asistente IA Concesionaria" : "Asistente IA Inmobiliaria"} &middot; Notificación automática</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const { error } = await resend.emails.send({
      from,
      to: clienteEmail,
      subject: `Nuevo lead: ${lead.nombre} — ${clienteNombre}`,
      html,
    });
    if (error) throw new Error(error.message);
    console.log(`📧 Notificación enviada a ${clienteEmail}`);
  } catch (err) {
    console.error("❌ Error enviando notificación:", err.message);
  }
}
