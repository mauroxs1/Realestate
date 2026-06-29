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
  suggestions: string[];
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

const SUGGESTIONS_DELIMITER = "---SUGGESTIONS---";

function parseResponse(raw: string): ParsedResponse {
  let working = raw;
  let actions: Action[] = [];
  let suggestions: string[] = [];

  // Extraer ---ACTIONS---
  const actIdx = working.indexOf(ACTIONS_DELIMITER);
  if (actIdx !== -1) {
    const jsonPart = working.slice(actIdx + ACTIONS_DELIMITER.length).trim();
    working = working.slice(0, actIdx).trim();
    try {
      const parsed = JSON.parse(jsonPart);
      actions = parsed.actions ?? [];
    } catch {
      console.error("Error parsing actions JSON:", jsonPart);
    }
  }

  // Extraer ---SUGGESTIONS---
  const sugIdx = working.indexOf(SUGGESTIONS_DELIMITER);
  if (sugIdx !== -1) {
    const sugPart = working.slice(sugIdx + SUGGESTIONS_DELIMITER.length).trim();
    working = working.slice(0, sugIdx).trim();
    try {
      suggestions = JSON.parse(sugPart);
    } catch {
      console.error("Error parsing suggestions JSON:", sugPart);
    }
  }

  return { text: working.trim(), actions, suggestions };
}
