import * as esbuild from "esbuild";
import { ImportMap, createResolverFromImportMap, defaultResolve } from "@maemon4095-esbuild-x/util-resolver";

export default function loaderOverride(options: { importMap?: string | ImportMap, loader?: { [ext: `.${string}`]: esbuild.Loader; }; }): esbuild.Plugin {
    const { importMap, loader } = options;
    const importMapResolver = createResolverFromImportMap(importMap ?? {});
    const nsExternal = `${loaderOverride.name}-external`;;
    const nsLocal = `${loaderOverride.name}-local`;;

    const isURL = (() => {
        const pat = /^(http|https):\/\/.*$/;
        return (p: string) => pat.test(p);
    })();

    return {
        name: loaderOverride.name,
        setup(build) {
            const loaderMap = loader ?? build.initialOptions.loader;
            if (loaderMap === undefined) {
                return;
            }
            const filter = (() => {
                const extensions = Object.keys(loaderMap);
                if (extensions.length === 0) {
                    return /^\0$/; // never match
                }

                let pattern = "^.*(";
                let first = true;
                for (const ext of extensions) {
                    if (first) {
                        first = false;
                    } else {
                        pattern += "|";
                    }
                    pattern = `${pattern}\\${ext}`;
                }
                pattern += ")$";
                return new RegExp(pattern);
            })();

            build.onResolve({ filter }, args => {
                const path = importMapResolver(args.path) ?? defaultResolve(args);
                return {
                    path,
                    namespace: isURL(path) ? nsExternal : nsLocal,
                };
            });

            build.onLoad({ filter: /.*/, namespace: nsLocal }, async args => {
                const match = args.path.match(filter)!;
                const ext = match[1] as `.${string}`;
                const contents = await Deno.readFile(args.path);
                return {
                    contents,
                    loader: loaderMap[ext]
                };
            });

            build.onLoad({ filter: /.*/, namespace: nsExternal }, async args => {
                const match = args.path.match(filter)!;
                const ext = match[1] as `.${string}`;
                const response = await fetch(args.path);
                const buf = await response.arrayBuffer();
                return {
                    contents: new Uint8Array(buf),
                    loader: loaderMap[ext]
                };
            });
        }
    };
}