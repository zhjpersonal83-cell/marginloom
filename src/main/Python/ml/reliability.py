"""Portable, explicit multiclass calibration and selective-prediction conventions."""
import math
import numpy as np
from scipy.optimize import minimize_scalar
from sklearn.metrics import f1_score, roc_auc_score


def validate_dataset(dataset):
    if not isinstance(dataset, dict):
        raise ValueError("dataset must be an object")
    classes = dataset.get("classNames")
    if not isinstance(classes, list) or len(classes) < 2 or not all(isinstance(c, str) and c for c in classes) or len(set(classes)) != len(classes):
        raise ValueError("classNames must contain at least two unique nonempty strings")
    rows = dataset.get("records")
    if not isinstance(rows, list) or not rows:
        raise ValueError("records must be a nonempty array")
    ids = set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("each record must be an object")
        if not isinstance(row.get("id"), str) or not row["id"] or row["id"] in ids:
            raise ValueError("record ids must be unique nonempty strings")
        ids.add(row["id"])
        if type(row.get("label")) is not int or not 0 <= row["label"] < len(classes):
            raise ValueError("label must be an integer class index")
        if row.get("split") not in ("calibration", "test"):
            raise ValueError("split must be calibration or test")
        if "text" in row and not isinstance(row["text"], str):
            raise ValueError("text must be a string")
        if "slice" in row and not isinstance(row["slice"], str):
            raise ValueError("slice must be a string")
        z = row.get("logits")
        if not isinstance(z, list) or len(z) != len(classes) or any(type(v) not in (int,float) or not math.isfinite(v) for v in z):
            raise ValueError("logits must be a finite vector matching classNames")
        if "oodScore" in row and (type(row["oodScore"]) not in (int,float) or not math.isfinite(row["oodScore"]) or not 0 <= row["oodScore"] <= 1):
            raise ValueError("oodScore must lie in [0,1]")
        if "ensembleLogits" in row:
            members = row["ensembleLogits"]
            if not isinstance(members, list) or len(members) < 2 or any(not isinstance(m, list) or len(m) != len(classes) or any(type(v) not in (int,float) or not math.isfinite(v) for v in m) for m in members):
                raise ValueError("ensembleLogits must contain at least two valid class-logit vectors")
    return rows


def log_softmax(logits, temperature=1.0):
    if not np.isfinite(temperature) or temperature <= 0:
        raise ValueError("temperature must be positive and finite")
    z = np.asarray(logits, dtype=float)
    if not np.all(np.isfinite(z)):
        raise ValueError("logits must be finite")
    z = (z - np.max(z, axis=-1, keepdims=True)) / temperature
    return z - np.log(np.exp(z).sum(axis=-1, keepdims=True))


def probabilities(logits, temperature=1.0):
    return np.exp(log_softmax(logits, temperature))


def fit_temperature(rows):
    """Only calibration rows may influence the single fitted positive temperature."""
    cal = [r for r in rows if r["split"] == "calibration"]
    if not cal:
        raise ValueError("at least one calibration record is required")
    z, y = np.array([r["logits"] for r in cal]), np.array([r["label"] for r in cal])
    def objective(log_t):
        lp = log_softmax(z, math.exp(log_t))
        return float(-lp[np.arange(len(y)), y].mean())
    result = minimize_scalar(objective, bounds=(math.log(.05), math.log(20)), method="bounded", options={"xatol": 1e-11})
    candidates = [0., math.log(.05), math.log(20), float(result.x)]
    best = min(candidates, key=objective)
    temperature = math.exp(best)
    return {"temperature": temperature, "calibrationCount": len(cal), "nllBefore": objective(0.), "nllAfter": objective(best), "bounds": [.05, 20], "atBoundary": temperature < .05001 or temperature > 19.999}


def metrics(rows, temperature=1., n_bins=10, n_classes=3):
    if not rows:
        return {"count": 0, "accuracy": None, "macroF1": None, "nll": None, "brier": None, "ece": None, "aurocMacroOvr": None, "bins": []}
    y = np.array([r["label"] for r in rows]); z = np.array([r["logits"] for r in rows])
    lp = log_softmax(z, temperature); p = np.exp(lp)
    pred = np.argmax(z, axis=1); confidence = p.max(axis=1); correct = pred == y
    indices = np.minimum(np.floor(confidence * n_bins).astype(int), n_bins - 1)
    bins = []
    ece = 0.
    for b in range(n_bins):
        chosen = indices == b; count = int(chosen.sum())
        acc = float(correct[chosen].mean()) if count else None
        conf = float(confidence[chosen].mean()) if count else None
        if count:
            ece += count / len(rows) * abs(acc - conf)
        bins.append({"lower": b/n_bins, "upper": (b+1)/n_bins, "count": count, "accuracy": acc, "confidence": conf})
    aucs = [float(roc_auc_score(y == k, p[:, k])) if 0 < (y == k).sum() < len(y) else None for k in range(n_classes)]
    return {"count": len(rows), "accuracy": float(correct.mean()), "macroF1": float(f1_score(y, pred, labels=list(range(n_classes)), average="macro", zero_division=0)), "nll": float(-lp[np.arange(len(y)), y].mean()), "brier": float(((p - np.eye(n_classes)[y]) ** 2).sum(axis=1).mean()), "ece": float(ece), "aurocMacroOvr": float(np.mean(aucs)) if all(a is not None for a in aucs) else None, "aurocPerClass": aucs, "classCounts": [int((y == k).sum()) for k in range(n_classes)], "bins": bins}


def disagreement(member_logits):
    """Jensen-Shannon disagreement in nats among uncalibrated ensemble members."""
    p = probabilities(member_logits)
    mean = p.mean(axis=0)
    def entropy(x):
        return -(x * np.log(np.maximum(x, 1e-300))).sum(axis=-1)
    return float(max(0., entropy(mean) - entropy(p).mean()))


def apply_policy(row, temperature, confidence_threshold=.8, ood_threshold=.65, disagreement_threshold=.12):
    confidence = float(probabilities(row["logits"], temperature).max())
    reasons = []
    if confidence < confidence_threshold:
        reasons.append("low_confidence")
    if row.get("oodScore") is not None and row["oodScore"] > ood_threshold:
        reasons.append("high_novelty")
    if row.get("ensembleLogits") is not None and disagreement(row["ensembleLogits"]) > disagreement_threshold:
        reasons.append("ensemble_disagreement")
    return {"decision": "review" if reasons else "accept", "reasons": reasons, "confidence": confidence}


def risk_coverage(rows, temperature=1.):
    """All tied confidences enter together; no label-based ordering or fake zero risk."""
    scores = [(float(probabilities(r["logits"], temperature).max()), int(np.argmax(r["logits"]) != r["label"])) for r in rows]
    scores.sort(key=lambda x: -x[0])
    points = [{"coverage": 0., "risk": None, "accepted": 0, "errors": 0, "threshold": None}]
    errors = 0
    for i, (score, error) in enumerate(scores):
        errors += error
        if i == len(scores)-1 or scores[i+1][0] != score:
            points.append({"coverage": (i+1)/len(scores), "risk": errors/(i+1), "accepted": i+1, "errors": errors, "threshold": score})
    return points
