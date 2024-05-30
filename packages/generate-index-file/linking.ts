import type { Attributes } from "./mod.ts";

export const LinkAs: unique symbol = Symbol();
export const SourcePathAttribute: unique symbol = Symbol();

export type Link = {
    [LinkAs]: string;
    [SourcePathAttribute]: string;
} & Attributes;

export function link(props: EmbeddingLinkProps): Link {
    return {
        ...props,
        [LinkAs]: "link",
        [SourcePathAttribute]: "href"
    };
}

export function script(props: EmbeddingScriptProps): Link {
    return {
        ...props,
        [LinkAs]: "script",
        [SourcePathAttribute]: "src"
    };
}

type EmbeddingLinkProps = {
    rel: string;
} & Attributes;

type EmbeddingScriptProps = Attributes;
