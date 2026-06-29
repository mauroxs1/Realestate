import axios from "axios";
import { Redis } from "@upstash/redis";

const INMOUP_API = "https://inmoup.com.ar/api/2.0";
const USUARIO_ID = 254044;
const CACHE_KEY = "lorenzo:catalog:v1";
const CACHE_TTL = 60 * 60 * 24 * 7; // 7 días en segundos

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export interface Property {
  id: number;
  tipo: string;
  operacion: string;
  direccion: string;
  localidad: string;
  precio: string;
  moneda: string; // "USD" | "ARS"
  dormitorios: string | null;
  banos: string | null;
  supCubierta: number | null;
  supTotal: number | null;
  antiguedad: string | null;
  mascotas: string | null;
  cochera: boolean;
  extras: string[]; // pileta, patio, terraza, balcón, jardín, A/C, wifi, TV, etc.
  descripcion: string;
  url: string;
  fotoPrincipal: string;    // foto[0]: exterior / panorama
  fotosPreview: string[];   // fotos[0..2]: para enviar por WhatsApp
}

/**
 * Devuelve el catálogo desde Redis (cache semanal).
 * Si no hay cache o expiró, descarga desde Inmoup y guarda.
 */
export async function fetchProperties(): Promise<Property[]> {
  const redis = getRedis();

  // Intentar leer del cache
  if (redis) {
    try {
      const cached = await redis.get<Property[]>(CACHE_KEY);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    } catch (err) {
      console.error("Error leyendo cache de propiedades:", err);
    }
  }

  // Cache vacío o expirado — descargar desde Inmoup
  const fresh = await fetchFromInmoup();

  if (redis && fresh.length > 0) {
    try {
      await redis.set(CACHE_KEY, fresh, { ex: CACHE_TTL });
      console.log(`Catálogo cacheado: ${fresh.length} propiedades (TTL 7 días)`);
    } catch (err) {
      console.error("Error guardando cache de propiedades:", err);
    }
  }

  return fresh;
}

/**
 * Fuerza una actualización del catálogo desde Inmoup y guarda en cache.
 * Llamado por el cron semanal de Vercel.
 */
export async function refreshPropertiesCache(): Promise<{ count: number; updatedAt: string }> {
  const fresh = await fetchFromInmoup();
  const redis = getRedis();

  if (redis && fresh.length > 0) {
    await redis.set(CACHE_KEY, fresh, { ex: CACHE_TTL });
    await redis.set("lorenzo:catalog:updatedAt", new Date().toISOString(), { ex: CACHE_TTL });
    console.log(`Cache refrescado: ${fresh.length} propiedades`);
  }

  return { count: fresh.length, updatedAt: new Date().toISOString() };
}

