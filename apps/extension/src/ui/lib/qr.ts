import encodeQR from "qr";

// QR modules for the Receive screen (UI_FLOWS §6). The encoder is `qr` (paulmillr, zero deps),
// used only for its boolean grid; rendering is ours (components/qr-code.tsx), so no SVG/HTML
// strings from a library ever reach the DOM. ECC M recovers ~15% damage; the 4-module quiet
// zone is the minimum ISO/IEC 18004 asks for, and the grid includes it.

export const QR_QUIET_ZONE = 4;

/** Rows of modules, quiet zone included; true = dark. */
export function qrModules(text: string): boolean[][] {
  return encodeQR(text, "raw", { ecc: "medium", border: QR_QUIET_ZONE });
}

/**
 * One SVG path for all dark modules, one subpath per horizontal run (1 unit = 1 module).
 * Runs keep the path short and leave no hairline seams between neighbouring modules.
 */
export function qrPath(modules: readonly (readonly boolean[])[]): string {
  const parts: string[] = [];
  modules.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      if (row[x] !== true) {
        x++;
        continue;
      }
      let end = x;
      while (row[end] === true) end++;
      parts.push(`M${String(x)} ${String(y)}h${String(end - x)}v1h-${String(end - x)}z`);
      x = end;
    }
  });
  return parts.join("");
}
