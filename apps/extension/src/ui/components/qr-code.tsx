import { useMemo } from "react";
import { qrModules, qrPath } from "../lib/qr.js";

/**
 * QR code as one SVG <path> (lib/qr.ts). Always dark-on-white, in dark mode too: many scanners
 * can't read inverted codes. The quiet zone is part of the grid, so the white tile has no padding.
 */
export function QrCode({
  value,
  label,
  size = 184,
}: {
  value: string;
  label: string;
  size?: number;
}) {
  const modules = useMemo(() => qrModules(value), [value]);
  const path = useMemo(() => qrPath(modules), [modules]);
  return (
    <svg
      role="img"
      aria-label={label}
      data-testid="qr"
      data-value={value}
      width={size}
      height={size}
      viewBox={`0 0 ${String(modules.length)} ${String(modules.length)}`}
      shapeRendering="crispEdges"
      className="rounded-lg bg-white shadow-ring"
    >
      <path d={path} fill="#000" />
    </svg>
  );
}
