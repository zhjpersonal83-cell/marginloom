package Model;

import Controller.HttpError;
import java.util.*;
import java.util.stream.*;
import org.json.*;

/** Pure reliability calculations, ported from the original engine with fixture parity tests. */
public final class Reliability {
  private Reliability() {}

  public static JSONObject policy() {
    return new JSONObject().put("threshold", .8).put("maxDisagreement", .12).put("maxOod", .65);
  }

  public static JSONObject policy(JSONObject p) {
    for (String k : List.of("threshold", "maxDisagreement", "maxOod")) {
      Object value = p.opt(k);
      if (!(value instanceof Number n)
          || !Double.isFinite(n.doubleValue())
          || n.doubleValue() < 0
          || n.doubleValue() > (k.equals("maxDisagreement") ? 2.5 : 1))
        throw new HttpError(422, "Invalid policy.");
    }
    return new JSONObject()
        .put("threshold", p.getDouble("threshold"))
        .put("maxDisagreement", p.getDouble("maxDisagreement"))
        .put("maxOod", p.getDouble("maxOod"));
  }

  public static double[] values(JSONArray a) {
    double[] v = new double[a.length()];
    for (int i = 0; i < v.length; i++) v[i] = a.getDouble(i);
    return v;
  }

  public static double[] softmax(double[] z, double temperature) {
    if (!Double.isFinite(temperature) || temperature <= 0)
      throw new IllegalArgumentException("Temperature must be positive.");
    double m = Arrays.stream(z).max().orElseThrow(), s = 0;
    double[] p = new double[z.length];
    for (int i = 0; i < z.length; i++) {
      p[i] = Math.exp((z[i] - m) / temperature);
      s += p[i];
    }
    for (int i = 0; i < p.length; i++) p[i] /= s;
    return p;
  }

  public static int argmax(double[] x) {
    int j = 0;
    for (int i = 1; i < x.length; i++) if (x[i] > x[j]) j = i;
    return j;
  }

  public static double entropy(double[] p) {
    double s = 0;
    for (double x : p) if (x > 0) s -= x * Math.log(x);
    return s;
  }

  public static double disagreement(JSONArray logits) {
    if (logits == null || logits.length() < 2) return 0;
    double[][] ps = new double[logits.length()][];
    for (int i = 0; i < ps.length; i++) ps[i] = softmax(values(logits.getJSONArray(i)), 1);
    double[] avg = new double[ps[0].length];
    double e = 0;
    for (double[] p : ps) {
      e += entropy(p) / ps.length;
      for (int i = 0; i < p.length; i++) avg[i] += p[i] / ps.length;
    }
    return Math.max(0, entropy(avg) - e);
  }

  public static List<JSONObject> rows(JSONObject d, String split) {
    List<JSONObject> rows = new ArrayList<>();
    for (Object o : d.getJSONArray("rows")) {
      JSONObject r = (JSONObject) o;
      if (split.equals(r.getString("split"))) rows.add(r);
    }
    return rows;
  }

  private static void require(boolean value, String message) {
    if (!value) throw new HttpError(422, message);
  }

  private static void logits(JSONArray a, int n) {
    require(a != null && a.length() == n, "Invalid logits.");
    for (Object o : a)
      require(
          o instanceof Number v
              && Double.isFinite(v.doubleValue())
              && Math.abs(v.doubleValue()) <= 10000,
          "Invalid logits.");
  }

