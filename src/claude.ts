import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./systemPrompt";
import { getHistory, addToHistory, isFirstContact } from "./conversation";
import { trackUsage } from "./credits";
import { fetchProperties, formatPropertiesForPrompt } from "./properties";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ACTIONS_DELIMITER = "---ACTIONS---";

export interface ParsedResponse {
  text: string;
  actions: Action[];
}

export interface Action {
  type: "addPropertyLead" | "updatePropertyLead" | "scheduleVisit" | "notifyAgent" | "notifyOwner" | "sendPhotos";
  propiedadIds?: number[]; // para sendPhotos: lista de IDs de propiedades a mostrar
  contexto?: string;       // para sendPhotos: qué busca el cliente (orienta el caption)
  nombre?: string;
  telefono?: string;
  tipoBusqueda?: string;
  tipoPropiedad?: string;
  ambientes?: string;
  zona?: string;
  presupuesto?: string;
  plazoIngreso?: string;
  estado?: string;
  observaciones?: string;
  propiedadId?: string;
  propiedadDescripcion?: string;
  disponibilidad?: string;
  detalle?: string;
}

export async function getLorenzosReply(
  phoneNumber: string,
  incomingMessage: string
): Promise<ParsedResponse> {
  const firstTime = await isFirstContact(phoneNumber);

  const userContent = firstTime
    ? `[PRIMER CONTACTO]\n${incomingMessage}`
    : incomingMessage;

  await addToHistory(phoneNumber, "user", userContent);

  const fullHistory = await getHistory(phoneNumber);
  const history = fullHistory.slice(-20);

  // Catálogo se carga fresco en cada request para reflejar cambios en Sheets
  const properties = await fetchProperties();
  const propiedadesFormateadas = formatPropertiesForPrompt(properties);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: buildSystemPrompt(propiedadesFormateadas),
    messages: history,
  });

  const fullText =
    response.content[0].type === "text" ? response.content[0].text : "";

  await addToHistory(phoneNumber, "assistant", fullText);

  trackUsage(response.usage.input_tokens, response.usage.output_tokens).catch(
    (err) => console.error("Error tracking usage:", err)
  );

  return parseResponse(fullText);
}

function parseResponse(raw: string): ParsedResponse {
  const delimIdx = raw.indexOf(ACTIONS_DELIMITER);

  if (delimIdx === -1) {
    return { text: raw.trim(), actions: [] };
  }

  const text = raw.slice(0, delimIdx).trim();
  const jsonPart = raw.slice(delimIdx + ACTIONS_DELIMITER.length).trim();

  let actions: Action[] = [];
  try {
    const parsed = JSON.parse(jsonPart);
    actions = parsed.actions ?? [];
  } catch {
    console.error("Error parsing actions JSON:", jsonPart);
  }

  return { text, actions };
}
