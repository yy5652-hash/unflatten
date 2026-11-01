import { zipSync, strToU8 } from "fflate";
import type { Worksheet } from "../parse/types";
import { semanticHTML, xml } from "./content";
export function makeEpub(doc: Worksheet, withAnswers: boolean): Uint8Array {
  const title = xml(doc.name),
    lang = xml(doc.language),
    id = xml(doc.id);
  const head = `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}"><head><title>${title}</title></head><body dir="${lang === "ar" ? "rtl" : "ltr"}">`;
  return zipSync({
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    "OEBPS/package.opf": strToU8(
      `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:unflatten:${id}</dc:identifier><dc:title>${title}</dc:title><dc:language>${lang}</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z/, "Z")}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="content" href="content.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="content"/></spine></package>`,
    ),
    "OEBPS/nav.xhtml": strToU8(
      `${head}<nav epub:type="toc"><h1>Contents</h1><ol><li><a href="content.xhtml">${title}</a></li>${doc.blocks
        .filter((b) => b.kind === "heading")
        .map(
          (b) =>
            `<li><a href="content.xhtml#${xml(b.id)}">${xml(b.text)}</a></li>`,
        )
        .join("")}</ol></nav></body></html>`,
    ),
    "OEBPS/content.xhtml": strToU8(
      `${head}${semanticHTML(doc, withAnswers)}</body></html>`,
    ),
  });
}
