import postcss, { AcceptedPlugin } from "postcss";
import * as esbuild from "esbuild";
import { ImportMap, createResolverFromImportMap, defaultResolve } from "@maemon4095-esbuild-x/util-resolver";

export type Options = {
    plugins?: AcceptedPlugin[];
    importMap?: string | ImportMap;
};
export default function postCssPlugin(options: Options): esbuild.Plugin {
    const name = "postCssPlugin";
    const { plugins, importMap: importMapOrPath } = options;

    const importMapResolver = createResolverFromImportMap(importMapOrPath ?? {});

    return {
        name,
        setup(build) {
            build.onResolve({ filter: /.*\.css/ }, args => {
                return {
                    path: importMapResolver(args.path) ?? defaultResolve(args),
                    namespace: name,
                };
            });

            build.onLoad({ filter: /.*/, namespace: name }, async args => {
                const cssdata = await Deno.readFile(args.path);
                const cssfile = new TextDecoder().decode(cssdata);

                const result = await postcss(plugins).process(cssfile, { from: args.path });

                return { contents: result.css, loader: "css" };
            });
        }
    };
}