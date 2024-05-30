import type { Attributes } from "./mod.ts";

export const EmbedAs: unique symbol = Symbol();
export const SourcePathAttribute: unique symbol = Symbol();

export type Embedding = {
    [EmbedAs]: string;
    [SourcePathAttribute]: string;
} & Attributes;

export function link(props: EmbeddingLinkProps): Embedding {
    return {
        ...props,
        [EmbedAs]: "link",
        [SourcePathAttribute]: "href"
    };
}

export function script(props: EmbeddingScriptProps): Embedding {
    return {
        ...props,
        [EmbedAs]: "script",
        [SourcePathAttribute]: "src"
    };
}

type EmbeddingLinkProps = {
    rel: string;
} & Attributes;

type EmbeddingScriptProps = Attributes;
