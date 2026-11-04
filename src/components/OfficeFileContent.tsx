"use client";

/* Embedded images are local Blob URLs, so they cannot use the Next image optimization service. */
/* eslint-disable @next/next/no-img-element */

import React, { useMemo, useState } from "react";
import { attr, children, columnLabel, columnNumber, descendants, OfficePackage, text } from "@/lib/officeFiles";
import type { OfficeKind } from "@/lib/officeFiles";

interface Props { document: OfficePackage; kind: OfficeKind; edits: Record<string, string>; onEdit: (key: string, value: string) => void }
const pageStyle: React.CSSProperties = { color: "#202124", background: "white", padding: "48px 56px", minHeight: 700, fontFamily: "Calibri, Arial, sans-serif", lineHeight: 1.5, boxShadow: "0 2px 8px #0003" };

function EditableText({ node, part, document, edits, onEdit }: Omit<Props, "kind"> & { node: Element; part: string }) {
  const key = document.textKey(part, node);
  const [initialText] = useState(() => edits[key] ?? node.textContent);
  const properties = node.parentElement && children(node.parentElement, "rPr")[0];
  const size = properties && descendants(properties, "sz")[0];
  const color = properties && descendants(properties, "color")[0];
  const rawColor = attr(color || undefined, "val");
  return <span contentEditable="plaintext-only" suppressContentEditableWarning spellCheck data-office-edit={key} onInput={(event) => onEdit(key, event.currentTarget.textContent ?? "")} style={{ whiteSpace: "pre-wrap", outlineColor: "#6965db", fontWeight: properties && descendants(properties, "b").length ? "bold" : undefined, fontStyle: properties && descendants(properties, "i").length ? "italic" : undefined, textDecoration: properties && descendants(properties, "u").length ? "underline" : undefined, fontSize: size ? `${Number(attr(size, "val")) / 2}pt` : undefined, color: /^[\da-f]{6}$/i.test(rawColor) ? `#${rawColor}` : undefined }}>{initialText}</span>;
}

function WordContent(props: Props) {
  const part = "word/document.xml";
  const body = descendants(props.document.xml(part), "body")[0];
  const images = useMemo(() => {
    const relationships = props.document.relationships(part); const result = new Map<Element, string>();
    for (const node of descendants(props.document.xml(part), "blip")) { const image = props.document.image(relationships.get(attr(node, "embed"))); if (image) result.set(node, image); }
    return result;
  }, [props.document]);
  const render = (node: Element, index: number): React.ReactNode => {
    if (node.localName === "tbl") return <table key={index} style={{ borderCollapse: "collapse", width: "100%", margin: "12px 0" }}><tbody>{children(node, "tr").map((row, ri) => <tr key={ri}>{children(row, "tc").map((cell, ci) => <td key={ci} style={{ border: "1px solid #b6b6bf", padding: 8, verticalAlign: "top" }}>{Array.from(cell.children).map(render)}</td>)}</tr>)}</tbody></table>;
    if (node.localName !== "p") return null;
    const style = attr(descendants(node, "pStyle")[0], "val");
    return <div key={index} style={{ margin: "0 0 9px", minHeight: 20, fontSize: /heading1|title/i.test(style) ? 26 : /heading2/i.test(style) ? 21 : undefined, fontWeight: /heading|title/i.test(style) ? 600 : undefined }}>
      {Array.from(node.getElementsByTagNameNS("*", "r")).map((run, ri) => <React.Fragment key={ri}>{Array.from(run.children).map((child, ti) => child.localName === "t" ? <EditableText key={ti} {...props} node={child} part={part} /> : child.localName === "br" ? <br key={ti} /> : child.localName === "tab" ? <span key={ti}>{"\t"}</span> : null)}{descendants(run, "blip").map((image, ii) => images.get(image) ? <img key={ii} src={images.get(image)} alt="Document image" style={{ maxWidth: "100%", height: "auto" }} /> : null)}</React.Fragment>)}
    </div>;
  };
  if (!body) throw new Error("This document has no readable body.");
  return <article aria-label="Word document" style={{ ...pageStyle, maxWidth: 850, margin: "0 auto" }}>{Array.from(body.children).map(render)}</article>;
}

