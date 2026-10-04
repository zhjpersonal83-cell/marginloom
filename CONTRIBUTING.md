# Contributing

Use Node 24, pnpm 11.25.0 and Python 3.12. Run `make install`, then `make dev`.

Keep changes focused on the prediction → evidence → decision → review workflow. Add a regression test for a statistical or authorization bug. Run `make test`, `make lint`, `make typecheck` and `make integration` before opening a pull request. Format first-party TypeScript with Prettier.

New model adapters should export the documented JSON bundle. Never fit a calibrator on test data. Preserve source records and write review decisions separately. Any benchmark must record the actual commands, dataset provenance, seed and limitations.

Use only synthetic, appropriately licensed or explicitly authorized data. Do not attach sensitive datasets to issues. Existing migration files are immutable after deployment; append a new migration.

This project was developed with AI assistance. Contributions are reviewed on their behavior and evidence, regardless of how code was authored.
