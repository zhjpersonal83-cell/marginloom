import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {evaluate,validateDataset} from '../lib/reliability/engine.ts';
const content=readFileSync(new URL('../data/demo.json',import.meta.url),'utf8');
const dataset=validateDataset(JSON.parse(content));const evaluation=evaluate(dataset);
const report={schemaVersion:'1.0',source:'Deterministic synthetic fixture',datasetHash:createHash('sha256').update(JSON.stringify(dataset)).digest('hex'),dataset:{name:dataset.name,classNames:dataset.classNames},evaluation,limitations:['Synthetic scores do not establish real-world reliability.','Calibration improves ECE and Brier but worsens test log loss.','The default threshold is exploratory; no independent release gate is claimed.']};
writeFileSync(new URL('../docs/reports/benchmark.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({temperature:evaluation.temperature,raw:evaluation.raw,calibrated:evaluation.calibrated,selection:evaluation.selection},null,2));
