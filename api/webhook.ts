import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  extractMessage,
  sendTextMessage,
  sendImageMessage,
  uploadMedia,
  notifyAgent,
  notifyOwnerClose,
  downloadAudio,
} from "../src/whatsapp";
import { fetchProperties } from "../src/properties";
import { applyWatermark } from "../src/watermark";
import { getLorenzosReply } from "../src/claude";
import { addLead, updateLead, addVisit } from "../src/sheets";
import { saveVisit } from "../src/visits";
import { transcribeAudio } from "../src/transcribe";
import { getHistory } from "../src/conversation";
import { getUsageStats } from "../src/credits";
import type { Action } from "../src/claude";

const processedMessageIds = new Set<string>();

function isTeamMember(phone: string): boolean {
  return (
    phone === process.env.AGENT_PHONE ||
    phone === process.env.OWNER_PHONE
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") return handleVerification(req, res);
  if (req.method === "POST") return handleIncoming(req, res);
  return res.status(405).json({ error: "Method not allowed" });
}

function handleVerification(req: VercelRequest, res: VercelResponse) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log("Webhook verificado correctamente.");
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: "Forbidden" });
}

async function handleIncoming(req: VercelRequest, res: VercelResponse) {
  const incoming = extractMessage(req.body);
  if (!incoming) return res.status(200).json({ status: "ok" });

  if (processedMessageIds.has(incoming.messageId)) return res.status(200).json({ status: "ok" });
  processedMessageIds.add(incoming.messageId);
  if (processedMessageIds.size > 1000) processedMessageIds.clear();

  // ── CASO 1: Comandos del equipo ──────────────────────────────────
  if (isTeamMember(incoming.from) && incoming.text) {
    if (/^creditos?$/i.test(incoming.text.trim())) {
      const stats = await getUsageStats();
      const budget = parseFloat(process.env.ANTHROPIC_BUDGET_USD ?? "5");
      const remaining = budget - stats.costUSD;
      const pct = Math.round((stats.costUSD / budget) * 100);
      const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
      await sendTextMessage(
        incoming.from,
        `📊 *Créditos Lorenzo — Anthropic*\n\n` +
        `${bar} ${pct}% usado\n\n` +
        `💸 Gastado: $${stats.costUSD.toFixed(3)} USD\n` +
        `💰 Disponible: ~$${remaining.toFixed(2)} USD\n` +
        `🔢 Tokens: ${(stats.inputTokens + stats.outputTokens).toLocaleString()}\n\n` +
        `_Recargá en: console.anthropic.com → Billing_`
      );
      return res.status(200).json({ status: "ok" });
    }

    if (/^actualizar\s+cat[aá]logo?$/i.test(incoming.text.trim())) {
      const { refreshPropertiesCache } = await import("../src/properties");
      const result = await refreshPropertiesCache();
      await sendTextMessage(
        incoming.from,
        `✅ *Catálogo actualizado*\n\n` +
        `🏠 Propiedades cargadas: ${result.count}\n` +
        `🕐 Actualizado: ${new Date(result.updatedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Mendoza" })}\n\n` +
        `_El agente ya tiene el catálogo fresco._`
      );
      return res.status(200).json({ status: "ok" });
    }

    const histMatch = incoming.text.trim().match(/^historial\s+(\d+)/i);
    if (histMatch) {
      const targetPhone = histMatch[1];
      const history = await getHistory(targetPhone);
      if (!history.length) {
        await sendTextMessage(incoming.from, `No hay historial guardado para ${targetPhone}.`);
      } else {
        const lines = history.map((m) => {
          const who = m.role === "user" ? "👤 Cliente" : "🤖 Lorenzo";
          const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
          return `${who}: ${content}`;
        });
        const full = `📋 *Historial de ${targetPhone}*\n\n` + lines.join("\n\n");
        for (let i = 0; i < full.length; i += 3800) {
          await sendTextMessage(incoming.from, full.slice(i, i + 3800));
        }
      }
      return res.status(200).json({ status: "ok" });
    }
  }

  // ── CASO 2: Audio ────────────────────────────────────────────────
  let userText = incoming.text;

  if (incoming.audioId) {
    try {
      const audioBuffer = await downloadAudio(incoming.audioId);
      const transcription = await transcribeAudio(audioBuffer, incoming.audioMime ?? "audio/ogg");
      userText = `[AUDIO TRANSCRIPTO] ${transcription}`;
      console.log(`Audio transcripto de ${incoming.from}: ${transcription}`);
    } catch (err) {
      console.error("Error transcribiendo audio:", err);
      await sendTextMessage(incoming.from, "Perdón, no pude escuchar el audio. ¿Podés escribirme?");
      return res.status(200).json({ status: "ok" });
    }
  }

  if (!userText?.trim()) return res.status(200).json({ status: "ok" });

  console.log(`Mensaje de ${incoming.from}: ${userText}`);

  // Delay humano: 20s, 35s o 60s
  const delays = [20000, 35000, 60000];
  const delay = delays[Math.floor(Math.random() * delays.length)];
  await new Promise((resolve) => setTimeout(resolve, delay));

  try {
    const { text, actions } = await getLorenzosReply(incoming.from, userText);
    await sendTextMessage(incoming.from, text);
    await runActions(actions, incoming.from);
  } catch (error) {
    console.error("Error procesando mensaje:", error);
  }

  return res.status(200).json({ status: "ok" });
}

