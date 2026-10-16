import { expect, test } from "vitest";
import type { PiRuntime } from "../server/runtime";
import { createPiExtractor } from "../server/pi";

function runtime(response: unknown) {
  return {
    async getAvailable() { return [{ provider: "example", id: "small", name: "Small" }]; },
    getModel(provider: string, id: string) { return provider === "example" && id === "small" ? { provider, id } : undefined; },
    async complete() { return response; },
  } as unknown as PiRuntime;
}

test.each(["error", "aborted", "length", "toolUse"])("Pi extraction refuses %s responses even if they contain valid JSON", async (stopReason) => {
  const extractor = createPiExtractor(async () => runtime({ stopReason, errorMessage: "Provider unavailable", content: [{ type: "text", text: '{"questions":[]}' }] }));
  await expect(extractor.extract({ provider: "example", id: "small" }, "Question?")).rejects.toThrow("Extraction");
});

test("Pi extraction accepts explicit single/multiple choices and plain-text questions", async () => {
  const extractor = createPiExtractor(async () => runtime({ stopReason: "stop", content: [{ type: "text", text: '```json\n{"questions":[{"question":"Which database?","mode":"single","options":["SQLite","PostgreSQL"]},{"question":"Which features?","mode":"multiple","options":["Search","Export"]},{"question":"Any constraints?","mode":"text"}]}\n```' }] }));
  expect(await extractor.extract({ provider: "example", id: "small" }, "Questions here")).toEqual([
    { question: "Which database?", mode: "single", context: "", options: ["SQLite", "PostgreSQL"] },
    { question: "Which features?", mode: "multiple", context: "", options: ["Search", "Export"] },
    { question: "Any constraints?", mode: "text", context: "", options: [] },
  ]);
});

test.each([
  ["plain", (json: string) => json],
  ["fenced", (json: string) => "```json\n" + json + "\n```"],
])("Pi extraction keeps code fences inside %s JSON strings", async (_, wrap) => {
  const question = { question: "Run it?", context: "```bash\nsudo python setup.py\n```", mode: "text", options: [] };
  const text = wrap(JSON.stringify({ questions: [question] }));
  const extractor = createPiExtractor(async () => runtime({ stopReason: "stop", content: [{ type: "text", text }] }));
  expect(await extractor.extract({ provider: "example", id: "small" }, "Run it?")).toEqual([question]);
});
