import static org.junit.Assert.*;

import Model.*;
import java.nio.charset.StandardCharsets;
import org.json.*;
import org.junit.*;

public class ReliabilityTest {
  static JSONArray array(String name) throws Exception {
    try (var in = ReliabilityTest.class.getResourceAsStream("/" + name)) {
      return new JSONArray(new String(in.readAllBytes(), StandardCharsets.UTF_8));
    }
  }

  static void compare(Object expected, Object actual, String path, double tolerance) {
    if (expected instanceof Number a && actual instanceof Number b)
      assertEquals(path, a.doubleValue(), b.doubleValue(), tolerance);
    else if (expected instanceof JSONObject a) {
      assertTrue(path, actual instanceof JSONObject);
      JSONObject b = (JSONObject) actual;
      for (String k : a.keySet()) compare(a.get(k), b.get(k), path + "." + k, tolerance);
    } else if (expected instanceof JSONArray a) {
      assertTrue(path, actual instanceof JSONArray);
      JSONArray b = (JSONArray) actual;
      assertEquals(path, a.length(), b.length());
      for (int i = 0; i < a.length(); i++)
        compare(a.get(i), b.get(i), path + "[" + i + "]", tolerance);
    } else assertEquals(path, expected, actual);
  }

  @Test
  public void completeOriginalEngineParity() throws Exception {
    WorkspaceService s = new WorkspaceService();
    for (Object o : array("engine-parity.json")) {
      JSONObject f = (JSONObject) o;
      compare(
          f.getJSONObject("evaluation"),
          Reliability.evaluate(s.demo, f.getJSONObject("policy")),
          "engine",
          1e-6);
    }
    for (Object o : array("prediction-parity.json")) {
      JSONObject f = (JSONObject) o;
      compare(
          f.getJSONObject("result"),
          Reliability.predict(f.getString("text"), s.model, Reliability.policy()),
          "inference",
          1e-12);
    }
  }

  @Test
  public void independentMetricFixtures() throws Exception {
    for (Object o : array("metric-fixtures.json")) {
      JSONObject f = (JSONObject) o;
      var rows = new java.util.ArrayList<JSONObject>();
      for (Object r : f.getJSONArray("rows")) rows.add((JSONObject) r);
      JSONObject expected = f.getJSONObject("expected");
      expected.remove("aurocPerClass");
      expected.put("macroAuroc", expected.remove("aurocMacroOvr"));
      expected.remove("classCounts");
      JSONObject actual = Reliability.metrics(rows, f.getDouble("temperature"), 3);
      compare(expected, actual, f.getString("name"), 1e-9);
    }
  }

  @Test
  public void originalInferenceParity() throws Exception {
    WorkspaceService s = new WorkspaceService();
    for (Object o : array("inference-fixtures.json")) {
      JSONObject f = (JSONObject) o;
      JSONObject p = Reliability.predict(f.getString("text"), s.model, Reliability.policy());
      compare(
          f.getJSONArray("probabilities"), p.getJSONArray("probabilities"), "probability", 1e-12);
      if (f.has("oodScore")) assertEquals(f.getDouble("oodScore"), p.getDouble("oodScore"), 1e-12);
    }
  }

  @Test
  public void benchmarkAndEmptySelection() {
    WorkspaceService s = new WorkspaceService();
    JSONObject e = Reliability.evaluate(s.demo, Reliability.policy());
    assertEquals(360, e.getInt("testCount"));
    assertEquals(180, e.getInt("calibrationCount"));
    assertEquals(.902777777777, e.getJSONObject("raw").getDouble("accuracy"), 1e-10);
    assertEquals(.1606, e.getDouble("temperature"), .0001);
    assertEquals(344, e.getJSONObject("selection").getInt("accepted"));
    assertEquals(28, e.getJSONObject("selection").getInt("errors"));
    JSONObject p = Reliability.policy().put("threshold", 1);
    assertTrue(
        Reliability.selection(Reliability.rows(s.demo, "test"), e.getDouble("temperature"), p)
            .isNull("risk"));
  }

  @Test
  public void rejectLeakageInvalidTypesAndCalibrationLeak() {
    WorkspaceService s = new WorkspaceService();
    JSONObject bad = new JSONObject(s.demo.toString());
    bad.getJSONArray("rows").getJSONObject(0).put("label", "0");
    try {
      Reliability.validate(bad);
      fail();
    } catch (Controller.HttpError ex) {
      assertEquals(422, ex.status);
    }
    bad = new JSONObject(s.demo.toString());
    JSONObject a = bad.getJSONArray("rows").getJSONObject(0);
    for (Object o : bad.getJSONArray("rows")) {
      JSONObject r = (JSONObject) o;
      if (!r.getString("split").equals(a.getString("split"))) {
        r.put("text", a.getString("text"));
        break;
      }
    }
    try {
      Reliability.validate(bad);
      fail();
    } catch (Controller.HttpError ex) {
      assertEquals(422, ex.status);
    }
  }
}
