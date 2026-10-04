# Security

This is a research preview with isolated demo sessions, not a hardened enterprise service. Do not upload sensitive data to a shared demonstration deployment.

Report vulnerabilities privately through GitHub's security reporting facility if enabled; otherwise request a private reporting channel without publishing exploit details or secrets. No security contact email is invented here.

The app uses prepared SQL, server-side workspace scoping, hashed capability/API tokens, same-origin mutation checks, request-size limits, rate limits, bounded run storage, secure response headers and audited writes. See [the threat model](docs/security.md) for the precise guarantees and gaps.

The container binds localhost by default. Before external self-hosting, add HTTPS, account lifecycle management, retention/backup operations and an abuse-resistant ingress. Do not trust platform identity headers on an untrusted direct origin.
