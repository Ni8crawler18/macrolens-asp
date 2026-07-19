# MacroLens — free-text meal macro analysis as a paid agent service

**OKX.AI Genesis Hackathon — Lifestyle Companion track.**

MacroLens is an **Agentic Service Provider (ASP)**: a nutrition micro-service that *other AI agents pay to call*. When a lifestyle-companion agent's user says "I had 2 eggs, toast with butter, a banana and a glass of milk", the agent calls MacroLens over MCP, pays $0.02 per call via the x402 payment protocol, and gets back a per-item macro breakdown, totals and balance advice — no food database or parsing logic of its own required.

## What it does

One MCP tool, `analyze_macros`:

| Input | Type | Notes |
|---|---|---|
| `meal_description` | string | free text, e.g. `"2 eggs, toast with butter, a banana and a glass of milk"` |

Output:

- `items`: per-item breakdown `{item, matched_food, quantity_assumed, calories, protein_g, carbs_g, fat_g, fiber_g}`
- `totals` and `macro_split` (% of calories from protein/carbs/fat)
- `suggestions`: macro-balance advice (low protein, low fiber, carb-heavy, oversized meal, ...)
- `unmatched`: segments it could not recognize (reported, never silently dropped)

Backed by `src/data/foodDb.ts` — ~85 common foods (Western + Indian staples: roti, dal, dosa, idli, paneer, poha...) with per-100g macros and keyword aliases — and a parser that splits on commas/"and"/"with", matches the **longest alias** ("skim milk" beats "milk", "peanut butter" beats "peanut"), and applies quantity heuristics: digits and number words ("two", "half"), units (`slice`, `cup`, `glass`, `bowl`, `tbsp`, `scoop`, `150g`, `oz`...), natural piece weights ("2 eggs" = 2 x 50 g), and sensible default portions otherwise.

> Estimates for lifestyle guidance, not medical/clinical nutrition data.

## AI enrichment (optional)

MacroLens can use Claude as a fallback estimator for foods the local database
cannot match. When enrichment is enabled and a request contains unmatched
segments (e.g. `"half a bowl of hyderabadi biryani"`), the server makes **one**
Claude call with all unmatched strings and merges the estimates into the
response:

- every item gains a `source` field: `"database"` (deterministic DB match) or
  `"ai_estimate"` (Claude estimate; no `matched_food` field)
- AI-estimated items are included in `totals`, `macro_split` and the
  `suggestions` logic, and are removed from `unmatched`
- non-food segments come back as zero-macro items rather than guesses

The call uses structured outputs (a strict JSON schema), `max_tokens` ≤ 2000
and a 15 s timeout. On any error or timeout the server logs one warning line
and returns exactly the deterministic result. With enrichment disabled the
service behaves byte-for-byte as before (no `source` fields).

Configuration (see `.env.example`):

