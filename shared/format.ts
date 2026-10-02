import type { Draft } from "./types";

export function answerText(draft: Draft, index: number): string {
  const answer = draft.answers[index];
  if (answer.skipped) return "(skipped)";
  const choices = answer.selected.map(i => draft.questions[index].options[i]).join("; ");
  return [choices, answer.text.trim()].filter(Boolean).join("\n") || "(unanswered)";
}

export function formatAnswers(draft: Draft): string {
  return "I answered your questions:\n\n" + draft.questions.map((question, index) =>
    [`Q: ${question.question}`, question.context ? `> ${question.context}` : "", `A: ${answerText(draft, index)}`].filter(Boolean).join("\n"),
  ).join("\n\n");
}
