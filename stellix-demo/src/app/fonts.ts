import localFont from "next/font/local";

// Geist, vendored from the `geist` npm package 1.7.2 (SIL OFL 1.1, see src/fonts/OFL.txt).
// Self-hosted: no font request leaves the site, at build time or at runtime.
//
// Sans sets every line of running text, so a late swap would move the page. display: optional
// means no swap after first paint: the preloaded font is used when it's there in time,
// otherwise the fallback stays for that page view.
export const geistSans = localFont({
  src: "../fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "optional",
});

// Mono is for badges, addresses and rule IDs: small, fixed-height text, so a late swap can't
// shift the page. Not preloaded, and swapped in when it arrives.
export const geistMono = localFont({
  src: "../fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  preload: false,
});
