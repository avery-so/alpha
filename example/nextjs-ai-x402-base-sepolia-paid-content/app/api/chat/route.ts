import { createDeepSeek } from "@ai-sdk/deepseek";
import { X402Client, X402Networks, type EndpointResult } from "@averyso/alpha";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";

export const runtime = "nodejs";

const defaultModel = "deepseek-v4-flash";
const defaultMaxAmount = 10_000n;
const defaultPaidContentEndpoint = "https://x402.payai.network/api/base-sepolia/paid-content";
const network = X402Networks.baseSepolia;

const readPaidContentInputSchema = z.object({});

interface PaidContentSuccess {
  ok: true;
  status: number;
  body: unknown;
}

interface PaidContentFailure {
  ok: false;
  reason: string;
  status: number;
}

type PaidContentOutput = PaidContentSuccess | PaidContentFailure;

export async function POST(request: Request) {
  const { messages } = await request.json();
  const deepSeek = createDeepSeek({
    apiKey: requiredEnv("DEEPSEEK_API_KEY"),
  });
  const modelId = process.env.AI_MODEL ?? defaultModel;

  const result = streamText({
    model: deepSeek(modelId),
    stopWhen: stepCountIs(4),
    system:
      "You are a concise assistant. When the user asks for paid content, call readPaidContent once, then summarize the returned body.",
    messages: await convertToModelMessages(messages),
    tools: {
      readPaidContent: tool({
        description: "Read the Base Sepolia x402 paid-content endpoint.",
        inputSchema: readPaidContentInputSchema,
        async execute(_input, options): Promise<PaidContentOutput> {
          const endpointUrl = paidContentEndpoint();
          const maxAmount = parseMaxAmount(process.env.X402_MAX_AMOUNT);
          const client = createX402Client(maxAmount);

          console.info("Calling Base Sepolia x402 paid-content endpoint.", {
            endpoint: endpointUrl,
            network,
            maxAmount: maxAmount.toString(),
          });

          const endpoint = await client.call(
            endpointUrl,
            {
              method: "GET",
            },
            {
              signal: options.abortSignal,
              throwOnError: false,
            },
          );

          if (endpoint.kind !== "success") {
            console.warn("Base Sepolia x402 paid-content call failed.", {
              endpoint: endpointUrl,
              network,
              maxAmount: maxAmount.toString(),
              kind: endpoint.kind,
              status: endpoint.status,
            });

            return {
              ok: false,
              reason: endpoint.kind,
              status: endpoint.status,
            };
          }

          console.info("Base Sepolia x402 paid-content call succeeded.", {
            endpoint: endpointUrl,
            network,
            maxAmount: maxAmount.toString(),
            status: endpoint.status,
          });

          return toPaidContentSuccess(endpoint);
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}

function createX402Client(maxAmount: bigint) {
  return new X402Client(requiredEnv("X402_PRIVATE_KEY"), {
    network,
    rpcUrl: process.env.X402_RPC_URL,
    maxAmount,
  });
}

function requiredEnv(name: "DEEPSEEK_API_KEY" | "X402_PRIVATE_KEY"): string {
  const value = process.env[name];

  if (value === undefined || value.length === 0) {
    console.error("Missing required server environment variable.", {
      name,
    });

    throw new Error(`${name} is required.`);
  }

  return value;
}

function paidContentEndpoint(): string {
  const endpoint = process.env.X402_PAID_CONTENT_ENDPOINT;

  if (endpoint === undefined || endpoint.length === 0) {
    return defaultPaidContentEndpoint;
  }

  return endpoint;
}

function parseMaxAmount(value: string | undefined): bigint {
  if (value === undefined || value.length === 0) {
    return defaultMaxAmount;
  }

  if (!/^[1-9]\d*$/u.test(value)) {
    console.error("Invalid X402_MAX_AMOUNT value.", {
      reason: "not_positive_integer",
    });

    throw new Error("X402_MAX_AMOUNT must be a positive integer in atomic units.");
  }

  return BigInt(value);
}

function toPaidContentSuccess(endpoint: Extract<EndpointResult, { kind: "success" }>) {
  return {
    ok: true as const,
    status: endpoint.status,
    body: endpoint.body,
  };
}
