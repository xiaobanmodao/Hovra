import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { afterEach, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

it("loads Electron Forge's CommonJS main output within the package scope", async () => {
  const directory = await mkdtemp(path.join(process.cwd(), ".forge-main-test-"));
  temporaryDirectories.push(directory);
  const mainBundle = path.join(directory, "main.js");
  await writeFile(mainBundle, "module.exports = { loaded: true };\n");

  const requireFromTest = createRequire(import.meta.url);

  expect(requireFromTest(mainBundle)).toEqual({ loaded: true });
});
