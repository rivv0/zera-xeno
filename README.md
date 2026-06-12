# Zera CRM — AI-Native Zero-Waste Mini CRM

Zera is an AI-native mini CRM purpose-built for D2C zero-waste and refill brands. It computes predicted product depletion dates based on order history and SKU consumption rates, then automatically generates campaign recommendations every morning using Claude.

The system is composed of two main backend services and a React frontend:
1. **crm-service**: Core Express app (ingestion, segmentation, campaign scheduling, receipt webhook, React frontend).
2. **channel-service**: Delivery simulator exposing a mock sending API and asynchronously posting callback events (`sent` -> `delivered`/`failed` -> `opened` -> `clicked`) to the CRM webhook.
3. **React frontend**: A premium dashboard built in React + Vite for viewing daily briefs, custom segments builder, and live delivery funnel tracking.

---

## Prerequisites
- **Node.js** ≥ 20
- **PostgreSQL** ≥ 16 (Either running locally or via Docker)
- **Redis** (Either running locally or via Docker)
- *Optional:* **Docker** & **Docker Compose**

---

## Getting Started

### 1. Copy Environment Configuration
Copy the `.env.example` at the repository root to `.env`:
```bash
cp .env.example .env
```
Modify `.env` to include your Anthropic API Key (`ANTHROPIC_API_KEY`). If the key is not set, the AI Daily Brief and Segment Builder will fall back to cache and mock responses gracefully.

### 2. Start PostgreSQL & Redis

#### Option A: Docker Compose (Recommended if Docker is installed)
Start the database and Redis services in the background:
```bash
docker-compose up -d
```

#### Option B: Native macOS (via Homebrew)
If you don't have Docker installed, start PostgreSQL and Redis via Homebrew:
```bash
brew install postgresql@16
brew install redis
brew services start postgresql@16
brew services start redis
```
Create the database and user configured in the default connection string:
```bash
createuser -s zera
createdb zera_db -O zera
psql -d zera_db -c "ALTER USER zera WITH PASSWORD 'zera';"
```

### 3. Install Dependencies & Seed
Install all package dependencies and populate the database with realistic D2C zero-waste shopper data:

```bash
# Install CRM Service dependencies & apply DB schema
cd zera/crm-service
npm install
psql -d zera_db -U zera -f src/db/schema.sql

# Seed the database
npm run seed

# Install Channel Service dependencies
cd ../channel-service
npm install

# Install Frontend dependencies
cd ../crm-service/frontend
npm install
```

### 4. Run the Stack
Run all three services locally:

```bash
# Terminal 1: Start CRM Service (runs on port 3000)
cd zera/crm-service
npm run dev

# Terminal 2: Start Channel Service (runs on port 4001)
cd zera/channel-service
npm run dev

# Terminal 3: Start Frontend Dev Server (runs on http://localhost:5173)
cd zera/crm-service/frontend
npm run dev
```

