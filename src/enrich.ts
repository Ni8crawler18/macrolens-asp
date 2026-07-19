import Anthropic from "@anthropic-ai/sdk";

/**
 * Optional Claude-powered enrichment layer.
 *
 * When enabled (ANTHROPIC_API_KEY set, or ENRICH_ENABLED=true), meal items the
 * deterministic food DB could not match are sent to Claude in a single call
 * for a best-effort macro estimate. When disabled - or on any error/timeout -
 * the service behaves exactly as it does without enrichment.
 */

const DEFAULT_MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 1500; // well under the 2000 cap
const TIMEOUT_MS = 15_000;

/** Enrichment is on when a key is present or explicitly forced on. */
export function enrichmentEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) || process.env.ENRICH_ENABLED === "true";
}

export function enrichmentModel(): string {
  return process.env.ENRICH_MODEL ?? DEFAULT_MODEL;
}

/** One AI-estimated food item (mirrors the JSON schema sent to Claude). */
export interface AiEstimatedItem {
  item: string;
  quantity_assumed: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

/**
 * Minimal structural view of the Anthropic client used here. Tests inject a
 * mock implementing this interface; production uses the real SDK client.
 */
export interface EnrichmentClient {
  messages: {
    create(
      body: Record<string, unknown>,
      options?: { timeout?: number },
    ): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

let cachedClient: EnrichmentClient | undefined;

/**
 * Lazily create the Anthropic client - only when enrichment is enabled.
 * Constructed zero-arg so the SDK's own credential resolution applies.
 */
export function getEnrichmentClient(): EnrichmentClient | undefined {
  if (!enrichmentEnabled()) return undefined;
  if (!cachedClient) {
    try {
      cachedClient = new Anthropic() as unknown as EnrichmentClient;
    } catch (err) {
      console.warn(`[enrich] could not create Anthropic client: ${(err as Error).message}`);
      return undefined;
    }
  }
  return cachedClient;
}

// Structured-output schema: every object property listed in `required`,
// additionalProperties false (both required by the API for json_schema).
const ESTIMATE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          quantity_assumed: { type: "string" },
          calories: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
          fiber_g: { type: "number" },
        },
        required: [
          "item",
          "quantity_assumed",
          "calories",
          "protein_g",
          "carbs_g",
          "fat_g",
          "fiber_g",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const SYSTEM_PROMPT =
  "You are a nutrition estimator. You receive a JSON array of free-text food/portion " +
  "descriptions. For each one, estimate realistic macros (calories, protein, carbs, fat, " +
  "fiber in grams) for the described portion; when no portion is stated, assume a typical " +
  "single serving and describe that assumption in quantity_assumed. Echo each input string " +
  "back unchanged in the item field. If a described item is not a food, return zeros for it. " +
  "If an item is a container or dish phrase whose contents are itemized separately in the same " +
  "meal (e.g. 'a buddha bowl' alongside its listed ingredients, 'a salad' followed by its parts, " +
  "'a plate'), return zeros for the container itself so its contents are not double-counted.";

/** Signature the analyzer accepts, so tests can inject a fake estimator. */
export type UnmatchedEstimator = (unmatched: string[]) => Promise<AiEstimatedItem[] | undefined>;

/**
 * Make ONE Claude call estimating macros for all unmatched item strings.
 * Returns undefined when enrichment is unavailable. May throw on API errors -
 * callers are expected to fall back to the deterministic result.
 */
export async function estimateUnmatchedItems(
  unmatched: string[],
  client: EnrichmentClient | undefined = getEnrichmentClient(),
): Promise<AiEstimatedItem[] | undefined> {
  if (!client || unmatched.length === 0) return undefined;

  const response = await client.messages.create(
    {
      model: enrichmentModel(),
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Estimate macros for these unrecognized meal items:\n${JSON.stringify(unmatched)}`,
        },
      ],
      output_config: { format: { type: "json_schema", schema: ESTIMATE_SCHEMA } },
    },
    { timeout: TIMEOUT_MS },
  );

  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) return undefined;
  const parsed = JSON.parse(text) as { items: AiEstimatedItem[] };
  return parsed.items;
}
