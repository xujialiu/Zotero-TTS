// Globals injected by the Zotero plugin sandbox. Types are deliberately
// kept loose — we don't try to model the whole Zotero API, only narrow
// it in place where it's actually used.
declare const Zotero: any;
declare const Services: any;
declare const Components: any;

interface Document {
  createXULElement(name: string): HTMLElement;
}
