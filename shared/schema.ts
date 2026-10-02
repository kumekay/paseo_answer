import { z } from "zod";

export const ModelSchema = z.object({ provider: z.string().min(1), id: z.string().min(1) });
export const ModelOptionSchema = ModelSchema.extend({ name: z.string() });
export const QuestionSchema = z.object({
  question: z.string().trim().min(1).max(20000),
  context: z.string().max(20000).default(""),
  mode: z.enum(["text", "single", "multiple"]),
  options: z.array(z.string().trim().min(1).max(2000)).max(30).default([]),
}).refine(question => question.mode === "text" ? question.options.length === 0 : question.options.length > 0, "Choices must match the question mode.");
export const QuestionsSchema = z.object({ questions: z.array(QuestionSchema).max(100) });
export const AnswerSchema = z.object({ selected: z.array(z.number().int().nonnegative()).max(30), text: z.string().max(50000), skipped: z.boolean() });
export const DraftPatchSchema = z.object({
  sourceId: z.string(), revision: z.string(), answers: z.array(AnswerSchema).max(100),
  index: z.number().int().nonnegative(), review: z.boolean(),
});
export const DraftSchema = DraftPatchSchema.extend({ questions: z.array(QuestionSchema) });
export const OpenResultSchema = z.object({ status: z.enum(["ready", "waiting", "empty"]), draft: DraftSchema.nullable() });