async function fetchFromInmoup(): Promise<Property[]> {
  try {
    const { data } = await axios.get(`${INMOUP_API}/inmuebles`, {
      params: { usuario: USUARIO_ID, limit: 50, page: 1 },
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      timeout: 6000,
    });

    const pager = data?.data?.pager ?? [];

    return pager
      .filter((p: Record<string, unknown>) => p.prp_mostrar === 1)
      .map((p: Record<string, unknown>) => {
        const enDolares = !!p.prp_pre_dol;
        const precio = enDolares
          ? `USD ${(p.prp_pre_dol as number).toLocaleString("es-AR")}`
          : `$${(p.prp_pre as number).toLocaleString("es-AR")}`;

        const fotos = (p.fotos as Record<string, unknown>[]) ?? [];
        const fotoUrl = (f: Record<string, unknown>) =>
          ((f["url_fotos_api"] as Record<string, string>)["wm1024x576"] ?? "");
        const foto = fotos.length > 0 ? fotoUrl(fotos[0]) : "";
        // Guardamos las primeras 3 fotos: [0]=exterior/panorama, [1][2]=interiores
        const fotosPreview = fotos.slice(0, 3).map(fotoUrl).filter(Boolean);

        // Detectar extras desde la descripción
        const desc = ((p.prp_desc as string) ?? "").toLowerCase();
        const extras: string[] = [];
        if (/pileta|piscina/.test(desc)) extras.push("pileta");
        if (/patio/.test(desc)) extras.push("patio");
        if (/terraza/.test(desc)) extras.push("terraza");
        if (/balc[oó]n/.test(desc)) extras.push("balcón");
        if (/jard[ií]n|parquizado/.test(desc)) extras.push("jardín");
        if (/quincho/.test(desc)) extras.push("quincho");
        if (/aire acondicionado/.test(desc)) extras.push("A/C");
        if (/wifi/.test(desc)) extras.push("wifi");
        if (/\btv\b|televisi[oó]n/.test(desc)) extras.push("TV");
        if (/lavadero/.test(desc)) extras.push("lavadero");
        if (/ascensor/.test(desc)) extras.push("ascensor");
        if (/amoblado|amueblado/.test(desc)) extras.push("amoblado");
        if (/equipado/.test(desc)) extras.push("equipado");

        return {
          id: p.propiedad_id as number,
          tipo: p.tip_desc as string,
          operacion: p.con_desc as string,
          direccion: p.prp_dom as string,
          localidad: `${p.loc_desc as string}, ${p.pro_desc as string}`,
          precio,
          moneda: enDolares ? "USD" : "ARS",
          dormitorios: p.dormitorios ? String(p.dormitorios) : null,
          banos: p.banos ? String(p.banos) : null,
          supCubierta: p.sup_cubierta as number | null,
          supTotal: p.sup_total as number | null,
          antiguedad: p.antiguedad as string | null,
          mascotas: p.mascotas as string | null,
          cochera: !!(p.cochera as number),
          extras,
          descripcion: ((p.prp_desc as string) ?? "").replace(/\r\n/g, " ").trim(),
          url: p.url_ficha_inmoup as string,
          fotoPrincipal: foto,
          fotosPreview,
        };
      });
  } catch (err) {
    console.error("Error cargando catálogo desde Inmoup:", err);
    return [];
  }
}

export function formatPropertiesForPrompt(properties: Property[]): string {
  if (properties.length === 0) {
    return "_(catálogo no disponible en este momento — derivá al agente para consultar disponibilidad)_";
  }

  const alquileres = properties.filter(
    (p) => p.operacion === "Alquiler" || p.operacion === "Alquiler Temporario"
  );
  const ventas = properties.filter((p) => p.operacion === "Venta");

  const formatItem = (p: Property): string => {
    const tags: string[] = [];
    if (p.cochera) tags.push("cochera");
    if (p.mascotas === "Si" || p.mascotas === "Indistinto") tags.push("mascotas OK");
    tags.push(...p.extras);

    const superficies = [
      p.supCubierta ? `${p.supCubierta}m² cub.` : "",
      p.supTotal && p.supTotal !== p.supCubierta ? `${p.supTotal}m² tot.` : "",
    ].filter(Boolean).join(" / ");

    return (
      `• [ID:${p.id}] *${p.tipo} — ${p.operacion}* | ${p.precio}${p.operacion.includes("Alquiler") ? "/mes" : ""}\n` +
      `  📍 ${p.direccion} — ${p.localidad}\n` +
      `  ${[p.dormitorios ? `${p.dormitorios} dorm.` : "", p.banos ? `${p.banos} baño(s)` : "", superficies].filter(Boolean).join(" | ")}\n` +
      `  ${tags.length > 0 ? tags.join(" · ") + "\n  " : ""}🔗 ${p.url}`
    );
  };

  const sections: string[] = [];

  if (alquileres.length > 0) {
    sections.push(
      `### 🔑 ALQUILERES (${alquileres.length})\n` + alquileres.map(formatItem).join("\n\n")
    );
  }
  if (ventas.length > 0) {
    sections.push(
      `### 🏷️ VENTAS (${ventas.length})\n` + ventas.map(formatItem).join("\n\n")
    );
  }

  return sections.join("\n\n");
}
