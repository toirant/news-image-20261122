// news-image-20261122 — "The World in One Day"
// A newspaper front page summing up Sunday 22 November 2026.
// Draws the whole page in code (hand-rolled RGB canvas + 5x7 bitmap
// font + deterministic PNG encoder, Node standard library only) and
// writes it to /output/entry.png. No network at run time, no clock,
// no randomness: every run writes the same bytes.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

// ------------------------------------------------------------------
// 5x7 bitmap font. Each glyph is 7 rows; each row is a 5-bit mask
// written as a string of 0/1, left to right, top to bottom.
// ------------------------------------------------------------------
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "*": ["00000", "00100", "10101", "01110", "10101", "00100", "00000"],
  "\u2022": ["00000", "00000", "01100", "01100", "01100", "00000", "00000"],
};

// ------------------------------------------------------------------
// Canvas: a plain RGB buffer with the drawing primitives the page needs.
// ------------------------------------------------------------------
const W = 1024;
const H = 1024;

type RGB = [number, number, number];

const PAPER: RGB = [247, 243, 234]; // warm newsprint
const INK: RGB = [20, 20, 22]; // near-black text
const NAVY: RGB = [20, 33, 61]; // masthead band
const RED: RGB = [178, 34, 34]; // rules and accents
const GREY: RGB = [90, 88, 82]; // secondary text
const SKY: RGB = [126, 166, 198]; // globe seas
const LAND: RGB = [74, 120, 86]; // globe land
const SUN: RGB = [232, 164, 32]; // sun motif

class Canvas {
  buf = Buffer.alloc(W * H * 3);

  constructor() {
    this.fill(PAPER);
  }

  fill(c: RGB): void {
    for (let i = 0; i < W * H; i++) {
      this.buf[i * 3] = c[0];
      this.buf[i * 3 + 1] = c[1];
      this.buf[i * 3 + 2] = c[2];
    }
  }

  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }

  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
    }
  }

  hline(x: number, y: number, w: number, c: RGB, t = 1): void {
    this.rect(x, y, w, t, c);
  }

  vline(x: number, y: number, h: number, c: RGB, t = 1): void {
    this.rect(x, y, t, h, c);
  }

  // Filled circle by scanline.
  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy));
      for (let dx = -half; dx <= half; dx++) this.set(cx + dx, cy + dy, c);
    }
  }

  // Circle outline, 1px thick, by angle steps.
  ring(cx: number, cy: number, r: number, c: RGB): void {
    const steps = Math.max(24, r * 6);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      this.set(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), c);
    }
  }

  charWidth(scale: number): number {
    return 6 * scale;
  }

  textWidth(text: string, scale: number): number {
    return text.length * this.charWidth(scale) - scale;
  }

  drawChar(ch: string, x: number, y: number, scale: number, c: RGB): void {
    const glyph = FONT[ch] ?? FONT["?"];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === "1") {
          this.rect(x + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
  }

  // Draws text left-aligned at (x, y). Unknown chars fall back to "?".
  text(str: string, x: number, y: number, scale: number, c: RGB): void {
    const upper = str.toUpperCase();
    for (let i = 0; i < upper.length; i++) {
      this.drawChar(upper[i], x + i * this.charWidth(scale), y, scale, c);
    }
  }

  textCentered(str: string, cx: number, y: number, scale: number, c: RGB): void {
    const w = this.textWidth(str.toUpperCase(), scale);
    this.text(str, cx - Math.floor(w / 2), y, scale, c);
  }

  // Greedy word wrap. Returns the lines; caller advances y by lineHeight.
  wrap(str: string, maxWidth: number, scale: number): string[] {
    const words = str.toUpperCase().split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const word of words) {
      const trial = cur === "" ? word : cur + " " + word;
      if (this.textWidth(trial, scale) <= maxWidth) {
        cur = trial;
      } else {
        if (cur !== "") lines.push(cur);
        cur = word;
      }
    }
    if (cur !== "") lines.push(cur);
    return lines;
  }

  paragraph(str: string, x: number, y: number, maxWidth: number, scale: number, c: RGB, lineGap = 4): number {
    const lines = this.wrap(str, maxWidth, scale);
    const lh = 7 * scale + lineGap;
    for (let i = 0; i < lines.length; i++) {
      this.text(lines[i], x, y + i * lh, scale, c);
    }
    return y + lines.length * lh;
  }
}

