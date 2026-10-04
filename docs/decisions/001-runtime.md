# ADR 001: Worker-compatible modular monolith

Status: accepted for v0.1.

A small public portfolio must run without paid services and be deployable to the available hosting platform. We use React/TypeScript with a Next-compatible App Router implemented by Vinext, a Worker API and D1. Python handles reproducible ML research and exports portable weights.

This avoids a mandatory always-on Python inference service, Redis, vector database or microservice network. The model-independent engine has no runtime coupling to the UI/store. Docker uses the same production Worker build in the local emulator.

Trade-offs: Vinext is beta software rather than stock Next.js; framework compatibility needs explicit build/browser checks. D1/Worker limits constrain synchronous jobs. The container uses Wrangler local for demonstration. A conventional Node/FastAPI/Postgres deployment is a valid future adapter, not a feature that exists today.
