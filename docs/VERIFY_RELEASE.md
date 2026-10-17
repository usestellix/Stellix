# Verifying a Stellix release

Stellix is built only in CI, reproducibly (SECURITY §9). These steps let anyone check that the copy the Chrome Web Store serves is exactly a published GitHub release, built from public source.

## What the store changes

The store repackages every upload. We measured what it changes on 2026-10-17, by comparing uBlock Origin Lite's store package with its GitHub release: every file was byte-identical except two.

- `_metadata/verified_contents.json` is **added**. It holds per-file hashes signed by the publisher and by the store, which Chrome uses for content verification.
- `manifest.json` gets one **added** key: `"update_url": "https://clients2.google.com/service/update2/crx"`. Everything else in it is unchanged.

So a store copy matches a release when every other file is byte-identical, `manifest.json` is equal once `update_url` is removed, and nothing is added or missing.

TODO (after the first publish): confirm the same two changes on Stellix's own store package, which has a single-line manifest, and fill in the extension ID: `EXTENSION_ID`.

## 1. Check the release zip

From the GitHub release, download `stellixextension-<version>-chrome.zip` and `SHA256SUMS`. The first line of `SHA256SUMS` is the zip's hash, and it also appears in the release notes:

```bash
head -n1 SHA256SUMS | shasum -a 256 -c
```

Optional: rebuild it yourself from the tag (`.github/RELEASE.md` §3). The hash must be identical.

## 2a. With the script

```bash
node scripts/verify-store-package.mjs EXTENSION_ID stellixextension-<version>-chrome.zip
```

It downloads the store package from the store's public update endpoint, the same one Chrome uses. It then compares every file and prints `OK`, or `FAIL` with each difference. It has no dependencies, uses about 150 lines of code including `scripts/lib/zip.mjs`, and is meant to be read before you trust it.

## 2b. By hand, with standard tools

```bash
# The store package (CRX3 = a signed header + a zip). `unzip` skips the header with a warning.
curl -L -o store.crx "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=141.0&acceptformat=crx3&x=id%3DEXTENSION_ID%26uc"
mkdir store release
unzip -q store.crx -d store
unzip -q stellixextension-<version>-chrome.zip -d release

# Only `_metadata` (store-only) and manifest.json may differ:
diff -r release store

# manifest.json: equal once update_url is removed (jq -S sorts keys on both sides):
diff <(jq -S . release/manifest.json) <(jq -S 'del(.update_url)' store/manifest.json) && echo "manifest OK"
```

## 3. The copy installed in your browser

- **About** in Stellix shows the version and build commit. They must match the release notes.
- Chrome keeps the installed files under your profile folder: open `chrome://version`, find **Profile Path**, then look in `Extensions/EXTENSION_ID/<version>_0`. Compare that folder with `release/` as in 2b. TODO: confirm on Stellix's own install which extra files Chrome adds there (expected: `_metadata/`).

## If a check fails

Don't enter your recovery phrase or password. Report it privately through GitHub's **Report a vulnerability** (Security tab), or by email to TODO (security email). See `docs/INCIDENT_RESPONSE.md`.
