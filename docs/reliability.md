# Reliability methods and limits

## Calculations

For class logits z, temperature T > 0 gives softmax(z/T). T minimizes natural-log negative log likelihood on calibration rows only, bounded to [0.05,20]. The implementation uses deterministic golden-section search in log T and retains T=1 if the fitted objective does not improve. A boundary-fit flag is exported.

- Accuracy and macro F1 use argmax labels; positive temperature preserves both.
- Multiclass Brier is the mean sum of squared class-probability errors, range [0,2].
- ECE uses ten equal-width top-confidence bins and weights absolute bin accuracy/confidence gaps by counts. Empty bins have null accuracy/confidence. ECE is bin-sensitive and not a complete calibration assessment.
- NLL and Brier are proper scoring rules that also reflect discrimination, not pure calibration scores.
- Macro one-vs-rest AUROC is undefined if any class lacks positive or negative examples. Tied ranks use midranks. Multiclass temperature scaling can change cross-record class-probability ranking.
- Predictive entropy is in nats. Ensemble disagreement is the Jensen–Shannon gap of raw member distributions, also in nats. Neither is a certified epistemic/aleatoric decomposition.

## Selective prediction

A record is accepted only if all available policy signals pass: confidence ≥ threshold, disagreement ≤ maximum, and novelty ≤ maximum. Missing optional signals are unavailable evidence, not measured safety. Confidence-only risk–coverage includes all equal-confidence records together. It does not pretend to be the combined multi-signal policy curve.

Selective risk is wrong accepted predictions / accepted predictions. When no prediction is accepted, risk and its interval are null. The displayed Wilson upper endpoint uses z=1.96 and assumes independent Bernoulli observations for its descriptive interpretation. Synthetic records share templates; this is not a formal uncertainty guarantee or a multiple-comparison-corrected release bound.

Interactive threshold exploration reads test labels. Therefore results are descriptive. For an unbiased release gate, select policy on a separate validation split and evaluate once on a locked final test set, with uncertainty estimated at the appropriate group/image level. Human-reviewed labels never silently feed training or replace the benchmark reference.

## An observed failure, preserved

Calibration reduced synthetic test ECE from 0.1267 to 0.0726 and Brier from 0.1775 to 0.1620, but increased NLL from 0.3256 to 0.3816. The mixed-context slice also performs worse than the aggregate. These results illustrate why one headline metric is insufficient.

References: [Guo et al., 2017](https://proceedings.mlr.press/v70/guo17a.html), [Geifman and El-Yaniv, 2017](https://papers.nips.cc/paper_files/paper/2017/hash/4a8423d5e91fda00bb7e46540e2b0cf1-Abstract.html), [scikit-learn calibration guide](https://scikit-learn.org/stable/modules/calibration.html). No method is presented as novel.
