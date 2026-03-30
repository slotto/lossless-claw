import { describe, expect, it } from "vitest";
import { extractTextFromChatContent } from "./chat-content.js";

describe("extractTextFromChatContent", () => {
  it("extracts and normalizes string content", () => {
    expect(extractTextFromChatContent("  hello   world  ")).toBe("hello world");
    expect(
      extractTextFromChatContent("hello", {
        sanitizeText: (value) => `${value}!`,
      }),
    ).toBe("hello!");
  });

  it("returns null for non-string and non-array content", () => {
    expect(extractTextFromChatContent(null)).toBeNull();
    expect(extractTextFromChatContent({})).toBeNull();
    expect(extractTextFromChatContent(123)).toBeNull();
  });

  it("extracts only text blocks from array payloads", () => {
    expect(
      extractTextFromChatContent([
        null,
        "x",
        { type: "image", text: "ignored" },
        { type: "text", text: 1 },
        { type: "text", text: " first " },
        { type: "text", text: "second" },
      ]),
    ).toBe("first second");
  });

  it("sanitizes text blocks inside array payloads", () => {
    expect(
      extractTextFromChatContent(
        [
          { type: "text", text: " first " },
          { type: "text", text: "second" },
        ],
        {
          sanitizeText: (value) => value.toUpperCase(),
        },
      ),
    ).toBe("FIRST SECOND");
  });

  it("returns null when array has no non-empty text blocks", () => {
    expect(
      extractTextFromChatContent([
        { type: "image", text: "ignored" },
        { type: "text", text: "   " },
      ]),
    ).toBeNull();
  });

  it("supports custom join and normalize functions", () => {
    expect(
      extractTextFromChatContent(
        [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
        {
          joinWith: "|",
          normalizeText: (value) => value,
        },
      ),
    ).toBe("a|b");
  });
});