  public static JSONObject validate(JSONObject d) {
    String name = d.optString("name", "");
    require(
        d.opt("name") instanceof String && !name.isBlank() && name.length() <= 80,
        "Name must have 1–80 characters.");
    JSONArray classes = d.optJSONArray("classNames"), rows = d.optJSONArray("rows");
    require(
        classes != null && classes.length() >= 2 && classes.length() <= 12,
        "Provide 2–12 distinct class names.");
    Set<String> names = new HashSet<>();
    for (Object c : classes)
      require(
          c instanceof String s && !s.isBlank() && s.length() <= 40 && names.add(s),
          "Provide distinct class names.");
    require(
        rows != null && rows.length() >= 20 && rows.length() <= 2000,
        "Provide 20–2,000 prediction records.");
    Set<String> ids = new HashSet<>(), slices = new HashSet<>();
    Map<String, String> groups = new HashMap<>(), texts = new HashMap<>();
    Set<Integer> calClasses = new HashSet<>();
    int cal = 0, test = 0;
    for (Object o : rows) {
      require(o instanceof JSONObject, "Invalid record.");
      JSONObject r = (JSONObject) o;
      Object id = r.opt("id"), label = r.opt("label");
      require(
          id instanceof String s && !s.isEmpty() && s.length() <= 100 && ids.add(s),
          "Record IDs must be nonempty and unique.");
      require(
          label instanceof Number l
              && l.doubleValue() == l.intValue()
              && l.intValue() >= 0
              && l.intValue() < classes.length(),
          "Invalid label.");
      logits(r.optJSONArray("logits"), classes.length());
      String split = r.optString("split", "");
      require(
          split.equals("calibration") || split.equals("test"),
          "Split must be calibration or test.");
      if (split.equals("calibration")) {
        cal++;
        calClasses.add(r.getInt("label"));
      } else test++;
      for (String k : List.of("text", "slice", "group"))
        if (r.has(k))
          require(
              r.opt(k) instanceof String s
                  && s.length() <= (k.equals("text") ? 2000 : k.equals("slice") ? 60 : 100),
              "Invalid " + k + ".");
      slices.add(r.optString("slice", "all"));
      if (r.has("oodScore")) {
        Object v = r.get("oodScore");
        require(
            v instanceof Number n
                && Double.isFinite(n.doubleValue())
                && n.doubleValue() >= 0
                && n.doubleValue() <= 1,
            "OOD scores must be in [0,1].");
      }
      if (r.has("ensembleLogits")) {
        JSONArray a = r.optJSONArray("ensembleLogits");
        require(a != null && a.length() >= 2 && a.length() <= 8, "Invalid ensemble logits.");
        for (Object v : a) {
          require(v instanceof JSONArray, "Invalid ensemble logits.");
          logits((JSONArray) v, classes.length());
        }
      }
      for (String k : List.of("group", "text")) {
        String key = r.optString(k, "");
        if (k.equals("text")) key = key.trim().toLowerCase(Locale.ROOT);
        if (!key.isEmpty()) {
          Map<String, String> map = k.equals("text") ? texts : groups;
          require(
              !map.containsKey(key) || map.get(key).equals(split),
              "Leakage: repeated text or group across calibration and test.");
          map.put(key, split);
        }
      }
    }
    require(slices.size() <= 50, "At most 50 distinct slices are supported.");
    require(cal >= 10 && test >= 10, "Each split needs at least 10 records.");
    require(calClasses.size() == classes.length(), "Calibration split must contain every class.");
    return new JSONObject().put("name", name.trim()).put("classNames", classes).put("rows", rows);
  }

  public static double nll(List<JSONObject> rows, double t) {
    double s = 0;
    for (JSONObject r : rows) {
      double[] z = values(r.getJSONArray("logits"));
      double m = -Double.MAX_VALUE;
      for (double v : z) m = Math.max(m, v / t);
      double e = 0;
      for (double v : z) e += Math.exp(v / t - m);
      s += m + Math.log(e) - z[r.getInt("label")] / t;
    }
    return s / rows.size();
  }

  public static double temperature(List<JSONObject> cal) {
    require(
        !cal.isEmpty() && cal.stream().allMatch(r -> r.getString("split").equals("calibration")),
        "Fit only on calibration data.");
    double lo = Math.log(.05), hi = Math.log(20), phi = (Math.sqrt(5) - 1) / 2;
    for (int i = 0; i < 80; i++) {
      double a = hi - phi * (hi - lo), b = lo + phi * (hi - lo);
      if (nll(cal, Math.exp(a)) < nll(cal, Math.exp(b))) hi = b;
      else lo = a;
    }
    double t = Math.exp((lo + hi) / 2);
    return nll(cal, t) < nll(cal, 1) ? t : 1;
  }

