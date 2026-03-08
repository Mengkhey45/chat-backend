export interface LinkPreview {
    url: string;
    title?: string;
    description?: string;
    image?: string;
}
export declare function fetchLinkPreview(url: string): Promise<LinkPreview | null>;
//# sourceMappingURL=linkPreview.d.ts.map