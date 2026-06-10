import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/x402/logger.js";
import type { Logger } from "../../src/x402/index.js";

describe("createLogger", () => {
  it("filters messages below the configured level", () => {
    const sink = loggerSink();
    const logger = createLogger("warn", sink);

    logger.debug("debug");
    logger.info("info");
    logger.warn("warn");
    logger.error("error");

    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.warn).toHaveBeenCalledWith("warn");
    expect(sink.error).toHaveBeenCalledWith("error");
  });

  it("supports silent logging", () => {
    const sink = loggerSink();
    const logger = createLogger("silent", sink);

    logger.debug("debug");
    logger.info("info");
    logger.warn("warn");
    logger.error("error");

    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.warn).not.toHaveBeenCalled();
    expect(sink.error).not.toHaveBeenCalled();
  });

  it("passes details to custom sinks", () => {
    const sink = loggerSink();
    const logger = createLogger("debug", sink);

    logger.debug("debug", {
      key: "value",
    });

    expect(sink.debug).toHaveBeenCalledWith("debug", {
      key: "value",
    });
  });
});

function loggerSink(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}
