import { describe, expect, it } from "vitest";
import { stripAssistantInternalScaffolding } from "./assistant-visible-text.js";

describe("stripAssistantInternalScaffolding", () => {
  it("handles empty input", () => {
    expect(stripAssistantInternalScaffolding("")).toBe("");
  });

  it("removes relevant memory blocks, tag wrappers, think and reasoning blocks", () => {
    const input =
      "<relevant-memories>Ignore this</relevant-memories><relevant-memories />text<think>x</think><reasoning>y</reasoning> done";
    expect(stripAssistantInternalScaffolding(input)).toBe("text done");
  });
});