  public static Object auc(double[] scores, int[] labels) {
    int pos = Arrays.stream(labels).sum(), neg = labels.length - pos;
    if (pos == 0 || neg == 0) return JSONObject.NULL;
    List<Integer> order =
        IntStream.range(0, scores.length)
            .boxed()
            .sorted(Comparator.comparingDouble(i -> scores[i]))
            .toList();
    double rankSum = 0;
    for (int i = 0; i < order.size(); ) {
      int j = i + 1;
      while (j < order.size() && scores[order.get(j)] == scores[order.get(i)]) j++;
      double rank = (i + 1 + j) / 2.0;
      for (int k = i; k < j; k++) rankSum += rank * labels[order.get(k)];
      i = j;
    }
    return (rankSum - pos * (pos + 1) / 2.0) / (pos * neg);
  }

  public static JSONObject metrics(List<JSONObject> rows, double t, int classes) {
    int n = rows.size(), correct = 0;
    int[][] matrix = new int[classes][classes];
    double[][] probs = new double[n][];
    double[] confidence = new double[n];
    int[] preds = new int[n], count = new int[10];
    double[] binConf = new double[10], binAcc = new double[10];
    double brier = 0, sumConfidence = 0;
    for (int i = 0; i < n; i++) {
      JSONObject r = rows.get(i);
      int y = r.getInt("label");
      double[] p = softmax(values(r.getJSONArray("logits")), t);
      probs[i] = p;
      preds[i] = argmax(p);
      confidence[i] = p[preds[i]];
      sumConfidence += confidence[i];
      matrix[y][preds[i]]++;
      boolean ok = y == preds[i];
      if (ok) correct++;
      int bin = Math.min(9, (int) Math.floor(confidence[i] * 10));
      count[bin]++;
      binConf[bin] += confidence[i];
      if (ok) binAcc[bin]++;
      for (int c = 0; c < classes; c++) brier += Math.pow(p[c] - (c == y ? 1 : 0), 2);
    }
    JSONArray bins = new JSONArray(), perClass = new JSONArray();
    double ece = 0, f1 = 0, auroc = 0;
    boolean aucAvailable = true;
    for (int b = 0; b < 10; b++) {
      if (count[b] > 0) ece += Math.abs(binAcc[b] - binConf[b]) / n;
      bins.put(
          new JSONObject()
              .put("lower", b / 10.0)
              .put("upper", (b + 1) / 10.0)
              .put("count", count[b])
              .put("confidence", count[b] > 0 ? binConf[b] / count[b] : JSONObject.NULL)
              .put("accuracy", count[b] > 0 ? binAcc[b] / count[b] : JSONObject.NULL));
    }
    for (int c = 0; c < classes; c++) {
      int support = Arrays.stream(matrix[c]).sum(), predicted = 0;
      for (int[] row : matrix) predicted += row[c];
      double precision = predicted > 0 ? (double) matrix[c][c] / predicted : 0,
          recall = support > 0 ? (double) matrix[c][c] / support : 0,
          f = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
      f1 += f / classes;
      perClass.put(
          new JSONObject()
              .put("precision", precision)
              .put("recall", recall)
              .put("f1", f)
              .put("support", support));
      double[] scores = new double[n];
      int[] labels = new int[n];
      for (int i = 0; i < n; i++) {
        scores[i] = probs[i][c];
        labels[i] = rows.get(i).getInt("label") == c ? 1 : 0;
      }
      Object a = auc(scores, labels);
      if (a == JSONObject.NULL) aucAvailable = false;
      else auroc += ((Number) a).doubleValue() / classes;
    }
    return new JSONObject()
        .put("count", n)
        .put("accuracy", (double) correct / n)
        .put("ece", ece)
        .put("brier", brier / n)
        .put("nll", nll(rows, t))
        .put("macroF1", f1)
        .put("macroAuroc", aucAvailable ? auroc : JSONObject.NULL)
        .put("meanConfidence", sumConfidence / n)
        .put("bins", bins)
        .put("confusion", new JSONArray(matrix))
        .put("perClass", perClass);
  }

