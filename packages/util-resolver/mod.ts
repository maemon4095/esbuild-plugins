import * as path from "@std/path";
import type { OnResolveArgs } from "esbuild";

export type ImportMap = { [prefix: string]: string; };
export function createResolverFromImportMap(importMapOrPath: string | ImportMap): (p: string) => string | undefined {
    let importMap: ImportMap = {};
    let importMapPrefix = "";
    if (typeof importMapOrPath === "string") {
        const raw = Deno.readFileSync(importMapOrPath);
        const text = new TextDecoder().decode(raw);
        const map = JSON.parse(text) as { imports: ImportMap; };

        importMapPrefix = path.dirname(importMapOrPath);
        importMap = { ...importMap, ...(map.imports) };
    }

    if (typeof importMapOrPath === "object") {
        importMap = { ...importMap, ...importMapOrPath };
    }

    return (p: string) => {
        for (const [pref, rep] of Object.entries(importMap)) {
            if (!p.startsWith(pref)) continue;

            return path.join(importMapPrefix, rep, p.slice(pref.length));
        }
    };
}

export function defaultResolve(args: OnResolveArgs): string {
    if (path.isAbsolute(args.path)) {
        return args.path;
    }
    return path.join(args.resolveDir, args.path);
}