/**
 * OKX x402 payment middleware for MacroLens's paid REST endpoints.
 *
 * Wires OKX's official seller-side x402 stack (@okxweb3/x402-express +
 * @okxweb3/x402-core + @okxweb3/x402-evm) against the OKX facilitator on
 * X Layer (eip155:196).
 *
 * Activation rule: payment is enforced only when PAYMENT_ENABLED === "true"
 * AND all of OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE, PAY_TO_ADDRESS are
 * set. In every other case `installOkxPayment` is a no-op, so deploys stay
 * safe until real credentials exist. Any initialization failure (bad keys,
 * unreachable facilitator) logs a warning and leaves the app free — it never
 * crashes the server.
 *
 * API notes (verified against the installed packages):
 *   - paymentMiddleware(routes, resourceServer, paywallConfig?, paywall?,
 *     syncFacilitatorOnStart?) — routes first, server second.
 *   - OKXFacilitatorClient takes { apiKey, secretKey, passphrase, syncSettle? };
 *     the `syncSettle` flag lives on the client config, not on the per-route
 *     payment option.
 *   - We call resourceServer.initialize() ourselves (with a timeout) and pass
 *     syncFacilitatorOnStart=false, so a failing facilitator can never reject
 *     an unhandled promise inside the middleware and take the process down.
 */
import type { Express } from "express";
import { paymentMiddleware, x402ResourceServer, type Network } from "@okxweb3/x402-express";
import type { RoutesConfig } from "@okxweb3/x402-core/server";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";

/** X Layer mainnet (CAIP-2). */
export const NETWORK: Network = "eip155:196";

/** Paid REST routes and their on-chain listing prices. */
export const PAID_ROUTES: ReadonlyArray<{
  route: string;
  price: string;
  description: string;
}> = [
  {
    route: "POST /api/macros",
    price: "$0.02",
    description:
      "MacroLens: free-text meal description to per-item macro breakdown, totals and balance advice",
  },
];

export interface OkxPaymentStatus {
  /** True when the OKX payment middleware is installed and enforcing. */
  enabled: boolean;
  detail: string;
}

const REQUIRED_ENV = [
  "OKX_API_KEY",
  "OKX_SECRET_KEY",
  "OKX_PASSPHRASE",
  "PAY_TO_ADDRESS",
] as const;

const INIT_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Install the OKX x402 payment middleware on `app` (call BEFORE registering
 * routes). Gates only the REST routes in PAID_ROUTES — never /healthz, `/`
 * (discovery) or /mcp.
 */
export async function installOkxPayment(app: Express): Promise<OkxPaymentStatus> {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (process.env.PAYMENT_ENABLED !== "true" || missing.length > 0) {
    console.log(
      `[x402] payment disabled (${
        process.env.PAYMENT_ENABLED !== "true"
          ? 'PAYMENT_ENABLED != "true"'
          : `missing env: ${missing.join(", ")}`
      }) — all endpoints free`,
    );
    return { enabled: false, detail: "payment disabled" };
  }

  try {
    const facilitatorClient = new OKXFacilitatorClient({
      apiKey: process.env.OKX_API_KEY!,
      secretKey: process.env.OKX_SECRET_KEY!,
      passphrase: process.env.OKX_PASSPHRASE!,
      // OKX exact-scheme extension: facilitator waits for on-chain
      // confirmation before answering the settle call.
      syncSettle: true,
    });

    const resourceServer = new x402ResourceServer(facilitatorClient);
    resourceServer.register(NETWORK, new ExactEvmScheme());

    const payTo = process.env.PAY_TO_ADDRESS!;
    const routes: RoutesConfig = Object.fromEntries(
      PAID_ROUTES.map((r) => [
        r.route,
        {
          accepts: [{ scheme: "exact", network: NETWORK, payTo, price: r.price }],
          description: r.description,
          mimeType: "application/json",
        },
      ]),
    );

    // Fetch the facilitator's supported scheme/network kinds up front (with a
    // hard timeout). Passing syncFacilitatorOnStart=false below means the
    // middleware never kicks off its own un-awaited init promise.
    await withTimeout(
      resourceServer.initialize(),
      INIT_TIMEOUT_MS,
      "OKX facilitator initialize()",
    );

    app.use(paymentMiddleware(routes, resourceServer, undefined, undefined, false));

    const summary = PAID_ROUTES.map((r) => `${r.route} (${r.price})`).join(", ");
    console.log(
      `[x402] OKX payment middleware ACTIVE on ${summary} — network ${NETWORK}, payTo ${payTo}`,
    );
    return { enabled: true, detail: "OKX x402 payment active" };
  } catch (err) {
    console.warn(
      `[x402] OKX payment init failed — continuing with all endpoints FREE: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { enabled: false, detail: "init failed; running free" };
  }
}
