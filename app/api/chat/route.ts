import { NextResponse } from "next/server";
import { answer, NotFoundError } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Very simple abuse protection: at most 20 messages per minute from one IP.
// Fine for one server; with several servers use Redis or Upstash instead.
const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many messages. Wait a minute and try again." }, { status: 429 });
  }

  let body: { slug?: string; message?: string; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON: { slug, message, conversationId? }" }, { status: 400 });
  }
  if (!body.slug || !body.message?.trim()) {
    return NextResponse.json({ error: "slug and message are required" }, { status: 400 });
  }

  try {
    const result = await answer(body.slug, body.message, body.conversationId);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    console.error("chat error", e);
    return NextResponse.json({ error: "The assistant could not answer right now. Try again." }, { status: 500 });
  }
}
