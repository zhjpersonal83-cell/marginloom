# Product brief

## User and decision

An applied AI developer has model outputs but needs to decide what can be automated and what should be reviewed. Aggregate accuracy is not enough: confidence can be wrong, context can be misleading and a threshold creates a human workload.

Marginloom connects prediction evidence to a visible, reversible policy and a recorded human decision. It is a developer/research tool, not a system that decides consequential outcomes for people.

## Core journey and acceptance criteria

1. Open an immediately usable synthetic benchmark without a commercial API key.
2. Inspect calibration and held-out errors. Every displayed count comes from records.
3. Adjust policy and observe acceptance/error/review volume change together.
4. Find a failing record and persist a review note without replacing its reference label.
5. Import a valid custom prediction bundle, save a policy version and retrieve it after reload.
6. Export the visible policy and independent review evidence with the original content hash.

Success is a five-minute inspectable journey that a developer can reproduce from a checkout. It is not measured by fictional adoption or an unvalidated commercial market-size claim.

## Screens and state

Overview and Evaluation share the actual statistical engine. Datasets & runs manages immutable snapshots. Inference lab runs the fixed local text adapter. Human review searches and filters policy failures. Monitoring shows actual actions and descriptive slice distributions. Developer access rotates a workspace key. Settings exposes real session/policy boundaries. Product guide explains the workflow.

The secondary Vision lab is explicitly a precomputed segmentation experiment with its own export. It is not yet an online image import/review system. The interface is responsive, keyboard-operable and provides validation, loading, error and empty states. No placeholder feature pages are advertised.

## Differentiation and scope

The strength is a reproducible evidence chain with clear limitations and tested engineering. Competitors already offer evaluation, observability and review primitives. Broader agents, RAG, finance, native mobile and billing are deferred because they would dilute this release's central problem.
