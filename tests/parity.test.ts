import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evaluate,
  metrics,
  validateDataset,
  defaultPolicy,
} from "../lib/reliability/engine.ts";
import type { Prediction } from "../lib/reliability/engine.ts";
import { predictText } from "../lib/reliability/inference.ts";
const read = (name: string) =>
  JSON.parse(readFileSync(new URL("../data/" + name, import.meta.url), "utf8"));
const model = read("model.json"),
  gold = read("metrics.json");
const close = (a: number, b: number, tol = 1e-10) =>
  assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
test("portable inference matches Python probabilities, novelty and disagreement", () => {
  for (const f of read("inference-fixtures.json")) {
    const p = predictText(f.text, model);
    p.probabilities.forEach((v: number, i: number) =>
      close(v, f.probabilities[i]),
    );
    close(p.oodScore, f.oodScore);
    close(p.disagreement, f.disagreement);
  }
});
test("reliability metrics match independent numpy/scikit-learn fixtures", () => {
  for (const f of read("metric-fixtures.json")) {
    const m = metrics(f.rows as Prediction[], f.temperature, 3);
    for (const k of ["accuracy", "macroF1", "nll", "brier", "ece"] as const)
      close(m[k], f.expected[k]);
    if (f.expected.aurocMacroOvr !== null)
      close(m.macroAuroc!, f.expected.aurocMacroOvr);
    else assert.equal(m.macroAuroc, null);
  }
});
test("held-out metrics reproduce training report and expose log-loss regression", () => {
  const e = evaluate(validateDataset(read("demo.json")));
  close(e.temperature, gold.calibrationFit.temperature, 1e-6);
  close(e.calibrated.accuracy, gold.test.after.accuracy);
  close(e.calibrated.ece, gold.test.after.ece, 1e-6);
  assert.ok(e.calibrated.nll > e.raw.nll);
});
test("every slice updates when policy changes", () => {
  const e = evaluate(validateDataset(read("demo.json")), {
    ...defaultPolicy,
    threshold: 1,
  });
  assert.equal(e.selection.accepted, 0);
  assert.ok(
    e.slices.every(
      (s) => s.selection.accepted === 0 && s.selection.risk === null,
    ),
  );
});
test("slice-cardinality bound prevents evaluated payload amplification", () => {
  const d = read("demo.json");
  d.rows.forEach((r: Prediction, i: number) => (r.slice = "slice-" + i));
  assert.throws(() => validateDataset(d), /50 distinct slices/);
});
test("changing test labels cannot change fitted temperature", () => {
  const d = validateDataset(read("demo.json")),
    a = evaluate(d);
  d.rows = d.rows.map((r) =>
    r.split === "test" ? { ...r, label: (r.label + 1) % 3 } : r,
  );
  close(a.temperature, evaluate(d).temperature);
});