// ------------------------------------------------------------------
// Deterministic PNG encoder (color type 2, 8-bit RGB, filter 0).
// ------------------------------------------------------------------
function crc32(buf: Buffer): number {
  let table = (crc32 as unknown as { t?: Uint32Array }).t;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    (crc32 as unknown as { t?: Uint32Array }).t = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(canvas: Canvas): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    canvas.buf.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------
// The front page: masthead, lead story, two columns, third story,
// briefs band, footer. All copy is the day's reported news.
// ------------------------------------------------------------------
function drawPage(): Canvas {
  const cv = new Canvas();
  const MX = 36; // side margin
  const CW = W - 2 * MX; // content width

  // --- Masthead ---------------------------------------------------
  cv.rect(0, 24, W, 96, NAVY);
  cv.textCentered("THE WORLD IN ONE DAY", W / 2, 44, 7, [247, 243, 234]);
  cv.textCentered("ONE DAY  •  ONE PAGE  •  THE WORLD'S NEWS", W / 2, 100, 2, [200, 205, 220]);
  cv.hline(0, 128, W, RED, 5);

  // --- Dateline ---------------------------------------------------
  cv.text("SUNDAY 22 NOVEMBER 2026", MX, 146, 3, INK);
  const rightTag = "ANTALYA  •  GAZA  •  KYIV  •  PARIS";
  cv.text(rightTag, W - MX - cv.textWidth(rightTag, 2), 150, 2, GREY);
  cv.hline(MX, 178, CW, INK, 2);

  // --- Lead story: COP31 ------------------------------------------
  let y = 196;
  cv.text("CLIMATE DEAL AT LAST", MX, y, 6, INK);
  y += 52;
  y = cv.paragraph(
    "COP31 PRESIDENTS UNVEIL FINAL TEXT IN ANTALYA AFTER TALKS RUN INTO SUNDAY",
    MX, y, 640, 2, RED, 5,
  );
  y += 8;

  // Sun-and-globe motif at the right of the lead.
  const gx = 800;
  const gy = 268;
  cv.disc(gx, gy, 74, SKY);
  cv.disc(gx - 18, gy - 12, 22, LAND);
  cv.disc(gx + 26, gy + 22, 16, LAND);
  cv.disc(gx + 8, gy - 34, 10, LAND);
  cv.ring(gx, gy, 74, NAVY);
  cv.ring(gx, gy, 52, [247, 243, 234]);
  cv.hline(gx - 74, gy, 148, [247, 243, 234], 2);
  cv.disc(gx + 108, gy - 52, 16, SUN);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x1 = Math.round(gx + 108 + Math.cos(a) * 22);
    const y1 = Math.round(gy - 52 + Math.sin(a) * 22);
    const x2 = Math.round(gx + 108 + Math.cos(a) * 30);
    const y2 = Math.round(gy - 52 + Math.sin(a) * 30);
    cv.hline(Math.min(x1, x2), y1, Math.abs(x2 - x1) + 1, SUN, 2);
  }
  cv.textCentered("ANTALYA, TURKEY", gx, gy + 88, 2, GREY);

  y = cv.paragraph(
    "Negotiators worked past their Friday deadline, through Saturday and into the early hours of Sunday. President Murat Kurum told a late-night plenary the new package could win consensus of nearly 200 nations.",
    MX, y, 640, 2, INK, 5,
  );
  y += 4;
  y = cv.paragraph(
    "Delegates have until 03:00 GMT to raise objections. A session at 06:00 GMT will begin approving the deal, the first since the world was confirmed on course to blow past 1.5C of warming.",
    MX, y, 640, 2, INK, 5,
  );
  y += 14;
  cv.hline(MX, y, CW, INK, 2);
  y += 16;

  // --- Two columns: Nvidia / Gaza ---------------------------------
  const colW = Math.floor((CW - 40) / 2);
  const col2X = MX + colW + 40;
  const rowY = y;

  cv.text("NVIDIA IN TURMOIL", MX, rowY, 4, INK);
  cv.text("FOUR MORE KILLED IN GAZA", col2X, rowY + 4, 3, INK);
  let yL = cv.paragraph(
    "Nvidia faces a US accounting probe as turmoil deepens around the chipmaker. Jensen Huang has resigned amid espionage probes, and the scramble for the firm has shaken markets.",
    MX, rowY + 38, colW, 2, INK, 5,
  );
  let yR = cv.paragraph(
    "Israeli fire kills four more in Gaza, where deadly floods have swamped tens of thousands. Aid groups warn of a deepening crisis as winter closes in.",
    col2X, rowY + 38, colW, 2, INK, 5,
  );
  yL = cv.paragraph(
    "Trump urges a \"second chance\" for Huang. Musk backs the campaign to reinstate the ousted boss.",
    MX, yL + 4, colW, 2, GREY, 5,
  );
  yR = cv.paragraph(
    "The flooding has left families wading through streets turned to rivers, with shelters overwhelmed.",
    col2X, yR + 4, colW, 2, GREY, 5,
  );
  y = Math.max(yL, yR) + 12;
  cv.vline(MX + colW + 20, rowY, y - rowY - 4, GREY, 1);
  cv.hline(MX, y, CW, INK, 2);
  y += 16;

  // --- Third story: Ukraine ---------------------------------------
  cv.text("MISSILE HITS ZELENSKY'S HOME CITY", MX, y, 4, INK);
  y += 40;
  y = cv.paragraph(
    "A ballistic missile attack on the Ukrainian president's home town in central Ukraine kills 2 and wounds scores, as the war grinds on into another winter.",
    MX, y, CW, 2, INK, 5,
  );
  y += 12;
  cv.hline(MX, y, CW, INK, 2);
  y += 16;

  // --- In brief ----------------------------------------------------
  cv.rect(MX, y, CW, 30, NAVY);
  cv.text("IN BRIEF", MX + 12, y + 8, 2, [247, 243, 234]);
  cv.text("AROUND THE WORLD IN SIX LINES", MX + 130, y + 8, 2, [200, 205, 220]);
  y += 44;

  const briefs: string[] = [
    "FRANCE: PROTESTERS RALLY FOR A SIXTH WEEKEND.",
    "NIGERIA: 24 DEAD AS A BOAT CAPSIZES.",
    "PERU: 6.7-MAGNITUDE QUAKE STRIKES.",
    "CONGO: EBOLA TOLL PASSES 5,300.",
    "SERBIA: PRESIDENT RESIGNS AMID PROTESTS.",
    "MARKETS: BITCOIN CRASHES TO A TWO-YEAR LOW.",
  ];
  const bw = Math.floor((CW - 48) / 3);
  for (let i = 0; i < briefs.length; i++) {
    const bx = MX + (i % 3) * (bw + 24);
    const by = y + Math.floor(i / 3) * 62;
    cv.text("\u2022", bx, by, 2, RED);
    cv.paragraph(briefs[i], bx + 16, by, bw - 16, 2, INK, 4);
  }
  y += 108;
  cv.hline(MX, y, CW, INK, 2);

  // --- Footer ------------------------------------------------------
  y += 12;
  cv.textCentered(
    "THE WORLD IN ONE DAY  •  SUNDAY 22 NOVEMBER 2026  •  DRAWN FROM THE DAY'S REPORTS",
    W / 2, y, 2, GREY,
  );

  return cv;
}

// ------------------------------------------------------------------
// Entry point. Writes entry.png into MAKEFUN_OUTPUT_DIR (or ./out).
// Only creates the directory when missing and writes the file inside
// it; the output directory itself is never removed.
// ------------------------------------------------------------------
function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
  mkdirSync(outDir, { recursive: true });
  const png = encodePng(drawPage());
  writeFileSync(join(outDir, "entry.png"), png);
}

main();
