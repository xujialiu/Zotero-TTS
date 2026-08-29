// Globals injected by the Zotero plugin sandbox. Types are deliberately
// kept loose — we don't try to model the whole Zotero API, only narrow
// it in place where it's actually used.
declare const Zotero: any;
declare const Services: any;
declare const Components: any;
declare const ChromeUtils: any;
declare const IOUtils: any;

// Baked in by scripts/build.mjs (esbuild `define`): the date the xpi was
// built, shown in the pane's Build section. Undefined outside a build.
declare const __BUILD_DATE__: string | undefined;

interface Document {
  createXULElement(name: string): HTMLElement;
}
