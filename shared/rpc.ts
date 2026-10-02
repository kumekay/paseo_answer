import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { DraftPatchSchema, DraftSchema, ModelOptionSchema, ModelSchema, OpenResultSchema } from "./schema";

const AgentInput = z.object({ agentId: z.string().min(1).max(500) });
const Done = z.object({});
export const settingsRpc = defineRpc({ name: "answer.settings", input: Done, output: z.object({ model: ModelSchema.nullable(), models: z.array(ModelOptionSchema) }) });
export const configureRpc = defineRpc({ name: "answer.configure", input: ModelSchema, output: Done });
export const openRpc = defineRpc({ name: "answer.open", input: AgentInput, output: OpenResultSchema });
export const resumeRpc = defineRpc({ name: "answer.resume", input: AgentInput, output: OpenResultSchema });
export const saveRpc = defineRpc({ name: "answer.save", input: AgentInput.extend({ patch: DraftPatchSchema }), output: DraftSchema });
export const submitRpc = defineRpc({ name: "answer.submit", input: AgentInput.extend({ sourceId: z.string(), revision: z.string() }), output: Done });