  public static JSONObject inspect(JSONObject r, double t, JSONObject policy) {
    double[] p = softmax(values(r.getJSONArray("logits")), t);
    int prediction = argmax(p);
    double confidence = p[prediction], js = disagreement(r.optJSONArray("ensembleLogits"));
    JSONArray reasons = new JSONArray();
    if (confidence < policy.getDouble("threshold")) reasons.put("Low confidence");
    if (r.has("ensembleLogits") && js > policy.getDouble("maxDisagreement"))
      reasons.put("Ensemble disagreement");
    if (r.has("oodScore") && r.getDouble("oodScore") > policy.getDouble("maxOod"))
      reasons.put("Outside reference vocabulary");
    return new JSONObject(r.toString())
        .put("probabilities", new JSONArray(p))
        .put("prediction", prediction)
        .put("confidence", confidence)
        .put("entropy", entropy(p))
        .put("disagreement", r.has("ensembleLogits") ? js : JSONObject.NULL)
        .put("correct", prediction == r.getInt("label"))
        .put("accepted", reasons.isEmpty())
        .put("reasons", reasons);
  }

  public static double wilsonUpper(int errors, int n) {
    double z = 1.96, p = (double) errors / n;
    return (p + z * z / (2 * n) + z * Math.sqrt(p * (1 - p) / n + z * z / (4.0 * n * n)))
        / (1 + z * z / n);
  }

  public static JSONObject selection(List<JSONObject> rows, double t, JSONObject policy) {
    int accepted = 0, errors = 0;
    for (JSONObject r : rows) {
      JSONObject d = inspect(r, t, policy);
      if (d.getBoolean("accepted")) {
        accepted++;
        if (!d.getBoolean("correct")) errors++;
      }
    }
    return new JSONObject()
        .put("accepted", accepted)
        .put("total", rows.size())
        .put("review", rows.size() - accepted)
        .put("errors", errors)
        .put("coverage", rows.isEmpty() ? 0 : (double) accepted / rows.size())
        .put("risk", accepted > 0 ? (double) errors / accepted : JSONObject.NULL)
        .put("wilsonUpper", accepted > 0 ? wilsonUpper(errors, accepted) : JSONObject.NULL);
  }

  public static JSONArray curve(List<JSONObject> rows, double t) {
    List<JSONObject> ordered =
        rows.stream()
            .map(r -> inspect(r, t, policy()))
            .sorted(
                Comparator.comparingDouble((JSONObject r) -> r.getDouble("confidence")).reversed())
            .toList();
    JSONArray points = new JSONArray();
    int errors = 0;
    for (int i = 0; i < ordered.size(); i++) {
      if (!ordered.get(i).getBoolean("correct")) errors++;
      if (i == ordered.size() - 1
          || ordered.get(i + 1).getDouble("confidence") != ordered.get(i).getDouble("confidence"))
        points.put(
            new JSONObject()
                .put("coverage", (i + 1.0) / ordered.size())
                .put("risk", (double) errors / (i + 1))
                .put("threshold", ordered.get(i).getDouble("confidence")));
    }
    return points;
  }

