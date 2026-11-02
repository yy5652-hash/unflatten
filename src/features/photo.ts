import { findPageQuad, type Quad } from "../parse/vision";
const names = [
  "Top left corner",
  "Top right corner",
  "Bottom right corner",
  "Bottom left corner",
];
/** Selection is stored in original bitmap pixels, while keyboard movement is in preview pixels. */
export async function mountCorners(
  container: HTMLElement,
  file: File,
  selection: { corners?: Quad | null },
  current: () => boolean,
) {
  const bitmap = await createImageBitmap(file);
  if (!current()) {
    bitmap.close();
    return;
  }
  const scale = Math.min(1, 420 / Math.max(bitmap.width, bitmap.height)),
    c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  const image = container.querySelector<HTMLImageElement>("img")!;
  const detected = findPageQuad(ctx.getImageData(0, 0, c.width, c.height));
  const automatic = detected?.map((p) => ({
    x: p.x / scale,
    y: p.y / scale,
  })) as Quad | undefined;
  const full = () =>
    [
      { x: 0, y: 0 },
      { x: c.width / scale - 1, y: 0 },
      { x: c.width / scale - 1, y: c.height / scale - 1 },
      { x: 0, y: c.height / scale - 1 },
    ] as Quad;
  if (selection.corners === undefined) selection.corners = automatic ?? null;
  let corners = (selection.corners?.map((p) => ({ ...p })) as Quad) ?? full();
  const frame = document.createElement("div");
  frame.className = "corner-frame";
  image.replaceWith(frame);
  frame.append(image);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${c.width / scale} ${c.height / scale}`);
  svg.setAttribute("aria-hidden", "true");
  const polygon = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );
  svg.append(polygon);
  frame.append(svg);
  const help = document.createElement("p");
  help.className = "small";
  help.textContent =
    "Adjust corners with arrow keys (1 preview pixel; Shift: 10) or drag. Use whole photo to skip the crop.";
  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  let announce: ReturnType<typeof setTimeout> | undefined;
  const buttons = names.map((name, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "corner-handle";
    b.setAttribute("aria-label", name);
    frame.append(b);
    return b;
  });
  const paint = () => {
    buttons.forEach((b, i) => {
      b.style.left = `${(corners[i].x / (c.width / scale)) * 100}%`;
      b.style.top = `${(corners[i].y / (c.height / scale)) * 100}%`;
    });
    polygon.setAttribute(
      "points",
      corners.map((p) => `${p.x},${p.y}`).join(" "),
    );
  };
  const moved = (i: number) => {
    selection.corners = corners;
    paint();
    clearTimeout(announce);
    announce = setTimeout(() => {
      live.textContent = `${names[i]}: ${Math.round((corners[i].x * frame.clientWidth) / (c.width / scale))}, ${Math.round((corners[i].y * frame.clientHeight) / (c.height / scale))} preview pixels.`;
    }, 120);
  };
  const set = (i: number, x: number, y: number) => {
    corners[i] = {
      x: Math.max(0, Math.min(c.width / scale - 1, x)),
      y: Math.max(0, Math.min(c.height / scale - 1, y)),
    };
    moved(i);
  };
  buttons.forEach((b, i) => {
    b.onkeydown = (e) => {
      const step = e.shiftKey ? 10 : 1,
        dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
        dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      if (dx || dy) {
        e.preventDefault();
        set(
          i,
          corners[i].x + (dx * (c.width / scale)) / frame.clientWidth,
          corners[i].y + (dy * (c.height / scale)) / frame.clientHeight,
        );
      }
    };
    b.onpointerdown = (e) => {
      e.preventDefault();
      b.focus();
      b.setPointerCapture(e.pointerId);
    };
    b.onpointermove = (e) => {
      if (!b.hasPointerCapture(e.pointerId)) return;
      const r = frame.getBoundingClientRect();
      set(
        i,
        ((e.clientX - r.left) / r.width) * (c.width / scale),
        ((e.clientY - r.top) / r.height) * (c.height / scale),
      );
    };
    b.onpointerup = (e) => {
      if (b.hasPointerCapture(e.pointerId))
        b.releasePointerCapture(e.pointerId);
    };
  });
  const actions = document.createElement("div");
  actions.className = "actions";
  for (const [name, reset] of [
    ["Use whole photo", false],
    ["Reset", true],
  ] as const) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = name;
    b.onclick = () => {
      selection.corners = reset ? (automatic ?? null) : null;
      corners = (selection.corners?.map((p) => ({ ...p })) as Quad) ?? full();
      paint();
      live.textContent = reset
        ? "Detected corners restored."
        : "Using the whole photo.";
    };
    actions.append(b);
  }
  container.append(help, actions, live);
  paint();
}
