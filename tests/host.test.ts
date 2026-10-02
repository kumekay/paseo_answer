import { expect, test } from "vitest";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { findPiDirectory, loadPiRuntime } from "../server/runtime";

test.skipIf(!process.env.PASEO_COMPILER)("the host Pi runtime loads through Node without a CommonJS export", async () => {
  const runtime = await loadPiRuntime(await findPiDirectory());
  expect(typeof runtime.getModel).toBe("function");
});

// Optional real-host gate. Set PASEO_COMPILER to the installed server's compiler.js.
test.skipIf(!process.env.PASEO_COMPILER)("the installed Paseo compiler accepts both runtime entries", async () => {
  const moduleUrl = pathToFileURL(process.env.PASEO_COMPILER!).href;
  const compiler = await import(/* @vite-ignore */ moduleUrl);
  const directory = await mkdtemp(join(tmpdir(), "paseo-answer-clean-"));
  try {
    for (const path of ["index.client.tsx", "index.server.ts", "client", "server", "shared", "paseo-plugin.json"]) await cp(resolve(path), join(directory, path), { recursive: true });
    const result = await compiler.compilePlugin({ client: join(directory, "index.client.tsx"), server: join(directory, "index.server.ts") });
    expect(result.clientBundle).toEqual(expect.any(String));
    expect(result.serverBundle).toEqual(expect.any(String));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
