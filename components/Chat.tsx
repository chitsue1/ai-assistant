"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type Route = "FAQ" | "LLM" | "GUARD" | "DEMO" | "ERROR";
type Msg = {
  role: "user" | "assistant";
  text: string;
  route?: Route;
  costUsd?: number;
  latencyMs?: number;
  detail?: string;
};

const ROUTE_LABEL: Record<Route, string> = {
  FAQ: "მზა პასუხი",
  LLM: "Claude Haiku",
  GUARD: "დაცვა",
  DEMO: "დემო რეჟიმი",
  ERROR: "AI მიუწვდომელია",
};

export default function Chat({
  slug,
  name,
  greeting,
  showDebug,
}: {
  slug: string;
  name: string;
  greeting: string;
  showDebug: boolean;
}) {
  const storageKey = `assistant-conv-${slug}`;
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", text: greeting }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationId = useRef<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      conversationId.current = sessionStorage.getItem(storageKey) ?? undefined;
    } catch {
      /* storage blocked: a new conversation each page load is fine */
    }
  }, [storageKey]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, message: text, conversationId: conversationId.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      conversationId.current = data.conversationId;
      try {
        sessionStorage.setItem(storageKey, data.conversationId);
      } catch {
        /* ignore */
      }
      const d = data.debug ?? {};
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.reply,
          route: data.route,
          costUsd: d.costUsd ?? 0,
          latencyMs: d.latencyMs,
          detail:
            data.route === "FAQ"
              ? `დამთხვევა ${Math.round((d.faqScore ?? 0) * 100)}%`
              : d.leadSaved
                ? "ნომერი შენახულია"
                : d.tokens
                ? `${d.tokens.input + d.tokens.cacheRead + d.tokens.cacheWrite} ტოკენი შემავალი, ${d.tokens.output} გამავალი`
                : undefined,
        },
      ]);
    } catch {
      setError("პასუხი ვერ მივიღეთ. სცადეთ ხელახლა.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      <header className="chat-head">
        <span className="dot" aria-hidden />
        <div>
          <p className="chat-name">{name}</p>
          <p className="chat-sub">AI ასისტენტი</p>
        </div>
      </header>

      <div className="chat-list" ref={listRef} aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <p className="bubble">{m.text}</p>
            {showDebug && m.route && (
              <p className={`meta route-${m.route}`}>
                {ROUTE_LABEL[m.route]} · ${(m.costUsd ?? 0).toFixed(5)}
                {m.latencyMs != null && ` · ${(m.latencyMs / 1000).toFixed(2)} წმ`}
                {m.detail && ` · ${m.detail}`}
              </p>
            )}
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <p className="bubble typing">წერს…</p>
          </div>
        )}
      </div>

      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}

      <form className="chat-form" onSubmit={send}>
        <label htmlFor="chat-input" className="sr-only">
          შეტყობინება
        </label>
        <input
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="დაწერეთ კითხვა…"
          maxLength={800}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !input.trim()}>
          გაგზავნა
        </button>
      </form>
    </div>
  );
}
