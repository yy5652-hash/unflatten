import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
} from "docx";
import { answerKeys, type Worksheet } from "../parse/types";
export async function makeDocx(
  doc: Worksheet,
  withAnswers: boolean,
): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];
  for (const b of doc.blocks) {
    children.push(
      new Paragraph({
        text: b.text,
        heading:
          b.kind === "title"
            ? HeadingLevel.HEADING_1
            : b.kind === "heading"
              ? HeadingLevel.HEADING_2
              : undefined,
        bidirectional: doc.language === "ar",
      }),
    );
    for (const o of b.options ?? [])
      children.push(new Paragraph({ text: o, bullet: { level: 0 } }));
    if (b.cells)
      children.push(
        new Table({
          rows: b.cells.map(
            (r, i) =>
              new TableRow({
                tableHeader: i === 0,
                children: r.map(
                  (c, j) =>
                    new TableCell({
                      children: [
                        new Paragraph(
                          c ||
                            (withAnswers
                              ? doc.answers[`${b.id}-${i}-${j}`]
                              : "") ||
                            "________",
                        ),
                      ],
                    }),
                ),
              }),
          ),
        }),
      );
    if (b.pairs)
      for (const [i, p] of b.pairs.entries())
        children.push(
          new Paragraph(
            `${p}: ${withAnswers ? doc.answers[`${b.id}-${i}`] || "________" : "________"}`,
          ),
        );
    if (!b.cells && !b.pairs)
      for (const k of answerKeys(b))
        children.push(
          new Paragraph(
            `Answer: ${withAnswers ? doc.answers[k] || "________" : "________"}`,
          ),
        );
    if (b.figureText)
      children.push(
        new Paragraph(`Text found in this figure: ${b.figureText}`),
      );
  }
  return Packer.toBlob(
    new Document({
      title: doc.name,
      creator: "Unflatten",
      sections: [{ children }],
    }),
  );
}