| Env var | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Setting a key enables enrichment (the SDK's own credential resolution is used — the client is constructed with no arguments) |
| `ENRICH_ENABLED` | `true` forces enrichment on even without the env var key (e.g. when credentials come from an `ant auth` profile) |
| `ENRICH_MODEL` | Model to use; defaults to `claude-haiku-4-5` |

**Cost note:** with the default Haiku model a typical call is roughly
**$0.003–0.006** (small prompt, ≤2000 output tokens) — below the
$0.02 x402 price per call. Enrichment only fires when there are unmatched
items, so fully-matched meals cost nothing extra.

## Architecture

```
src/
  server.ts          Express app: MCP Streamable HTTP at /mcp (stateless) + REST at /api/macros
  x402.ts            OKX x402 payment middleware (@okxweb3/x402-express, env-gated no-op by default)
  schemas.ts         Zod input schema (shared by MCP tool and REST)
  tools/macros.ts    pure, unit-tested parser + analyzer
  enrich.ts          optional Claude enrichment layer (LLM fallback for unmatched foods)
  data/foodDb.ts     ~85-food macro database with aliases and portion heuristics
test/macros.test.ts  node:test unit tests
test/enrich.test.ts  enrichment tests (mocked client, no network)
```

## Run it

```bash
npm install
npm run dev        # tsx, listens on :4022
# or
npm run build && npm start
npm test           # unit tests (node:test via tsx)
```

## Try it

REST (easiest demo):

```bash
curl -s -X POST http://localhost:4022/api/macros \
  -H 'Content-Type: application/json' \
  -d '{"meal_description":"2 eggs, toast with butter, a banana and a glass of milk"}'
```

Sample response:

```json
{
  "items": [
    {"item": "2 eggs", "matched_food": "egg", "quantity_assumed": "2 x 50 g (100 g)", "calories": 155, "protein_g": 13, "carbs_g": 1.1, "fat_g": 11, "fiber_g": 0},
    {"item": "toast", "matched_food": "white bread", "quantity_assumed": "default portion (30 g)", "calories": 80, "protein_g": 2.7, "carbs_g": 14.7, "fat_g": 1, "fiber_g": 0.8},
    {"item": "butter", "matched_food": "butter", "quantity_assumed": "default portion (10 g)", "calories": 72, "protein_g": 0.1, "carbs_g": 0, "fat_g": 8.1, "fiber_g": 0},
    {"item": "a banana", "matched_food": "banana", "quantity_assumed": "1 x 118 g (118 g)", "calories": 105, "protein_g": 1.3, "carbs_g": 27.1, "fat_g": 0.4, "fiber_g": 3.1},
    {"item": "a glass of milk", "matched_food": "whole milk", "quantity_assumed": "1 glass (240 g)", "calories": 146, "protein_g": 7.7, "carbs_g": 11.5, "fat_g": 7.9, "fiber_g": 0}
  ],
  "totals": {"calories": 558, "protein_g": 24.8, "carbs_g": 54.4, "fat_g": 28.4, "fiber_g": 3.9},
  "macro_split": {"protein_pct": 17, "carbs_pct": 38, "fat_pct": 45},
  "suggestions": ["Only 3.9 g fiber. Add vegetables, fruit, legumes or whole grains toward the ~30 g/day target."],
  "unmatched": []
}
```

MCP (what other agents call):

```bash
# list tools
curl -s -X POST http://localhost:4022/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# call the tool
curl -s -X POST http://localhost:4022/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"analyze_macros","arguments":{"meal_description":"a bowl of dal, 2 rotis and a glass of skim milk"}}}'
```

## OKX payment

Paid calls are settled via OKX's official x402 seller middleware
(`@okxweb3/x402-express` + `@okxweb3/x402-core` + `@okxweb3/x402-evm`) against
the OKX facilitator on **X Layer** (`eip155:196`).

| Route              | Price |
| ------------------ | ----- |
| `POST /api/macros` | $0.02 |

Env vars (all four OKX values plus `PAYMENT_ENABLED=true` are required to
activate payments; create keys at <https://web3.okx.com/onchainos/dev-portal>):

```bash
PAYMENT_ENABLED=true
OKX_API_KEY=...
OKX_SECRET_KEY=...
OKX_PASSPHRASE=...
PAY_TO_ADDRESS=0xYourReceivingAddress
```

With payment active, unpaid requests to the paid route get **HTTP 402** with an
`x402Version: 2` payment-required body listing the accepted `exact`-scheme
X Layer payment option. If any variable is missing, or OKX initialization
fails, the server logs one line and serves everything free — deploys stay safe
until real keys exist. `/healthz`, `/` and `/mcp` are never payment-gated.

## Register as an ASP on OKX.AI

1. Deploy this server to a public HTTPS URL (any Node host).
2. Enable payments (`PAYMENT_ENABLED=true`) with your receiving address.
3. Follow the OKX.AI ASP tutorial — <https://www.okx.ai/tutorial/asp> — to register the service, pointing the MCP endpoint at `https://your-host/mcp` so OKX.AI agents can discover `analyze_macros` and pay per call via x402.
