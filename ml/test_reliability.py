import copy
import json
import math
from pathlib import Path
import subprocess
import unittest
import numpy as np
from build import generate_split
from reliability import validate_dataset, probabilities, fit_temperature, metrics, disagreement, apply_policy, risk_coverage

HERE = Path(__file__).resolve().parent


class ReliabilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = json.loads((HERE / "artifacts/predictions.json").read_text())
        cls.rows = cls.dataset["records"]

    def test_schema_and_invalid_records(self):
        self.assertEqual(len(validate_dataset(self.dataset)), 540)
        for mutation in [lambda d: d["records"].append(copy.deepcopy(d["records"][0])), lambda d: d["records"][0].update(label=3), lambda d: d["records"][0].update(logits=[1,2]), lambda d: d["records"][0].update(logits=[1,float("nan"),3]), lambda d: d["records"][0].update(split="train")]:
            d = copy.deepcopy(self.dataset); mutation(d)
            with self.assertRaises(ValueError): validate_dataset(d)

    def test_split_groups_and_texts_are_disjoint(self):
        splits = [generate_split(name) for name in ["train", "calibration", "test"]]
        self.assertEqual([len(s) for s in splits], [720,180,360])
        for i in range(3):
            for j in range(i+1,3):
                for key in ["id", "templateGroup", "text"]:
                    self.assertFalse({r[key] for r in splits[i]} & {r[key] for r in splits[j]})
        self.assertEqual(splits[2], generate_split("test"))

    def test_temperature_has_no_test_label_or_logit_dependency(self):
        original = fit_temperature(self.rows)
        altered = copy.deepcopy(self.rows)
        for row in altered:
            if row["split"] == "test": row.update(label=(row["label"]+1)%3, logits=[100,-100,0])
        self.assertEqual(original, fit_temperature(altered))
        self.assertLessEqual(original["nllAfter"], original["nllBefore"] + 1e-10)

    def test_scaling_preserves_predictions_and_macro_f1(self):
        before = metrics(self.rows)
        for t in [.05,.2,1,2,20]:
            after = metrics(self.rows,t)
            self.assertEqual(before["accuracy"],after["accuracy"])
            self.assertEqual(before["macroF1"],after["macroF1"])
        np.testing.assert_allclose(probabilities([1,2,3]), probabilities([10001,10002,10003]))

    def test_multiclass_cross_record_probability_order_can_change(self):
        z = [[0,-1,-10],[0,-2,-2]]
        self.assertLess(probabilities(z,1)[0,0], probabilities(z,1)[1,0])
        self.assertGreater(probabilities(z,2)[0,0], probabilities(z,2)[1,0])

    def test_uniform_metrics_have_known_values(self):
        rows = [{"label":i,"logits":[0,0,0]} for i in range(3)]
        m = metrics(rows)
        for key, expected in [("nll",math.log(3)),("brier",2/3),("ece",0),("macroF1",1/6),("accuracy",1/3),("aurocMacroOvr",.5)]:
            self.assertAlmostEqual(m[key],expected,places=12)

    def test_perfect_and_extreme_logits(self):
        rows = [{"label":i,"logits":[10000 if j==i else -10000 for j in range(3)]} for i in range(3)]
        m = metrics(rows)
        for key in ["nll","brier","ece"]: self.assertEqual(m[key],0)
        for key in ["accuracy","macroF1","aurocMacroOvr"]: self.assertEqual(m[key],1)
        self.assertEqual(m["bins"][-1]["count"],3)

    def test_missing_class_auc_is_not_silently_averaged(self):
        result = metrics([{"label":0,"logits":[1,0,0]},{"label":1,"logits":[0,1,0]}])
        self.assertIsNone(result["aurocMacroOvr"])
        self.assertIsNone(result["aurocPerClass"][2])
        self.assertEqual(metrics([])["count"],0)

    def test_policy_triggers_and_boundaries(self):
        row = {"logits":[5,0,0],"label":0,"oodScore":.65,"ensembleLogits":[[5,0,0],[5,0,0]]}
        p = float(probabilities(row["logits"]).max())
        self.assertEqual(apply_policy(row,1,confidence_threshold=p)["decision"],"accept")
        self.assertIn("low_confidence",apply_policy(row,1,confidence_threshold=p+.001)["reasons"])
        row["oodScore"] = .651
        self.assertIn("high_novelty",apply_policy(row,1)["reasons"])
        row["ensembleLogits"] = [[20,0,0],[0,20,0]]
        self.assertIn("ensemble_disagreement",apply_policy(row,1)["reasons"])
        original = apply_policy(row,1); row["label"] = 2
        self.assertEqual(original,apply_policy(row,1))
        self.assertAlmostEqual(disagreement([[1,2,3]]*3),0)
        self.assertAlmostEqual(disagreement([[10000,0,0],[0,10000,0]]), math.log(2), places=12)

    def test_risk_coverage_empty_ties_and_endpoint(self):
        rows = [{"label":0,"logits":[2,0,0]},{"label":1,"logits":[2,0,0]}]
        curve = risk_coverage(rows)
        self.assertEqual(len(curve),2)
        self.assertIsNone(curve[0]["risk"])
        self.assertEqual(curve[-1]["risk"],.5)
        self.assertEqual(curve[-1]["coverage"],1)
        self.assertEqual(risk_coverage([])[0]["accepted"],0)

    def test_json_gold_fixtures(self):
        for fixture in json.loads((HERE / "artifacts/metric-fixtures.json").read_text()):
            self.assertEqual(metrics(fixture["rows"],fixture["temperature"]),fixture["expected"])

    def test_portable_js_inference_matches_python(self):
        script = """import fs from 'node:fs'; import {infer} from './inference.mjs';
const model=JSON.parse(fs.readFileSync('./artifacts/model.json','utf8'));
const fixtures=JSON.parse(fs.readFileSync('./artifacts/inference-fixtures.json','utf8'));
console.log(JSON.stringify(fixtures.map(f=>infer(model,f.text))));"""
        result = subprocess.run(["node","--input-type=module","-e",script],cwd=HERE,check=True,capture_output=True,text=True)
        actual = json.loads(result.stdout)
        expected = json.loads((HERE / "artifacts/inference-fixtures.json").read_text())
        for a,b in zip(actual,expected):
            for key in ["logits","ensembleLogits","probabilities","oodScore","disagreement"]:
                np.testing.assert_allclose(a[key],b[key],atol=1e-12,rtol=1e-12)


if __name__ == "__main__": unittest.main()
