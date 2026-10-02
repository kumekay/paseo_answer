import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

import type { ModelSelection, ModelOption, Question, Draft, OpenResult, DraftPatch } from "../shared/types";
import { DraftPatchSchema } from "../shared/schema";
import { formatAnswers } from "../shared/format";
export type { ModelSelection, ModelOption, Question } from "../shared/types";
export interface Iteration { id: string; text: string; busy: boolean }
export interface AgentGateway {
  iteration(agentId: string): Promise<Iteration>;
  send(agentId: string, message: string): Promise<void>;
}
export interface Extractor {
  models(): Promise<ModelOption[]>;
  extract(model: ModelSelection, text: string): Promise<Question[]>;
}
export function createAnswerService(options: { directory: string; gateway: AgentGateway; extractor: Extractor }) {
  async function read<T>(name: string, fallback: T): Promise<T> {
    try { return JSON.parse(await readFile(join(options.directory, name), "utf8")) as T; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; }
  }
  async function write(name: string, value: unknown) {
    await mkdir(options.directory, { recursive: true, mode: 0o700 });
    const temporary = join(options.directory, `${name}.${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, join(options.directory, name));
  }
  const draftName = (agentId: string) => `draft-${createHash("sha256").update(agentId).digest("hex")}.json`;
  const queue = new Map<string, Promise<unknown>>();
  async function serial<T>(agentId: string, action: () => Promise<T>): Promise<T> {
    const pending = (queue.get(agentId) ?? Promise.resolve()).catch(() => {}).then(action);
    queue.set(agentId, pending);
    try { return await pending; } finally { if (queue.get(agentId) === pending) queue.delete(agentId); }
  }
  const service = {
    async configure(model: ModelSelection) {
      const models = await options.extractor.models();
      if (!models.some(candidate => candidate.provider === model.provider && candidate.id === model.id)) throw new Error("Model is not available; configure Pi authentication first.");
      await write("model.json", model);
    },
    async settings() { return { model: await read<ModelSelection | null>("model.json", null), models: await options.extractor.models() }; },
    async resume(agentId: string): Promise<OpenResult> {
      const iteration = await options.gateway.iteration(agentId);
      const draft = await read<Draft | null>(draftName(agentId), null);
      if (draft && draft.sourceId !== iteration.id) await rm(join(options.directory, draftName(agentId)), { force: true });
      if (iteration.busy) return { status: "waiting", draft: null };
      return draft?.sourceId === iteration.id && draft.questions.length ? { status: "ready", draft } : { status: "empty", draft: null };
    },
    async submit(agentId: string, sourceId: string, revision: string) {
      const draft = await read<Draft | null>(draftName(agentId), null);
      if (!draft) throw new Error("Draft no longer exists.");
      const current = await options.gateway.iteration(agentId);
      if (draft.sourceId !== current.id || sourceId !== draft.sourceId) {
        await rm(join(options.directory, draftName(agentId)), { force: true });
        throw new Error("Draft is obsolete; the conversation has advanced.");
      }
      if (current.busy) throw new Error("Wait for the agent to finish.");
      if (revision !== draft.revision) throw new Error("Draft changed on another device; reload.");
      if (!draft.review) throw new Error("Review your answers before sending.");
      await options.gateway.send(agentId, formatAnswers(draft));
      await rm(join(options.directory, draftName(agentId)), { force: true });
    },
    async save(agentId: string, patch: DraftPatch) {
      const draft = await read<Draft | null>(draftName(agentId), null);
      if (!draft) throw new Error("Draft no longer exists.");
      const current = await options.gateway.iteration(agentId);
      if (draft.sourceId !== current.id || patch.sourceId !== draft.sourceId) {
        await rm(join(options.directory, draftName(agentId)), { force: true });
        throw new Error("Draft is obsolete; the conversation has advanced.");
      }
      if (patch.revision !== draft.revision) throw new Error("Draft changed on another device; reload.");
      const valid = DraftPatchSchema.safeParse(patch);
      if (!valid.success || patch.answers.length !== draft.questions.length || patch.index >= draft.questions.length || patch.answers.some((answer, i) =>
        new Set(answer.selected).size !== answer.selected.length ||
        (draft.questions[i].mode !== "multiple" && answer.selected.length > 1) ||
        answer.selected.some(selected => selected >= draft.questions[i].options.length)
      )) throw new Error("Invalid answers or question position.");
      const updated = { ...draft, answers: patch.answers, index: patch.index, review: patch.review, revision: randomUUID() };
      await write(draftName(agentId), updated);
      return updated;
    },
    async open(agentId: string): Promise<OpenResult> {
      const model = await read<ModelSelection | null>("model.json", null);
      if (!model) throw new Error("Select an extraction model first.");
      const iteration = await options.gateway.iteration(agentId);
      const existing = await read<Draft | null>(draftName(agentId), null);
      if (existing && existing.sourceId !== iteration.id) await rm(join(options.directory, draftName(agentId)), { force: true });
      if (iteration.busy) return { status: "waiting", draft: null };
      if (existing?.sourceId === iteration.id) return existing.questions.length ? { status: "ready", draft: existing } : { status: "empty", draft: null };
      if (!iteration.text.trim()) return { status: "empty", draft: null };
      const questions = await options.extractor.extract(model, iteration.text);
      const current = await options.gateway.iteration(agentId);
      if (current.id !== iteration.id || current.busy) return { status: "waiting", draft: null };
      const draft: Draft = {
        sourceId: iteration.id, questions,
        answers: questions.map(() => ({ selected: [], text: "", skipped: false })),
        index: 0, review: false, revision: randomUUID(),
      };
      await write(draftName(agentId), draft);
      return questions.length ? { status: "ready", draft } : { status: "empty", draft: null };
    },
  };
  return {
    settings: service.settings,
    configure: service.configure,
    resume: (agentId: string) => serial(agentId, () => service.resume(agentId)),
    open: (agentId: string) => serial(agentId, () => service.open(agentId)),
    save: (agentId: string, patch: DraftPatch) => serial(agentId, () => service.save(agentId, patch)),
    submit: (agentId: string, sourceId: string, revision: string) => serial(agentId, () => service.submit(agentId, sourceId, revision)),
  };
}
