import { expect, test, vi } from "vitest";
import { chmod, cp, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { findPiDirectory, loadPiRuntime } from "../server/runtime";

test("finds the Pi SDK behind the managed installer's launcher script", async () => {
  const agent = await realpath(await mkdtemp(join(tmpdir(), "paseo-answer-pi-")));
  try {
    const sdk = join(agent, "install", "releases", "1.2.0", "node_modules", "@earendil-works", "pi-coding-agent");
    await mkdir(sdk, { recursive: true });
    await writeFile(join(sdk, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent" }));
    await writeFile(join(agent, "install", "current-version"), "1.2.0\n");
    await mkdir(join(agent, "bin"));
    await writeFile(join(agent, "bin", "pi"), "#!/bin/sh\n");
    await chmod(join(agent, "bin", "pi"), 0o755);
    vi.stubEnv("PASEO_ANSWER_PI_DIR", "");
    vi.stubEnv("PATH", join(agent, "bin"));
    expect(await findPiDirectory()).toBe(sdk);
  } finally {
    vi.unstubAllEnvs();
    await rm(agent, { recursive: true, force: true });
  }
});

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
