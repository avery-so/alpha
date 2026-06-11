import { X402Client, type EndpointResult } from "@averyso/alpha";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";

const exaSearchUrl = "https://api.exa.ai/search";
const defaultMaxAmount = 7000n;
const x402Network = "eip155:8453";

const searchInputSchema = z.object({
  query: z.string().min(1).describe("The web search query to send to Exa."),
});

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json();

        const result = streamText({
          model: process.env.AI_MODEL ?? "anthropic/claude-sonnet-4.5",
          stopWhen: stepCountIs(4),
          system:
            "You are a concise research assistant. Use searchExa when current web context would improve the answer, then cite the returned URLs.",
          messages: await convertToModelMessages(messages),
          tools: {
            searchExa: tool({
              description:
                "Search the web with Exa through an x402-paid endpoint.",
              inputSchema: searchInputSchema,
              async execute(input, options) {
                const client = createX402Client();

                console.info("Calling Exa x402 search endpoint.", {
                  query: input.query,
                  network: x402Network,
                });

                const endpoint = await client.call(
                  exaSearchUrl,
                  {
                    method: "POST",
                    body: {
                      query: input.query,
                    },
                  },
                  {
                    signal: options.abortSignal,
                    throwOnError: false,
                  },
                );

                if (endpoint.kind !== "success") {
                  console.warn("Exa x402 search failed.", {
                    kind: endpoint.kind,
                    status: endpoint.status,
                  });

                  return {
                    ok: false as const,
                    reason: endpoint.kind,
                    status: endpoint.status,
                  };
                }

                console.info("Exa x402 search succeeded.", {
                  status: endpoint.status,
                });

                return {
                  ok: true as const,
                  results: extractExaResults(endpoint),
                };
              },
            }),
          },
        });

        return result.toUIMessageStreamResponse();
      },
    },
  },
});

function createX402Client() {
  const privateKey = process.env.X402_PRIVATE_KEY;

  if (privateKey === undefined || privateKey.length === 0) {
    console.warn("Missing required X402_PRIVATE_KEY for Exa x402 search.");
    throw new Error("X402_PRIVATE_KEY is required.");
  }

  if (
    process.env.X402_RPC_URL === undefined ||
    process.env.X402_RPC_URL.length === 0
  ) {
    console.info(
      "X402_RPC_URL is not set. The x402 client will rely on SDK defaults where supported.",
    );
  }

  return new X402Client(privateKey, {
    network: x402Network,
    rpcUrl: process.env.X402_RPC_URL,
    maxAmount: parseMaxAmount(process.env.X402_MAX_AMOUNT),
  });
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
