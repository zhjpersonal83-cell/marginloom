# API contract

All endpoints are same-origin under `/api`. JSON errors include `error` and usually `requestId`. The live route implementation is authoritative.

## Authentication

`POST /session` with JSON `{}` and `X-Marginloom-Client: 1` opens an isolated capability workspace. The random session token is an HttpOnly, SameSite=Strict cookie with a seven-day expiry and Secure on HTTPS. Browser mutations require the custom header and reject a different Origin. No permissive CORS headers are emitted.

Generate a key in Developer access or authenticated `POST /keys`. The returned secret appears once; only its SHA-256 hash is persisted. A new key atomically revokes the prior key. Send `Authorization: Bearer <key>` for programmatic calls. Keys cannot cross workspaces.

| Method | Path           | Behavior                                                       |
| ------ | -------------- | -------------------------------------------------------------- |
| GET    | `/health`      | Database readiness, public                                     |
| POST   | `/session`     | Create/reuse isolated browser workspace                        |
| GET    | `/bootstrap`   | Baseline run, saved-run index and baseline reviews             |
| POST   | `/evaluate`    | Validate, fit T and persist an evaluation                      |
| GET    | `/runs/:id`    | Fetch an authorized run; `demo` is the synthetic baseline      |
| POST   | `/policy`      | `{runId, policy}` creates an immutable snapshot                |
| POST   | `/predict`     | `{text, policy?}` runs the fixed synthetic text adapter        |
| POST   | `/review`      | `{runId, recordId, decision, note}` records independent review |
| GET    | `/reviews/:id` | Reviews for one authorized run                                 |
| GET    | `/report/:id`  | Export persisted policy and review evidence                    |
| POST   | `/report/:id`  | `{policy}` exports the current exploratory policy              |
| GET    | `/audit`       | Latest 100 workspace events                                    |
| POST   | `/keys`        | Rotate the workspace API key                                   |

## Prediction bundle

```json
{
  "name": "My classifier",
  "classNames": ["negative", "positive"],
  "rows": [
    {
      "id": "unique-sample-id",
      "label": 1,
      "logits": [-0.4, 1.2],
      "split": "calibration",
      "text": "Optional inspectable source text",
      "slice": "clean",
      "group": "subject-or-template-group",
      "ensembleLogits": [
        [-0.5, 1.3],
        [-0.3, 1.1]
      ],
      "oodScore": 0.1
    }
  ]
}
```

This shows one row's shape, not a complete valid dataset. Use `data/demo.json` for a runnable example. At least 10 rows per split and every class in calibration are required. There may be 2–12 distinct classes, up to 2,000 records and 50 slices. Text is at most 2,000 characters per row; request body at most 900,000 bytes. Labels index `classNames`; logits must be finite and dimensionally consistent. Exact normalized text and supplied group IDs cannot cross splits. The importer cannot discover hidden near-duplicates or verify the caller's true provenance.

Policy: `{threshold: 0.8, maxDisagreement: 0.12, maxOod: 0.65}`. The latter two checks apply only when corresponding optional signals are supplied. Review decisions are `confirmed`, `corrected` or `needs-context`; a correction requires a nonempty note. A correction is a disposition/note, not an automatic relabeling.

Status codes: 401 missing/invalid identity, 403 CSRF/origin failure, 404 unknown/foreign run, 409 run quota, 413 resource limit, 415 content type, 422 input validation, 429 request rate, 500/503 service failure. API tests exercise these boundaries.
