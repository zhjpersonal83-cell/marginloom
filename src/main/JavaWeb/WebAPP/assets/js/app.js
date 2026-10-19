"use strict";
const $ = (id) => document.getElementById(id),
  base = new URL("./", document.baseURI),
  views = {
    overview: "Overview",
    evaluation: "Evaluation",
    data: "Datasets & runs",
    playground: "Inference lab",
    vision: "Vision lab",
    review: "Human review",
    monitoring: "Monitoring",
  },
  pct = (v, d = 1) => (v === null ? "—" : `${(v * 100).toFixed(d)}%`),
  dec = (v, d = 3) => (v === null ? "—" : v.toFixed(d));
let boot,
  run,
  records = [],
  reviews = [],
  view =
    new URLSearchParams(location.search).get("view") ||
    location.pathname.split("/").filter(Boolean).at(-1) ||
    "overview",
  selected,
  vision,
  index = 0,
  previewGeneration = 0,
  pending = 0;
function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function panel(title, description) {
  const p = el("section", undefined, "panel"),
    h = el("div", undefined, "panel-heading"),
    d = el("div");
  d.append(el("h2", title));
  if (description) d.append(el("p", description));
  h.append(d);
  p.append(h);
  return p;
}
function button(label, fn, primary = false) {
  const b = el(
    "button",
    label,
    "button " + (primary ? "primary" : "secondary"),
  );
  b.onclick = () => perform(fn);
  return b;
}
function table(headers, rows) {
  const wrap = el("div", undefined, "scroll"),
    t = el("table"),
    head = el("thead"),
    tr = el("tr");
  headers.forEach((s) => {
    const th = el("th", s);
    th.scope = "col";
    tr.append(th);
  });
  head.append(tr);
  const body = el("tbody");
  for (const row of rows) {
    const tr = el("tr");
    for (const cell of row) {
      const td = el("td");
      td.append(
        cell instanceof Node ? cell : document.createTextNode(String(cell)),
      );
      tr.append(td);
    }
    body.append(tr);
  }
  t.append(head, body);
  wrap.append(t);
  return wrap;
}
async function api(path, body) {
  const r = await fetch(new URL("api/" + path, base), {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-Marginloom-Client": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error(`Invalid service response (${r.status})`);
  }
  if (!r.ok) throw Error(data.error || `Request failed (${r.status})`);
  return data;
}
async function perform(fn) {
  $("error").textContent = "";
  pending++;
  $("status").textContent = "Computing…";
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    await fn();
    $("status").textContent = "Ready";
  } catch (e) {
    $("error").textContent = e.message;
    $("status").textContent = "";
  } finally {
    pending--;
    if (!pending)
      document.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}
function policy() {
  return Object.fromEntries(
    ["threshold", "maxDisagreement", "maxOod"].map((k) => [
      k,
      Number($(k).value),
    ]),
  );
}
function setPolicy(p) {
  for (const k of ["threshold", "maxDisagreement", "maxOod"]) {
    $(k).value = p[k];
    $(k + "-value").textContent =
      k === "maxDisagreement" ? dec(p[k], 2) : pct(p[k], 0);
  }
}
async function preview() {
  const generation = ++previewGeneration,
    value = await api("preview", { runId: run.id, policy: policy() });
  if (generation !== previewGeneration) return;
  run.evaluation = value.evaluation;
  records = value.records;
  render();
}
async function adopt(value) {
  run = value;
  setPolicy(value.evaluation.policy);
  reviews = (await api("reviews/" + run.id)).reviews;
  await preview();
}
function stats(items) {
  const grid = el("div", undefined, "stat-grid");
  for (const [label, value, detail] of items) {
    const s = el("div", undefined, "stat");
    s.append(el("span", label), el("strong", value), el("p", detail));
    grid.append(s);
  }
  return grid;
}
function metricCards(e) {
  return stats([
    [
      "Test accuracy",
      pct(e.calibrated.accuracy),
      "Held-out synthetic predictions",
    ],
    ["Calibration error", dec(e.calibrated.ece), "Raw ECE " + dec(e.raw.ece)],
    [
      "Accepted error",
      pct(e.selection.risk),
      `${e.selection.errors} errors among ${e.selection.accepted} accepted`,
    ],
    [
      "Human review",
      String(e.selection.review),
      `${pct(e.selection.coverage)} coverage · ${e.testCount} test records`,
    ],
  ]);
}
const NS = "http://www.w3.org/2000/svg";
function svgNode(tag, attributes) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attributes)) e.setAttribute(k, v);
  return e;
}
function chart(e, risk = false) {
  const svg = svgNode("svg", {
    viewBox: "0 0 520 240",
    class: "chart",
    role: "img",
    "aria-label": risk
      ? "Risk coverage curve"
      : "Raw and calibrated reliability diagram",
  });
  for (let i = 0; i < 5; i++) {
    const y = 20 + i * 45;
    svg.append(
      svgNode("line", { x1: 45, x2: 505, y1: y, y2: y, stroke: "#e3e9ef" }),
    );
    const text = svgNode("text", { x: 38, y: y + 4, "text-anchor": "end" });
    text.textContent = pct(1 - i / 4, 0);
    svg.append(text);
  }
  if (risk) {
    const max = Math.max(0.1, ...e.curve.map((p) => p.risk)) * 1.12;
    svg.replaceChildren();
    for (let i = 0; i < 5; i++) {
      const y = 20 + i * 45;
      svg.append(
        svgNode("line", { x1: 45, x2: 505, y1: y, y2: y, stroke: "#e3e9ef" }),
      );
      const text = svgNode("text", { x: 38, y: y + 4, "text-anchor": "end" });
      text.textContent = pct(max * (1 - i / 4), 0);
      svg.append(text);
    }
    svg.append(
      svgNode("polyline", {
        points: e.curve
          .map((p) => `${45 + 460 * p.coverage},${200 - (180 * p.risk) / max}`)
          .join(" "),
        fill: "none",
        stroke: "#0fa693",
        "stroke-width": 2.5,
      }),
    );
  } else {
    svg.append(
      svgNode("line", {
        x1: 45,
        x2: 505,
        y1: 200,
        y2: 20,
        stroke: "#a9b8c5",
        "stroke-dasharray": "4 5",
      }),
    );
    for (const [key, color, offset] of [
      ["raw", "#b8c8e9", 0.12],
      ["calibrated", "#149e8e", 0.49],
    ])
      e[key].bins.forEach((b, i) => {
        if (!b.count) return;
        const r = svgNode("rect", {
            x: 45 + (i + offset) * 46,
            y: 200 - 180 * b.accuracy,
            width: 15,
            height: 180 * b.accuracy,
            fill: color,
            rx: 2,
          }),
          title = svgNode("title", {});
        title.textContent = `${key}: ${b.count} records; accuracy ${pct(b.accuracy)}; confidence ${pct(b.confidence)}`;
        r.append(title);
        svg.append(r);
      });
  }
  for (let i = 0; i <= 5; i++) {
    const text = svgNode("text", {
      x: 45 + i * 92,
      y: 223,
      "text-anchor": "middle",
    });
    text.textContent = pct(i / 5, 0);
    svg.append(text);
  }
  return svg;
}
function overview(root) {
  const e = run.evaluation;
  root.append(metricCards(e));
  const grid = el("div", undefined, "grid-two"),
    cal = panel(
      "Confidence versus observed accuracy",
      "Raw (blue) and calibrated (teal). Confidence → · accuracy ↑",
    ),
    risk = panel(
      "Risk versus coverage",
      "Confidence-only ranking; ties included together. Coverage → · empirical error ↑",
    );
  cal.append(chart(e));
  risk.append(chart(e, true));
  risk.append(
    el(
      "p",
      "Current policy also applies disagreement and vocabulary checks.",
      "footnote",
    ),
  );
  grid.append(cal, risk);
  root.append(grid);
  const warning = panel(
    "A useful failure case",
    "Calibration is not a guarantee of improvement.",
  );
  warning.append(
    el(
      "p",
      `Test log loss: raw ${dec(e.raw.nll)} → calibrated ${dec(e.calibrated.nll)}. Temperature ${dec(e.temperature, 4)} fitted only on ${e.calibrationCount} calibration records.`,
    ),
    el(
      "p",
      "The synthetic test set is for exploration. It does not establish performance on real support tickets.",
      "warning",
    ),
  );
  root.append(warning);
}
function evaluation(root) {
  const e = run.evaluation;
  root.append(metricCards(e));
  const p = panel(
    "Raw versus calibrated",
    "Metrics computed from actual untouched test labels.",
  );
  p.append(
    table(
      ["Metric", "Raw", "Calibrated"],
      [
        ["Accuracy", pct(e.raw.accuracy), pct(e.calibrated.accuracy)],
        ["Macro F1", dec(e.raw.macroF1), dec(e.calibrated.macroF1)],
        [
          "Macro OvR AUROC",
          dec(e.raw.macroAuroc),
          dec(e.calibrated.macroAuroc),
        ],
        ["ECE", dec(e.raw.ece), dec(e.calibrated.ece)],
        ["Brier", dec(e.raw.brier), dec(e.calibrated.brier)],
        ["Log loss", dec(e.raw.nll), dec(e.calibrated.nll)],
        [
          "Mean confidence",
          pct(e.raw.meanConfidence),
          pct(e.calibrated.meanConfidence),
        ],
      ],
    ),
  );
  root.append(p);
  const matrix = panel(
    "Confusion matrix",
    "Rows: true label · columns: predicted label.",
  );
  matrix.append(
    table(
      ["True / predicted", ...run.dataset.classNames],
      e.calibrated.confusion.map((r, i) => [run.dataset.classNames[i], ...r]),
    ),
  );
  root.append(matrix);
  const slices = panel(
    "Slice analysis",
    "Inspect performance and review workload across stress slices.",
  );
  slices.append(
    table(
      ["Slice", "Records", "Accuracy", "ECE", "Accepted error", "Review"],
      e.slices.map((s) => [
        s.name,
        s.metrics.count,
        pct(s.metrics.accuracy),
        dec(s.metrics.ece),
        pct(s.selection.risk),
        s.selection.review,
      ]),
    ),
  );
  root.append(slices);
  const bins = panel("Calibration bins", "Ten equal-width confidence bins.");
  bins.append(
    table(
      ["Bin", "Records", "Mean confidence", "Accuracy"],
      e.calibrated.bins.map((b) => [
        `${dec(b.lower, 1)}–${dec(b.upper, 1)}`,
        b.count,
        pct(b.confidence),
        pct(b.accuracy),
      ]),
    ),
  );
  root.append(bins);
}
function datasets(root) {
  const p = panel(
    "Datasets & runs",
    "Imported predictions and immutable policy snapshots in this workspace.",
  );
  p.append(
    button("Use original demo", async () => adopt(boot.run)),
    button("Download current prediction bundle", () =>
      download("marginloom-predictions.json", run.dataset),
    ),
    el(
      "p",
      `${run.dataset.name} · ${run.evaluation.calibrationCount} calibration / ${run.evaluation.testCount} test records`,
    ),
  );
  p.append(el("p", "Content SHA-256: " + run.datasetHash, "footnote"));
  const rows = [
    ["Synthetic demo", "Original", button("Open", async () => adopt(boot.run))],
    ...boot.runs.map((r) => [
      r.name,
      new Date(r.created_at).toLocaleString(),
      button("Open", async () => adopt(await api("runs/" + r.id))),
    ]),
  ];
  p.append(table(["Run", "Created", "Action"], rows));
  root.append(p);
  const provenance = panel(
    "Model provenance",
    "Three logistic classifiers; generated support-message data; MIT license.",
  );
  provenance.append(
    el(
      "p",
      "720 training / 180 calibration / 360 test records. Sentence-template families are assigned to disjoint splits before generation. Vocabulary fitting and model training use training data only.",
    ),
    el(
      "p",
      "Human reviews remain separate from benchmark labels. Imported data must pass split and group leakage checks.",
    ),
  );
  root.append(provenance);
}
function playground(root) {
  const p = panel(
    "Inference lab",
    "Three trained local logistic models. No paid model API.",
  );
  const label = el("label", "Support message"),
    text = el("textarea");
  text.id = "inference-text";
  text.rows = 5;
  text.maxLength = 2000;
  text.value =
    "I have been charged twice and nobody has replied. Please help me resolve this today.";
  label.htmlFor = text.id;
  const result = el("div");
  p.append(
    label,
    text,
    button(
      "Run inference",
      async () => {
        const value = await api("predict", {
          text: text.value,
          policy: policy(),
        });
        result.replaceChildren(
          el("h3", value.predictionLabel),
          el(
            "span",
            value.accepted
              ? "Accepted by current policy"
              : "Route to human review",
            "badge",
          ),
        );
        value.classes.forEach((c, i) => {
          const row = el("div", undefined, "prob-row"),
            meter = el("meter");
          meter.min = 0;
          meter.max = 1;
          meter.value = value.probabilities[i];
          row.append(
            el("span", c),
            meter,
            el("b", pct(value.probabilities[i])),
          );
          result.append(row);
        });
        result.append(
          el(
            "p",
            `Disagreement ${dec(value.disagreement)} · vocabulary novelty ${pct(value.oodScore)} · entropy ${dec(value.entropy)}`,
          ),
        );
        for (const reason of value.reasons)
          result.append(el("p", reason, "warning"));
        result.append(
          table(
            ["Token", "Contribution to predicted logit"],
            value.contributions.map((c) => [c.token, dec(c.weight, 4)]),
          ),
          el("p", "Member predictions: " + value.memberPredictions.join(", ")),
          el("p", value.explanation, "footnote"),
        );
      },
      true,
    ),
    result,
  );
  root.append(p);
}
function humanReview(root) {
  const p = panel(
    "Human review",
    "Record dispositions separately from evaluation truth.",
  );
  const bar = el("div", undefined, "toolbar"),
    search = el("input"),
    filter = el("select");
  search.type = "search";
  search.placeholder = "Search records";
  search.setAttribute("aria-label", "Search review queue");
  for (const [v, label] of [
    ["pending", "Pending"],
    ["all", "All review-routed"],
  ]) {
    const o = el("option", label);
    o.value = v;
    filter.append(o);
  }
  filter.setAttribute("aria-label", "Review status");
  const results = el("div");
  const draw = () => {
    const map = new Map(reviews.map((r) => [r.record_id, r]));
    const queue = records
      .filter((r) => !r.accepted && (filter.value === "all" || !map.has(r.id)))
      .filter((r) =>
        `${r.id} ${r.text || ""} ${r.slice || ""}`
          .toLowerCase()
          .includes(search.value.toLowerCase()),
      );
    results.replaceChildren(
      el(
        "p",
        `${queue.length} records match · ${reviews.length} recorded reviews`,
      ),
    );
    if (!queue.length)
      results.append(
        el("p", "No records need review under these filters.", "empty"),
      );
    else
      results.append(
        table(
          [
            "Record",
            "Prediction / truth",
            "Confidence",
            "Reasons",
            "Status",
            "Action",
          ],
          queue.map((r) => [
            `${r.id}: ${r.text || ""}`,
            `${run.dataset.classNames[r.prediction]} / ${run.dataset.classNames[r.label]}`,
            pct(r.confidence),
            r.reasons.join("; "),
            map.get(r.id)?.decision || "Pending",
            button("Review", async () => {
              selected = r;
              $("selected-record").replaceChildren(
                el("p", r.text || r.id),
                el(
                  "p",
                  `Predicted: ${run.dataset.classNames[r.prediction]}; benchmark label: ${run.dataset.classNames[r.label]}; confidence: ${pct(r.confidence)}`,
                ),
              );
              $("review-note").value = map.get(r.id)?.note || "";
              $("review-dialog").showModal();
            }),
          ]),
        ),
      );
  };
  search.oninput = draw;
  filter.onchange = draw;
  bar.append(search, filter);
  p.append(bar, results);
  root.append(p);
  draw();
  const evidence = panel(
    "Recorded reviews",
    "Notes and decisions persist in this workspace.",
  );
  evidence.append(
    table(
      ["Record", "Decision", "Note"],
      reviews.map((r) => [r.record_id, r.decision, r.note]),
    ),
  );
  root.append(evidence);
}
async function monitoring(root) {
  const events = (await api("audit")).events;
  if (view !== "monitoring") return;
  const p = panel(
    "Workspace events",
    "Actual operations in this demo workspace; no invented production traffic.",
  );
  p.append(
    table(
      ["Time", "Event", "Detail"],
      events.map((e) => [
        new Date(e.created_at).toLocaleString(),
        e.action,
        e.detail,
      ]),
    ),
  );
  root.append(p);
  const distribution = panel(
    "Descriptive distribution comparison",
    "Reference labels versus current model predictions on the selected held-out run.",
  );
  const a = run.dataset.classNames.map(
      (_, c) => records.filter((r) => r.label === c).length,
    ),
    b = run.dataset.classNames.map(
      (_, c) => records.filter((r) => r.prediction === c).length,
    ),
    total = records.length;
  const entropy = (p) => -p.reduce((s, x) => s + (x ? x * Math.log(x) : 0), 0),
    pa = a.map((x) => x / total),
    pb = b.map((x) => x / total),
    mean = pa.map((x, i) => (x + pb[i]) / 2),
    js = entropy(mean) - (entropy(pa) + entropy(pb)) / 2;
  distribution.append(
    el(
      "p",
      `Jensen–Shannon divergence: ${dec(js, 5)} nats. A descriptive comparison, not a drift alarm.`,
    ),
    table(
      ["Class", "Reference count", "Predicted count"],
      run.dataset.classNames.map((c, i) => [c, a[i], b[i]]),
    ),
  );
  root.append(distribution);
}
async function visionLab(root) {
  if (!vision) {
    const r = await fetch(new URL("vision/manifest.json", base));
    if (!r.ok) throw Error("Vision assets unavailable");
    vision = await r.json();
  }
  if (view !== "vision") return;
  root.append(
    stats([
      [
        "Mean per-image Dice",
        pct(vision.summary.dice),
        "Held-out synthetic images",
      ],
      ["Mean per-image IoU", pct(vision.summary.iou), "Foreground overlap"],
      [
        "Inspectable samples",
        String(vision.images.length),
        "Generated with fixed seeds",
      ],
      ["Model family", "Linear", "Pixel features · logistic regression"],
    ]),
  );
  const p = panel(
    "Segmentation inspection",
    vision.description +
      " Results precomputed by the reproducible research pipeline.",
  );
  const select = el("select");
  select.setAttribute("aria-label", "Vision sample");
  vision.images.forEach((im, i) => {
    const o = el("option", im.id + " · " + im.slice);
    o.value = i;
    select.append(o);
  });
  select.value = index;
  select.onchange = () => {
    index = Number(select.value);
    render();
  };
  p.append(select);
  const sample = vision.images[index],
    grid = el("div", undefined, "vision-grid");
  for (const [label, key] of [
    ["Input micrograph", "image"],
    ["Reference mask", "mask"],
    ["Predicted mask", "prediction"],
    ["Pixel entropy", "uncertainty"],
  ]) {
    const fig = el("figure"),
      img = el("img");
    img.src = new URL(sample[key].replace(/^\//, ""), base);
    img.alt = label + " for " + sample.id;
    img.width = 192;
    img.height = 192;
    fig.append(img, el("figcaption", label));
    grid.append(fig);
  }
  p.append(
    grid,
    el(
      "p",
      `Dice ${pct(sample.dice)} · IoU ${pct(sample.iou)} · ${sample.slice}`,
    ),
    el(
      "p",
      "Entropy is pixel-level uncertainty, not the probability that a whole mask is correct. Synthetic objects, not patient images.",
      "warning",
    ),
  );
  root.append(p);
}
function render() {
  if (!run) return;
  $("heading").textContent = views[view] || views.overview;
  $("breadcrumb").textContent = $("heading").textContent;
  $("description").textContent =
    `${run.dataset.name} · ${run.id === "demo" ? "Original demo" : "Saved run"}`;
  $("policy-panel").hidden = view === "vision";
  document
    .querySelectorAll("#navigation button")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  const root = $("view");
  root.replaceChildren();
  switch (view) {
    case "overview":
      overview(root);
      break;
    case "evaluation":
      evaluation(root);
      break;
    case "data":
      datasets(root);
      break;
    case "playground":
      playground(root);
      break;
    case "review":
      humanReview(root);
      break;
    case "monitoring":
      monitoring(root).catch(showError);
      break;
    case "vision":
      visionLab(root).catch(showError);
      break;
    default:
      view = "overview";
      overview(root);
  }
}
function showError(e) {
  $("error").textContent = e.message;
}
function navigate(v) {
  view = v;
  history.pushState({}, "", new URL("?view=" + v, base));
  $("sidebar").classList.remove("open");
  render();
  window.scrollTo(0, 0);
}
for (const [id, label] of Object.entries(views)) {
  const b = el("button", label);
  b.dataset.view = id;
  b.onclick = () => navigate(id);
  $("navigation").append(b);
}
let timer;
for (const k of ["threshold", "maxDisagreement", "maxOod"])
  $(k).oninput = () => {
    $(k + "-value").textContent =
      k === "maxDisagreement"
        ? dec(Number($(k).value), 2)
        : pct(Number($(k).value), 0);
    clearTimeout(timer);
    timer = setTimeout(() => perform(preview), 220);
  };
$("menu").onclick = () => $("sidebar").classList.toggle("open");
$("import-open").onclick = () => $("import-dialog").showModal();
$("developer").onclick = () => {
  $("api-key").textContent = "";
  $("developer-dialog").showModal();
};
$("developer-dialog").addEventListener("close", () => {
  $("api-key").textContent = "";
});
$("upload-file").onchange = () =>
  perform(async () => {
    const f = $("upload-file").files[0];
    if (f) {
      if (f.size > 900000) throw Error("Maximum upload size is 900 KB.");
      $("upload").value = await f.text();
    }
  });
async function refreshRuns() {
  boot = await api("bootstrap");
}
$("import").onclick = () =>
  perform(async () => {
    const value = await api("evaluate", JSON.parse($("upload").value));
    await refreshRuns();
    await adopt(value);
    $("import-dialog").close();
    $("upload").value = "";
    navigate("evaluation");
  });
$("save-policy").onclick = () =>
  perform(async () => {
    const value = await api("policy", { runId: run.id, policy: policy() });
    await refreshRuns();
    await adopt(value);
    $("status").textContent = "Policy saved as a new immutable run.";
  });
for (const b of document.querySelectorAll("[data-decision]"))
  b.onclick = () =>
    perform(async () => {
      if (!selected) return;
      await api("review", {
        runId: run.id,
        recordId: selected.id,
        decision: b.dataset.decision,
        note: $("review-note").value,
      });
      reviews = (await api("reviews/" + run.id)).reviews;
      $("review-dialog").close();
      render();
    });
function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("download-demo").onclick = () =>
  download("marginloom-demo.json", boot.run.dataset);
$("export").onclick = () =>
  perform(async () => {
    if (view === "vision") {
      const r = await fetch(new URL("vision/report.json", base));
      if (!r.ok) throw Error("Vision report unavailable");
      download("marginloom-vision-report.json", await r.json());
    } else
      download(
        "marginloom-report-" + run.id + ".json",
        await api("report/" + run.id, { policy: policy() }),
      );
  });
$("key").onclick = () =>
  perform(async () => {
    $("api-key").textContent = (await api("keys", {})).key;
  });
window.onpopstate = () => {
  view =
    new URLSearchParams(location.search).get("view") ||
    location.pathname.split("/").filter(Boolean).at(-1) ||
    "overview";
  render();
};
perform(async () => {
  await api("session", {});
  await refreshRuns();
  await adopt(boot.run);
});
