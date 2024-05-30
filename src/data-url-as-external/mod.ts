import type { Plugin } from "esbuild";

export default function dataUrlAsExternalPlugin(): Plugin {
    return {
        name: "data-url-as-external",
        setup(build) {
            build.onResolve({ filter: /^data.*$/ }, args => {
                return { path: args.path, external: true };
            });
        }
    };
}