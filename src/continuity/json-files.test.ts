import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAsyncLock, readJsonFile, writeJsonAtomic, writeTextAtomic } from "./json-files.js";

describe("json file helpers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "continuity-json-files-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("reads valid json and returns null for missing or invalid files", async () => {
    const validPath = path.join(tempDir, "valid.json");
    const invalidPath = path.join(tempDir, "invalid.json");

    await fs.writeFile(validPath, JSON.stringify({ ok: true }), "utf8");
    await fs.writeFile(invalidPath, "{bad json", "utf8");

    await expect(readJsonFile(validPath)).resolves.toEqual({ ok: true });
    await expect(readJsonFile(path.join(tempDir, "missing.json"))).resolves.toBeNull();
    await expect(readJsonFile(invalidPath)).resolves.toBeNull();
  });

  it("writes json/text atomically with trailing newlines and best-effort chmod", async () => {
    const jsonPath = path.join(tempDir, "nested", "payload.json");
    const textPath = path.join(tempDir, "notes.txt");
    const chmodSpy = vi
      .spyOn(fs, "chmod")
      .mockRejectedValueOnce(new Error("chmod disabled"))
      .mockResolvedValue(undefined);

    await writeJsonAtomic(
      jsonPath,
      { ok: true },
      {
        mode: 0o640,
        ensureDirMode: 0o755,
        trailingNewline: true,
      },
    );
    await writeTextAtomic(textPath, "hello", { appendTrailingNewline: true });
    await writeTextAtomic(textPath, "hello\n", { appendTrailingNewline: true });

    await expect(fs.readFile(jsonPath, "utf8")).resolves.toBe('{\n  "ok": true\n}\n');
    await expect(fs.readFile(textPath, "utf8")).resolves.toBe("hello\n");
    expect(chmodSpy).toHaveBeenCalled();
  });

  it("suppresses temporary cleanup failures after writing", async () => {
    const textPath = path.join(tempDir, "cleanup.txt");
    const rmSpy = vi
      .spyOn(fs, "rm")
      .mockRejectedValueOnce(new Error("cleanup failed"))
      .mockResolvedValue(undefined);

    await expect(writeTextAtomic(textPath, "hello")).resolves.toBeUndefined();
    expect(rmSpy).toHaveBeenCalled();
    await expect(fs.readFile(textPath, "utf8")).resolves.toBe("hello");
  });

  it("serializes concurrent async work with the lock", async () => {
    const withLock = createAsyncLock();
    const order: string[] = [];

    await Promise.all([
      withLock(async () => {
        order.push("start-1");
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push("end-1");
      }),
      withLock(async () => {
        order.push("start-2");
        order.push("end-2");
      }),
    ]);

    expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
  });
});
