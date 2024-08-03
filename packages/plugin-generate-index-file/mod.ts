import type * as esbuild from "esbuild";
import * as linking from "./linking.ts";
import * as pathUtil from "@maemon4095/path";
import * as fs from "node:fs";
import * as path from "@std/path";

export { linking };
export type Content = string | { tag: string, attributes: Attributes, contents: string; };
export type Options = { generate: (result: esbuild.BuildResult<esbuild.BuildOptions>) => GenerationOptions | GenerationOptions[]; };
export type GenerationOptions = {
    filepath?: string;
    rootAttributes?: { lang?: string; } & Attributes;
    title?: string;
    meta?: Attributes[];
    headContents?: Content[];
    bodyContents?: Content[];
    bodyAttributes?: Attributes,
    staticFiles?: File[];
    linkByExtension?: LinkByExtension;
    link?(path: string, file: OutputFileMeta): undefined | linking.Link;
    additionalFiles?: File[];
};
export type File = FileWithPath | FileWithContents;
export type FileWithPath = {
    name?: string;
    path: string;
    link: linking.Link;
};
export type FileWithContents = {
    name: string;
    contents: string;
    link: linking.Link;
};
export type Attributes = { [name: string]: undefined | string | boolean; };

type OutputFileMeta = esbuild.BuildResult<{ metafile: true; }>["metafile"]["outputs"][string];

export const defaultLinkByExtension: LinkByExtension = {
    ".js": linking.script({ "defer": true }),
    ".css": linking.link({ rel: "stylesheet" })
};

export const defaultMeta: Attributes[] = [
    { charset: "UTF-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1.0" }
];

type LinkByExtension = {
    [ext: `.${string}`]: linking.Link;
};

export default function generateIndexFile(options: Options): esbuild.Plugin {
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
            const generate = options.generate;

            build.onEnd(async result => {
                let options = generate?.(result) ?? [];
                if (!Array.isArray(options)) {
                    options = [options];
                }

                for (const option of options) {
                    await createIndexFile(result, outdir, option);
                }
            });
        }
    };
};

async function createIndexFile(result: esbuild.BuildResult<esbuild.BuildOptions>, outdir: string, options: GenerationOptions) {
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
        const extensionMap: { [ext: string]: linking.Link | undefined; } = options?.linkByExtension ?? {};
        const linkFn = options?.link ?? (() => undefined);
        return (path: string, file: OutputFileMeta) => {
            let link = linkFn(path, file);
            if (link !== undefined) return link;
            const ext = pathUtil.ext(path);
            link = extensionMap[ext];
            return link;
        };
    })();
    const additionalFiles = options?.additionalFiles ?? [];
    const meta = options?.meta ?? [];
    const headContents = options?.headContents ?? [];
    const bodyContents = options?.bodyContents ?? [];
    const bodyAttributes = options?.bodyAttributes ?? {};

    const files = (function* (): Iterator<File> {
        yield* staticFiles;
        yield* additionalFiles;
    })();
    const outputs = (function* () {
        const outs = result.metafile!.outputs;
        for (const [p, f] of Object.entries(outs)) {
            const link = detemineLink(p, f);
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
    source += embedContents(headContents);

    source += "</head>\n<body";
    source += createAttributeText(bodyAttributes);
    source += ">";
    source += embedContents(bodyContents);
    source += "</body></html>";

    await fs.promises.mkdir(indexFileDir, { recursive: true });
    await fs.promises.writeFile(indexFilePath, source);
}

function createAttributeText(attributes: Attributes): string {
    const entries = Object.entries(attributes);
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
    return attrs;
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
                const contents = await fs.promises.readFile(file.path);
                return { filepath, contents: contents.toString() };
            }
        })();

        await fs.promises.mkdir(path.dirname(filepath), { recursive: true });
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

        source += `<${elem} ${attr}=${JSON.stringify(relativePath)}`;
        source += createAttributeText(link);
        source += `></${elem}>\n`;
    }
    return source;
}

function embedContents(elements: Content[]) {
    let result = "";

    for (const content of elements) {
        if (typeof content === "string") {
            result += content;
        } else {
            const { tag, attributes, contents } = content;
            result += `<${tag}${createAttributeText(attributes)}>${contents}</${tag}>`;
        }
    }

    return result;
}

