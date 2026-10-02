import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createAnswerService } from "../server/service";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "paseo-answer-test-"));
  directories.push(path);
  return path;
}

function gateway() {
  return {
    async iteration(_agentId: string) { return { id: "user-1", text: "Which database?", busy: false }; },
    async send(_agentId: string, _message: string) {},
  };
}
const extractor = {
  async models() { return [{ provider: "example", id: "small", name: "Small model" }]; },
  async extract(_model: { provider: string; id: string }, _text: string) {
    return [{ question: "Which database?", context: "", mode: "single" as const, options: ["SQLite", "PostgreSQL"] }];
  },
};

test("draft polling discards obsolete drafts without starting another extraction", async () => {
  let id = "user-1";
  let extractionAllowed = true;
  const service = createAnswerService({ directory: await directory(), gateway: {
    ...gateway(), async iteration() { return { id, text: "Question?", busy: false }; },
  }, extractor: { ...extractor, async extract(model, text) {
    if (!extractionAllowed) throw new Error("Polling must not invoke the model");
    return extractor.extract(model, text);
  } } });
  await service.configure({ provider: "example", id: "small" });
  await service.open("agent-1");
  id = "user-2";
  extractionAllowed = false;
  expect(await service.resume("agent-1")).toEqual({ status: "empty", draft: null });
});

test("a failed send preserves the reviewed draft for retry", async () => {
  const service = createAnswerService({ directory: await directory(), gateway: {
    ...gateway(), async send() { throw new Error("Connection lost"); },
  }, extractor });
  await service.configure({ provider: "example", id: "small" });
  const { draft } = await service.open("agent-1");
  const reviewed = await service.save("agent-1", { ...draft!, review: true });
  await expect(service.submit("agent-1", reviewed.sourceId, reviewed.revision)).rejects.toThrow("Connection lost");
  expect((await service.open("agent-1")).draft).toEqual(reviewed);
});

test.each(["missing answer", "invalid choice", "multiple single choices", "invalid position"])("saving refuses %s without corrupting the draft", async (reason) => {
  const service = createAnswerService({ directory: await directory(), gateway: gateway(), extractor });
  await service.configure({ provider: "example", id: "small" });
  const { draft } = await service.open("agent-1");
  const patch = { ...draft!, answers: [{ selected: reason === "invalid choice" ? [99] : reason === "multiple single choices" ? [0, 1] : [], text: "", skipped: false }] };
  if (reason === "missing answer") patch.answers = [];
  if (reason === "invalid position") patch.index = 10;
  await expect(service.save("agent-1", patch)).rejects.toThrow("Invalid answers");
  expect((await service.open("agent-1")).draft).toEqual(draft);
});

test("a conversation advancing during extraction cannot leave an obsolete draft", async () => {
  let id = "user-1";
  const service = createAnswerService({ directory: await directory(), gateway: {
    ...gateway(), async iteration() { return { id, text: "Which database?", busy: false }; },
  }, extractor: { ...extractor, async extract(model, text) { id = "user-2"; return extractor.extract(model, text); } } });
  await service.configure({ provider: "example", id: "small" });
  expect(await service.open("agent-1")).toEqual({ status: "waiting", draft: null });
});

test("configuration rejects a model without usable Pi authentication", async () => {
  const service = createAnswerService({ directory: await directory(), gateway: gateway(), extractor });
  await expect(service.configure({ provider: "unconfigured", id: "huge" })).rejects.toThrow("available");
  expect((await service.settings()).model).toBeNull();
});

