import { notFound } from "next/navigation";
import Chat from "@/components/Chat";
import { loadTenant } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

// The chat window itself. Companies embed it with /widget.js; it can also be opened directly.
export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { debug?: string };
}) {
  const bundle = await loadTenant(params.slug);
  if (!bundle) notFound();
  const { tenant } = bundle;
  return (
    <main className="embed">
      <Chat
        slug={tenant.slug}
        name={tenant.name}
        greeting={tenant.config.greeting}
        showDebug={searchParams.debug === "1"}
      />
    </main>
  );
}
