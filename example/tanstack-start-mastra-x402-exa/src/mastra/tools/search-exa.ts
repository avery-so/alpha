import {
  X402Client,
  X402Networks,
  x402MastraTool,
  type EndpointResult,
} from "@averyso/alpha";
import { z } from "zod";

const exaSearchUrl = "https://api.exa.ai/search";
const defaultMaxAmount = 7000n;
const buildPlaceholderPrivateKey =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

export const searchExaInputSchema = z.object({
  query: z.string().min(1).describe("The web search query to send to Exa."),
});

const searchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  text: z.string(),
});

export const searchExaOutputSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    results: z.array(searchResultSchema),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.string(),
    status: z.number(),
  }),
]);

export type SearchExaInput = z.infer<typeof searchExaInputSchema>;
export type SearchExaOutput = z.infer<typeof searchExaOutputSchema>;

export const searchExaTool = x402MastraTool<
  SearchExaInput,
  SearchExaOutput,
  "search-exa"
>({
  id: "search-exa",
  client: createX402ClientForTool(),
  description: "Search the web with Exa through an x402-paid endpoint.",
  inputSchema: searchExaInputSchema,
  outputSchema: searchExaOutputSchema,
  endpoint: exaSearchUrl,
  maxAmount: parseMaxAmount(process.env.X402_MAX_AMOUNT),
  request(input) {
    assertRuntimeConfiguration();

    console.info("Executing Exa x402 search tool.", {
      query: input.query,
    });

    console.info("Preparing Exa x402 search request.", {
      query: input.query,
      network: X402Networks.base,
    });

    return {
      method: "POST",
      body: {
        query: input.query,
      },
    };
  },
  execute({ endpoint }) {
    if (endpoint.kind !== "success") {
      console.warn("Exa x402 search failed.", {
        kind: endpoint.kind,
        status: endpoint.status,
      });

      return {
        ok: false,
        reason: endpoint.kind,
        status: endpoint.status,
      };
    }

    console.info("Exa x402 search succeeded.", {
      status: endpoint.status,
    });

    return {
      ok: true,
      results: extractExaResults(endpoint),
    };
  },
});

function createX402ClientForTool() {
  const privateKey =
    process.env.X402_PRIVATE_KEY === undefined ||
    process.env.X402_PRIVATE_KEY.length === 0
      ? buildPlaceholderPrivateKey
      : process.env.X402_PRIVATE_KEY;

  return new X402Client(privateKey, {
    network: X402Networks.base,
    rpcUrl: process.env.X402_RPC_URL,
    maxAmount: parseMaxAmount(process.env.X402_MAX_AMOUNT),
  });
}

function assertRuntimeConfiguration() {
  if (
    process.env.X402_PRIVATE_KEY === undefined ||
    process.env.X402_PRIVATE_KEY.length === 0
  ) {
    console.error("Missing required X402_PRIVATE_KEY for Exa x402 search.");
    throw new Error("X402_PRIVATE_KEY is required.");
  }

  if (
    process.env.X402_RPC_URL === undefined ||
    process.env.X402_RPC_URL.length === 0
  ) {
    console.warn(
      "X402_RPC_URL is not set. The x402 client will rely on SDK defaults where supported.",
    );
  }
}

function parseMaxAmount(value: string | undefined): bigint {
  if (value === undefined || value.length === 0) {
    return defaultMaxAmount;
  }

  return BigInt(value);
}

function extractExaResults(
  endpoint: Extract<EndpointResult, { kind: "success" }>,
) {
  if (!isObject(endpoint.body) || !Array.isArray(endpoint.body.results)) {
    return [];
  }

  return endpoint.body.results
    .filter(isObject)
    .map((result) => ({
      title: stringValue(result.title),
      url: stringValue(result.url),
      text: stringValue(result.text),
    }))
    .filter((result) => result.url.length > 0)
    .slice(0, 8);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
