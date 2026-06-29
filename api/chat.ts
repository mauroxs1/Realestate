import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getLorenzosReply } from "../src/claude";
import { fetchProperties } from "../src/properties";

const SIMULATOR_SECRET = process.env.SIMULATOR_SECRET || "simulador_lorenzo_2025";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${SIMULATOR_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    return res.status(400).json({ error: "message y sessionId son requeridos" });
  }

  try {
    const { text, actions } = await getLorenzosReply(`sim_${sessionId}`, message);

    // Procesar acciones de propiedades para enviarlas al simulador
    const properties: PropertyCard[] = [];

    for (const action of actions) {
      if (action.type === "sendPhotos" && action.propiedadIds?.length) {
        const allProps = await fetchProperties();
        const targets = allProps.filter((p) => action.propiedadIds!.includes(p.id));
        for (const prop of targets) {
          properties.push({
            id: prop.id,
            tipo: prop.tipo,
            operacion: prop.operacion,
            direccion: prop.direccion,
            localidad: prop.localidad,
            precio: prop.precio,
            dormitorios: prop.dormitorios,
            banos: prop.banos,
            supCubierta: prop.supCubierta,
            supTotal: prop.supTotal,
            mascotas: prop.mascotas,
            cochera: prop.cochera,
            extras: prop.extras,
            descripcion: prop.descripcion,
            url: prop.url,
            foto: prop.fotoPrincipal,
            contexto: action.contexto || "",
          });
        }
      }
    }

    return res.status(200).json({ text, properties });
  } catch (error: any) {
    console.error("Error en /api/chat:", error);
    return res.status(500).json({ error: "Error procesando el mensaje", detail: error.message });
  }
}

interface PropertyCard {
  id: number;
  tipo: string;
  operacion: string;
  direccion: string;
  localidad: string;
  precio: string;
  dormitorios: string | null;
  banos: string | null;
  supCubierta: number | null;
  supTotal: number | null;
  mascotas: string | null;
  cochera: boolean;
  extras: string[];
  descripcion: string;
  url: string;
  foto: string;
  contexto: string;
}