Open your browser to [http://localhost:5173](http://localhost:5173).

---

## Running Tests

Test suites can be executed inside their respective directories:

```bash
# Run CRM Service tests
cd zera/crm-service
npm run test

# Run Frontend tests
cd zera/crm-service/frontend
npm run test
```

---

## Scale Tradeoffs & Architectural Decisions

Consistent with Xeno's engineering principles, we made specific architectural trade-offs appropriate for this MVP's scope, with clear upgrade paths for production scaling:

### 1. Refill Cadence Prediction: Static SQL Arithmetic vs. Bayesian Survival Modeling (Weibull Distribution)
* **Decision:** Used a deterministic SQL date projection (`ordered_at + avg_consumption_days`) inside `src/index.js`.
* **Rationale:** Simple to audit, test, and computationally inexpensive for a localized dataset.
* **At Scale (I'd do X):** Real-world shopper consumption is highly variable (e.g., detergent consumption increases during holidays or slows down during travel). In production, we would implement a **Bayesian survival analysis model** (such as a Weibull hazard model) that dynamically updates consumption parameters based on individual feedback loops (e.g., if a shopper consistently repurchases their 30-day Dish Soap on day 35, the model shifts their individual cadence). These scores would be computed asynchronously in a Spark/Flink pipeline and written to a Redis feature store, rather than calculating intervals on the fly in Postgres.

### 2. Channel Delivery: Single-Queue BullMQ vs. Multi-Tenant Priority Shard Pools with Dynamic Throttle Backoff
* **Decision:** Configured a single BullMQ queue with a worker concurrency of 1.
* **Rationale:** Successfully decouples API latency from channel delivery processing and ensures orderly processing.
* **At Scale (I'd do X):** Telecommunication gateways (especially WhatsApp Business and RCS APIs) enforce strict rate limits (TPS) and apply severe quality rating penalties (including account suspensions) if user-report or opt-out rates surge. At scale, we would shard the outbound queue by `brand_id` and `channel_type`, running a Token Bucket rate-limiter. The worker would monitor carrier status codes and dynamically apply exponential backoff, or even automatically reroute the campaign (e.g., fall back from WhatsApp to SMS) if a brand's carrier quality rating drops.

### 3. Database Write Performance: In-place Status Updates vs. Event Sourcing on LSM/Time-Series Stores
* **Decision:** Performed transactional `UPDATE` statements directly on the `communications` table, with insert triggers appending audit rows to `comm_events`.
* **Rationale:** Simplifies relational joins and ensures campaign stats are kept up-to-date and easily queryable inside a single transactional database.
* **At Scale (I'd do X):** Running millions of updates on a single table due to carrier webhook bursts causes severe lock contention, table bloat, and database degradation. In production, we would adopt **Event Sourcing**—writing all delivery callbacks as immutable, append-only logs into a high-throughput time-series store (like TimescaleDB or ClickHouse). We would then project campaign funnel aggregates asynchronously via background materialization or Kafka consumer streams, leaving the main database completely free of write locks.

### 4. Natural Language Segment Builder: Prompt-to-JSON Direct Parsing vs. Two-Pass AST Compiler
* **Decision:** Used direct prompt-to-JSON translation via Llama 3.3 in `ai.js`, followed by whitelist checks in `segmentResolver.js`.
* **Rationale:** Low latency, easy to maintain with structured prompts, and sufficient for validating simple rule sets.
* **At Scale (I'd do X):** Allowing AI models to directly dictate database query arguments is vulnerable to prompt injection and database structure hallucinations. At scale, we would implement a **Two-Pass AST Compiler**: the LLM translates the prompt into a restricted Abstract Syntax Tree (AST) validated against a JSON Schema. A compiler (such as a whitelisted Knex.js query builder) then parses this AST, verifying that columns, operators, and parameters belong to a strict, pre-approved list before compiling the SQL.

### 5. PII and Data Privacy: Raw Text Transmission vs. Tokenized Message Templating & KMS Encryption
* **Decision:** Transmitted raw rendered message strings (containing customer names, product names, and message body) to the simulator over HTTP.
* **Rationale:** Practical and readable for testing and debugging simulated communications locally.
* **At Scale (I'd do X):** Transmitting and storing customer PII (names, contact details) in raw text violates modern privacy compliance regulations (GDPR, DPDPA). At scale, we would implement **Tokenized Templating**—the worker only passes a pre-approved template ID and a variables payload to the delivery gateway, rather than a raw message string. In addition, all stored customer profiles and message histories in the database would be encrypted at the field level using AWS KMS envelope encryption.

### 6. Live Dashboard Monitoring: 5-Second REST Polling vs. Redis Pub/Sub WebSocket Gateway
* **Decision:** Implemented a client-side 5-second REST polling loop to fetch statistics and broadcast logs.
* **Rationale:** Robust, stateless, requires no persistent connection management on the backend, and handles client disconnects gracefully.
* **At Scale (I'd do X):** Having thousands of marketers actively polling aggregate endpoints would overwhelm database resources. We would deploy a WebSocket gateway cluster. When delivery webhooks are received, the CRM service publishes an event to a Redis Pub/Sub channel. The WebSocket gateway subscribes to this channel and streams updates to connected client browser sessions instantly, keeping database connections dedicated exclusively to write tasks.

