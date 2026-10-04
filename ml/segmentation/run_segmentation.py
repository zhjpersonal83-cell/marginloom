#!/usr/bin/env python3
"""Reproducible synthetic microscopy segmentation; not a clinical model.

Training fits a three-feature logistic regression on training-image pixels.
Calibration selects one global threshold by mean per-image Dice. Test images
are used only for the final evaluation. No deep learning is used.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, uniform_filter
from scipy.special import expit
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler


SPLIT_COUNTS = {"train": 40, "calibration": 10, "test": 10}
FEATURE_NAMES = ["intensity", "local_mean_5x5", "local_mean_11x11"]


def write_json(path: Path, value: dict | list) -> None:
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")


def generate_image(rng: np.random.Generator, size: int = 96):
    """Create fluorescent-style images and exact geometric ellipse masks."""
    yy, xx = np.mgrid[:size, :size]
    background = (
        rng.uniform(0.08, 0.20)
        + rng.uniform(-0.04, 0.04) * xx / size
        + rng.uniform(-0.04, 0.04) * yy / size
    )
    signal = np.zeros((size, size), dtype=np.float64)
    mask = np.zeros((size, size), dtype=bool)
    ellipses = []
    for _ in range(int(rng.integers(5, 12))):
        cx, cy = rng.uniform(12, size - 12, size=2)
        rx, ry = rng.uniform(4, 10, size=2)
        angle = rng.uniform(0, np.pi)
        dx, dy = xx - cx, yy - cy
        u = dx * np.cos(angle) + dy * np.sin(angle)
        v = -dx * np.sin(angle) + dy * np.cos(angle)
        radius_sq = (u / rx) ** 2 + (v / ry) ** 2
        inside = radius_sq <= 1
        mask |= inside
        amplitude = rng.uniform(0.24, 0.55)
        cell_signal = inside * amplitude * (0.65 + 0.35 * np.exp(-radius_sq))
        signal = np.maximum(signal, cell_signal)
        ellipses.append({
            "center_x": float(cx), "center_y": float(cy),
            "radius_x": float(rx), "radius_y": float(ry),
            "angle_radians": float(angle), "amplitude": float(amplitude),
        })
    intensity = background + gaussian_filter(signal, sigma=rng.uniform(0.7, 1.25))
    # Non-cell point fluorescence makes intensity thresholding imperfect.
    for _ in range(int(rng.integers(3, 9))):
        cx, cy = rng.uniform(0, size, size=2)
        intensity += rng.uniform(0.05, 0.17) * np.exp(-((xx-cx)**2 + (yy-cy)**2) / 3)
    intensity += rng.normal(0, rng.uniform(0.025, 0.055), intensity.shape)
    # Fit and evaluate the exact quantized images that are exported as PNGs.
    image = np.rint(np.clip(intensity, 0, 1) * 255).astype(np.uint8)
    return image, mask, ellipses


def extract_features(image: np.ndarray) -> np.ndarray:
    intensity = image.astype(np.float64) / 255.0
    return np.stack([
        intensity,
        uniform_filter(intensity, size=5, mode="reflect"),
        uniform_filter(intensity, size=11, mode="reflect"),
    ], axis=-1).reshape(-1, 3)


def overlap_metrics(predicted: np.ndarray, actual: np.ndarray) -> dict:
    predicted, actual = predicted.astype(bool), actual.astype(bool)
    tp = int(np.count_nonzero(predicted & actual))
    fp = int(np.count_nonzero(predicted & ~actual))
    fn = int(np.count_nonzero(~predicted & actual))
    dice_denominator = 2 * tp + fp + fn
    iou_denominator = tp + fp + fn
    return {
        "dice": float(2 * tp / dice_denominator) if dice_denominator else 1.0,
        "iou": float(tp / iou_denominator) if iou_denominator else 1.0,
        "true_positive_pixels": tp,
        "false_positive_pixels": fp,
        "false_negative_pixels": fn,
        "foreground_pixels": int(actual.sum()),
        "predicted_foreground_pixels": int(predicted.sum()),
    }


def predict_from_export(image: np.ndarray, model: dict) -> np.ndarray:
    """Inference uses only exported coefficients, with no sklearn dependency."""
    x = extract_features(image)
    normalized = (x - np.asarray(model["scaler_mean"])) / np.asarray(model["scaler_scale"])
    return expit(normalized @ np.asarray(model["coefficients"]) + model["intercept"])


def make_examples(samples: list, probabilities: dict, threshold: float, output: Path) -> None:
    examples = output / "examples"
    examples.mkdir(exist_ok=True)
    tiles = []
    for sample in [s for s in samples if s["split"] == "test"][:4]:
        sid, raw, mask = sample["id"], sample["image"], sample["mask"]
        predicted = probabilities[sid].reshape(raw.shape) >= threshold
        Image.fromarray(predicted.astype(np.uint8) * 255).save(examples / f"{sid}_prediction.png")
        # Green=true positive; red=false positive; blue=false negative.
        overlay = np.repeat(raw[..., None], 3, axis=2).astype(np.float64)
        for region, color in [
            (predicted & mask, [70, 225, 135]),
            (predicted & ~mask, [255, 70, 80]),
            (~predicted & mask, [70, 140, 255]),
        ]:
            overlay[region] = 0.45 * overlay[region] + 0.55 * np.asarray(color)
        overlay_image = Image.fromarray(np.rint(overlay).astype(np.uint8))
        overlay_image.save(examples / f"{sid}_overlay.png")
        panels = [Image.fromarray(raw).convert("RGB"), Image.fromarray(mask.astype(np.uint8)*255).convert("RGB"), Image.fromarray(predicted.astype(np.uint8)*255).convert("RGB"), overlay_image]
        row = Image.new("RGB", (4 * 192, 228), (18, 25, 38))
        draw = ImageDraw.Draw(row)
        scores = overlap_metrics(predicted, mask)
        titles = [sid + " / synthetic", "Known ellipse mask", f"Prediction Dice {scores['dice']:.3f}", "TP green / FP red / FN blue"]
        for i, (panel, title) in enumerate(zip(panels, titles)):
            row.paste(panel.resize((192, 192), resample=Image.Resampling.NEAREST), (i*192, 28))
            draw.text((i*192+5, 8), title, fill=(235, 242, 255))
        tiles.append(row)
    sheet = Image.new("RGB", (768, 228 * len(tiles)), (18, 25, 38))
    for i, row in enumerate(tiles):
        sheet.paste(row, (0, i*228))
    sheet.save(examples / "test_examples.png")


def run(output: Path, seed: int = 20261004) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    samples = []
    manifest = []
    # Spawn separate RNG streams so generating more training examples cannot
    # change the calibration or test images.
    streams = np.random.SeedSequence(seed).spawn(len(SPLIT_COUNTS))
    for (split, count), stream in zip(SPLIT_COUNTS.items(), streams):
        rng = np.random.default_rng(stream)
        split_path = output / "data" / split
        split_path.mkdir(parents=True, exist_ok=True)
        for index in range(count):
            sid = f"{split}_{index:03d}"
            raw, mask, ellipses = generate_image(rng)
            Image.fromarray(raw).save(split_path / f"{sid}.png")
            Image.fromarray(mask.astype(np.uint8) * 255).save(split_path / f"{sid}_mask.png")
            samples.append({"id": sid, "split": split, "image": raw, "mask": mask})
            manifest.append({
                "id": sid, "split": split,
                "image": f"data/{split}/{sid}.png",
                "mask": f"data/{split}/{sid}_mask.png",
                "ellipse_parameters": ellipses,
            })
    train = [s for s in samples if s["split"] == "train"]
    x_train = np.concatenate([extract_features(s["image"]) for s in train])
    y_train = np.concatenate([s["mask"].ravel() for s in train]).astype(np.uint8)
    scaler = StandardScaler().fit(x_train)
    classifier = LogisticRegression(C=1.0, solver="lbfgs", max_iter=400, random_state=seed)
    classifier.fit(scaler.transform(x_train), y_train)
    probabilities = {
        s["id"]: classifier.predict_proba(scaler.transform(extract_features(s["image"])))[:, 1]
        for s in samples
    }
    calibration = [s for s in samples if s["split"] == "calibration"]
    threshold_scores = []
    for threshold in np.linspace(0.1, 0.9, 81):
        score = np.mean([
            overlap_metrics(probabilities[s["id"]] >= threshold, s["mask"].ravel())["dice"]
            for s in calibration
        ])
        threshold_scores.append({"threshold": float(threshold), "mean_image_dice": float(score)})
    selected = max(threshold_scores, key=lambda row: (row["mean_image_dice"], -abs(row["threshold"] - 0.5)))
    threshold = selected["threshold"]
    model = {
        "schema_version": 1,
        "model_type": "standardized_pixel_logistic_regression",
        "synthetic_only": True,
        "clinical_use": False,
        "feature_names": FEATURE_NAMES,
        "input": "uint8 grayscale; divide by 255; local means use scipy.ndimage.uniform_filter(mode='reflect')",
        "scaler_mean": scaler.mean_.tolist(), "scaler_scale": scaler.scale_.tolist(),
        "coefficients": classifier.coef_[0].tolist(), "intercept": float(classifier.intercept_[0]),
        "probability_formula": "sigmoid(((features - scaler_mean) / scaler_scale) @ coefficients + intercept)",
        "foreground_threshold": threshold,
        "threshold_rule": "foreground if probability >= threshold",
        "threshold_selection": "maximize mean per-image Dice on calibration images; ties closest to 0.5",
        "fit_image_ids": [s["id"] for s in train],
        "threshold_image_ids": [s["id"] for s in calibration],
        "training_iterations": int(classifier.n_iter_[0]),
    }
    per_image = []
    for sample in samples:
        scores = overlap_metrics(probabilities[sample["id"]] >= threshold, sample["mask"].ravel())
        per_image.append({"id": sample["id"], "split": sample["split"], **scores})
    summaries = {}
    for split in SPLIT_COUNTS:
        rows = [row for row in per_image if row["split"] == split]
        tp = sum(row["true_positive_pixels"] for row in rows)
        fp = sum(row["false_positive_pixels"] for row in rows)
        fn = sum(row["false_negative_pixels"] for row in rows)
        summaries[split] = {
            "images": len(rows),
            "mean_image_dice": float(np.mean([r["dice"] for r in rows])),
            "std_image_dice": float(np.std([r["dice"] for r in rows])),
            "mean_image_iou": float(np.mean([r["iou"] for r in rows])),
            "std_image_iou": float(np.std([r["iou"] for r in rows])),
            "pooled_pixel_dice": float(2*tp / (2*tp+fp+fn)),
            "pooled_pixel_iou": float(tp / (tp+fp+fn)),
        }
    metrics = {
        "schema_version": 1, "seed": seed,
        "provenance": "Entirely generated fluorescent-style grayscale images with known geometric ellipse masks. No real microscopy or patient data.",
        "scope": "Nonclinical synthetic baseline using logistic regression; no deep learning and no evidence of real-world microscopy performance.",
        "split_unit": "image", "image_shape": [96, 96],
        "fitting_protocol": "Scaler and logistic model fit only training pixels. One threshold selected only on calibration images. Test used only for evaluation.",
        "calibration_definition": "Calibration split tunes a binary decision threshold; it does not perform probability calibration.",
        "dice_definition": "2*TP/(2*TP+FP+FN)",
        "iou_definition": "TP/(TP+FP+FN)",
        "empty_mask_convention": "If prediction and truth are both empty, Dice and IoU equal 1.",
        "foreground_threshold": threshold,
        "splits": summaries,
        "per_image": per_image,
        "calibration_threshold_search": threshold_scores,
    }
    # Check inference portability against sklearn before publishing exports.
    export_error = max(float(np.max(np.abs(predict_from_export(s["image"], model) - probabilities[s["id"]]))) for s in samples)
    if export_error > 1e-12:
        raise RuntimeError(f"Exported inference mismatch: {export_error}")
    metrics["export_max_probability_error"] = export_error
    write_json(output / "model.json", model)
    write_json(output / "metrics.json", metrics)
    write_json(output / "manifest.json", manifest)
    make_examples(samples, probabilities, threshold, output)
    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent / "artifacts")
    parser.add_argument("--seed", type=int, default=20261004)
    args = parser.parse_args()
    result = run(args.output, args.seed)
    print(json.dumps({"output": str(args.output.resolve()), "threshold": result["foreground_threshold"], "test": result["splits"]["test"], "export_max_probability_error": result["export_max_probability_error"]}, indent=2))
