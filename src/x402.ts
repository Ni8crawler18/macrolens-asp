/**
 * x402 payment gating for MacroLens's paid endpoints.
 *
 * When PAYMENT_ENABLED=true this wires the real `x402-express` package
 * (v1, `paymentMiddleware(payTo, routes, facilitator?)` - API verified against
 * the installed package's dist/cjs/index.d.ts). Otherwise it is a no-op
 * passthrough so local development needs no wallet or facilitator.
 *
 * If the real package cannot be loaded at runtime, a minimal spec-shaped
 * fallback returns HTTP 402 with an x402 "payment required" JSON body. That
 * fallback is a STUB: it advertises payment requirements but does not verify
 * or settle payments - wire it to OKX's x402 facilitator flow for production.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface PaymentConfig {
  enabled: boolean;
  payTo: string;
  price: string;
  network: string;
  facilitatorUrl?: string;
}

export function loadPaymentConfig(): PaymentConfig {
  return {
    enabled: process.env.PAYMENT_ENABLED === "true",
    payTo: process.env.PAY_TO_ADDRESS ?? "0x0000000000000000000000000000000000000000",
    price: process.env.PRICE_PER_CALL ?? "$0.05",
    network: process.env.X402_NETWORK ?? "base-sepolia",
    facilitatorUrl: process.env.X402_FACILITATOR_URL,
  };
}

/**
 * STUB fallback (only used if x402-express fails to load): replies 402 with an
 * x402-style payment-required body on every protected route. Does NOT verify
 * X-PAYMENT headers - replace with OKX's x402 facilitator integration.
 */
function stub402Middleware(paidRoutes: string[], cfg: PaymentConfig): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const isPaid = paidRoutes.some((r) => req.path === r || req.path.startsWith(`${r}/`));
    if (!isPaid) return next();
    if (req.header("X-PAYMENT")) {
      // Stub: accept any presented payment header without verification.
      return next();
    }
    res.status(402).json({
      x402Version: 1,
      error: "X-PAYMENT header is required",
      accepts: [
        {
          scheme: "exact",
          network: cfg.network,
          maxAmountRequired: cfg.price,
          resource: `${req.protocol}://${req.get("host")}${req.path}`,
          description: "MacroLens paid API access (stub - not settling payments)",
          mimeType: "application/json",
          payTo: cfg.payTo,
          maxTimeoutSeconds: 60,
        },
      ],
    });
  };
}

/**
 * Build the payment middleware for the given paid route paths.
 * Returns a no-op passthrough when payments are disabled.
 */
export async function buildPaymentMiddleware(
  paidRoutes: string[],
  cfg: PaymentConfig = loadPaymentConfig(),
): Promise<RequestHandler> {
  if (!cfg.enabled) {
    return (_req, _res, next) => next();
  }

  try {
    const { paymentMiddleware } = await import("x402-express");
    const routes = Object.fromEntries(
      paidRoutes.map((path) => [
        path,
        {
          price: cfg.price,
          network: cfg.network,
          config: { description: "MacroLens meal macro analysis", mimeType: "application/json" },
        },
      ]),
    );
    const facilitator = cfg.facilitatorUrl ? { url: cfg.facilitatorUrl } : undefined;
    // Cast: payTo/network/facilitator come from env strings; x402-express
    // validates them at request time.
    return paymentMiddleware(
      cfg.payTo as never,
      routes as never,
      facilitator as never,
    ) as unknown as RequestHandler;
  } catch (err) {
    console.warn(
      "[x402] Failed to load x402-express, using STUB 402 middleware (no settlement):",
      (err as Error).message,
    );
    return stub402Middleware(paidRoutes, cfg);
  }
}
