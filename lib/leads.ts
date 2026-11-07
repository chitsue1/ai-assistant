// Layer 04 (tools): saving a customer's contact details and telling the company on Telegram.

import { q, type Tenant } from "./db";

export type LeadInput = { name?: string; phone: string; topic: string };
export type LeadResult = { ok: true; leadId: number; notified: boolean } | { ok: false; error: string };

/** Georgian mobile numbers: 5XX XX XX XX, optionally with +995 / 995 in front. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  const local = digits.startsWith("995") ? digits.slice(3) : digits;
  if (/^5\d{8}$/.test(local)) return `+995${local}`;
  // Landlines and foreign numbers: accept 7–15 digits as given.
  if (/^\d{7,15}$/.test(digits)) return `+${digits}`;
  return null;
}

export async function saveLead(tenant: Tenant, conversationId: string, input: LeadInput): Promise<LeadResult> {
  const phone = normalizePhone(input.phone ?? "");
  if (!phone) return { ok: false, error: "invalid_phone" };
  const topic = (input.topic ?? "").trim().slice(0, 300) || "not specified";
  const name = input.name?.trim().slice(0, 80) || null;

  // The same person leaving the same number twice in one chat is one lead.
  const [existing] = await q<{ id: number }>(
    "SELECT id FROM leads WHERE conversation_id = $1 AND phone = $2",
    [conversationId, phone],
  );
  if (existing) return { ok: true, leadId: existing.id, notified: true };

  const [row] = await q<{ id: number }>(
    "INSERT INTO leads (tenant_id, conversation_id, name, phone, topic) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [tenant.id, conversationId, name, phone, topic],
  );

  const notified = await notifyTelegram(
    tenant,
    `🔔 ახალი მომართვა: ${tenant.name}\n\nსახელი: ${name ?? "—"}\nტელეფონი: ${phone}\nთემა: ${topic}`,
  );
  if (notified) await q("UPDATE leads SET notified = true WHERE id = $1", [row.id]);
  return { ok: true, leadId: row.id, notified };
}

/** Sends a message to the company's Telegram chat. Needs TELEGRAM_BOT_TOKEN and config.telegramChatId.
 *  Failure never breaks the chat: the lead is already saved and visible in /admin. */
export async function notifyTelegram(tenant: Tenant, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = tenant.config.telegramChatId;
  if (!token || !chatId) return false;
  const base = process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org";
  try {
    const res = await fetch(`${base}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (e) {
    console.error("telegram notify failed", e);
    return false;
  }
}
