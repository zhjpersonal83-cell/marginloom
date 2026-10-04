/** Jensen–Shannon divergence between two empirical label distributions (nats). */
export function distributionDrift(reference: number[], current: number[]) {
  if (
    reference.length !== current.length ||
    reference.some((v) => v < 0) ||
    current.some((v) => v < 0)
  )
    throw new Error("Invalid distributions");
  const a = reference.reduce((s, v) => s + v, 0),
    b = current.reduce((s, v) => s + v, 0);
  if (!a || !b) return null;
  const p = reference.map((v) => v / a),
    q = current.map((v) => v / b),
    m = p.map((v, i) => (v + q[i]) / 2);
  return (
    0.5 * p.reduce((s, v, i) => s + (v ? v * Math.log(v / m[i]) : 0), 0) +
    0.5 * q.reduce((s, v, i) => s + (v ? v * Math.log(v / m[i]) : 0), 0)
  );
}
