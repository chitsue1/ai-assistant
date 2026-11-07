-- Phase 2: customers who leave their contact details, and a route for failed AI calls.

CREATE TABLE IF NOT EXISTS leads (
  id               SERIAL PRIMARY KEY,
  tenant_id        INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id  TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  name             TEXT,
  phone            TEXT NOT NULL,
  topic            TEXT NOT NULL,            -- what the customer needs, in one line
  notified         BOOLEAN NOT NULL DEFAULT false,  -- sent to the company's Telegram
  status           TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'CLOSED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_tenant ON leads (tenant_id, created_at DESC);

-- 'ERROR' = the AI could not be reached; the customer got the handoff text instead of an error.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_route_check;
ALTER TABLE messages ADD CONSTRAINT messages_route_check CHECK (route IN ('FAQ', 'LLM', 'GUARD', 'DEMO', 'ERROR'));
