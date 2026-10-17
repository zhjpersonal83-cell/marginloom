# Verified Ubuntu release

The owner's `Marginloom.zip` includes `Marginloom-Ubuntu-x64.tar.gz` in this directory. It is the deployed application release verified on 2026-10-17; runtime settings and SQLite data are not included.

- Application source commit: `d18d722ce70d9d0c426abb508b4022d1fc5a9510`.
- Archive SHA-256: `3d5b0633855b5b43104ae1fb191bdfbc156cc54a7fc64bee0023c192b4a2535f`.
- All 67 internal `SHA256SUMS` checks passed after downloading the release.
- Target platform: Ubuntu Linux x86_64; includes its pinned Node.js runtime.

The archive is intentionally excluded from Git. Repository users can build a release with `pnpm package:selfhost`. Source documentation may have newer commits than the bundled application; the application code and model artifacts remain at the source commit above.

Follow [the self-hosting guide](../../docs/self-hosting.md) and preserve the existing server settings and database during updates. The first-install script is for a new installation.
