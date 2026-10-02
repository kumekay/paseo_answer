export interface ModelSelection { provider: string; id: string }
export interface ModelOption extends ModelSelection { name: string }
export interface Question { question: string; context: string; mode: "text" | "single" | "multiple"; options: string[] }
export interface Answer { selected: number[]; text: string; skipped: boolean }
export interface Draft { sourceId: string; questions: Question[]; answers: Answer[]; index: number; review: boolean; revision: string }
export interface OpenResult { status: "ready" | "waiting" | "empty"; draft: Draft | null }
export type DraftPatch = Pick<Draft, "sourceId" | "revision" | "answers" | "index" | "review">;
