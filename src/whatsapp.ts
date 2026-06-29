import axios from "axios";
import FormData from "form-data";

const BASE_URL = "https://graph.facebook.com/v20.0";

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export async function sendTextMessage(to: string, text: string): Promise<void> {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  await axios.post(
    `${BASE_URL}/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text },
    },
    { headers: getHeaders() }
  );
}

/**
 * Sube un buffer de imagen a la Media API de WhatsApp y devuelve el media_id.
 * Necesario para enviar imágenes procesadas (con marca de agua) sin URL externa.
 */
export async function uploadMedia(imageBuffer: Buffer, mimeType = "image/jpeg"): Promise<string> {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", imageBuffer, { filename: "foto.jpg", contentType: mimeType });

  const { data } = await axios.post(
    `${BASE_URL}/${phoneNumberId}/media`,
    form,
    {
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        ...form.getHeaders(),
      },
    }
  );
  return data.id as string;
}

/**
 * Envía una imagen al cliente usando un media_id previamente subido.
 */
export async function sendImageMessage(to: string, mediaId: string, caption?: string): Promise<void> {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  await axios.post(
    `${BASE_URL}/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "image",
      image: { id: mediaId, ...(caption ? { caption } : {}) },
    },
    { headers: getHeaders() }
  );
}

// Notifica a Ricardo — visitas, escaladas, consultas en proceso
export async function notifyAgent(detail: string, clientPhone: string): Promise<void> {
  const owner = process.env.OWNER_PHONE;
  const message =
    `🏠 *Lorenzo Propiedades — Nueva consulta*\n\n` +
    `📱 Cliente: ${clientPhone}\n\n` +
    `${detail}`;
  if (owner) await sendTextMessage(owner, message).catch(console.error);
}

// Notifica a Ricardo — mensaje de cierre completo para que contacte al cliente
export async function notifyOwnerClose(detail: string, clientPhone: string): Promise<void> {
  const owner = process.env.OWNER_PHONE;
  const message =
    `🔔 *LORENZO PROPIEDADES — CIERRE LISTO*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${detail}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📲 *WhatsApp directo del cliente:* wa.me/${clientPhone}\n\n` +
    `_El cliente fue informado que te comunicás con él. Escribile cuanto antes para cerrar los detalles._`;
  if (owner) await sendTextMessage(owner, message).catch(console.error);
}

export interface IncomingMessage {
  from: string;
  text: string;
  messageId: string;
  audioId?: string;
  audioMime?: string;
  mediaId?: string;
  mediaType?: "image" | "document";
  mediaMime?: string;
}

export function extractMessage(body: unknown): IncomingMessage | null {
  try {
    const b = body as Record<string, unknown>;
    const entry = (b.entry as unknown[])?.[0] as Record<string, unknown>;
    const change = (entry?.changes as unknown[])?.[0] as Record<string, unknown>;
    const value = change?.value as Record<string, unknown>;
    const messages = value?.messages as unknown[];

    if (!messages || messages.length === 0) return null;

    const msg = messages[0] as Record<string, unknown>;

    if (msg.type === "text") {
      const textObj = msg.text as Record<string, unknown>;
      return { from: msg.from as string, text: textObj.body as string, messageId: msg.id as string };
    }

    if (msg.type === "audio") {
      const audioObj = msg.audio as Record<string, unknown>;
      return {
        from: msg.from as string, text: "", messageId: msg.id as string,
        audioId: audioObj.id as string,
        audioMime: (audioObj.mime_type as string) ?? "audio/ogg; codecs=opus",
      };
    }

    if (msg.type === "image") {
      const obj = msg.image as Record<string, unknown>;
      return {
        from: msg.from as string, text: "", messageId: msg.id as string,
        mediaId: obj.id as string, mediaType: "image",
        mediaMime: (obj.mime_type as string) ?? "image/jpeg",
      };
    }

    if (msg.type === "document") {
      const obj = msg.document as Record<string, unknown>;
      return {
        from: msg.from as string, text: "", messageId: msg.id as string,
        mediaId: obj.id as string, mediaType: "document",
        mediaMime: (obj.mime_type as string) ?? "application/pdf",
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const headers = { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` };
  const { data: mediaData } = await axios.get(`${BASE_URL}/${mediaId}`, { headers });
  const { data, headers: resHeaders } = await axios.get(mediaData.url, {
    headers, responseType: "arraybuffer",
  });
  return {
    buffer: Buffer.from(data),
    mimeType: (resHeaders["content-type"] as string) ?? mediaData.mime_type ?? "image/jpeg",
  };
}

export async function downloadAudio(mediaId: string): Promise<Buffer> {
  const { buffer } = await downloadMedia(mediaId);
  return buffer;
}
