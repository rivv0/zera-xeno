-- Customers
CREATE TABLE customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  phone            TEXT,
  channel_preference TEXT CHECK (channel_preference IN ('whatsapp', 'sms', 'email')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Product profiles (SKUs)
CREATE TABLE product_profiles (
  sku_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  category            TEXT NOT NULL,
  avg_consumption_days INTEGER NOT NULL CHECK (avg_consumption_days >= 1),
  price               NUMERIC(10, 2) NOT NULL CHECK (price >= 0.01)
);

-- Orders
CREATE TABLE orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sku_id      UUID NOT NULL REFERENCES product_profiles(sku_id) ON DELETE RESTRICT,
  quantity    INTEGER NOT NULL CHECK (quantity >= 1),
  amount      NUMERIC(10, 2) NOT NULL CHECK (amount > 0.00),
  ordered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campaigns
CREATE TABLE campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  segment_query    JSONB,
  message_template TEXT NOT NULL,
  channel          TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email')),
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Communications (one per recipient per campaign)
CREATE TABLE communications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email')),
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'opened', 'clicked')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comm events (immutable audit log)
CREATE TABLE comm_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comm_id    UUID NOT NULL REFERENCES communications(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'delivered', 'failed', 'opened', 'clicked')),
  occurred_at TIMESTAMPTZ NOT NULL
);

-- Transactional Outbox Events
CREATE TABLE outbox_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_orders_customer_sku ON orders(customer_id, sku_id, ordered_at DESC);
CREATE INDEX idx_communications_campaign ON communications(campaign_id, status);
CREATE INDEX idx_comm_events_comm ON comm_events(comm_id, event_type);
