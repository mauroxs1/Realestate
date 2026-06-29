import { Redis } from "@upstash/redis";

export interface VisitData {
  clientPhone: string;
  nombre: string;
  propiedadId: string;
  propiedadDescripcion: string;
  disponibilidad: string;
  observaciones: string;
  createdAt: number;
}

const VISIT_KEY = (phone: string) => `lorenzo:visit:${phone}`;
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 días

function getRedis(): Redis | null {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return null;
}

export async function saveVisit(data: VisitData): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(VISIT_KEY(data.clientPhone), data, { ex: TTL_SECONDS });
}

export async function getVisit(clientPhone: string): Promise<VisitData | null> {
  const redis = getRedis();
  if (!redis) return null;
  return redis.get<VisitData>(VISIT_KEY(clientPhone));
}
