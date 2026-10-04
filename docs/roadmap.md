# Roadmap

These are future directions, not implemented features.

1. **Real adapters and external validity.** Add consented/licensed datasets, a reproducible Transformer or Swin adapter and real segmentation outputs. Preserve model/data/preprocessing provenance and label semantics.
2. **Locked release decisions.** Introduce separate training/calibration/policy-validation/final-test roles, grouped confidence intervals, minimum-support requirements and an auditable pass/fail specification.
3. **Team operations.** Add recoverable managed identity, memberships, owner/reviewer/viewer roles, configurable retention, exports/deletion and backups.
4. **Larger asynchronous jobs.** Move datasets/masks to object storage, add durable job states, cancellation, idempotency and resource budgets. Keep the small offline demo intact.
5. **Ongoing feedback and new modalities.** Add labeled production windows, appropriate drift testing and multimodal or grounded-answer adapters. Keep uncertainty meanings task-specific; never turn heuristic scores into invented probabilities.

Contributions should first close a real workflow or validation gap. A feature does not belong solely because its name appears in a job advertisement.