async function runActions(actions: Action[], fromPhone: string): Promise<void> {
  for (const action of actions) {
    try {
      if (action.type === "addPropertyLead") {
        await addLead({
          nombre: action.nombre ?? "",
          telefono: action.telefono ?? fromPhone,
          tipoBusqueda: action.tipoBusqueda ?? "",
          tipoPropiedad: action.tipoPropiedad ?? "",
          ambientes: action.ambientes,
          zona: action.zona,
          presupuesto: action.presupuesto,
          plazoIngreso: action.plazoIngreso,
          estado: action.estado ?? "Nuevo",
          observaciones: action.observaciones,
        });
      } else if (action.type === "updatePropertyLead") {
        await updateLead(action.telefono ?? fromPhone, action.estado ?? "", action.observaciones);
      } else if (action.type === "scheduleVisit") {
        const visitData = {
          clientPhone: fromPhone,
          nombre: action.nombre ?? "",
          propiedadId: action.propiedadId ?? "",
          propiedadDescripcion: action.propiedadDescripcion ?? "",
          disponibilidad: action.disponibilidad ?? "",
          observaciones: action.observaciones ?? "",
          createdAt: Date.now(),
        };

        // Guardar en Redis y Google Sheets
        await saveVisit(visitData);
        await addVisit({
          nombre: visitData.nombre,
          telefono: fromPhone,
          propiedadId: visitData.propiedadId,
          propiedadDescripcion: visitData.propiedadDescripcion,
          disponibilidad: visitData.disponibilidad,
          observaciones: visitData.observaciones,
        });

        // Notificar a Alejandro con los datos de la visita
        await notifyAgent(
          `📅 *Nueva visita agendada*\n\n` +
          `👤 Cliente: ${visitData.nombre}\n` +
          `📱 WhatsApp: ${fromPhone}\n` +
          `🏠 Propiedad: ${visitData.propiedadDescripcion}\n` +
          `🕐 Disponibilidad: ${visitData.disponibilidad}\n` +
          (visitData.observaciones ? `💬 Notas: ${visitData.observaciones}` : ""),
          fromPhone
        );
      } else if (action.type === "notifyAgent") {
        await notifyAgent(action.detalle ?? "Sin detalle", fromPhone);
      } else if (action.type === "sendPhotos") {
        const ids = action.propiedadIds ?? [];
        if (ids.length > 0) {
          const allProps = await fetchProperties();
          const targets = allProps.filter((p) => ids.includes(p.id));
          for (const prop of targets) {
            if (!prop.fotoPrincipal) continue;
            try {
              // 1. Descargar + aplicar marca de agua Lorenzo Propiedades
              const withWatermark = await applyWatermark(prop.fotoPrincipal);

              // 2. Subir a WhatsApp Media API
              const mediaId = await uploadMedia(withWatermark, "image/jpeg");

              // 3. Armar caption contextual según lo que busca el cliente
              const detalles: string[] = [];
              if (prop.dormitorios) detalles.push(`${prop.dormitorios} dorm.`);
              if (prop.banos) detalles.push(`${prop.banos} baño(s)`);
              if (prop.supCubierta) detalles.push(`${prop.supCubierta}m²`);
              if (prop.cochera) detalles.push("🚗 cochera");
              if (prop.extras.includes("pileta")) detalles.push("🏊 pileta");
              if (prop.extras.includes("patio")) detalles.push("🌿 patio");
              if (prop.extras.includes("terraza")) detalles.push("☀️ terraza");
              if (prop.mascotas === "Si" || prop.mascotas === "Indistinto") detalles.push("🐾 mascotas OK");

              const sufijoPrecio = prop.operacion.includes("Alquiler") ? "/mes" : "";
              let caption =
                `📍 *${prop.direccion}* — ${prop.localidad}\n` +
                `🏠 ${prop.tipo} | ${prop.operacion}\n` +
                `💰 ${prop.precio}${sufijoPrecio}\n`;

              if (detalles.length > 0) caption += `✨ ${detalles.join(" · ")}\n`;

              // Si hay contexto de lo que busca el cliente, destacar coincidencia
              if (action.contexto) {
                caption += `\n💬 _${action.contexto}_`;
              }

              caption += `\n\n_Lorenzo Propiedades · ${prop.localidad}_`;

              await sendImageMessage(fromPhone, mediaId, caption);
            } catch (err) {
              console.error(`Error enviando foto de propiedad ${prop.id}:`, err);
            }

            if (targets.length > 1) await new Promise((r) => setTimeout(r, 1000));
          }
        }
      } else if (action.type === "notifyOwner") {
        // Notificar a Ricardo con todos los datos del cierre
        await notifyOwnerClose(action.detalle ?? "Sin detalle", fromPhone);

      }
    } catch (error) {
      console.error(`Error ejecutando acción ${action.type}:`, error);
    }
  }
}