function SpreadsheetContent(props: Props) {
  const [selected, setSelected] = useState(0); const [page, setPage] = useState(0);
  const sheets = useMemo(() => {
    const relationships = props.document.relationships("xl/workbook.xml");
    return descendants(props.document.xml("xl/workbook.xml"), "sheet").map((sheet) => ({ name: attr(sheet, "name"), part: relationships.get(attr(sheet, "r:id")) ?? "" })).filter((sheet) => sheet.part);
  }, [props.document]);
  const sheet = sheets[selected];
  const model = useMemo(() => {
    const shared = props.document.files["xl/sharedStrings.xml"] ? descendants(props.document.xml("xl/sharedStrings.xml"), "si").map(text) : [];
    const cells = new Map<string, { value: string; formula: string }>(); let rows = 20; let columns = 8;
    if (sheet) for (const cell of descendants(props.document.xml(sheet.part), "c")) {
      const address = attr(cell, "r"); const value = children(cell, "v")[0]?.textContent ?? "";
      cells.set(address, { value: attr(cell, "t") === "s" ? shared[Number(value)] ?? "" : attr(cell, "t") === "inlineStr" ? text(cell) : attr(cell, "t") === "b" ? value === "1" ? "TRUE" : "FALSE" : value, formula: children(cell, "f")[0]?.textContent ?? "" });
      rows = Math.max(rows, Number(address.match(/\d+$/)?.[0] ?? 1)); columns = Math.max(columns, columnNumber(address));
    }
    return { cells, rows, columns };
  }, [sheet, props.document]);
  const [columnPage, setColumnPage] = useState(0);
  if (!sheet) throw new Error("This workbook has no readable worksheets.");
  const from = page * 100 + 1; const columnFrom = columnPage * 30 + 1;
  const range = (count: number, start: number) => Array.from({ length: Math.max(0, count) }, (_, index) => start + index);
  const rows = range(Math.min(100, model.rows - from + 1), from); const columns = range(Math.min(30, model.columns - columnFrom + 1), columnFrom);
  return <div aria-label="Excel workbook" style={{ color: "#202124", background: "white", minHeight: "100%" }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 8, position: "sticky", top: 0, zIndex: 1, background: "#f1f3f4" }}>
      <select aria-label="Worksheet" value={selected} onChange={(event) => { setSelected(Number(event.target.value)); setPage(0); setColumnPage(0); }}>{sheets.map((item, index) => <option key={item.part} value={index}>{item.name}</option>)}</select>
      <button disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous rows</button><span>Rows {from}–{Math.min(model.rows, from + 99)}</span><button disabled={from + 100 > model.rows} onClick={() => setPage((current) => current + 1)}>Next rows</button>
      <button disabled={columnPage === 0} onClick={() => setColumnPage((current) => current - 1)}>Previous columns</button><button disabled={columnFrom + 30 > model.columns} onClick={() => setColumnPage((current) => current + 1)}>Next columns</button>
    </div>
    <table style={{ borderCollapse: "collapse", font: "13px Arial, sans-serif" }}><thead><tr><th />{columns.map((column) => <th key={column} style={{ padding: 5, background: "#eef0f1" }}>{columnLabel(column)}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row}><th style={{ padding: 5, background: "#eef0f1" }}>{row}</th>{columns.map((column) => {
      const address = `${columnLabel(column)}${row}`; const key = `${sheet.part}#cell-${address}`; const cell = model.cells.get(address);
      return <td key={key} style={{ border: "1px solid #dadce0", minWidth: 115 }}><input aria-label={`${sheet.name} ${address}`} title={cell?.formula ? `Formula: =${cell.formula}` : address} defaultValue={props.edits[key] ?? cell?.value ?? ""} onChange={(event) => props.onEdit(key, event.target.value)} style={{ width: "100%", minWidth: 115, padding: "5px 7px", color: "inherit", background: "transparent", border: 0 }} /></td>;
    })}</tr>)}</tbody></table>
    <p style={{ padding: 10, fontSize: 12, color: "#5f6368" }}>Existing formulas are preserved. Calculated results refresh when the downloaded workbook is opened in Excel.</p>
  </div>;
}

