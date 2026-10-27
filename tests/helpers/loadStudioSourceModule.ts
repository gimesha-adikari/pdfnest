import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

// Execute the actual source with explicit service/framework fixtures. React
// components and their event handlers are not replaced with source assertions.
export function loadStudioSourceModule<T>(relative: string, mocks: Record<string, unknown>): T {
  const filename = path.resolve(relative);
  const nativeRequire = createRequire(filename);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", outputText)((name: string) => {
    if (!Object.hasOwn(mocks, name)) return nativeRequire(name);
    const value = mocks[name];
    return value && typeof value === "object" && Object.hasOwn(value, "default")
      ? { ...value, __esModule: true } : value;
  }, loaded, loaded.exports);
  return loaded.exports as T;
}
