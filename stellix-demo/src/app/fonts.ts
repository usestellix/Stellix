import localFont from "next/font/local";

// Geist, vendored from the `geist` npm package 1.7.2 (SIL OFL 1.1, see src/fonts/OFL.txt).
// Self-hosted: no font request leaves the site, at build time or at runtime.
export const geistSans = localFont({
  src: "../fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

// Mono is for addresses and rule IDs only, so it isn't preloaded.
export const geistMono = localFont({
  src: "../fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  preload: false,
});
