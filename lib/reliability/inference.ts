import {
  softmax,
  argmax,
  entropy,
  disagreement,
  defaultPolicy,
} from "./engine.ts";
import type { Policy } from "./engine.ts";
export type PortableModel = {
  vocabulary: Record<string, number>;
  coefficients: number[][][];
  intercepts: number[][];
  classNames: string[];
  calibratedTemperature: number;
  [key: string]: unknown;
};
export function predictText(
  text: string,
  model: PortableModel,
  policy: Policy = defaultPolicy,
) {
  const tokens = [
      ...new Set(text.toLowerCase().match(/\b[a-z][a-z0-9']*\b/g) ?? []),
    ],
    known = [...new Set(tokens)].filter((t) =>
      Object.hasOwn(model.vocabulary, t),
    ),
    unknown = tokens.filter((t) => !Object.hasOwn(model.vocabulary, t));
  const ensembleLogits = model.coefficients.map((coeff, m) =>
    coeff.map(
      (weights, c) =>
        model.intercepts[m][c] +
        known.reduce((s, t) => s + weights[model.vocabulary[t]], 0),
    ),
  );
  const logits = model.classNames.map(
      (_, c) =>
        ensembleLogits.reduce((s, l) => s + l[c], 0) / ensembleLogits.length,
    ),
    p = softmax(logits, model.calibratedTemperature),
    pred = argmax(p),
    confidence = Math.max(...p),
    js = disagreement(ensembleLogits),
    oodScore = tokens.length ? unknown.length / tokens.length : 1;
  const reasons: string[] = [];
  if (confidence < policy.threshold)
    reasons.push("Confidence is below your threshold");
  if (js > policy.maxDisagreement) reasons.push("Ensemble members disagree");
  if (oodScore > policy.maxOod)
    reasons.push("Too much vocabulary is outside the training reference");
  const contributions = known
    .map((token) => ({
      token,
      weight:
        model.coefficients.reduce(
          (s, m) => s + m[pred][model.vocabulary[token]],
          0,
        ) / ensembleLogits.length,
    }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 12);
  return {
    probabilities: p,
    classes: model.classNames,
    prediction: pred,
    predictionLabel: model.classNames[pred],
    confidence,
    entropy: entropy(p),
    disagreement: js,
    oodScore,
    accepted: reasons.length === 0,
    reasons,
    contributions,
    memberPredictions: ensembleLogits.map((l) => model.classNames[argmax(l)]),
    temperature: model.calibratedTemperature,
    modelVersion: "triage-ensemble/1.0.0",
    explanation:
      "Token coefficients show contributions to the selected class logit, not causal explanations. Missing or misleading context may still cause confident errors.",
  };
}