  public static JSONObject evaluate(JSONObject dataset, JSONObject policy) {
    List<JSONObject> cal = rows(dataset, "calibration"), test = rows(dataset, "test");
    double t = temperature(cal);
    int classes = dataset.getJSONArray("classNames").length();
    Set<String> names = new LinkedHashSet<>();
    for (JSONObject r : test) names.add(r.optString("slice", "all"));
    JSONArray slices = new JSONArray();
    for (String name : names) {
      var slice = test.stream().filter(r -> r.optString("slice", "all").equals(name)).toList();
      slices.put(
          new JSONObject()
              .put("name", name)
              .put("metrics", metrics(slice, t, classes))
              .put("selection", selection(slice, t, policy)));
    }
    return new JSONObject()
        .put("temperature", t)
        .put("temperatureAtBoundary", t < .051 || t > 19.9)
        .put("calibrationCount", cal.size())
        .put("testCount", test.size())
        .put("raw", metrics(test, 1, classes))
        .put("calibrated", metrics(test, t, classes))
        .put("selection", selection(test, t, policy))
        .put("curve", curve(test, t))
        .put("slices", slices)
        .put("policy", policy);
  }

  public static JSONObject predict(String text, JSONObject model, JSONObject policy) {
    Set<String> tokens = new LinkedHashSet<>();
    var matcher =
        java.util.regex.Pattern.compile("\\b[a-z][a-z0-9']*\\b")
            .matcher(text.toLowerCase(Locale.ROOT));
    while (matcher.find()) tokens.add(matcher.group());
    JSONObject vocabulary = model.getJSONObject("vocabulary");
    List<String> known = tokens.stream().filter(vocabulary::has).toList();
    JSONArray coefficients = model.getJSONArray("coefficients"),
        intercepts = model.getJSONArray("intercepts"),
        classes = model.getJSONArray("classNames"),
        ensemble = new JSONArray();
    int n = classes.length(), members = coefficients.length();
    double[] mean = new double[n];
    for (int m = 0; m < members; m++) {
      double[] z = new double[n];
      for (int c = 0; c < n; c++) {
        z[c] = intercepts.getJSONArray(m).getDouble(c);
        for (String token : known)
          z[c] += coefficients.getJSONArray(m).getJSONArray(c).getDouble(vocabulary.getInt(token));
        mean[c] += z[c] / members;
      }
      ensemble.put(new JSONArray(z));
    }
    double t = model.getDouble("calibratedTemperature");
    double[] p = softmax(mean, t);
    int pred = argmax(p);
    double js = disagreement(ensemble),
        ood = tokens.isEmpty() ? 1 : (double) (tokens.size() - known.size()) / tokens.size();
    JSONArray reasons = new JSONArray();
    if (p[pred] < policy.getDouble("threshold")) reasons.put("Confidence is below your threshold");
    if (js > policy.getDouble("maxDisagreement")) reasons.put("Ensemble members disagree");
    if (ood > policy.getDouble("maxOod"))
      reasons.put("Too much vocabulary is outside the training reference");
    List<JSONObject> contributions = new ArrayList<>();
    for (String token : known) {
      double weight = 0;
      for (int m = 0; m < members; m++)
        weight +=
            coefficients.getJSONArray(m).getJSONArray(pred).getDouble(vocabulary.getInt(token))
                / members;
      contributions.add(new JSONObject().put("token", token).put("weight", weight));
    }
    contributions.sort(
        Comparator.comparingDouble((JSONObject v) -> Math.abs(v.getDouble("weight"))).reversed());
    JSONArray predictions = new JSONArray();
    for (Object z : ensemble) predictions.put(classes.getString(argmax(values((JSONArray) z))));
    return new JSONObject()
        .put("probabilities", new JSONArray(p))
        .put("classes", classes)
        .put("prediction", pred)
        .put("predictionLabel", classes.getString(pred))
        .put("confidence", p[pred])
        .put("entropy", entropy(p))
        .put("disagreement", js)
        .put("oodScore", ood)
        .put("accepted", reasons.isEmpty())
        .put("reasons", reasons)
        .put(
            "contributions",
            new JSONArray(contributions.subList(0, Math.min(12, contributions.size()))))
        .put("memberPredictions", predictions)
        .put("temperature", t)
        .put("modelVersion", "triage-ensemble/1.0.0")
        .put(
            "explanation",
            "Token coefficients show contributions to the selected class logit, not causal explanations. Missing or misleading context may still cause confident errors.");
  }
}
