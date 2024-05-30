import type * as esbuild from "esbuild";
import * as linking from "./linking.ts";
import * as pathUtil from "@maemon4095/path";
import * as fs from "node:fs";
import * as path from "@std/path";
export { linking };

type Options = {
    filepath?: string;
    rootAttributes?: { lang?: string; } & Attributes;
    title?: string;
    meta?: Attributes[];
    staticFiles?: File[];
    linkByExtension?: {
        [ext: `.${string}`]: linking.Link;
    };
    link?(path: string): undefined | linking.Link;
    additionalFiles?(result: esbuild.BuildResult<{ metafile: true; }>): File[];
};

const linkByExtension = {
    ".js": linking.script({ "defer": true }),
    ".css": linking.link({ rel: "stylesheet" })
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
            const detemineLink = (() => {
                const extensionMap: { [ext: string]: linking.Link | undefined; } = options?.linkByExtension ?? linkByExtension;
                const linkFn = options?.link ?? (() => undefined);
                return (path: string) => {
                    let link = linkFn(path);
                    if (link !== undefined) return link;
                    const ext = pathUtil.ext(path);
                    link = extensionMap[ext];
                    return link;
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
                        const link = detemineLink(p);
                        if (link === undefined) continue;
                        yield { path: p, link };
                    }
                })();

                let source = `<!DOCTYPE html>\n<html`;
                source += createAttributeText(rootAttributes);
                source += ">\n<head>\n";

                for (const m of meta) {
                    source += "<meta" + createAttributeText(m) + "/>\n";
                }

                source += await createFileLinks(outdir, indexFileDir, files);
                source += createOutputLinks(indexFileDir, outputs);

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
            if (!value) continue;
            attrs += ` ${name}`;
        } else {
            attrs += ` ${name}=${JSON.stringify(value)}`;
        }
    }
    return attrs + " ";
}

async function createFileLinks(outdir: string, indexFileDir: string, files: Iterator<File>) {
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
        const elem = file.link[linking.LinkAs];
        const attr = file.link[linking.SourcePathAttribute];
        source += `<${elem} ${attr}=${JSON.stringify(relativePath)}`;
        source += createAttributeText(file.link);
        source += `></${elem}>\n`;
    }
    return source;
}

function createOutputLinks(indexFileDir: string, paths: Iterator<{ path: string, link: linking.Link; }>) {
    let source = "";
    while (true) {
        const { done, value } = paths.next();
        if (done) break;
        const { path: p, link } = value;
        const relativePath = path.relative(indexFileDir, p);
        const elem = link[linking.LinkAs];
        const attr = link[linking.SourcePathAttribute];

        source += `<${elem} ${attr}=${JSON.stringify(relativePath)}></${elem}>\n`;
    }
    return source;
}

export type File = FileWithPath | FileWithContents;

type FileWithPath = {
    name?: string;
    path: string;
    link: linking.Link;
};

type FileWithContents = {
    name: string;
    contents: string;
    link: linking.Link;
};

export type Attributes = { [name: string]: undefined | string | boolean; };