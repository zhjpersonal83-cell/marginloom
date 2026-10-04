"""Reproduce Marginloom's honestly synthetic support-handling research assets.

Run: python build.py. Training, calibration and test sentence families are disjoint.
This is an intentionally limited lexical baseline, not an emotion detector.
"""
from pathlib import Path
import hashlib
import json
import re
import platform
import numpy as np
import sklearn
import scipy
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LogisticRegression
from reliability import probabilities, fit_temperature, metrics, disagreement, apply_policy, risk_coverage

HERE = Path(__file__).resolve().parent
OUT = HERE / "artifacts"
CLASS_NAMES = ["routine", "frustrated", "urgent"]
SEED = 4817

# A family is an entire sentence construction, assigned before text generation.
# First six families train; next three calibrate; last three are held-out test.
TEMPLATES = [
    [
        "How can I {action} in {product}? This is a general question and nothing is blocked.",
        "Please explain the steps to {action}. I am planning a change in {product}.",
        "I would like documentation about {topic}. Our {scope} are working normally.",
        "Could you help me understand {topic} before our next setup? No outage is happening.",
        "Where is the option to {action}? This is my first request about {topic}.",
        "Can you send instructions for {topic}? There is no immediate deadline.",
        "A general setup question: what is the best way to {action} in {product}? Everything still works.",
        "We are preparing a guide for {topic}; please point us to the relevant instructions.",
        "Nothing is failing, but I need assistance to {action} for next month's plan.",
        "I need a walkthrough for {topic}; this is a normal information request.",
        "When convenient, show me how to {action}. Our team can continue working.",
        "For a future configuration, could someone describe {topic} in {product}? No active incident.",
    ],
    [
        "I have asked support twice about {topic}, and the same issue remains unresolved after {duration}.",
        "The instructions to {action} did not fix it. Please get someone to follow up on my earlier ticket.",
        "This is my third contact about {topic}. I keep receiving the same reply without a resolution.",
        "I am still waiting for help with {topic} after {duration}; please escalate this repeated request.",
        "Support said {topic} was fixed, but it happened again. I need an owner to investigate.",
        "I tried the suggested fix to {action} several times. Please stop repeating the same steps and review my case.",
        "Following up again: {topic} remains broken despite two support conversations. Someone needs to take ownership.",
        "The previous answer about {topic} missed my problem; I need a person to investigate the open case.",
        "Another attempt to {action} failed after support's advice. This unresolved back-and-forth has lasted {duration}.",
        "My ticket about {topic} was closed without solving anything. Please reopen it and assign a specialist.",
        "We keep going in circles on {topic}. I have already followed those instructions and need further help.",
        "I am contacting you once more to {action}; the last two responses did not resolve my request.",
    ],
    [
        "Our {scope} are blocked right now by {issue} in {product}. Please start incident response immediately.",
        "Production is down: {issue} has affected {scope} for {duration}. We need urgent intervention.",
        "We cannot operate because of {issue}. The whole {scope} need an immediate response from the on-call team.",
        "There is an active outage in {product}: {issue}. Please escalate to incident support now.",
        "Our live operations stopped when {issue} began. {scope} cannot work; immediate help is needed.",
        "Time-critical incident: {issue} is blocking {scope} in production. Please contact the response team now.",
        "An ongoing service failure, {issue}, has halted work for {scope}. Immediate incident handling is required.",
        "Please page the on-call engineer: {scope} have lost access due to {issue} in {product}.",
        "We have no workaround for {issue}; production has been unavailable for {duration}. Treat this as an active incident.",
        "Business operations are currently stopped for {scope}: {issue}. We need the incident team immediately.",
        "Live service interruption in {product}. {issue} is happening now, and {scope} cannot continue.",
        "This needs immediate operational response: {issue} has taken our production service offline for {duration}.",
    ]
]
TOPICS = [("account access", "update account access", "login failures"), ("invoice exports", "export an invoice", "failed invoice exports"), ("workspace settings", "change workspace settings", "unavailable workspaces"), ("API integration", "configure the API", "API connection failures"), ("report delivery", "schedule a report", "missing live reports"), ("team permissions", "adjust team permissions", "permission failures"), ("data sync", "set up data sync", "stalled data sync"), ("file uploads", "upload a file", "failed file uploads")]
SLICES = ["clean", "typos", "verbose", "resolved-context", "mixed-context"]


