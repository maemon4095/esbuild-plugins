import * as path from "@std/path";
import type { Plugin } from "esbuild";

type Options = { excludedPlugins: string[]; } | { plugins: Plugin[]; };

export default function importWebWorker(options?: Options): Plugin {
    const name = "import-web-worker";

    return {
        name,
        setup(build) {
            const plugins = (() => {
                if (options === undefined) return build.initialOptions.plugins;
                if ("plugins" in options) { return options.plugins; }
                if ("excludedPlugins" in options) {
                    const excluded = new Set(options?.excludedPlugins ?? []);
                    return build.initialOptions.plugins?.filter(p => !excluded.has(p.name));
                }
                return build.initialOptions.plugins;
            })();

            build.onResolve({ filter: /^.*\.worker\.ts$/ }, args => {
                if (args.kind === "entry-point") {
                    return undefined;
                }
                return {
                    namespace: name,
                    path: args.path.substring(0, args.path.length - 10) + ".worker.js",
                    pluginData: path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path)
                };
            });

            build.onLoad({ filter: /.*/, namespace: name }, async args => {
                const result = await build.esbuild.build({
                    ...build.initialOptions,
                    plugins,
                    write: false,
                    sourcemap: false,
                    sourcesContent: false,
                    entryPoints: [path.relative(".", args.pluginData)]
                });

                return { contents: result.outputFiles[0].contents, loader: "file" };
            });
        }
    };
}