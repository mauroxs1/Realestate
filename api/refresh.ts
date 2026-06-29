import type { VercelRequest, VercelResponse } from "@vercel/node";
import { refreshPropertiesCache } from "../src/properties";
import { sendTextMessage } from "../src/whatsapp";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const isCron = req.headers["x-vercel-cron"] === "1";
  const isManual =
    process.env.CRON_SECRET &&
    req.headers["authorization"] === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron && !isManual) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await refreshPropertiesCache();
    const fecha = new Date(result.updatedAt).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Mendoza",
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Notificar a Ricardo por WhatsApp
    const owner = process.env.OWNER_PHONE;
    if (owner) {
      await sendTextMessage(
        owner,
        `🏠 *Lorenzo Propiedades — Catálogo actualizado*\n\n` +
        `✅ Se actualizaron automáticamente las propiedades disponibles.\n\n` +
        `📋 *Propiedades activas:* ${result.count}\n` +
        `🕐 *Fecha:* ${fecha}\n\n` +
        `El agente ya tiene la información al día. Si querés forzar una actualización antes del próximo lunes, escribí *actualizar catalogo*.\n\n` +
        `_Lorenzo Propiedades AI_`
      );
    }

    console.log(`[CRON] Catálogo actualizado: ${result.count} propiedades — ${result.updatedAt}`);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("[CRON] Error actualizando catálogo:", err);
    return res.status(500).json({ error: "Failed to refresh catalog" });
  }
}
