# Release checklist

SECURITY §9. CI builds; a maintainer signs and uploads. CI never holds store credentials or the upload-signing key, so a compromised CI alone can't ship a build. The key's custody and recovery are in `docs/INCIDENT_RESPONSE.md`.

## 1. Prepare (pull request to `main`)

- [ ] `apps/extension/package.json` `version` bumped (semver; 0.x is testnet-only, ADR 0008).
- [ ] Changelog entry.
- [ ] **Permission diff:** `manifest.json` permissions are still exactly `storage`, `alarms`. Any change has an ADR.
- [ ] **Dependency diff reviewed:** `git diff <previous tag> -- pnpm-lock.yaml`. Every new or changed package is justified, at least 14 days old, and pure JS if it's in core.
- [ ] CI green on the merge commit, including `reproducible` and `e2e-mainnet`.
- [ ] Manual testnet smoke test on a `pnpm build` of that commit: create, import, receive, send, history, lock/unlock (TESTING §4).

## 2. Tag

```bash
git checkout main && git pull --ff-only
git tag -s v0.1.0 -m "Stellix v0.1.0"   # -s signs the tag; use -a if no signing key is set up
git push origin v0.1.0
```

The `Release` workflow:
- checks that the tag matches the version;
- runs every gate and the E2E suite;
- builds the zip with `STELLIX_MAINNET_ENABLED=false`;
- creates a **draft** GitHub release with the zip, `SHA256SUMS`, and the commit hash in its notes.

## 3. Verify the draft (on the maintainer's machine)

- [ ] Download the draft's zip and `SHA256SUMS`.
- [ ] Rebuild from the tag and compare. They must match byte for byte (SECURITY §9.3):

  ```bash
  git checkout v0.1.0
  pnpm install --frozen-lockfile
  STELLIX_MAINNET_ENABLED=false pnpm zip
  node scripts/release-hashes.mjs apps/extension/.output/stellixextension-0.1.0-chrome.zip | diff - SHA256SUMS
  ```

  If they differ, stop. Don't upload; investigate as a possible CI compromise (`docs/INCIDENT_RESPONSE.md`).

## 4. Sign and upload (Verified CRX uploads)

Store docs: <https://developer.chrome.com/docs/webstore/update#protect-package-updates>.

- [ ] Unpack the **verified** zip into an empty folder, e.g. `stellix-0.1.0/`.
- [ ] Sign it with the offline key, on the machine that holds it:

  ```bash
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --pack-extension="$PWD/stellix-0.1.0" --pack-extension-key=/path/to/privatekey.pem
  ```

  This writes `stellix-0.1.0.crx` next to the folder. Never let Chrome generate a new key here: an upload signed with any other key is rejected.
- [ ] Developer Dashboard → the item → **Package** → **Upload new package**, choose the `.crx`.
- [ ] Store listing and privacy tab still match `docs/store/` (single purpose, permission justifications, data disclosures, privacy policy URL).
- [ ] Submit for review. Leave **deferred publishing** checked, so the release goes live only when you publish it.

## 5. After approval

- [ ] Publish in the dashboard.
- [ ] Once the store serves the new version, run `node scripts/verify-store-package.mjs <extension-id> SHA256SUMS` (docs/VERIFY_RELEASE.md). It must pass.
- [ ] Publish the GitHub draft release.
- [ ] If anything is wrong after publishing: roll back from the dashboard (previous version, no review, live in about a minute), then follow `docs/INCIDENT_RESPONSE.md`.
