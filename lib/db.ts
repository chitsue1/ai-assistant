import { Pool, type QueryResultRow } from "pg";

// One shared connection pool. In dev, Next.js reloads modules, so we keep it on globalThis.
const g = globalThis as unknown as { __pool?: Pool };

export const pool =
  g.__pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

if (process.env.NODE_ENV !== "production") g.__pool = pool;

export async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export type Tenant = {
  id: number;
  slug: string;
  name: string;
  config: TenantConfig;
};

export type TenantConfig = {
  description: string; // one line about the business
  tone: string; // how the assistant should sound
  greeting: string; // first message in the chat
  handoff: string; // what to say when it can't help
  contacts?: string;
  rules?: string[]; // extra do's and don'ts
  telegramChatId?: string; // where new leads are sent (phase 2)
};

export type FaqEntry = {
  id: number;
  question: string;
  phrasings: string[];
  answer: string;
  status: "ACTIVE" | "CANDIDATE" | "REJECTED";
  hits: number;
};

export type Chunk = { id: number; source: string; title: string; content: string };