def modify(text, slice_name, rng, label):
    if slice_name == "typos":
        words = text.split()
        for i, word in enumerate(words):
            if len(word) > 5 and rng.random() < .22:
                j = int(rng.integers(1, len(word)-2))
                words[i] = word[:j] + word[j+1] + word[j] + word[j+2:]
        return " ".join(words)
    if slice_name == "verbose":
        return "Hello support team. We use the desktop browser and have included the relevant details below. " + text + " The reference number is " + str(rng.integers(10000, 99999)) + ". Thank you for reading the full request."
    if slice_name == "resolved-context":
        return "The urgent outage mentioned in our old ticket is resolved and is not the current issue. Current request: " + text
    if slice_name == "mixed-context":
        # Label-preserving quoted context tests the weakness of bag-of-words models.
        quoted = ["Someone else wrote 'production down, urgent help' in a past example.", "The documentation says 'general question, no outage' in its sample.", "An older note said 'ticket closed, repeated request' but that is background."]
        return str(rng.choice(quoted)) + " Please handle this actual request: " + text
    return text


def generate_split(split):
    spec = {"train": (range(6), 40, 0), "calibration": (range(6, 9), 20, 1), "test": (range(9, 12), 40, 2)}
    groups, per_group, offset = spec[split]
    rng = np.random.default_rng(SEED + 1000 * offset)
    rows = []
    seen = set()
    for label, families in enumerate(TEMPLATES):
        for family in groups:
            for j in range(per_group):
                slice_name = SLICES[j % len(SLICES)]
                for attempt in range(100):
                    topic, action, issue = TOPICS[int(rng.integers(len(TOPICS)))]
                    text = families[family].format(topic=topic, action=action, issue=issue, product=str(rng.choice(["Atlas", "Beacon", "Cedar", "Delta"])), scope=str(rng.choice(["all operators", "the support team", "multiple customers", "every user", "the entire office"])), duration=str(rng.choice(["two hours", "three days", "half a day", "an hour", "a week"])))
                    text += " Workspace: " + str(rng.choice(["North", "South", "West", "East", "Central", "Remote"])) + ". Channel: " + str(rng.choice(["browser", "desktop", "mobile"])) + "."
                    text = modify(text, slice_name, rng, label)
                    if text not in seen:
                        break
                if text in seen:
                    raise RuntimeError("duplicate generation exhausted")
                seen.add(text)
                rows.append({"id": f"{split}-{label}-{family:02}-{j:03}", "text": text, "label": label, "split": split, "slice": slice_name, "templateGroup": f"class-{label}-family-{family:02}"})
    return rows


def write(name, obj):
    (OUT / name).write_text(json.dumps(obj, indent=2, allow_nan=False) + "\n")


