import type Anthropic from "@anthropic-ai/sdk";
import { Redis } from "@upstash/redis";

const memoryStore = new Map<string, Anthropic.MessageParam[]>();

function getRedis(): Redis | null {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return null;
}

const HISTORY_KEY = (phone: string) => `lorenzo:history:${phone}`;
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 días

export async function getHistory(phoneNumber: string): Promise<Anthropic.MessageParam[]> {
  const redis = getRedis();
  if (!redis) return memoryStore.get(phoneNumber) ?? [];
  const data = await redis.get<Anthropic.MessageParam[]>(HISTORY_KEY(phoneNumber));
  return data ?? [];
}

export async function addToHistory(
  phoneNumber: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const redis = getRedis();

  if (!redis) {
    const history = memoryStore.get(phoneNumber) ?? [];
    history.push({ role, content });
    if (history.length > 40) history.splice(0, history.length - 40);
    memoryStore.set(phoneNumber, history);
    return;
  }

  const history = await getHistory(phoneNumber);
  history.push({ role, content });
  if (history.length > 40) history.splice(0, history.length - 40);
  await redis.set(HISTORY_KEY(phoneNumber), history, { ex: TTL_SECONDS });
}

export async function isFirstContact(phoneNumber: string): Promise<boolean> {
  const history = await getHistory(phoneNumber);
  return history.length === 0;
}
