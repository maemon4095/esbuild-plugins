import type { Attributes } from "./mod.ts";

export const LinkAs: unique symbol = Symbol();
export const SourcePathAttribute: unique symbol = Symbol();

export type Link = {
    [LinkAs]: string;
    [SourcePathAttribute]: string;
} & Attributes;

export function link(props: LinkProps): Link {
    return {
        ...props,
        [LinkAs]: "link",
        [SourcePathAttribute]: "href"
    };
}

export function script(props: ScriptProps): Link {
    return {
        ...props,
        [LinkAs]: "script",
        [SourcePathAttribute]: "src"
    };
}

type LinkProps = {
    rel: string;
} & Attributes;

type ScriptProps = Attributes;
