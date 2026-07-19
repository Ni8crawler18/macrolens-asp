import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/server.js";

// With payment disabled (the default in test/dev environments) the paid REST
// route must serve normally — no 402, no OKX credentials required.
test("paid route serves normally when payment is disabled", async () => {
  delete process.env.PAYMENT_ENABLED;
  // Keep the test deterministic and offline.
  delete process.env.ANTHROPIC_API_KEY;
  process.env.ENRICH_ENABLED = "false";

  const app = await createApp();
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/macros`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meal_description: "2 eggs, toast with butter and a banana" }),
    });
    assert.equal(res.status, 200, "expected the paid route to serve without payment");
    const body = (await res.json()) as { items?: unknown[]; totals?: unknown };
    assert.ok(body.totals !== undefined, "expected a macro analysis body");
  } finally {
    server.close();
  }
});
