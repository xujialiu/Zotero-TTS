// Zotero 插件沙箱注入的全局。类型故意保持宽松 —— 我们不试图为
// Zotero 的整个 API 建模，只在用到的地方就地收窄。
declare const Zotero: any;
declare const Services: any;
declare const Components: any;

interface Document {
  createXULElement(name: string): HTMLElement;
}
