import encodeQR from "qr";
import decodeQR from "qr/decode.js";
import { describe, expect, it } from "vitest";
import { QR_QUIET_ZONE, qrModules, qrPath } from "../qr.js";

const URI =
  "web+stellar:pay?destination=GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO&amount=12.5&memo=hello%20world&memo_type=MEMO_TEXT&network_passphrase=Test%20SDF%20Network%20%3B%20September%202015";

/** The dark cells a path paints, by replaying its run subpaths. */
function cellsOf(path: string): Set<string> {
  const cells = new Set<string>();
  for (const m of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
    const [x, y, w, back] = [m[1], m[2], m[3], m[4]].map(Number) as [
      number,
      number,
      number,
      number,
    ];
    expect(back).toBe(w);
    for (let i = 0; i < w; i++) cells.add(`${String(x + i)},${String(y)}`);
  }
  return cells;
}

/** Renders modules as an RGBA image (4 px per module), as a camera would see the screen. */
function toImage(modules: boolean[][], scale = 4) {
  const size = modules.length * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dark = modules[Math.floor(py / scale)]![Math.floor(px / scale)] === true;
      data.set(dark ? [0, 0, 0, 255] : [255, 255, 255, 255], (py * size + px) * 4);
    }
  }
  return { width: size, height: size, data };
}

describe("qrModules", () => {
  it("uses ECC M with a 4-module quiet zone", () => {
    const modules = qrModules(URI);
    expect(modules).toEqual(encodeQR(URI, "raw", { ecc: "medium", border: QR_QUIET_ZONE }));
    expect(modules).not.toEqual(encodeQR(URI, "raw", { ecc: "low", border: QR_QUIET_ZONE }));
    const n = modules.length;
    for (let i = 0; i < n; i++) {
      for (let q = 0; q < QR_QUIET_ZONE; q++) {
        expect([
          modules[q]![i],
          modules[n - 1 - q]![i],
          modules[i]![q],
          modules[i]![n - 1 - q],
        ]).toEqual([false, false, false, false]);
      }
    }
    // A finder pattern starts right inside the quiet zone.
    expect(modules[QR_QUIET_ZONE]![QR_QUIET_ZONE]).toBe(true);
  });

  it("round-trips through a decoder: the image scans back to the exact URI", () => {
    expect(decodeQR(toImage(qrModules(URI)))).toBe(URI);
  });
});

describe("qrPath", () => {
  it("paints exactly the dark modules, in one path of horizontal runs", () => {
    const modules = qrModules(URI);
    const dark = new Set<string>();
    modules.forEach((row, y) => {
      row.forEach((on, x) => {
        if (on) dark.add(`${String(x)},${String(y)}`);
      });
    });
    expect(cellsOf(qrPath(modules))).toEqual(dark);
  });

  it("merges runs and handles empty rows", () => {
    expect(
      qrPath([
        [true, true, false, true],
        [false, false, false, false],
      ]),
    ).toBe("M0 0h2v1h-2zM3 0h1v1h-1z");
  });
});
