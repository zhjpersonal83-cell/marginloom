import { test } from "node:test";
import assert from "node:assert/strict";
import {
  softmax,
  fitTemperature,
  metrics,
  selection,
  validateDataset,
  auc,
  defaultPolicy,
  disagreement,
  riskCurve,
} from "../lib/reliability/engine.ts";
import type { Prediction } from "../lib/reliability/engine.ts";
import { distributionDrift } from "../lib/reliability/drift.ts";
const rows: Prediction[] = Array.from({ length: 40 }, (_, i) => ({
  id: String(i),
  label: i % 5 === 0 ? 1 - (i % 2) : i % 2,
  logits: i % 2 ? [0, 4] : [4, 0],
  split: i < 20 ? "calibration" : "test",
}));
test("stable softmax handles extreme finite logits", () => {
  assert.deepEqual(softmax([10000, 10000]), [0.5, 0.5]);
  assert.ok(Math.abs(softmax([-10000, 10000])[1] - 1) < 1e-9);
  assert.throws(() => softmax([1, 2], 0));
});
test("temperature fit uses calibration exclusively and never worsens fit objective", () => {
  assert.throws(() => fitTemperature(rows));
  const cal = rows.slice(0, 20),
    t = fitTemperature(cal);
  assert.ok(t > 1);
  assert.ok(metrics(cal, t, 2).nll <= metrics(cal, 1, 2).nll);
});
test("calibration preserves argmax accuracy and macro F1", () => {
  assert.equal(metrics(rows, 1, 2).accuracy, metrics(rows, 3, 2).accuracy);
  assert.equal(metrics(rows, 1, 2).macroF1, metrics(rows, 3, 2).macroF1);
});
test("zero acceptance has undefined risk and interval", () => {
  const s = selection(rows, 1, { ...defaultPolicy, threshold: 1 });
  assert.equal(s.accepted, 0);
  assert.equal(s.risk, null);
  assert.equal(s.wilsonUpper, null);
});
test("AUROC uses tied midranks and undefined single-class case", () => {
  assert.equal(auc([0.5, 0.5], [0, 1]), 0.5);
  assert.equal(auc([0, 1], [0, 1]), 1);
  assert.equal(auc([0, 1], [1, 1]), null);
});
test("detects group and normalized text leakage", () => {
  const data = {
    name: "test",
    classNames: ["a", "b"],
    rows: rows.map((r) => ({ ...r, group: "same" })),
  };
  assert.throws(() => validateDataset(data), /Leakage/);
  assert.throws(
    () =>
      validateDataset({
        ...data,
        rows: rows.map((r) => ({ ...r, text: " same " })),
      }),
    /Leakage/,
  );
});
test("rejects nonfinite and dimension-mismatched logits", () => {
  assert.throws(() =>
    validateDataset({
      name: "test",
      classNames: ["a", "b"],
      rows: rows.map((r) => ({ ...r, logits: [NaN, 0] })),
    }),
  );
});
test("correct multiclass Brier convention and populated bin accounting", () => {
  const m = metrics(rows, 1, 2);
  assert.equal(
    m.bins.reduce((s, b) => s + b.count, 0),
    40,
  );
  assert.ok(m.brier >= 0 && m.brier <= 2);
  assert.ok(m.confusion.flat().reduce((s, v) => s + v, 0) === 40);
});
test("ensemble disagreement is zero for identical members", () => {
  assert.equal(
    disagreement([
      [1, 2],
      [1, 2],
    ]),
    0,
  );
  assert.ok(
    disagreement([
      [10, 0],
      [0, 10],
    ]) > 0.6,
  );
});
test("risk curve does not arbitrarily split tied confidence groups", () => {
  assert.equal(riskCurve(rows, 1).length, 1);
  assert.equal(riskCurve(rows, 1)[0].coverage, 1);
});
test("distribution drift is symmetric and null on no observations", () => {
  assert.equal(distributionDrift([1, 2], [1, 2]), 0);
  assert.equal(distributionDrift([1, 0], [0, 1]), Math.log(2));
  assert.equal(distributionDrift([0, 0], [1, 2]), null);
});
