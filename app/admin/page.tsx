import { revalidatePath } from "next/cache";
import { q } from "@/lib/db";
import { invalidateTenant } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

// Simple admin for one person: open /admin?token=YOUR_ADMIN_TOKEN
// Phase 2 replaces this with real logins per company (layer 05: Access).

function authorized(token?: string) {
  return Boolean(process.env.ADMIN_TOKEN) && token === process.env.ADMIN_TOKEN;
}

async function review(formData: FormData) {
  "use server";
  if (!authorized(String(formData.get("token")))) return;
  const id = Number(formData.get("id"));
  const decision = String(formData.get("decision"));
  const answer = String(formData.get("answer") ?? "").trim();
  const [row] = await q<{ slug: string }>(
    `UPDATE faq_entries f SET status = $2, answer = CASE WHEN $3 = '' THEN f.answer ELSE $3 END, updated_at = now()
     FROM tenants t WHERE f.id = $1 AND t.id = f.tenant_id RETURNING t.slug`,
    [id, decision === "approve" ? "ACTIVE" : "REJECTED", answer],
  );
  if (row) invalidateTenant(row.slug);
  revalidatePath("/admin");
}

export default async function Admin({ searchParams }: { searchParams: { token?: string } }) {
  if (!authorized(searchParams.token)) {
    return (
      <main className="admin">
        <h1>Admin</h1>
        <p className="muted">Open this page as /admin?token=… using the ADMIN_TOKEN from your settings.</p>
      </main>
    );
  }
  const token = searchParams.token!;

  const routes = await q<{ route: string; n: string; cost: string | null; avg_ms: string | null }>(
    `SELECT route, count(*) AS n, sum(cost_usd) AS cost, avg(latency_ms) AS avg_ms
     FROM messages WHERE role = 'assistant' GROUP BY route ORDER BY n DESC`,
  );
  const candidates = await q<{ id: number; company: string; question: string; phrasings: string[]; answer: string; hits: number }>(
    `SELECT f.id, t.name AS company, f.question, f.phrasings, f.answer, f.hits
     FROM faq_entries f JOIN tenants t ON t.id = f.tenant_id
     WHERE f.status = 'CANDIDATE' ORDER BY f.hits DESC, f.created_at DESC LIMIT 50`,
  );
  const recent = await q<{ created_at: Date; question: string; reply: string; route: string; cost_usd: number | null; latency_ms: number | null }>(
    `SELECT a.created_at, u.content AS question, a.content AS reply, a.route, a.cost_usd, a.latency_ms
     FROM messages a
     JOIN LATERAL (SELECT content FROM messages u WHERE u.conversation_id = a.conversation_id AND u.id < a.id AND u.role = 'user'
                   ORDER BY u.id DESC LIMIT 1) u ON true
     WHERE a.role = 'assistant' ORDER BY a.id DESC LIMIT 30`,
  );

  return (
    <main className="admin">
      <h1>Admin</h1>
      <p className="muted">How questions were answered and what it cost.</p>

      <table>
        <thead>
          <tr><th>Route</th><th>Answers</th><th>AI cost (USD)</th><th>Avg. time</th></tr>
        </thead>
        <tbody>
          {routes.map((r) => (
            <tr key={r.route}>
              <td>{r.route}</td>
              <td>{r.n}</td>
              <td>${Number(r.cost ?? 0).toFixed(5)}</td>
              <td>{r.avg_ms ? `${(Number(r.avg_ms) / 1000).toFixed(2)} s` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Suggested ready answers ({candidates.length})</h2>
      <p className="muted">
        New questions the AI answered. Approve one and the same question is answered for free next time. Edit the answer
        first if needed.
      </p>
      {candidates.length === 0 ? (
        <p className="muted">Nothing to review yet.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Question</th><th>Asked</th><th>Answer</th><th></th></tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.question}
                  <div className="muted">{c.company}</div>
                  {c.phrasings.length > 0 && <div className="muted">also: {c.phrasings.join(" · ")}</div>}
                </td>
                <td>{c.hits}×</td>
                <td colSpan={2}>
                  <form action={review}>
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="id" value={c.id} />
                    <textarea name="answer" defaultValue={c.answer} aria-label="Answer" />
                    <div className="actions">
                      <button className="approve" name="decision" value="approve">Approve</button>
                      <button name="decision" value="reject">Reject</button>
                    </div>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Latest answers</h2>
      <table>
        <thead>
          <tr><th>Question</th><th>Answer</th><th>Route</th><th>Cost</th></tr>
        </thead>
        <tbody>
          {recent.map((m, i) => (
            <tr key={i}>
              <td>{m.question}</td>
              <td>{m.reply}</td>
              <td>{m.route}</td>
              <td>{m.cost_usd != null ? `$${m.cost_usd.toFixed(5)}` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
