# Marginloom reproducible research prototype

This is an actual trained, key-free lexical classification baseline with transparently synthetic data. It is not a production benchmark or an emotion detector. Class names are `routine`, `frustrated`, `urgent`; `frustrated` means an author-assigned repeated/unresolved support request requiring follow-up, never an inference about a real person's emotional state.

Run `python build.py`, then `python -m unittest -v`. Dependencies: Python, NumPy, SciPy and scikit-learn; Node is needed only for the exported-JavaScript parity test. Run `python segmentation/run_segmentation.py` for the optional image baseline.

The NLP experiment has 720 training, 180 calibration and 360 test records. Entire sentence-template families are assigned to splits before generation. Every class and slice occurs in every split; exact texts and group IDs never cross splits. The vocabulary is fitted only on training text. Three multinomial logistic models use separate stratified training bootstraps. Binary word presence, coefficients and intercepts are exported for portable local JavaScript inference. A shared mean-logit aggregation is explicit. No artificial logit sharpening is used (`logitScale=1`). Temperature is fitted only on calibration records, by minimizing natural-log NLL, within [0.05, 20].

`artifacts/model.json` contains vocabulary, three coefficient/intercept arrays, training settings and fitted temperature. `predictions.json` contains classNames and records shaped `{id,text,label,logits,split,slice,ensembleLogits,oodScore,templateGroup}`. `training-records.json` makes training provenance inspectable. `metadata.json` defines labels, split manifests and metric conventions. `metrics.json` holds measured overall/slice scores, reliability bins, risk–coverage curves and the default policy operating point. `metric-fixtures.json` and `inference-fixtures.json` are portable reference outputs. `inference.mjs` implements actual local inference from the exported model.

The experiment deliberately reports its measured results even when calibration worsens a metric. Positive temperature preserves each record's predicted class and therefore accuracy/F1; it can change multiclass probability ranking and AUROC. ECE measures only top-label bin gaps, using ten equal-width bins with a closed final endpoint. Brier is the mean **sum** of squared errors over classes, in [0,2]. Macro OvR AUROC is null when any class lacks positives or negatives. F1 uses all configured classes and zero-division=0. Empty selective sets have null risk. Confidence ties enter a risk–coverage curve together; labels never break ties.

Review is the union of low confidence, high lexical novelty or high ensemble disagreement. Lexical novelty is the unique-token out-of-vocabulary fraction, not a calibrated OOD probability. Disagreement is the Jensen–Shannon entropy gap across raw member probabilities, in nats. The default disagreement threshold is 0.12 nats. Missing optional scores do not imply a signal is safe: a UI should mark them unavailable. Confidence-only curves and the multi-signal policy operating point are different objects. Human review is a routing recommendation; no reviewed answer is assumed correct, and no model is updated from test labels.

Synthetic text variants share a hand-authored generation distribution even though families are disjoint. Scores do not establish performance on genuine customer messages. The quoted-context and typo slices expose lexical model limitations. Interactive threshold changes evaluated on test data are exploratory; an unbiased release decision requires a separately locked evaluation set. Do not label any result a production safety guarantee.

Primary technical references:

- Guo et al. (2017), temperature scaling: https://proceedings.mlr.press/v70/guo17a.html
- scikit-learn calibration documentation, disjoint calibration fitting and metric interpretation: https://scikit-learn.org/stable/modules/calibration.html
- scikit-learn multiclass Brier convention: https://scikit-learn.org/stable/modules/generated/sklearn.metrics.brier_score_loss.html
- scikit-learn AUROC conventions: https://scikit-learn.org/stable/modules/generated/sklearn.metrics.roc_auc_score.html
- Nixon et al. (2019), measurement choices and ECE limitations: https://openaccess.thecvf.com/content_CVPRW_2019/html/Uncertainty_and_Robustness_in_Deep_Visual_Learning/Nixon_Measuring_Calibration_in_Deep_Learning_CVPRW_2019_paper.html
- Ovadia et al. (2019), uncertainty under dataset shift: https://proceedings.neurips.cc/paper/2019/hash/8558cb408c1d76621371888657d2eb1d-Abstract.html
- Geifman and El-Yaniv (2017), selective prediction: https://proceedings.neurips.cc/paper_files/paper/2017/hash/4a8423d5e91fda00bb7e46540e2b0cf1-Abstract.html
