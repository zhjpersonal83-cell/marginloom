# Verification record

Executed on 2026-10-04. This is a record of observed checks, not a certification or a claim that remote CI has run.

## Automated checks

| Check                                           | Result                        | Evidence                                                                                                                   |
| ----------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| TypeScript engine and cross-language fixtures   | 17 passed                     | `pnpm test`                                                                                                                |
| Independent Python mathematical/inference tests | 12 passed                     | `python -m unittest discover -s ml -v`                                                                                     |
| Built Worker API suite with real local D1       | 21 checks passed, 23 requests | `pnpm build && pnpm test:integration`                                                                                      |
| Database invariants                             | 3 checks passed               | Same integration command: 35 concurrent inserts retain exactly 30 runs; expired session/counter cleanup; indexed run query |
| ESLint                                          | Passed                        | `pnpm lint`                                                                                                                |
| TypeScript                                      | Passed                        | `pnpm typecheck`                                                                                                           |
| Frontend + Worker build                         | Passed                        | Vinext/Vite production compilation                                                                                         |
| Model training and artifact export              | Executed                      | `ml/build.py`, `ml/segmentation/run_segmentation.py`, `scripts/export-models.py`                                           |

Integration tests use the compiled Worker and Miniflare D1, not mocked route functions. They exercise missing authentication, cross-origin writes, CSRF header enforcement, workspace isolation, invalid data, leakage rejection, inference escalation, snapshot persistence, consistent slice policies, provenance, review notes, current-policy report contents, API-key rotation and audit records. The database trigger is tested under concurrent calls.

The local suite prints timing measurements for diagnosis. They are sequential local Worker dispatch timings and **exclude real network latency and production concurrency**. They are not published as a production performance benchmark.

## Actual browser checks

The running app was inspected in Chrome at 1348 × 926. A temporary same-origin inspection page rendered the real app at 390 × 844 and 1024 × 768; content widths matched their available widths (375 and 1009 CSS pixels), with no document-level horizontal overflow. The temporary inspection page is excluded from the product.

Observed workflows:

- Seeded overview, calibration diagram, confidence risk curve and slice table loaded.
- Keyboard `End` on the threshold slider produced 100% confidence, 0 accepted records, 360 review records, and unavailable risk/Wilson values. Every slice showed 0% coverage.
- Saving the policy created a distinct selected run.
- New evaluation accepted the current dataset and persisted a run.
- The inference lab produced actual model probabilities and token contributions; unfamiliar vocabulary escalated a high-confidence input for review.
- A correction with a note persisted and remained visible after reloading the workspace.
- Vision sample selection changed the actual source image, masks, entropy and per-image metrics.
- The mobile sidebar opened with all navigation destinations.
- Report generation displayed the generated JSON filename, byte count and download link. API tests independently validated report content and current policy.

**Browser limits:** the cloud browser download-event adapter timed out for generated Blob links, including an explicit user-gesture download link. File delivery through that adapter is therefore not marked verified. The report API and visible report-generation state passed; validate file saving in a normal browser before a public release. A read-only WebMCP adapter is feature-detected in the app, but this browser exposed no document tools, so it is not claimed as tested. Browser console inspection showed extension metadata errors, with no application error in the inspected log entries.

Screenshots in `docs/screenshots/` are captures of the running app, not design mockups.

## Explicitly unverified

- Docker Engine is unavailable in the authoring environment. Dockerfile/Compose are reviewed and a dedicated container CI job is provided; a local container run is not claimed.
- GitHub Actions status is pending until the new repository is created and pushed. Workflow configuration alone is not a passing run.
- No production load test, independent penetration test, screen-reader audit, cross-browser suite or dependency-vulnerability scan is claimed.
- No external real-world dataset or clinical validation was performed. All displayed model results are synthetic demonstrations.

## Reproduce locally

```bash
corepack pnpm install --frozen-lockfile
make lint
make typecheck
make test
make build
make integration
```

For a complete container check:

```bash
docker compose up --build -d --wait
curl --fail http://127.0.0.1:3000/api/health
docker compose logs
docker compose down
```

Release gate: complete the container job, verify browser file saving, review dependency advisories, and test the exact deployment before exposing it to untrusted traffic. Production identity, retention controls and stronger OOD evaluation remain roadmap work.
