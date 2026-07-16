import { handleAlipayInboundRequest, type AlphaAlipayHandler } from "./alipay-inbound.js";
import { AlphaPaymentConfigError } from "./errors.js";
import {
  createAlipayRuntime,
  createInboundX402Runtime,
  createOutboundX402Runtime,
  createWeiXinRuntime,
  type AlphaRuntimeState,
} from "./runtime-states.js";
import type {
  AlphaPaymentConfig,
  AlphaPaymentContext,
  AlphaPaymentDirection,
  AlphaPaymentProvider,
} from "./types.js";

const runtimeStates = new WeakMap<AlphaPaymentRuntime, AlphaRuntimeState>();

export class AlphaPaymentRuntime {
  readonly direction: AlphaPaymentDirection;
  readonly provider: AlphaPaymentProvider;
  #initialization: Promise<void> | undefined;

  constructor(state: AlphaRuntimeState) {
    this.direction = state.direction;
    this.provider = state.provider;
    runtimeStates.set(this, state);
  }

  initialize(): Promise<void> {
    if (this.#initialization === undefined) {
      const state = getAlphaRuntimeState(this);
      this.#initialization = initializeState(state);
    }

    return this.#initialization;
  }
}

export function createAlphaPayment(config: AlphaPaymentConfig): AlphaPaymentRuntime {
  assertBaseConfig(config);

  if (config.provider !== "x402" && hasNetwork(config)) {
    throw configError(config, "network is only supported by the x402 provider.");
  }

  return new AlphaPaymentRuntime(createRuntimeState(config));
}

export function getAlphaRuntimeState(runtime: AlphaPaymentRuntime): AlphaRuntimeState {
  const state = runtimeStates.get(runtime);

  if (state === undefined) {
    throw new AlphaPaymentConfigError("A valid AlphaPaymentRuntime instance is required.");
  }

  return state;
}

export function getRuntimeContext(state: AlphaRuntimeState): AlphaPaymentContext {
  return state.context;
}

export function handleRuntimeAlipayRequest(
  state: AlphaRuntimeState,
  request: Request,
  handler: AlphaAlipayHandler,
): Promise<Response> {
  if (state.provider !== "alipay" || state.direction !== "inbound") {
    throw new AlphaPaymentConfigError(
      "Alipay inbound handling requires an alipay inbound runtime.",
    );
  }

  return handleAlipayInboundRequest(state, request, handler);
}

function assertBaseConfig(config: AlphaPaymentConfig): void {
  if (typeof config !== "object" || config === null) {
    throw new AlphaPaymentConfigError("Alpha payment config must be an object.");
  }

  const input = config as unknown as { direction?: unknown; provider?: unknown };

  if (!isProvider(input.provider)) {
    throw new AlphaPaymentConfigError("Unsupported Alpha payment provider.", {
      provider: input.provider,
    });
  }

  if (input.direction !== "inbound" && input.direction !== "outbound") {
    throw new AlphaPaymentConfigError("Unsupported Alpha payment direction.", {
      direction: input.direction,
      provider: input.provider,
    });
  }
}

function createRuntimeState(config: AlphaPaymentConfig): AlphaRuntimeState {
  if (config.provider === "x402" && config.direction === "inbound") {
    return createInboundX402Runtime(config);
  }

  if (config.provider === "x402" && config.direction === "outbound") {
    return createOutboundX402Runtime(config);
  }

  if (config.provider === "alipay" && config.direction === "inbound") {
    return createAlipayRuntime(config);
  }

  if (config.provider === "weixin" && config.direction === "outbound") {
    return createWeiXinRuntime(config);
  }

  const invalid = config as unknown as {
    direction: AlphaPaymentDirection;
    provider: AlphaPaymentProvider;
  };
  throw new AlphaPaymentConfigError(
    `The ${invalid.provider} provider does not support ${invalid.direction} payments.`,
    invalid,
  );
}

async function initializeState(state: AlphaRuntimeState): Promise<void> {
  try {
    await state.initialize();
  } catch (error) {
    state.logger.error("Alpha payment runtime initialization failed.", {
      direction: state.direction,
      errorType: errorName(error),
      provider: state.provider,
    });
    throw error;
  }
}

function isProvider(provider: unknown): provider is AlphaPaymentProvider {
  return provider === "x402" || provider === "alipay" || provider === "weixin";
}

function hasNetwork(config: AlphaPaymentConfig): boolean {
  return "network" in config && config.network !== undefined;
}

function configError(
  config: Pick<AlphaPaymentConfig, "direction" | "provider">,
  message: string,
): AlphaPaymentConfigError {
  return new AlphaPaymentConfigError(message, {
    direction: config.direction,
    provider: config.provider,
  });
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}
