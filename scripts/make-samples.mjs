import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("public/samples", { recursive: true });
const science = [
  ["Photosynthesis", 48, 110],
  ["Name: ____________________", 30, 190],
  ["Date: ____________________", 30, 242],
  ["Instructions: Read each question and write your answers.", 28, 325],
  ["1. What powers photosynthesis?", 32, 420],
  ["a) Sunlight", 30, 480],
  ["b) Moonlight", 30, 530],
  ["c) Soil", 30, 580],
  ["2. Plants take in ______ and release ______.", 30, 690],
  ["3. Explain how a leaf helps a plant.", 30, 800],
  ["_________________________________________________", 30, 870],
  ["_________________________________________________", 30, 930],
];
function paper(rows, photo = false) {
  const c = createCanvas(1240, 1400),
    ctx = c.getContext("2d");
  ctx.fillStyle = photo ? "#d7d3c9" : "#eeeae1";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.save();
  ctx.translate(photo ? 75 : 24, photo ? 50 : 20);
  ctx.rotate(photo ? -0.018 : 0.004);
  ctx.fillStyle = photo ? "#fffdf5" : "#faf9f4";
  ctx.fillRect(0, 0, 1140, 1320);
  ctx.fillStyle = "#20231f";
  for (const [s, size, y] of rows) {
    ctx.font = `${size === 48 ? "bold " : ""}${size}px Arial`;
    ctx.fillText(s, 55, y);
  }
  ctx.restore();
  let seed = 42;
  for (let i = 0; i < 20000; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = seed % 1240;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = seed % 1400;
    ctx.fillStyle = "rgba(40,40,35,0.06)";
    ctx.fillRect(x, y, 1, 1);
  }
  return c;
}
const scan = paper(science),
  scanBytes = scan.toBuffer("image/png");
await writeFile("public/samples/photosynthesis-scan.png", scanBytes);
const a = await PDFDocument.create();
const png = await a.embedPng(scanBytes);
a.addPage([620, 700]).drawImage(png, { x: 0, y: 0, width: 620, height: 700 });
a.setTitle("Photosynthesis — synthetic scan");
await writeFile("public/samples/photosynthesis.pdf", await a.save());
const fractions = [
  ["Fractions in the Kitchen", 48, 110],
  ["Name: ____________________", 30, 200],
  ["Instructions: Think about sharing food equally.", 28, 310],
  ["1. Half of eight apples is ______ apples.", 30, 420],
  ["2. Two halves make a whole. True / False", 30, 550],
  ["3. One quarter of twelve cups is ______ cups.", 30, 690],
  ["4. One half is smaller than one quarter.", 30, 830],
  ["True / False", 30, 880],
];
await writeFile(
  "public/samples/fractions.png",
  paper(fractions, true).toBuffer("image/png"),
);
const b = await PDFDocument.create(),
  font = await b.embedFont(StandardFonts.Helvetica),
  bold = await b.embedFont(StandardFonts.HelveticaBold),
  page = b.addPage([612, 792]);
const draw = (s, x, y, size = 11) =>
  page.drawText(s, {
    x,
    y: 792 - y,
    size,
    font: size >= 15 ? bold : font,
    color: rgb(0.1, 0.12, 0.11),
  });
draw("The Water Cycle", 42, 58, 26);
draw("Name: ____________________", 42, 96, 12);
draw("Date: ______________", 340, 96, 12);
const left = [
  ["Reading: From sea to sky", 145, 16],
  ["Sunlight warms water in rivers and lakes.", 185],
  ["Liquid water becomes water vapour.", 208],
  ["This process is called evaporation.", 231],
  ["1. What turns liquid water into vapour?", 285],
  ["a) Evaporation", 315],
  ["b) Collection", 340],
  ["c) Freezing", 365],
  ["2. Water vapour rises into the ______.", 420],
];
const right = [
  ["Think: Back to the ground", 145, 16],
  ["Water vapour cools and forms clouds.", 185],
  ["Drops join together and fall as rain.", 208],
  ["Water collects, and the cycle begins again.", 231],
  ["3. Clouds form as water vapour cools.", 285],
  ["True / False", 310],
  ["4. Describe where rain goes after it falls.", 365],
  ["_________________________________", 407],
  ["_________________________________", 435],
];
// Intentionally interleave draw operations. Spatial ordering must undo this.
for (let i = 0; i < Math.max(left.length, right.length); i++) {
  if (left[i]) draw(left[i][0], 42, left[i][1], left[i][2]);
  if (right[i]) draw(right[i][0], 330, right[i][1], right[i][2]);
}
const fig = createCanvas(650, 180),
  fc = fig.getContext("2d");
fc.fillStyle = "#f0f4ef";
fc.fillRect(0, 0, 650, 180);
fc.fillStyle = "#245c45";
fc.font = "24px Arial";
fc.fillText("WATER", 20, 90);
fc.fillText("CLOUD", 270, 45);
fc.fillText("RAIN", 510, 120);
fc.strokeStyle = "#245c45";
fc.lineWidth = 4;
for (const [x1, y1, x2, y2] of [
  [110, 80, 260, 40],
  [370, 50, 500, 105],
  [500, 145, 110, 145],
]) {
  fc.beginPath();
  fc.moveTo(x1, y1);
  fc.lineTo(x2, y2);
  fc.lineTo(x2 - 12, y2 - 8);
  fc.moveTo(x2, y2);
  fc.lineTo(x2 - 12, y2 + 8);
  fc.stroke();
}
const figure = await b.embedPng(fig.toBuffer("image/png"));
page.drawImage(figure, { x: 42, y: 100, width: 528, height: 146 });
b.setTitle("The Water Cycle — synthetic two-column worksheet");
await writeFile("public/samples/water-cycle.pdf", await b.save());
await writeFile(
  "public/samples/fixtures.json",
  JSON.stringify(
    {
      photosynthesis: science.map((r) => r[0]).join("\n"),
      fractions: fractions.map((r) => r[0]).join("\n"),
      waterCycle: [
        "The Water Cycle",
        "Name: ____",
        "Date: ____",
        ...left.map((r) => r[0]),
        ...right.map((r) => r[0]),
      ].join("\n"),
    },
    null,
    2,
  ),
);
for (const size of [192, 512]) {
  const icon = createCanvas(size, size),
    c = icon.getContext("2d");
  c.fillStyle = "#245c45";
  c.fillRect(0, 0, size, size);
  c.strokeStyle = "#ffffff";
  c.lineWidth = size * 0.085;
  c.beginPath();
  c.moveTo(size * 0.28, size * 0.25);
  c.lineTo(size * 0.28, size * 0.58);
  c.bezierCurveTo(
    size * 0.28,
    size * 0.88,
    size * 0.72,
    size * 0.88,
    size * 0.72,
    size * 0.58,
  );
  c.lineTo(size * 0.72, size * 0.25);
  c.stroke();
  await writeFile(`public/icon-${size}.png`, icon.toBuffer("image/png"));
}
console.log(
  "Generated three original worksheets, fixture texts and app icons.",
);
