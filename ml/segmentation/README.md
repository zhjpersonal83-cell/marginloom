# Synthetic microscopy segmentation baseline

This reproducible, nonclinical demonstration generates grayscale fluorescent-style images and exact ellipse masks. It contains no patient data or real microscopy. It uses logistic regression, not deep learning, and its synthetic results do not establish real-world segmentation performance.

Run from this directory:

```bash
python run_segmentation.py
```

Dependencies: Python 3.10+, NumPy, SciPy, scikit-learn, and Pillow. The default seed is `20261004`; use `--seed` and `--output` to change it or the destination.

The 60 images are split by image: 40 training, 10 calibration, and 10 test. Separate random-number streams generate each split. A scaler and binary logistic regression fit all training-image pixels using grayscale intensity and local means in 5x5 and 11x11 neighborhoods. No coordinates, target masks, or ellipse parameters are model inputs. The calibration images select one global probability threshold by mean per-image Dice over 81 candidates from 0.10 to 0.90. Here, “calibration” means threshold tuning; probabilities are not calibrated. Test images only measure final performance.

Exported artifacts:

- `artifacts/metrics.json`: actual per-image Dice/IoU, split summaries, pooled pixel metrics, threshold search, and provenance.
- `artifacts/model.json`: portable scaler values, logistic coefficients, decision threshold, fit-image IDs, and inference formula. `predict_from_export` demonstrates inference without sklearn.
- `artifacts/manifest.json`: image-level split membership, relative image/mask paths, and ground-truth ellipse parameters.
- `artifacts/data/`: all 60 image PNGs and their 60 binary mask PNGs. Quantized exported images are the exact inputs used for fitting and evaluation.
- `artifacts/examples/test_examples.png`: first four held-out images, known masks, predictions, and error overlays. Green is true positive, red false positive, blue false negative.

Dice is `2TP/(2TP+FP+FN)` and IoU is `TP/(TP+FP+FN)`. If both masks are empty, both equal 1. Split means weight images equally; pooled metrics weight pixels. Test sample size is small, images share a simple synthetic generator, and cell brightness is deliberately correlated with ellipse membership. This is a reproducible baseline and integration asset, not a biomedical validation study.