test("simultaneous devices share one extraction and cannot submit twice", async () => {
  const sent: string[] = [];
  const service = createAnswerService({ directory: await directory(), gateway: {
    ...gateway(), async send(_agentId, text) { sent.push(text); },
  }, extractor });
  await service.configure({ provider: "example", id: "small" });
  const [first, second] = await Promise.all([service.open("agent-1"), service.open("agent-1")]);
  expect(first).toEqual(second);
  const reviewed = await service.save("agent-1", { ...first.draft!, review: true });
  const submissions = await Promise.allSettled([
    service.submit("agent-1", reviewed.sourceId, reviewed.revision),
    service.submit("agent-1", reviewed.sourceId, reviewed.revision),
  ]);
  expect(submissions.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
  expect(sent).toHaveLength(1);
});

test.each(["no reply", "no questions"])("opening an iteration with %s shows an empty result", async (scenario) => {
  const service = createAnswerService({ directory: await directory(), gateway: {
    ...gateway(), async iteration() { return { id: "user-1", text: scenario === "no reply" ? "" : "Done.", busy: false }; },
  }, extractor: { ...extractor, async extract() {
    if (scenario === "no reply") throw new Error("Empty replies must not reach the model");
    return [];
  } } });
  await service.configure({ provider: "example", id: "small" });
  expect(await service.open("agent-1")).toEqual({ status: "empty", draft: null });
});

test("a stale device cannot overwrite a newer saved draft", async () => {
  const service = createAnswerService({ directory: await directory(), gateway: gateway(), extractor });
  await service.configure({ provider: "example", id: "small" });
  const { draft } = await service.open("agent-1");
  await service.save("agent-1", { ...draft!, answers: [{ selected: [1], text: "Phone answer", skipped: false }] });
  await expect(service.save("agent-1", { ...draft!, answers: [{ selected: [0], text: "Desktop answer", skipped: false }] })).rejects.toThrow("another device");
  expect((await service.open("agent-1")).draft?.answers[0].text).toBe("Phone answer");
});

test.each(["obsolete", "busy", "unreviewed", "changed"])("submission refuses a %s draft without sending", async (reason) => {
  let id = "user-1";
  let busy = false;
  const service = createAnswerService({ directory: await directory(), gateway: {
    ...gateway(), async iteration() { return { id, text: "Which database?", busy }; },
    async send() { throw new Error("Should never send unsafe answers"); },
  }, extractor });
  await service.configure({ provider: "example", id: "small" });
  const { draft } = await service.open("agent-1");
  const saved = await service.save("agent-1", { ...draft!, review: reason !== "unreviewed" });
  if (reason === "obsolete") id = "user-2";
  if (reason === "busy") busy = true;
  const revision = reason === "changed" ? "outdated-revision" : saved.revision;
  await expect(service.submit("agent-1", saved.sourceId, revision)).rejects.toThrow({
    obsolete: "obsolete", busy: "Wait", unreviewed: "Review", changed: "another device",
  }[reason]);
});

test("reviewed submission sends choices, explanations and skipped questions as one user message", async () => {
  const sent: string[] = [];
  const service = createAnswerService({ directory: await directory(), gateway: {
    ...gateway(), async send(_agentId, message) { sent.push(message); },
  }, extractor: { ...extractor, async extract() { return [
    { question: "Which features?", context: "Choose several.", mode: "multiple" as const, options: ["Search", "Export"] },
    { question: "Which region?", context: "", mode: "text" as const, options: [] },
  ]; } } });
  await service.configure({ provider: "example", id: "small" });
  const { draft } = await service.open("agent-1");
  const reviewed = await service.save("agent-1", { ...draft!, review: true, answers: [
    { selected: [0, 1], text: "Export as Markdown", skipped: false },
    { selected: [], text: "", skipped: true },
  ] });
  await service.submit("agent-1", reviewed.sourceId, reviewed.revision);
  expect(sent).toEqual(["I answered your questions:\n\nQ: Which features?\n> Choose several.\nA: Search; Export\nExport as Markdown\n\nQ: Which region?\nA: (skipped)"]);
  await expect(service.submit("agent-1", reviewed.sourceId, reviewed.revision)).rejects.toThrow("Draft no longer exists");
});

test("a newer user input discards obsolete answers and rejects late edits", async () => {
  let id = "user-1";
  const service = createAnswerService({ directory: await directory(), gateway: {
    ...gateway(), async iteration() { return { id, text: "Which database?", busy: false }; },
  }, extractor });
  await service.configure({ provider: "example", id: "small" });
  const { draft } = await service.open("agent-1");
  id = "user-2";
  await expect(service.save("agent-1", { ...draft!, answers: [{ selected: [0], text: "Old answer", skipped: false }] })).rejects.toThrow("obsolete");
  expect((await service.open("agent-1")).draft).toMatchObject({ sourceId: "user-2", answers: [{ selected: [], text: "", skipped: false }] });
});

test("saved choices, text and review position resume on another device", async () => {
  const path = await directory();
  const desktop = createAnswerService({ directory: path, gateway: gateway(), extractor });
  await desktop.configure({ provider: "example", id: "small" });
  const { draft } = await desktop.open("agent-1");
  await desktop.save("agent-1", { ...draft!, answers: [{ selected: [1], text: "Use the managed instance", skipped: false }], review: true });
  const phone = createAnswerService({ directory: path, gateway: gateway(), extractor });
  expect((await phone.open("agent-1")).draft).toMatchObject({ review: true, answers: [
    { selected: [1], text: "Use the managed instance", skipped: false },
  ] });
});

test("an unfinished iteration waits without invoking the model, then opens when idle", async () => {
  let busy = true;
  const service = createAnswerService({ directory: await directory(), gateway: {
    ...gateway(), async iteration() { return { id: "user-1", text: "Which database?", busy }; },
  }, extractor: { ...extractor, async extract(model, text) {
    if (busy) throw new Error("A busy iteration must not reach the model");
    return extractor.extract(model, text);
  } } });
  await service.configure({ provider: "example", id: "small" });
  expect(await service.open("agent-1")).toEqual({ status: "waiting", draft: null });
  busy = false;
  expect((await service.open("agent-1")).status).toBe("ready");
});

test("opening a completed iteration creates a question draft shared across devices", async () => {
  const path = await directory();
  const desktop = createAnswerService({ directory: path, gateway: gateway(), extractor });
  await desktop.configure({ provider: "example", id: "small" });
  const opened = await desktop.open("agent-1");
  const phone = createAnswerService({ directory: path, gateway: gateway(), extractor });
  expect(await phone.open("agent-1")).toEqual(opened);
  expect(opened).toMatchObject({ status: "ready", draft: { sourceId: "user-1", questions: [
    { question: "Which database?", mode: "single", options: ["SQLite", "PostgreSQL"] },
  ], answers: [{ selected: [], text: "", skipped: false }], index: 0, review: false } });
});

test("explicit model selection survives a daemon restart", async () => {
  const path = await directory();
  const service = createAnswerService({ directory: path, gateway: gateway(), extractor });
  await service.configure({ provider: "example", id: "small" });
  const restarted = createAnswerService({ directory: path, gateway: gateway(), extractor });
  expect((await restarted.settings()).model).toEqual({ provider: "example", id: "small" });
});

test("a host starts without an extraction model and cannot extract until one is selected", async () => {
  const service = createAnswerService({ directory: await directory(), gateway: gateway(), extractor });
  expect(await service.settings()).toEqual({ model: null, models: [{ provider: "example", id: "small", name: "Small model" }] });
  await expect(service.open("agent-1")).rejects.toThrow("Select an extraction model");
});
