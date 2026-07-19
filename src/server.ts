import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { macrosInputShape, MacrosInput } from "./schemas.js";
import { analyzeMacrosWithAi } from "./tools/macros.js";
import { enrichmentEnabled, enrichmentModel } from "./enrich.js";
import { buildPaymentMiddleware, loadPaymentConfig } from "./x402.js";

// Load .env if present (Node 22 built-in; no dotenv dependency needed).
try {
  process.loadEnvFile();
} catch {
  /* no .env file - fine */
}

const SERVICE = {
  name: "macrolens",
  version: "1.0.0",
  description:
    "MacroLens - free-text meal macro analysis. An Agentic Service Provider other AI agents pay per call to use.",
};

function createMcpServer(): McpServer {
  const server = new McpServer({ name: SERVICE.name, version: SERVICE.version });

  server.registerTool(
    "analyze_macros",
    {
      title: "Analyze meal macros",
      description:
        "Parses a free-text meal description (e.g. '2 eggs, toast with butter, a banana and a glass of milk') " +
        "into a per-item macro breakdown (calories, protein, carbs, fat, fiber) with sensible portion " +
        "assumptions, plus totals, macro split and actionable balance suggestions.",
      inputSchema: macrosInputShape,
    },
    async (args) => {
      const analysis = await analyzeMacrosWithAi(args.meal_description);
      return { content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }] };
    },
  );

  return server;
}

export async function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const paymentCfg = loadPaymentConfig();
  app.use(await buildPaymentMiddleware(["/mcp", "/api/macros"], paymentCfg));

  // ---- Service discovery / health ----
  app.get("/", (_req, res) => {
    res.json({
      ...SERVICE,
      mcp_endpoint: "/mcp",
      rest_endpoints: { "POST /api/macros": "same logic as the MCP tool, plain JSON" },
      tools: ["analyze_macros"],
      payment: {
        enabled: paymentCfg.enabled,
        price_per_call: paymentCfg.price,
        network: paymentCfg.network,
        protocol: "x402",
      },
      ai_enrichment: {
        enabled: enrichmentEnabled(),
        model: enrichmentEnabled() ? enrichmentModel() : null,
        behavior: "LLM fallback estimates for foods the local DB cannot match",
      },
    });
  });
  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  // ---- MCP Streamable HTTP endpoint (stateless) ----
  app.post("/mcp", async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[mcp] request failed:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const methodNotAllowed = (_req: express.Request, res: express.Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. This server runs stateless Streamable HTTP: POST only." },
      id: null,
    });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  // ---- Plain REST endpoint for demos / curl ----
  app.post("/api/macros", async (req, res) => {
    const parsed = MacrosInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    res.json(await analyzeMacrosWithAi(parsed.data.meal_description));
  });

  return app;
}

const PORT = Number(process.env.PORT ?? 4022);

createApp()
  .then((app) => {
    app.listen(PORT, () => {
      const cfg = loadPaymentConfig();
      console.log(`MacroLens ASP listening on http://localhost:${PORT}`);
      console.log(`  MCP endpoint:  POST http://localhost:${PORT}/mcp`);
      console.log(`  REST endpoint: POST http://localhost:${PORT}/api/macros`);
      console.log(`  x402 payments: ${cfg.enabled ? `ENABLED (${cfg.price} on ${cfg.network} -> ${cfg.payTo})` : "disabled (dev mode)"}`);
      console.log(`  AI enrichment: ${enrichmentEnabled() ? `ENABLED (${enrichmentModel()})` : "disabled (deterministic only)"}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start MacroLens:", err);
    process.exit(1);
  });
