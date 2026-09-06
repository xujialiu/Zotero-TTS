export declare const SITE: {
  readonly name: string;
  readonly base: string;
  readonly repo: string;
  readonly branch: string;
};

/** Build the public docs site into `outDir` (default: site/); returns the files written, site-relative. */
export declare function buildSite(options?: { outDir?: string; verification?: string }): string[];
