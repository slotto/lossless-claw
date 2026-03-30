import { describe, expect, it, vi } from "vitest";
import { defaultRuntime } from "./runtime.js";

describe("defaultRuntime", () => {
  it("forwards log and error calls", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    defaultRuntime.log("hello");
    defaultRuntime.error("oops");

    expect(logSpy).toHaveBeenCalledWith("hello");
    expect(errorSpy).toHaveBeenCalledWith("oops");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