def main():
    OUT.mkdir(exist_ok=True)
    train, cal, test = [generate_split(s) for s in ["train", "calibration", "test"]]
    vectorizer = CountVectorizer(binary=True, lowercase=True, token_pattern=r"(?a)\b[a-z][a-z0-9']*\b")
    x = vectorizer.fit_transform([r["text"] for r in train]); y = np.array([r["label"] for r in train])
    members = []
    for member in range(3):
        rng = np.random.default_rng(SEED + 100 + member)
        selected = np.concatenate([rng.choice(np.flatnonzero(y == k), size=int((y == k).sum()), replace=True) for k in range(3)])
        model = LogisticRegression(C=1.0, solver="lbfgs", max_iter=500, tol=1e-9)
        model.fit(x[selected], y[selected]); members.append(model)
    # Define aggregation as mean member logits, then one softmax. Portable and explicit.
    # No artificial logit sharpening is applied.
    for split in [cal, test]:
        features = vectorizer.transform([r["text"] for r in split])
        member_z = np.array([m.decision_function(features) for m in members])
        for i, row in enumerate(split):
            row["logits"] = member_z[:, i, :].mean(axis=0).tolist()
            row["ensembleLogits"] = member_z[:, i, :].tolist()
            tokens = re.findall(r"\b[a-z][a-z0-9']*\b", row["text"].lower(), flags=re.ASCII)
            unique = set(tokens)
            row["oodScore"] = len(unique - vectorizer.vocabulary_.keys()) / len(unique) if unique else 1.
    all_rows = cal + test
    fitted = fit_temperature(all_rows); temperature = fitted["temperature"]
    split_manifest = {s: {"count": len(rs), "classCounts": [sum(r["label"] == k for r in rs) for k in range(3)], "templateGroups": sorted({r["templateGroup"] for r in rs}), "textSha256": hashlib.sha256("\n".join(r["text"] for r in rs).encode()).hexdigest()} for s, rs in [("train", train), ("calibration", cal), ("test", test)]}
    model = {"schemaVersion": "1.0", "classNames": CLASS_NAMES, "modelType": "bagged multinomial logistic regression", "memberCount": 3, "aggregation": "arithmetic mean of member logits, then softmax", "logitScale": 1., "vectorizer": {"type": "binary bag of words", "lowercase": True, "tokenPattern": "\\b[a-z][a-z0-9']*\\b", "jsTokenRegex": "[a-z][a-z0-9']*", "binary": True}, "vocabulary": vectorizer.vocabulary_, "coefficients": [m.coef_.tolist() for m in members], "intercepts": [m.intercept_.tolist() for m in members], "calibratedTemperature": temperature, "training": {"seed": SEED, "C": 1., "maxIter": 500, "trainingCount": len(train), "featureCount": x.shape[1], "memberBootstrapCount": len(train), "memberSeeds": [SEED+100+i for i in range(3)], "optimizerIterations": [m.n_iter_.tolist() for m in members]}, "novelty": {"type": "unique-token out-of-vocabulary fraction", "emptyInputScore": 1., "meaning": "Lexical novelty heuristic, not an OOD probability"}}
    metadata = {"schemaVersion": "1.0", "name": "Marginloom synthetic support handling", "classNames": CLASS_NAMES, "synthetic": True, "labelMeaning": {"routine": "normal informational or setup support", "frustrated": "author-assigned repeated or unresolved request requiring follow-up, not inferred emotion", "urgent": "author-assigned active operational interruption needing immediate handling"}, "limitations": ["Synthetic author labels do not establish performance on real customer messages.", "Lexical baseline cannot reliably understand negation or quoted context.", "Disjoint template groups still share a hand-authored generation distribution.", "Calibration and test metrics can worsen under distribution shift.", "No artificial logit sharpening; temperature may be below one.", "Threshold exploration on test data is descriptive, not an unbiased release guarantee."], "splits": split_manifest, "calibration": fitted, "metricConventions": {"ece": "top-label ECE; 10 equal-width bins; [lower, upper), last includes 1; weighted by count", "brier": "mean sum of squared class errors; range [0,2] for all class counts", "nll": "natural-log NLL from stable log-softmax", "macroF1": "fixed complete class list; zero_division=0", "auroc": "macro one-vs-rest on probabilities; null if any class has no positives or negatives", "disagreement": "Jensen-Shannon entropy gap across raw member probabilities, in nats", "policy": "review if confidence < threshold OR novelty > threshold OR disagreement > threshold; missing extra signals do not trigger", "riskCoverage": "confidence-only ranking, complete tied groups; zero coverage risk null; separate multi-signal operating point"}}
    evaluations = {"calibrationFit": fitted, "test": {"before": metrics(test), "after": metrics(test, temperature)}, "slices": {s: {"before": metrics([r for r in test if r["slice"] == s]), "after": metrics([r for r in test if r["slice"] == s], temperature)} for s in SLICES}, "riskCoverage": {"before": risk_coverage(test), "after": risk_coverage(test, temperature)}}
    accepted = [r for r in test if apply_policy(r, temperature)["decision"] == "accept"]
    evaluations["defaultPolicy"] = {"confidenceThreshold": .8, "oodThreshold": .65, "disagreementThreshold": .12, "accepted": len(accepted), "review": len(test)-len(accepted), "coverage": len(accepted)/len(test), "selectiveRisk": sum(np.argmax(r["logits"]) != r["label"] for r in accepted)/len(accepted) if accepted else None}
    fixtures = []
    for name, z, labels in [("uniform", [[0,0,0]]*3, [0,1,2]), ("moderate", [[2,0,-1],[-1,2,0],[0,2,1],[1,0,2]], [0,1,2,2]), ("ties", [[1,1,1]]*6, [0,1,2,0,1,2]), ("missing-class", [[2,0,-1],[0,2,-1]], [0,1])]:
        rows = [{"id": str(i), "label": int(l), "logits": zz, "split": "test", "slice": "fixture"} for i,(zz,l) in enumerate(zip(z,labels))]
        fixtures.append({"name": name, "rows": rows, "temperature": 1., "expected": metrics(rows)})
    model["vectorizer"]["jsTokenRegex"] = model["vectorizer"]["tokenPattern"]
    model["vectorizer"]["wordBoundary"] = "ASCII; use JavaScript global regex on lowercased text"
    model["training"]["versions"] = {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__, "scikit-learn": sklearn.__version__}
    write("model.json", model); write("metadata.json", metadata)
    write("predictions.json", {"schemaVersion": "1.0", "classNames": CLASS_NAMES, "records": all_rows})
    write("training-records.json", train); write("metrics.json", evaluations)
    write("metric-fixtures.json", fixtures)
    write("inference-fixtures.json", [{"text": r["text"], "logits": r["logits"], "ensembleLogits": r["ensembleLogits"], "probabilities": probabilities(r["logits"], temperature).tolist(), "oodScore": r["oodScore"], "disagreement": disagreement(r["ensembleLogits"])} for r in test[:12]])
    print(json.dumps({"output": str(OUT), "counts": {s: v["count"] for s,v in split_manifest.items()}, "features": x.shape[1], "temperature": temperature, "testBefore": {k:v for k,v in evaluations["test"]["before"].items() if k != "bins"}, "testAfter": {k:v for k,v in evaluations["test"]["after"].items() if k != "bins"}}, indent=2))


if __name__ == "__main__":
    main()
