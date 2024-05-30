const pattern = /^(?<base>.*?)(?<ext>(\.[^/\\\.]+)*)$/;

export function withoutExt(path: string): string {
    const match = path.match(pattern)!;
    return match.groups!.base;
}

export function ext(path: string): string {
    const match = path.match(pattern)!;
    return match.groups!.ext;
}