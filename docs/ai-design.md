# AI design

## Text adapter

Three scikit-learn multinomial logistic regressions are trained on separate stratified bootstrap samples of 720 synthetic support records. Inputs are binary word-presence features. The exported vocabulary contains 410 features. ASCII tokenization, lowercase normalization and unique-token novelty are explicitly shared between Python and JavaScript.

Sentence-template families are assigned to training, calibration or test before generation. No text or template group crosses splits. The vocabulary uses training data only. Five slices test clean text, typos, verbose context, resolved context and misleading mixed context. They still share a synthetic generating process and do not establish generalization to real support traffic.

The class called `frustrated` means an author-assigned repeated/unresolved support category. It is not a claim to identify a real person's emotion. Model output should never be used to judge people.

Mean ensemble logits feed a temperature-scaled softmax. Members' raw predictive distributions provide Jensen–Shannon disagreement. Token coefficients explain contributions to the selected class logit; they are not causal explanations or SHAP values. The unknown unique-token fraction is a lexical novelty heuristic, not an OOD probability.

## Vision companion

`ml/segmentation/run_segmentation.py` creates grayscale fluorescent-style geometric objects and exact masks. A standardized pixel-feature logistic model is fitted on 40 images. A foreground threshold is selected by mean Dice on 10 separate tuning images. Ten untouched images provide final Dice/IoU. This tunes a decision threshold; it does not calibrate pixel probabilities.

The UI displays deterministic precomputed inputs, masks, predictions and normalized binary-entropy images. No patient data, clinical model or online image inference is implied. Image-level splits prevent pixel leakage between datasets.

## Extension contract

For any new classifier, export finite logits in a fixed class order, reference labels, unique IDs, split membership and provenance. Optionally provide ensemble logits, an explicitly defined OOD heuristic, slices and group IDs. The engine never trains the caller's model or silently interprets a probability vector as logits. See the API contract.

A future Transformer adapter should preserve preprocessing/checkpoint hashes and licensing, define its label semantics, add an independent calibration split and supply reference fixtures before being advertised.
