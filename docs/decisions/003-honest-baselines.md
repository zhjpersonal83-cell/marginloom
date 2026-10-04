# ADR 003: Small trained baselines with explicit limitations

Status: accepted for v0.1.

Use deterministic synthetic text and geometric micrographs with real trained linear models. This enables redistribution, one-command demos, exact parity checks and inspection without expensive weights or private research data.

The project does not pretend these models are Transformers, clinical systems or production emotion detectors. Users can import outputs from their own models through a stable contract. Actual calibration failures are retained; no logit inflation is introduced to manufacture an improvement.

Trade-off: synthetic data limits external validity and cannot demonstrate the user's original Swin or dissertation model quality. Future adapters need lawful data, actual checkpoints and independent evaluation.
