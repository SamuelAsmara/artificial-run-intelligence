const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  Header, Footer, PageNumber, LevelFormat, convertInchesToTwip,
} = require("docx");

const FONT = "Arial";
const INK = "111111", MUTED = "555555", RULE = "BFBFBF", HEAD = "1F3864", BAND = "EEF2F8";
const PAGE_W = 12240 - 2 * 1440;           // Letter minus 1" margins, in DXA
const rtl = { rightToLeft: true, font: FONT };

/* ---------- inline: **bold** and `code` ---------------------------- */
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ ...rtl, ...base, text: text.slice(last, m.index) }));
    const tok = m[0];
    if (tok.startsWith("**")) {
      // Recurse: bold spans in these documents routinely contain an inline
      // code identifier, and handling bold first meant the backticks inside it
      // were printed literally.
      out.push(...runs(tok.slice(2, -2), { ...base, bold: true }));
    } else if (tok.startsWith("*")) {
      out.push(...runs(tok.slice(1, -1), { ...base, italics: true }));
    } else {
      out.push(new TextRun({ ...base, text: tok.slice(1, -1), font: "Courier New", size: 19, color: "8A3A2A", rightToLeft: false }));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ ...rtl, ...base, text: text.slice(last) }));
  return out.length ? out : [new TextRun({ ...rtl, ...base, text: "" })];
}

const para = (text, o = {}) =>
  new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: 140, line: 300 },
    children: runs(text, o.run || {}),
    ...o.p,
  });

/* ---------- tables -------------------------------------------------- */
function buildTable(rows) {
  const cols = Math.max(...rows.map((r) => r.length));
  const width = Math.floor(PAGE_W / cols);
  const columnWidths = Array(cols).fill(width);

  const cell = (text, header) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: header ? { type: ShadingType.CLEAR, fill: BAND, color: "auto" } : undefined,
      margins: { top: 90, bottom: 90, left: 120, right: 120 },
      children: [
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          spacing: { after: 0, line: 260 },
          children: runs(text, { bold: !!header, size: 19, color: header ? HEAD : INK }),
        }),
      ],
    });

  return new Table({
    visuallyRightToLeft: true,
    columnWidths,
    width: { size: PAGE_W, type: WidthType.DXA },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      left:   { style: BorderStyle.SINGLE, size: 4, color: RULE },
      right:  { style: BorderStyle.SINGLE, size: 4, color: RULE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      insideVertical:   { style: BorderStyle.SINGLE, size: 4, color: RULE },
    },
    rows: rows.map((cells, i) =>
      new TableRow({
        tableHeader: i === 0,
        children: Array.from({ length: cols }, (_, c) => cell(cells[c] ?? "", i === 0)),
      }),
    ),
  });
}

const splitRow = (line) =>
  line.replace(/^\||\|$/g, "").split("|").map((s) => s.trim());

/* ---------- markdown -> docx children ------------------------------- */
function convert(md) {
  const lines = md.split("\n");
  const children = [];
  let i = 0;
  let buffer = [];

  const flush = () => {
    if (!buffer.length) return;
    children.push(para(buffer.join(" ")));
    buffer = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (t === "") { flush(); i++; continue; }
    if (/^-{3,}$/.test(t)) { flush(); i++; continue; }   // section rule: heading spacing carries it

    /*
     * Fenced code block.
     *
     * Left-to-right, monospaced, one paragraph per source line and no bidi.
     * Without this the SQL and TypeScript snippets were being run through the
     * bidirectional algorithm as if they were Hebrew prose, which reordered the
     * tokens on screen -- `alter table` came out reversed and interleaved with
     * the comment beside it. Code is the one thing in these documents that must
     * be reproduced exactly.
     */
    if (t.startsWith("```")) {
      flush();
      const lang = t.slice(3).trim();
      i++;
      const code = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) { code.push(lines[i]); i++; }
      i++; // closing fence
      code.forEach((cl, k) => {
        children.push(new Paragraph({
          alignment: AlignmentType.LEFT,
          shading: { type: ShadingType.CLEAR, fill: "F5F6F8", color: "auto" },
          spacing: { before: k === 0 ? 120 : 0, after: k === code.length - 1 ? 160 : 0, line: 250 },
          indent: { left: 160, right: 160 },
          children: [new TextRun({
            text: cl.length ? cl : " ",
            font: "Courier New", size: 17, color: "1A1A1A", rightToLeft: false,
          })],
        }));
      });
      if (lang) { /* language tag intentionally not printed - it adds noise */ }
      continue;
    }

    // table
    if (t.startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      flush();
      const rows = [splitRow(t)];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i].trim()));
        i++;
      }
      children.push(buildTable(rows));
      children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
      continue;
    }

    // headings
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length;
      const text = h[2];
      if (level === 1) {
        children.push(new Paragraph({
          bidirectional: true, alignment: AlignmentType.RIGHT,
          spacing: { after: 60 },
          children: [new TextRun({ font: FONT, text, bold: true, size: 40, color: HEAD, rightToLeft: false })],
        }));
      } else {
        children.push(new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          heading: level === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
          spacing: { before: level === 2 ? 320 : 240, after: 120 },
          children: runs(text, { bold: true, size: level === 2 ? 27 : 23, color: HEAD }),
        }));
      }
      i++;
      continue;
    }

    // bullets
    if (/^[-*]\s+/.test(t)) {
      flush();
      children.push(new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        numbering: { reference: "ari-bullets", level: 0 },
        spacing: { after: 80, line: 300 },
        children: runs(t.replace(/^[-*]\s+/, "")),
      }));
      i++;
      continue;
    }

    buffer.push(t);
    i++;
  }
  flush();
  return children;
}

/* ---------- build ---------------------------------------------------- */
const [, , inFile, outFile, docTitle] = process.argv;
const md = fs.readFileSync(inFile, "utf8");

const doc = new Document({
  creator: "Samuel Asmara",
  title: docTitle,
  styles: {
    default: { document: { run: { font: FONT, size: 21, color: INK } } },
  },
  numbering: {
    config: [{
      reference: "ari-bullets",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "•",
        alignment: AlignmentType.RIGHT,
        style: { paragraph: { indent: { start: convertInchesToTwip(0.3), hanging: convertInchesToTwip(0.18) } } },
      }],
    }],
  },
  sections: [{
    properties: {
      page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, right: 1440, bottom: 1200, left: 1440 } },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          bidirectional: true, alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 } },
          children: [new TextRun({ ...rtl, text: docTitle, size: 17, color: MUTED })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ font: FONT, size: 17, color: MUTED, children: [PageNumber.CURRENT] })],
        })],
      }),
    },
    children: convert(md),
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outFile, buf);
  console.log("wrote", path.basename(outFile), buf.length, "bytes");
});
