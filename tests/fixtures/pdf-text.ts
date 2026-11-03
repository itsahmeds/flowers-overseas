/**
 * A small PDF reader for the invoice suites (spec 018 T-17, T-18, T-22, T-40; TASK-342): enough
 * of PDF to read what PDFKit writes, so the tests need no PDF library beyond the one the spec
 * names.
 *
 *  - `pdfObjects(bytes)`: every `n 0 obj … endobj`, its dictionary text and its stream, inflated
 *    when it is `FlateDecode` (PDFKit writes no object streams and no cross-reference streams).
 *  - `pdfText(bytes)`: the text of every content stream in drawing order, decoded through each
 *    font's `ToUnicode` CMap (`beginbfrange` arrays and ranges, `beginbfchar`), one string per
 *    `TJ`/`Tj` run, runs joined by "\n". That is the text a reader extracts: a glyph without a
 *    Unicode mapping comes out as U+FFFD, so a lost diacritic shows.
 *  - `pdfCatalog(bytes)`: the catalogue dictionary's text, for `StructTreeRoot`, `MarkInfo` and
 *    `Lang`.
 */
import { inflateSync } from "node:zlib";

export interface PdfObject {
  readonly id: number;
  readonly dictionary: string;
  readonly stream: Buffer | undefined;
}

const LATIN1 = "latin1";

export function pdfObjects(bytes: Uint8Array): PdfObject[] {
  const buffer = Buffer.from(bytes);
  const text = buffer.toString(LATIN1);
  const objects: PdfObject[] = [];
  const pattern = /(\d+) 0 obj\s*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index + match[0].length;
    const end = text.indexOf("endobj", start);
    const body = text.slice(start, end);
    const streamAt = body.indexOf("stream");
    let dictionary = body;
    let stream: Buffer | undefined;
    if (streamAt !== -1 && /^\s*<</.test(body)) {
      dictionary = body.slice(0, streamAt);
      let dataStart = start + streamAt + "stream".length;
      if (text[dataStart] === "\r") dataStart += 1;
      if (text[dataStart] === "\n") dataStart += 1;
      const lengthMatch = /\/Length (\d+)/.exec(dictionary);
      const length = lengthMatch === null ? 0 : Number(lengthMatch[1]);
      const raw = buffer.subarray(dataStart, dataStart + length);
      stream = dictionary.includes("/FlateDecode") ? inflateSync(raw) : raw;
    }
    objects.push({ id: Number(match[1]), dictionary, stream });
    pattern.lastIndex = end;
  }
  return objects;
}

/** The catalogue dictionary's text. */
export function pdfCatalog(bytes: Uint8Array): string {
  const catalog = pdfObjects(bytes).find((object) =>
    /\/Type \/Catalog/.test(object.dictionary),
  );
  if (catalog === undefined) throw new Error("no catalogue");
  return catalog.dictionary;
}

function hexToCodes(hex: string, width: number): number[] {
  const clean = hex.replace(/\s+/g, "");
  const codes: number[] = [];
  for (let index = 0; index < clean.length; index += width) {
    codes.push(Number.parseInt(clean.slice(index, index + width), 16));
  }
  return codes;
}

/** UTF-16BE hex (`<0041 0301>` or `<00410301>`) to a string. */
function utf16(hex: string): string {
  return String.fromCharCode(...hexToCodes(hex, 4));
}

/** A ToUnicode CMap's code → text map. */
function parseCmap(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1] ?? "";
    for (const entry of body.matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g,
    )) {
      const low = Number.parseInt(entry[1] ?? "0", 16);
      const high = Number.parseInt(entry[2] ?? "0", 16);
      const target = entry[3] ?? "";
      if (target.startsWith("[")) {
        const items = [...target.matchAll(/<([0-9a-fA-F\s]*)>/g)].map((item) =>
          utf16(item[1] ?? ""),
        );
        items.forEach((value, offset) => map.set(low + offset, value));
      } else {
        const base = hexToCodes(target.slice(1, -1), 4);
        for (let code = low; code <= high; code += 1) {
          const last = (base.at(-1) ?? 0) + (code - low);
          map.set(code, String.fromCharCode(...base.slice(0, -1), last));
        }
      }
    }
  }
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const entry of (block[1] ?? "").matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g,
    )) {
      map.set(Number.parseInt(entry[1] ?? "0", 16), utf16(entry[2] ?? ""));
    }
  }
  return map;
}

/** Each font resource name (`/F1`) → its ToUnicode map, read through the page resources. */
function fontMaps(
  objects: readonly PdfObject[],
): Map<string, Map<number, string>> {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const maps = new Map<string, Map<number, string>>();
  for (const object of objects) {
    const fontDictionary = /\/Font\s*<<([^>]*)>>/.exec(object.dictionary);
    if (fontDictionary === null) continue;
    for (const entry of (fontDictionary[1] ?? "").matchAll(
      /\/(\w+) (\d+) 0 R/g,
    )) {
      const name = entry[1] ?? "";
      const font = byId.get(Number(entry[2]));
      const toUnicode =
        font === undefined
          ? null
          : /\/ToUnicode (\d+) 0 R/.exec(font.dictionary);
      const cmap =
        toUnicode === null ? undefined : byId.get(Number(toUnicode[1]));
      if (cmap?.stream !== undefined) {
        maps.set(name, parseCmap(cmap.stream.toString(LATIN1)));
      }
    }
  }
  return maps;
}

/** The document's text runs, in drawing order, joined by "\n". */
export function pdfText(bytes: Uint8Array): string {
  const objects = pdfObjects(bytes);
  const maps = fontMaps(objects);
  const byId = new Map(objects.map((object) => [object.id, object]));
  const runs: string[] = [];
  for (const page of objects.filter((object) =>
    /\/Type \/Page\b/.test(object.dictionary),
  )) {
    const contents = /\/Contents (\d+) 0 R/.exec(page.dictionary);
    const stream =
      contents === null ? undefined : byId.get(Number(contents[1]))?.stream;
    if (stream === undefined) continue;
    const content = stream.toString(LATIN1);
    let current: Map<number, string> | undefined;
    const tokens =
      /\/(\w+) [\d.]+ Tf|\[((?:<[0-9a-fA-F]*>|[^\]])*)\] TJ|<([0-9a-fA-F]*)> Tj/g;
    for (const token of content.matchAll(tokens)) {
      if (token[1] !== undefined) {
        current = maps.get(token[1]);
        continue;
      }
      const hexes =
        token[2] !== undefined
          ? [...token[2].matchAll(/<([0-9a-fA-F]*)>/g)].map(
              (item) => item[1] ?? "",
            )
          : [token[3] ?? ""];
      const text = hexes
        .flatMap((hex) => hexToCodes(hex, 4))
        .map((code) => current?.get(code) ?? "�")
        .join("");
      runs.push(text);
    }
  }
  return runs.join("\n");
}
