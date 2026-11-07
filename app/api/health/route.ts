import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// Railway calls this after each deploy; it only goes live if the app can reach the database.
export async function GET() {
  try {
    await q("SELECT 1");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
