import Chat from "@/components/Chat";
import { q } from "@/lib/db";
import { loadTenant } from "@/lib/knowledge";
import { aiEnabled } from "@/lib/llm";

export const dynamic = "force-dynamic";

const DEMO_SLUG = process.env.DEMO_SLUG ?? "fixlab-demo";

async function stats(tenantId: number) {
  const [row] = await q<{ total: string; faq: string; llm: string; cost: string | null }>(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE m.route = 'FAQ') AS faq,
            count(*) FILTER (WHERE m.route = 'LLM') AS llm,
            sum(m.cost_usd) AS cost
     FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.tenant_id = $1 AND m.role = 'assistant'`,
    [tenantId],
  );
  const total = Number(row.total);
  return {
    total,
    faqShare: total ? Math.round((Number(row.faq) / total) * 100) : 0,
    llm: Number(row.llm),
    cost: Number(row.cost ?? 0),
  };
}

export default async function Home() {
  const bundle = await loadTenant(DEMO_SLUG);
  if (!bundle) {
    return (
      <main className="home">
        <p>The demo company is not loaded yet. Run: npm run db:migrate && npm run seed</p>
      </main>
    );
  }
  const s = await stats(bundle.tenant.id);

  return (
    <main className="home">
      <section className="intro">
        <h1>AI ასისტენტი ქართული ბიზნესისთვის</h1>
        <p className="lead">
          საიტის ჩატბოტი, რომელიც კომპანიის მონაცემებით ქართულად პასუხობს. ხშირ კითხვებზე პასუხს უფასოდ, მზა
          შაბლონებიდან იღებს, ახალ კითხვებზე კი Claude Haiku-ს მიმართავს.
        </p>

        <ol className="steps">
          <li>
            <strong>მზა პასუხი.</strong> კითხვა ედრება კომპანიის შაბლონებს, ქართული და ლათინური ასოებით დაწერილიც.
            თუ ემთხვევა, პასუხი მყისიერია და არაფერი ღირს.
          </li>
          <li>
            <strong>ცოდნის ძებნა.</strong> თუ არ ემთხვევა, სისტემა ცოდნის ბაზიდან შესაბამის ნაწილებს არჩევს.
          </li>
          <li>
            <strong>Claude Haiku.</strong> მოდელი პასუხს მხოლოდ ამ ნაწილებზე დაყრდნობით წერს და ფაქტებს არ იგონებს.
          </li>
          <li>
            <strong>სწავლა.</strong> ახალი კითხვები შაბლონის კანდიდატებად ინახება. ადამიანი ამოწმებს და
            ამტკიცებს, შემდეგ ჯერზე კი იგივე კითხვა უფასოდ იპასუხება.
          </li>
        </ol>

        <dl className="stats">
          <div>
            <dt>პასუხი სულ</dt>
            <dd>{s.total}</dd>
          </div>
          <div>
            <dt>მზა შაბლონიდან</dt>
            <dd>{s.faqShare}%</dd>
          </div>
          <div>
            <dt>AI ხარჯი სულ</dt>
            <dd>${s.cost.toFixed(4)}</dd>
          </div>
        </dl>

        <p className="note">
          სადემონსტრაციო კომპანია FixLab გამოგონილია. სცადეთ: „სად მდებარეობთ?“, „garantia gaqvt?“ ან „რა ღირს
          iPhone 13-ის ეკრანის გამოცვლა?“
          {!aiEnabled() && " AI ახლა გამორთულია, ამიტომ ახალ კითხვებზე დემო რეჟიმი ჩანს."}
        </p>
      </section>

      <section className="demo" aria-label="ჩატის დემო">
        <Chat slug={bundle.tenant.slug} name={bundle.tenant.name} greeting={bundle.tenant.config.greeting} showDebug />
      </section>
    </main>
  );
}
