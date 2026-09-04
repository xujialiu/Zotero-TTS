// Globals injected by the Zotero plugin sandbox. Types are deliberately
// kept loose — we don't try to model the whole Zotero API, only narrow
// it in place where it's actually used.
declare const Zotero: any;
declare const Services: any;
declare const Components: any;
declare const ChromeUtils: any;
declare const IOUtils: any;
declare const PathUtils: any;
// Fluent's Localization constructor, handed into the sandbox beside the
// whitelist (xpcom/plugins.js _loadScope); core/l10n.ts formats through a
// sync instance of it over the plugin's own file
declare const Localization: any;

// The bootstrap reason constants, copied into the sandbox scope by Zotero's
// plugins.js (`for (let name in REASONS) scope[name] = ...`). Only the ones
// shutdown() actually compares against are declared here.
declare const ADDON_DISABLE: number;
declare const ADDON_UNINSTALL: number;

// Baked in by scripts/build.mjs (esbuild `define`): the date the xpi was
// built, shown in the pane's Build section. Undefined outside a build.
declare const __BUILD_DATE__: string | undefined;

interface Document {
  createXULElement(name: string): HTMLElement;
}