function PresentationContent(props: Props) {
  const [selected, setSelected] = useState(0);
  const model = useMemo(() => {
    const doc = props.document.xml("ppt/presentation.xml"); const relationships = props.document.relationships("ppt/presentation.xml");
    const size = descendants(doc, "sldSz")[0]; const width = Number(attr(size, "cx")) || 9144000; const height = Number(attr(size, "cy")) || 5143500;
    const slides = descendants(doc, "sldId").map((slide) => relationships.get(attr(slide, "r:id"))).filter((part): part is string => !!part);
    return { width, height, slides: slides.map((part) => {
      const document = props.document.xml(part); const relationships = props.document.relationships(part);
      const images = new Map<Element, string>(); for (const node of descendants(document, "blip")) { const image = props.document.image(relationships.get(attr(node, "embed"))); if (image) images.set(node, image); }
      return { part, document, images };
    }) };
  }, [props.document]);
  const slide = model.slides[selected];
  if (!slide) throw new Error("This presentation has no readable slides.");
  const tree = descendants(slide.document, "spTree")[0];
  return <div aria-label="PowerPoint presentation" style={{ color: "#202124" }}>
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 8, background: "#f1f3f4" }}><button disabled={selected === 0} onClick={() => setSelected((current) => current - 1)}>Previous slide</button><select aria-label="Slide" value={selected} onChange={(event) => setSelected(Number(event.target.value))}>{model.slides.map((item, index) => <option key={item.part} value={index}>Slide {index + 1}</option>)}</select><span>of {model.slides.length}</span><button disabled={selected === model.slides.length - 1} onClick={() => setSelected((current) => current + 1)}>Next slide</button></div>
    <div style={{ position: "relative", background: "white", width: "100%", aspectRatio: `${model.width}/${model.height}`, containerType: "inline-size", overflow: "hidden" }}>
      {tree && Array.from(tree.children).filter((node) => node.localName === "sp" || node.localName === "pic").map((shape, index) => {
        const transform = descendants(shape, "xfrm")[0]; const offset = transform && children(transform, "off")[0]; const extent = transform && children(transform, "ext")[0];
        const box: React.CSSProperties = { position: "absolute", left: offset ? `${Number(attr(offset, "x")) / model.width * 100}%` : "6%", top: offset ? `${Number(attr(offset, "y")) / model.height * 100}%` : `${8 + index * 16}%`, width: extent ? `${Number(attr(extent, "cx")) / model.width * 100}%` : "88%", height: extent ? `${Number(attr(extent, "cy")) / model.height * 100}%` : "auto", overflow: "auto" };
        const image = descendants(shape, "blip")[0];
        if (image) return slide.images.get(image) ? <img key={index} src={slide.images.get(image)} alt="Slide image" style={{ ...box, objectFit: "contain" }} /> : null;
        return <div key={`${slide.part}-${index}`} style={{ ...box, padding: "0.5%", fontFamily: "Calibri, Arial, sans-serif", fontSize: "2.5cqw", lineHeight: 1.2 }}>{descendants(shape, "p").map((paragraph, pi) => <div key={pi} style={{ minHeight: "1em" }}>{descendants(paragraph, "t").map((node) => <EditableText key={props.document.textKey(slide.part, node)} {...props} part={slide.part} node={node} />)}</div>)}</div>;
      })}
    </div>
  </div>;
}

export default function OfficeFileContent(props: Props) {
  return props.kind === "docx" ? <WordContent {...props} /> : props.kind === "xlsx" ? <SpreadsheetContent {...props} /> : <PresentationContent {...props} />;
}
