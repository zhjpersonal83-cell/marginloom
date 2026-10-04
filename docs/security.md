# Security design

## Threat model

The expected user is a developer inspecting non-sensitive model outputs. Treat imports and model text as untrusted. Main threats are cross-workspace record access, cross-origin mutations, maliciously expensive inputs, key disclosure, accidental provenance corruption and misleading evidence.

| Control        | Implemented behavior                                                                             | Remaining limit                                                         |
| -------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Authentication | Random session/API capability tokens; stored hashes                                              | No recoverable accounts, password reset or MFA                          |
| Authorization  | Every record query binds workspace; foreign runs return 404                                      | One owner capability per demo workspace; no multi-user team RBAC        |
| CSRF/CORS      | SameSite cookie, custom mutation header, Origin validation, no permissive CORS                   | TLS and trusted ingress required outside local demo                     |
| Injection/XSS  | Prepared statements and React text rendering; JSON-only imports                                  | No arbitrary HTML/CSV/image uploads supported                           |
| Secrets        | Hash-only token storage; keys shown once; env files ignored                                      | Stolen bearer capabilities grant workspace access until revoked/expired |
| Resource use   | Streamed byte cap, class/row/slice caps, stored-payload cap, atomic run quota, rate counters     | Distributed bot abuse/global account quotas need an ingress control     |
| Headers        | nosniff, same-origin referrer policy, camera/mic/location denied; object/base/frame restrictions | This is a partial CSP, not a strict nonce-based script policy           |
| Audit          | Safe structured request logs and database mutation events                                        | Audit records are not cryptographically immutable                       |

Raw inference text and tokens are not logged. Imported text is intentionally persisted in the caller's evaluation snapshot and returned to that authorized workspace/report. A public demonstration should only accept nonsensitive data. Synthetic seed data contains no private user material.

Rate-limit/session expiry records are cleaned. Runs, keys and reviews do not yet have automatic retention/deletion or backup management. A seven-day browser session is not a promise of seven-day data retention. Keys remain active until rotated or removed by the operator.

The hosted preview's outer platform authentication is separate from app workspaces. Local mode does not trust arbitrary platform identity headers. Docker defaults to loopback exposure, a non-root user, dropped capabilities and no-new-privileges.

Before external production use, add managed identity, role membership, retention/backups, HTTPS ingress, global abuse controls, dependency/security review and independent domain validation. These are explicit product gaps, not hidden behind a certification claim.
