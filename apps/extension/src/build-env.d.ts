/** Git commit the build came from (wxt.config.ts `define`), shown in About (SECURITY §9.5). */
declare const __STELLIX_COMMIT__: string;
/** STELLIX_MAINNET_ENABLED at build time (ADR 0008). Constant-folded, so off-builds drop the mainnet UI. */
declare const __STELLIX_MAINNET_ENABLED__: boolean;
