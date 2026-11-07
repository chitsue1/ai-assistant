-- One database serves many companies ("tenants"). Every row belongs to a tenant.

CREATE TABLE IF NOT EXISTS tenants (
  id          SERIAL PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,          -- used in the widget URL: /embed/<slug>
  name        TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',   -- tone, contacts, hours, greeting, handoff text
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ready-made answers. ACTIVE ones answer instantly without calling the AI.
-- CANDIDATE ones were suggested from real AI answers and wait for a human to approve.
CREATE TABLE IF NOT EXISTS faq_entries (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  phrasings   TEXT[] NOT NULL DEFAULT '{}',  -- other ways people ask the same thing
  answer      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANDIDATE', 'REJECTED')),
  hits        INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS faq_tenant_status ON faq_entries (tenant_id, status);

-- The company's knowledge, cut into small pieces the AI can be given as context.
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,                 -- file name or URL
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chunks_tenant ON knowledge_chunks (tenant_id);

CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,              -- random id kept by the browser
  tenant_id   INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every message, with how it was answered and what it cost. This is the observability layer's raw data.
CREATE TABLE IF NOT EXISTS messages (
  id                 SERIAL PRIMARY KEY,
  conversation_id    TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role               TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content            TEXT NOT NULL,
  route              TEXT CHECK (route IN ('FAQ', 'LLM', 'GUARD', 'DEMO')),
  faq_id             INT REFERENCES faq_entries(id) ON DELETE SET NULL,
  match_score        REAL,
  input_tokens       INT,
  output_tokens      INT,
  cache_read_tokens  INT,
  cache_write_tokens INT,
  cost_usd           DOUBLE PRECISION,
  latency_ms         INT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conv ON messages (conversation_id, created_at);
