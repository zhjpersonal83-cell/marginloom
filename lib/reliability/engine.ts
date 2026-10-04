/** Pure, deterministic multiclass reliability engine. No network or training side effects. */
export type Prediction = {
  id: string;
  label: number;
  logits: number[];
  split: "calibration" | "test";
  text?: string;
  slice?: string;
  group?: string;
  ensembleLogits?: number[][];
  oodScore?: number;
};
export type Dataset = {
  name: string;
  classNames: string[];
  rows: Prediction[];
};
export type Policy = {
  threshold: number;
  maxDisagreement: number;
  maxOod: number;
};
export const defaultPolicy: Policy = {
  threshold: 0.8,
  maxDisagreement: 0.12,
  maxOod: 0.65,
};
export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
export function softmax(logits: number[], temperature = 1): number[] {
  if (!Number.isFinite(temperature) || temperature <= 0)
    throw new Error("Temperature must be positive.");
  const m = Math.max(...logits);
  const e = logits.map((x) => Math.exp((x - m) / temperature));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}
export const argmax = (xs: number[]) => xs.indexOf(Math.max(...xs));
export const entropy = (p: number[]) =>
  -p.reduce((s, x) => s + (x > 0 ? x * Math.log(x) : 0), 0);
export function disagreement(logits?: number[][]) {
  if (!logits || logits.length < 2) return 0;
  const ps = logits.map((x) => softmax(x));
  const average = ps[0].map((_, i) => mean(ps.map((p) => p[i])));
  return Math.max(0, entropy(average) - mean(ps.map(entropy)));
}
export function validateDataset(input: unknown): Dataset {
  if (!input || typeof input !== "object")
    throw new Error("Expected a dataset object.");
  const x = input as Dataset;
  if (typeof x.name !== "string" || !x.name.trim() || x.name.length > 80)
    throw new Error("Name must have 1–80 characters.");
  if (
    !Array.isArray(x.classNames) ||
    x.classNames.length < 2 ||
    x.classNames.length > 12 ||
    x.classNames.some(
      (c) => typeof c !== "string" || !c.trim() || c.length > 40,
    ) ||
    new Set(x.classNames).size !== x.classNames.length
  )
    throw new Error("Provide 2–12 distinct class names.");
  if (!Array.isArray(x.rows) || x.rows.length < 20 || x.rows.length > 2000)
    throw new Error("Provide 20–2,000 prediction records.");
  if (new Set(x.rows.map((r) => r?.slice ?? "all")).size > 50)
    throw new Error("At most 50 distinct slices are supported.");
  const ids = new Set<string>(),
    groups = new Map<string, string>(),
    texts = new Map<string, string>();
  const validLogits = (a: number[]) =>
    Array.isArray(a) &&
    a.length === x.classNames.length &&
    a.every(
      (v) =>
        typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 10000,
    );
  for (const r of x.rows) {
    if (
      !r ||
      typeof r !== "object" ||
      typeof r.id !== "string" ||
      !r.id ||
      r.id.length > 100 ||
      ids.has(r.id)
    )
      throw new Error("Record IDs must be nonempty and unique.");
    ids.add(r.id);
    if (
      !Number.isInteger(r.label) ||
      r.label < 0 ||
      r.label >= x.classNames.length ||
      !validLogits(r.logits)
    )
      throw new Error(`Invalid label or logits in ${r.id}.`);
    if (!["calibration", "test"].includes(r.split))
      throw new Error("Split must be calibration or test.");
    if (
      r.text !== undefined &&
      (typeof r.text !== "string" || r.text.length > 2000)
    )
      throw new Error("Text must be at most 2,000 characters.");
    if (
      r.slice !== undefined &&
      (typeof r.slice !== "string" || r.slice.length > 60)
    )
      throw new Error("Invalid slice.");
    if (
      r.group !== undefined &&
      (typeof r.group !== "string" || r.group.length > 100)
    )
      throw new Error("Invalid group.");
    if (
      r.oodScore !== undefined &&
      (!Number.isFinite(r.oodScore) || r.oodScore < 0 || r.oodScore > 1)
    )
      throw new Error("OOD scores must be in [0,1].");
    if (
      r.ensembleLogits !== undefined &&
      (!Array.isArray(r.ensembleLogits) ||
        r.ensembleLogits.length < 2 ||
        r.ensembleLogits.length > 8 ||
        r.ensembleLogits.some((v) => !validLogits(v)))
    )
      throw new Error("Invalid ensemble logits.");
    for (const [key, map] of [
      [r.group, groups],
      [r.text?.trim().toLowerCase(), texts],
    ] as const) {
      if (key) {
        if (map.has(key) && map.get(key) !== r.split)
          throw new Error(
            "Leakage: repeated text or group across calibration and test.",
          );
        map.set(key, r.split);
      }
    }
  }
  for (const split of ["calibration", "test"])
    if (x.rows.filter((r) => r.split === split).length < 10)
      throw new Error("Each split needs at least 10 records.");
  const cal = x.rows.filter((r) => r.split === "calibration");
  if (new Set(cal.map((r) => r.label)).size !== x.classNames.length)
    throw new Error("Calibration split must contain every class.");
  return { name: x.name.trim(), classNames: x.classNames, rows: x.rows };
}
export function nll(rows: Prediction[], temperature: number) {
  return mean(
    rows.map((r) => {
      const z = r.logits.map((v) => v / temperature),
        m = Math.max(...z);
      return (
        m + Math.log(z.reduce((s, v) => s + Math.exp(v - m), 0)) - z[r.label]
      );
    }),
  );
}
export function fitTemperature(rows: Prediction[]) {
  if (rows.length === 0 || rows.some((r) => r.split !== "calibration"))
    throw new Error("Fit only on a nonempty calibration split.");
  // Golden-section search in log-temperature, bounded and deterministic.
  let lo = Math.log(0.05),
    hi = Math.log(20);
  const phi = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 80; i++) {
    const a = hi - phi * (hi - lo),
      b = lo + phi * (hi - lo);
    if (nll(rows, Math.exp(a)) < nll(rows, Math.exp(b))) hi = b;
    else lo = a;
  }
  const t = Math.exp((lo + hi) / 2);
  return nll(rows, t) < nll(rows, 1) ? t : 1;
}
export function auc(scores: number[], labels: number[]): number | null {
  const pos = labels.reduce((a, b) => a + b, 0),
    neg = labels.length - pos;
  if (!pos || !neg) return null;
  const sorted = scores
    .map((score, i) => ({ score, label: labels[i] }))
    .sort((a, b) => a.score - b.score);
  let rankSum = 0;
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].score === sorted[i].score) j++;
    const rank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) rankSum += rank * sorted[k].label;
    i = j;
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}
export function metrics(
  rows: Prediction[],
  temperature: number,
  classes: number,
) {
  const probabilities = rows.map((r) => softmax(r.logits, temperature)),
    predictions = probabilities.map(argmax),
    confidence = probabilities.map((p) => Math.max(...p));
  const confusion = Array.from(
    { length: classes },
    () => Array(classes).fill(0) as number[],
  );
  rows.forEach((r, i) => confusion[r.label][predictions[i]]++);
  const bins = Array.from({ length: 10 }, (_, i) => {
    const indices = confidence.flatMap((c, j) =>
      Math.min(9, Math.floor(c * 10)) === i ? [j] : [],
    );
    return {
      lower: i / 10,
      upper: (i + 1) / 10,
      count: indices.length,
      confidence: indices.length
        ? mean(indices.map((j) => confidence[j]))
        : null,
      accuracy: indices.length
        ? mean(indices.map((j) => Number(predictions[j] === rows[j].label)))
        : null,
    };
  });
  const perClass = Array.from({ length: classes }, (_, c) => {
    const tp = confusion[c][c],
      support = confusion[c].reduce((a, b) => a + b, 0),
      predicted = confusion.reduce((s, r) => s + r[c], 0);
    const precision = predicted ? tp / predicted : 0,
      recall = support ? tp / support : 0;
    return {
      precision,
      recall,
      f1:
        precision + recall
          ? (2 * precision * recall) / (precision + recall)
          : 0,
      support,
    };
  });
  const aucs = Array.from({ length: classes }, (_, c) =>
    auc(
      probabilities.map((p) => p[c]),
      rows.map((r) => Number(r.label === c)),
    ),
  );
  return {
    count: rows.length,
    accuracy: mean(rows.map((r, i) => Number(r.label === predictions[i]))),
    ece: bins.reduce(
      (s, b) =>
        s +
        (b.count / rows.length) *
          Math.abs((b.accuracy ?? 0) - (b.confidence ?? 0)),
      0,
    ),
    brier: mean(
      rows.map((r, i) =>
        probabilities[i].reduce(
          (s, p, c) => s + (p - Number(c === r.label)) ** 2,
          0,
        ),
      ),
    ),
    nll: nll(rows, temperature),
    macroF1: mean(perClass.map((c) => c.f1)),
    macroAuroc: aucs.every((a) => a !== null) ? mean(aucs as number[]) : null,
    meanConfidence: mean(confidence),
    bins,
    confusion,
    perClass,
  };
}
export function inspect(r: Prediction, temperature: number, policy: Policy) {
  const probabilities = softmax(r.logits, temperature),
    prediction = argmax(probabilities),
    confidence = Math.max(...probabilities),
    js = disagreement(r.ensembleLogits),
    reasons: string[] = [];
  if (confidence < policy.threshold) reasons.push("Low confidence");
  if (r.ensembleLogits && js > policy.maxDisagreement)
    reasons.push("Ensemble disagreement");
  if (r.oodScore !== undefined && r.oodScore > policy.maxOod)
    reasons.push("Outside reference vocabulary");
  return {
    ...r,
    probabilities,
    prediction,
    confidence,
    entropy: entropy(probabilities),
    disagreement: r.ensembleLogits ? js : null,
    correct: prediction === r.label,
    accepted: reasons.length === 0,
    reasons,
  };
}
export function selection(
  rows: Prediction[],
  temperature: number,
  policy: Policy,
) {
  const details = rows.map((r) => inspect(r, temperature, policy)),
    accepted = details.filter((r) => r.accepted),
    errors = accepted.filter((r) => !r.correct).length;
  return {
    accepted: accepted.length,
    total: rows.length,
    review: rows.length - accepted.length,
    errors,
    coverage: rows.length ? accepted.length / rows.length : 0,
    risk: accepted.length ? errors / accepted.length : null,
    wilsonUpper: accepted.length ? wilsonUpper(errors, accepted.length) : null,
  };
}
export function wilsonUpper(errors: number, n: number) {
  const z = 1.96,
    p = errors / n;
  return (
    (p +
      (z * z) / (2 * n) +
      z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) /
    (1 + (z * z) / n)
  );
}
export function riskCurve(rows: Prediction[], temperature: number) {
  const ordered = rows
    .map((r) => inspect(r, temperature, { ...defaultPolicy, threshold: 0 }))
    .sort((a, b) => b.confidence - a.confidence);
  const points: { coverage: number; risk: number; threshold: number }[] = [];
  let errors = 0;
  for (let i = 0; i < ordered.length; i++) {
    errors += Number(!ordered[i].correct);
    if (
      i === ordered.length - 1 ||
      ordered[i + 1].confidence !== ordered[i].confidence
    )
      points.push({
        coverage: (i + 1) / ordered.length,
        risk: errors / (i + 1),
        threshold: ordered[i].confidence,
      });
  }
  return points;
}
export function evaluate(dataset: Dataset, policy: Policy = defaultPolicy) {
  const calibration = dataset.rows.filter((r) => r.split === "calibration"),
    test = dataset.rows.filter((r) => r.split === "test"),
    temperature = fitTemperature(calibration);
  return {
    temperature,
    temperatureAtBoundary: temperature < 0.051 || temperature > 19.9,
    calibrationCount: calibration.length,
    testCount: test.length,
    raw: metrics(test, 1, dataset.classNames.length),
    calibrated: metrics(test, temperature, dataset.classNames.length),
    selection: selection(test, temperature, policy),
    curve: riskCurve(test, temperature),
    slices: [...new Set(test.map((r) => r.slice ?? "all"))].map((name) => {
      const rows = test.filter((r) => (r.slice ?? "all") === name);
      return {
        name,
        metrics: metrics(rows, temperature, dataset.classNames.length),
        selection: selection(rows, temperature, policy),
      };
    }),
    policy,
  };
}
export type Evaluation = ReturnType<typeof evaluate>;
