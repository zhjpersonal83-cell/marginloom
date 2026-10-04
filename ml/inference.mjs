/** Portable local inference for the exported binary-token logistic ensemble. */
export function softmax(logits, temperature = 1) {
  if (!(Number.isFinite(temperature) && temperature > 0)) throw new Error('Temperature must be positive.');
  const max = Math.max(...logits);
  const values = logits.map(value => Math.exp((value - max) / temperature));
  const denominator = values.reduce((sum, value) => sum + value, 0);
  return values.map(value => value / denominator);
}

export function tokenize(text) {
  return text.toLowerCase().match(/\b[a-z][a-z0-9']*\b/g) || [];
}

export function infer(model, text) {
  const tokens = [...new Set(tokenize(text))];
  const known = tokens.filter(token => Object.hasOwn(model.vocabulary, token));
  const indices = known.map(token => model.vocabulary[token]).sort((a, b) => a - b);
  const ensembleLogits = model.coefficients.map((member, m) => member.map((weights, k) =>
    indices.reduce((sum, index) => sum + weights[index], model.intercepts[m][k])
  ));
  const logits = model.classNames.map((_, k) => ensembleLogits.reduce((sum, member) => sum + member[k], 0) / ensembleLogits.length);
  const probabilities = softmax(logits, model.calibratedTemperature);
  const rawMembers = ensembleLogits.map(member => softmax(member));
  const meanProbability = model.classNames.map((_, k) => rawMembers.reduce((sum, p) => sum + p[k], 0) / rawMembers.length);
  const entropy = p => -p.reduce((sum, x) => sum + (x > 0 ? x * Math.log(x) : 0), 0);
  const disagreement = Math.max(0, entropy(meanProbability) - rawMembers.reduce((sum,p) => sum + entropy(p), 0)/rawMembers.length);
  return {logits, ensembleLogits, probabilities, predictedClass: logits.indexOf(Math.max(...logits)), confidence: Math.max(...probabilities), oodScore: tokens.length ? (tokens.length - known.length) / tokens.length : 1, disagreement};
}
