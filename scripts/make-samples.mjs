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
fc.fillStyle = "#FFE600";
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
  c.fillStyle = "#FFE600";
  c.fillRect(0, 0, size, size);
  c.strokeStyle = "#111111";
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
console.log("Generated four original worksheets, fixture texts and app icons.");
// Sample D deliberately uses ink outlines, not printed Unicode checkbox glyphs.
const rock = createCanvas(1240, 1400),
  rc = rock.getContext("2d");
rc.fillStyle = "#fff";
rc.fillRect(0, 0, 1240, 1400);
rc.fillStyle = "#111";
rc.font = "bold 48px Arial";
rc.fillText("Rock Cycle Review", 75, 110);
rc.font = "28px Arial";
rc.fillText("Name: ____________________", 75, 180);
rc.fillText("Instructions: Use the word bank to complete the table.", 75, 255);
rc.strokeStyle = "#111";
rc.lineWidth = 3;
rc.strokeRect(65, 295, 1110, 100);
rc.font = "27px Arial";
rc.fillText("Word bank: cooling, heat, pressure", 85, 355);
rc.font = "30px Arial";
rc.fillText("1. Choose the processes that change rocks.", 75, 465);
for (const [i, label] of ["Heat", "Pressure", "Sunlight"].entries()) {
  const y = 510 + i * 65;
  rc.strokeRect(76, y, 27, 27);
  rc.fillText(label, 125, y + 25);
}
rc.fillText("2. Complete the rock cycle table.", 75, 780);
const xs = [75, 445, 810, 1165],
  ys = [835, 930, 1025, 1120];
rc.lineWidth = 3;
for (const x of xs) {
  rc.beginPath();
  rc.moveTo(x, ys[0]);
  rc.lineTo(x, ys.at(-1));
  rc.stroke();
}
for (const y of ys) {
  rc.beginPath();
  rc.moveTo(xs[0], y);
  rc.lineTo(xs.at(-1), y);
  rc.stroke();
}
rc.font = "bold 28px Arial";
for (const [i, label] of ["Rock type", "Process", "Example"].entries())
  rc.fillText(label, xs[i] + 20, 895);
rc.font = "28px Arial";
rc.fillText("Igneous", 95, 990);
rc.fillText("Granite", 830, 990);
rc.fillText("Metamorphic", 95, 1085);
rc.fillText("Marble", 830, 1085);
await writeFile("public/samples/rock-cycle.png", rock.toBuffer("image/png"));
// Thumbnail drawn from the same content and coordinates as the digital PDF.
const waterPreview = createCanvas(612, 792),
  wp = waterPreview.getContext("2d");
wp.fillStyle = "white";
wp.fillRect(0, 0, 612, 792);
wp.fillStyle = "#111";
wp.font = "bold 26px Arial";
wp.fillText("The Water Cycle", 42, 58);
wp.font = "12px Arial";
wp.fillText("Name: ____________________", 42, 96);
wp.fillText("Date: ______________", 340, 96);
for (const [rows, x] of [
  [left, 42],
  [right, 330],
])
  for (const [s, y, size = 11] of rows) {
    wp.font = `${size >= 15 ? "bold " : ""}${size}px Arial`;
    wp.fillText(s, x, y);
  }
wp.drawImage(fig, 50, 500, 510, 142);
await writeFile(
  "public/samples/water-cycle-preview.png",
  waterPreview.toBuffer("image/png"),
);

// Test-only desk photo: project the exact clean sample onto a dark desk.
// Keep it off the home-page sample list.
const desk = createCanvas(1540, 1660),
  dc = desk.getContext("2d");
dc.fillStyle = "#292c30";
dc.fillRect(0, 0, desk.width, desk.height);
const corners = [
  [170, 110],
  [1390, 210],
  [1280, 1540],
  [90, 1460],
];
const source = scan
  .getContext("2d")
  .getImageData(0, 0, scan.width, scan.height);
// Solve the inverse map from desk pixels into unit source coordinates.
// A unit-square inverse expressed as a projective map in normalized desk space.
const eq = [];
for (let i = 0; i < 4; i++) {
  const [x, y] = corners[i],
    u = [0, 1, 1, 0][i],
    v = [0, 0, 1, 1][i];
  eq.push(
    [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
    [0, 0, 0, x, y, 1, -v * x, -v * y, v],
  );
}
for (let i = 0; i < 8; i++) {
  let k = i;
  for (let j = i + 1; j < 8; j++)
    if (Math.abs(eq[j][i]) > Math.abs(eq[k][i])) k = j;
  [eq[i], eq[k]] = [eq[k], eq[i]];
  const n = eq[i][i];
  for (let j = i; j < 9; j++) eq[i][j] /= n;
  for (let j = 0; j < 8; j++)
    if (j !== i) {
      const n = eq[j][i];
      for (let k = i; k < 9; k++) eq[j][k] -= n * eq[i][k];
    }
}
const H = eq.map((r) => r[8]),
  pixels = dc.getImageData(0, 0, desk.width, desk.height);
for (let y = 0; y < desk.height; y++)
  for (let x = 0; x < desk.width; x++) {
    const z = H[6] * x + H[7] * y + 1,
      u = (H[0] * x + H[1] * y + H[2]) / z,
      v = (H[3] * x + H[4] * y + H[5]) / z;
    if (u < 0 || v < 0 || u > 1 || v > 1) continue;
    const sx = u * (scan.width - 1),
      sy = v * (scan.height - 1),
      x0 = Math.floor(sx),
      y0 = Math.floor(sy),
      x1 = Math.min(scan.width - 1, x0 + 1),
      y1 = Math.min(scan.height - 1, y0 + 1),
      tx = sx - x0,
      ty = sy - y0;
    const shade = 1 - 0.48 * Math.exp(-(((u - 0.25) / 0.22) ** 2)),
      at = (y * desk.width + x) * 4;
    for (let k = 0; k < 3; k++)
      pixels.data[at + k] =
        shade *
        (source.data[(y0 * scan.width + x0) * 4 + k] * (1 - tx) * (1 - ty) +
          source.data[(y0 * scan.width + x1) * 4 + k] * tx * (1 - ty) +
          source.data[(y1 * scan.width + x0) * 4 + k] * (1 - tx) * ty +
          source.data[(y1 * scan.width + x1) * 4 + k] * tx * ty);
  }
dc.putImageData(pixels, 0, 0);
await writeFile("public/samples/desk-photo.png", desk.toBuffer("image/png"));
for (const angle of [90, 180, 270]) {
  const swap = angle % 180 !== 0,
    c = createCanvas(
      swap ? scan.height : scan.width,
      swap ? scan.width : scan.height,
    ),
    ctx = c.getContext("2d");
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(scan, -scan.width / 2, -scan.height / 2);
  await writeFile(
    `public/samples/sideways-${angle}.png`,
    c.toBuffer("image/png"),
  );
}
