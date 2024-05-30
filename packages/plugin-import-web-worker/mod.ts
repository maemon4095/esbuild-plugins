import * as path from "@std/path";
import * as esbuild from "esbuild";

type Options = { excludedPlugins: string[]; } | { plugins: esbuild.Plugin[]; };

export default function importWebWorker(options?: Options): esbuild.Plugin {
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
                    path: args.path.substring(0, args.path.length - 9) + "js",
                    pluginData: path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path)
                };
            });

            build.onLoad({ filter: /.*/, namespace: name }, async args => {
                const result = await esbuild.build({
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