import { strFromU8, strToU8, unzip, zip } from "fflate";

export type OfficeKind = "docx" | "xlsx" | "pptx";
export interface OfficeWindowItem {
  id: string; canvasId: string; file: File; kind: OfficeKind;
  x: number; y: number; width?: number; height?: number;
  edits?: Record<string, string>;
}
export function officeKind(name: string): OfficeKind | null {
  const extension = name.split(".").pop()?.toLowerCase();
  return extension === "docx" || extension === "xlsx" || extension === "pptx" ? extension : null;
}
export const children = (element: Element, name: string) => Array.from(element.children).filter((node) => node.localName === name);
export const descendants = (element: Document | Element, name: string) => Array.from(element.getElementsByTagNameNS("*", name));
export const attr = (element: Element | undefined, name: string) => element ? Array.from(element.attributes).find((attribute) => name === "r:id" ? attribute.localName === "id" && !!attribute.namespaceURI : attribute.localName === name)?.value ?? "" : "";
export const text = (element: Element) => descendants(element, "t").map((node) => node.textContent ?? "").join("");
const normalize = (path: string) => {
  const result: string[] = [];
  for (const segment of path.split("/")) { if (segment === "..") result.pop(); else if (segment && segment !== ".") result.push(segment); }
  return result.join("/");
};

export class OfficePackage {
  documents = new Map<string, Document>();
  textKeys = new WeakMap<Element, string>();
  objectUrls: string[] = [];
  constructor(public files: Record<string, Uint8Array>) {}
  xml(path: string): Document {
    if (this.documents.has(path)) return this.documents.get(path)!;
    if (!this.files[path]) throw new Error(`This file is missing ${path}.`);
    const document = new DOMParser().parseFromString(strFromU8(this.files[path]), "application/xml");
    if (document.getElementsByTagName("parsererror").length) throw new Error("This Office file contains invalid XML.");
    this.documents.set(path, document);
    descendants(document, "t").forEach((node, index) => this.textKeys.set(node, `${path}#text-${index}`));
    return document;
  }
  relationships(part: string) {
    const slash = part.lastIndexOf("/");
    const directory = part.slice(0, slash + 1);
    const relPath = `${directory}_rels/${part.slice(slash + 1)}.rels`;
    const result = new Map<string, string>();
    if (!this.files[relPath]) return result;
    for (const rel of descendants(this.xml(relPath), "Relationship")) {
      if (attr(rel, "TargetMode") === "External") continue;
      const target = attr(rel, "Target");
      result.set(attr(rel, "Id"), normalize(target.startsWith("/") ? target : directory + target));
    }
    return result;
  }
  image(path: string | undefined): string | undefined {
    if (!path || !this.files[path]) return;
    const ext = path.split(".").pop()?.toLowerCase();
    const mime = ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" } as Record<string, string>)[ext ?? ""];
    if (!mime) return;
    const url = URL.createObjectURL(new Blob([new Uint8Array(this.files[path])], { type: mime }));
    this.objectUrls.push(url);
    return url;
  }
  destroy() { this.objectUrls.forEach((url) => URL.revokeObjectURL(url)); }
  textKey(part: string, node: Element) { return this.textKeys.get(node) ?? `${part}#text--1`; }
  async export(edits: Record<string, string>): Promise<Uint8Array> {
    const files = { ...this.files };
    const modified = new Map<string, Document>();
    const copy = (part: string) => {
      if (!modified.has(part)) modified.set(part, this.xml(part).cloneNode(true) as Document);
      return modified.get(part)!;
    };
    for (const [key, value] of Object.entries(edits)) {
      const split = key.lastIndexOf("#"); const part = key.slice(0, split); const reference = key.slice(split + 1);
      if (!this.files[part]) continue;
      const doc = copy(part);
      if (reference.startsWith("text-")) {
        const node = descendants(doc, "t")[Number(reference.slice(5))];
        if (node) { node.textContent = value; node.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve"); }
      } else if (reference.startsWith("cell-")) {
        const address = reference.slice(5);
        const namespace = doc.documentElement.namespaceURI!;
        const sheetData = descendants(doc, "sheetData")[0];
        if (!sheetData) continue;
        const rowNumber = Number(address.match(/\d+$/)?.[0]);
        let row = children(sheetData, "row").find((node) => Number(attr(node, "r")) === rowNumber);
        if (!row) { row = doc.createElementNS(namespace, "row"); row.setAttribute("r", String(rowNumber)); sheetData.insertBefore(row, children(sheetData, "row").find((node) => Number(attr(node, "r")) > rowNumber) ?? null); }
        let cell = children(row, "c").find((node) => attr(node, "r") === address);
        if (!cell) { cell = doc.createElementNS(namespace, "c"); cell.setAttribute("r", address); row.insertBefore(cell, children(row, "c").find((node) => columnNumber(attr(node, "r")) > columnNumber(address)) ?? null); }
        cell.replaceChildren();
        cell.setAttribute("t", "inlineStr");
        const inline = doc.createElementNS(namespace, "is"); const content = doc.createElementNS(namespace, "t");
        content.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve"); content.textContent = value; inline.append(content); cell.append(inline);
        if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) { cell.removeAttribute("t"); const numeric = doc.createElementNS(namespace, "v"); numeric.textContent = value; cell.replaceChildren(numeric); }
      }
    }
    if (Object.keys(edits).some((key) => key.includes("#cell-")) && files["xl/workbook.xml"]) {
      const doc = copy("xl/workbook.xml"); let calc = descendants(doc, "calcPr")[0];
      if (!calc) { calc = doc.createElementNS(doc.documentElement.namespaceURI, "calcPr"); doc.documentElement.append(calc); }
      calc.setAttribute("fullCalcOnLoad", "1"); calc.setAttribute("forceFullCalc", "1");
    }
    for (const [part, doc] of modified) files[part] = strToU8(new XMLSerializer().serializeToString(doc));
    return new Promise((resolve, reject) => zip(files, { level: 4 }, (error, data) => error ? reject(error) : resolve(data)));
  }
}
export function columnNumber(address: string) { return (address.match(/^[A-Z]+/)?.[0] ?? "A").split("").reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0); }
export function columnLabel(number: number): string { let label = ""; while (number > 0) { number--; label = String.fromCharCode(65 + number % 26) + label; number = Math.floor(number / 26); } return label; }
export async function openOfficeFile(file: File) {
  if (file.size > 40 * 1024 * 1024) throw new Error("Please use an Office file smaller than 40 MB.");
  let expandedSize = 0; let oversized = false;
  const files = await new Promise<Record<string, Uint8Array>>(async (resolve, reject) => {
    try {
      unzip(new Uint8Array(await file.arrayBuffer()), { filter: (entry) => { expandedSize += entry.originalSize; if (expandedSize > 100 * 1024 * 1024) oversized = true; return !oversized; } }, (error, result) => error ? reject(new Error("This file cannot be opened. It may be encrypted, damaged, or not an Office Open XML file.")) : resolve(result));
    } catch (error) { reject(error); }
  });
  if (oversized) throw new Error("The expanded file is too large to edit safely in this window.");
  return new OfficePackage(files);
}
