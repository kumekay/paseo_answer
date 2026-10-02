import { dirname, join, delimiter } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, realpath } from "node:fs/promises";
import type { ModelOption } from "../shared/types";

// Node loads the host's Pi runtime intact, outside Paseo's dependency/type scanner.
export interface PiRuntime {
  getAvailable(): Promise<readonly ModelOption[]>;
  getModel(provider: string, id: string): ModelOption | undefined;
  complete(model: ModelOption, context: {
    systemPrompt: string;
    messages: { role: "user"; content: { type: "text"; text: string }[]; timestamp: number }[];
  }, options: { signal: AbortSignal; maxTokens: number }): Promise<{
    stopReason: string; errorMessage?: string;
    content: ({ type: "text"; text: string } | { type: "thinking"; thinking: string } | { type: "toolCall" })[];
  }>;
}

export async function loadPiRuntime(packageRoot: string): Promise<PiRuntime> {
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const entry = manifest.exports?.["."]?.import ?? manifest.main;
  if (manifest.name !== "@earendil-works/pi-coding-agent" || typeof entry !== "string") throw new Error("Select a Pi SDK installation, not a standalone binary.");
  const moduleUrl = pathToFileURL(join(packageRoot, entry)).href;
  const pi = await import(/* @vite-ignore */ moduleUrl);
  if (!pi.ModelRuntime?.create) throw new Error("Update Pi to a version with ModelRuntime (1.0.0 or newer).");
  return pi.ModelRuntime.create({ allowModelNetwork: false });
}

export async function findPiDirectory(): Promise<string> {
  if (process.env.PASEO_ANSWER_PI_DIR) return process.env.PASEO_ANSWER_PI_DIR;
  for (const binDirectory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const name of process.platform === "win32" ? ["pi.cmd", "pi.exe", "pi"] : ["pi"]) {
      let binary: string;
      try { binary = await realpath(join(binDirectory, name)); } catch { continue; }
      for (let directory = dirname(binary);;) {
        for (const root of [directory, join(directory, "node_modules", "@earendil-works/pi-coding-agent")]) {
          try {
            const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
            if (manifest.name === "@earendil-works/pi-coding-agent") return root;
          } catch { /* Keep looking at the executable's ancestors. */ }
        }
        const parent = dirname(directory);
        if (parent === directory) break;
        directory = parent;
      }
    }
  }
  throw new Error("Pi SDK was not found on this host. Install Pi or set PASEO_ANSWER_PI_DIR to its package directory.");
}
