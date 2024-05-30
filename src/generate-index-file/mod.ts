import type * as esbuild from "esbuild";
import * as embedding from "./embedding.ts";
import * as pathUtil from "../util/path/mod.ts";
import * as fs from "node:fs";
import * as path from "@std/path";
export { embedding };

type Options = {
    filepath?: string;
    rootAttributes?: { lang?: string; } & Attributes;
    title?: string;
    meta?: Attributes[];
    staticFiles?: File[];
    embedByExtension?: {
        [ext: `.${string}`]: embedding.Embedding;
    };
    embed?(path: string): undefined | embedding.Embedding;
    additionalFiles?(result: esbuild.BuildResult<{ metafile: true; }>): File[];
};

const embedByExtension = {
    [".js"]: embedding.script({})
};

export default function generateIndexFile(options?: Options): esbuild.Plugin {
    const name = "generate-index-file";
    return {
        name,
        setup(build) {
            if (!build.initialOptions.metafile) {
                build.initialOptions.metafile = true;
                console.warn(`[${name}] WARN: Change to enable metafile.`);
            }
            const { outdir } = build.initialOptions;
            if (outdir === undefined) {
                throw new Error(`outdir must be set.`);
            }
            const rootAttributes = options?.rootAttributes ?? {};
            const indexFilePath = (() => {
                const p = options?.filepath ?? "index.html";
                if (path.isAbsolute(p)) {
                    return p;
                }
                return path.join(outdir, p);
            })();
            const indexFileDir = path.dirname(indexFilePath);
            const staticFiles = options?.staticFiles ?? [];
            const detemineEmbedding = (() => {
                const extensionMap: { [ext: string]: embedding.Embedding | undefined; } = options?.embedByExtension ?? embedByExtension;
                const embedFn = options?.embed ?? (() => undefined);
                return (path: string) => {
                    let embed = embedFn(path);
                    if (embed !== undefined) return embed;
                    const ext = pathUtil.ext(path);
                    embed = extensionMap[ext];
                    return embed;
                };
            })();
            const additionalFiles = options?.additionalFiles ?? (() => []);
            const meta = options?.meta ?? [];
            build.onEnd(async result => {
                const files = (function* (): Iterator<File> {
                    yield* staticFiles;
                    yield* additionalFiles(result);
                })();
                const outputs = (function* () {
                    const outs = result.metafile!.outputs;
                    for (const p of Object.keys(outs)) {
                        const embed = detemineEmbedding(p);
                        if (embed === undefined) continue;
                        yield { path: p, embed };
                    }
                })();

                let source = `<!DOCTYPE html>\n<html`;
                source += createAttributeText(rootAttributes);
                source += ">\n<head>\n";

                for (const m of meta) {
                    source += "<meta" + createAttributeText(m) + "/>\n";
                }

                source += await createFileEmbeds(outdir, indexFileDir, files);
                source += createOutputEmbeds(indexFileDir, outputs);

                source += "</head>\n<body></body>\n</html>";

                await fs.promises.mkdir(indexFileDir, { recursive: true });
                await fs.promises.writeFile(indexFilePath, source);
            });
        }
    };
};

function createAttributeText(attributes: Attributes): string {
    const entries = Object.entries(attributes);
    if (entries.length === 0) {
        return "";
    }
    let attrs = "";
    for (const [name, value] of entries) {
        if (value === undefined) continue;
        if (typeof value === "boolean") {
            attrs += ` ${name}`;
        } else {
            attrs += ` ${name}=${JSON.stringify(value)}`;
        }
    }
    return attrs + " ";
}

async function createFileEmbeds(outdir: string, indexFileDir: string, files: Iterator<File>) {
    let source = "";
    while (true) {
        const { done, value: file } = files.next();
        if (done) break;
        const { filepath, contents } = await (async () => {
            if ("contents" in file) {
                const filepath = path.join(outdir, file.name);
                return { filepath, contents: file.contents };
            } else {
                const filepath = path.join(outdir, file.name ?? path.basename(file.path));
                await fs.promises.mkdir(path.dirname(filepath));
                const contents = await fs.promises.readFile(file.path);
                return { filepath, contents: contents.toString() };
            }
        })();

        await fs.promises.mkdir(path.dirname(filepath));
        await fs.promises.writeFile(filepath, contents.toString());

        const relativePath = path.relative(indexFileDir, filepath);
        const elem = file.embed[embedding.EmbedAs];
        const attr = file.embed[embedding.SourcePathAttribute];
        source += `<${elem} ${attr}=${JSON.stringify(relativePath)}`;
        source += createAttributeText(file.embed);
        source += `></${elem}>\n`;
    }
    return source;
}

function createOutputEmbeds(indexFileDir: string, paths: Iterator<{ path: string, embed: embedding.Embedding; }>) {
    let source = "";
    while (true) {
        const { done, value } = paths.next();
        if (done) break;
        const { path: p, embed } = value;
        const relativePath = path.relative(indexFileDir, p);
        const elem = embed[embedding.EmbedAs];
        const attr = embed[embedding.SourcePathAttribute];

        source += `<${elem} ${attr}=${JSON.stringify(relativePath)}></${elem}>\n`;
    }
    return source;
}

export type File = FileWithPath | FileWithContents;

type FileWithPath = {
    name?: string;
    path: string;
    embed: embedding.Embedding;
};

type FileWithContents = {
    name: string;
    contents: string;
    embed: embedding.Embedding;
};

export type Attributes = { [name: string]: undefined | string | boolean; };