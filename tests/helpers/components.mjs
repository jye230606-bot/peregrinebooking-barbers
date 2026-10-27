import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

// Run the real client components in Node's test runner, using the project's
// existing TypeScript compiler rather than a second test/build toolchain.
const source = fileURLToPath(new URL("../../src/", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    let candidate;
    if (specifier.startsWith("@/")) candidate = path.join(source, specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.startsWith(pathToFileURL(source).href)) {
      candidate = fileURLToPath(new URL(specifier, context.parentURL));
    }
    if (candidate) {
      for (const suffix of ["", ".tsx", ".ts"]) {
        if (existsSync(candidate + suffix)) return next(pathToFileURL(candidate + suffix).href, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(pathToFileURL(source).href) && /\.tsx?$/.test(url)) {
      return {
        format: "module",
        shortCircuit: true,
        source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
        }).outputText,
      };
    }
    return next(url, context);
  },
});
