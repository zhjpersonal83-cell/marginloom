"""Publish deterministic research exports into the web bundle; no model fitting here."""
import json
import shutil
import sys
from pathlib import Path
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'ml' / 'segmentation'))
from run_segmentation import predict_from_export

def main():
    source = ROOT / 'ml' / 'artifacts'
    data = ROOT / 'data'
    predictions = json.loads((source / 'predictions.json').read_text())
    rows = [{**{k: v for k, v in r.items() if k != 'templateGroup'}, 'group': r['templateGroup']} for r in predictions['records']]
    dataset = {'name': 'Support triage · reliability benchmark', 'classNames': predictions['classNames'], 'rows': rows}
    (data / 'demo.json').write_text(json.dumps(dataset, separators=(',', ':')))
    for name in ['model.json', 'metadata.json', 'metrics.json', 'metric-fixtures.json', 'inference-fixtures.json']:
        shutil.copy(source / name, data / name)
    artifacts = ROOT / 'ml' / 'segmentation' / 'artifacts'
    model = json.loads((artifacts / 'model.json').read_text())
    metrics = json.loads((artifacts / 'metrics.json').read_text())
    manifest = json.loads((artifacts / 'manifest.json').read_text())
    output = ROOT / 'public' / 'vision'
    output.mkdir(parents=True, exist_ok=True)
    images = []
    for item in manifest:
        if item['split'] != 'test':
            continue
        sample = item['id']
        raw = np.array(Image.open(artifacts / item['image']))
        probability = predict_from_export(raw, model).reshape(raw.shape)
        entropy = -(probability * np.log(np.clip(probability, 1e-12, 1)) + (1-probability) * np.log(np.clip(1-probability, 1e-12, 1))) / np.log(2)
        shutil.copy(artifacts / item['image'], output / f'{sample}.png')
        shutil.copy(artifacts / item['mask'], output / f'{sample}_mask.png')
        Image.fromarray((probability >= model['foreground_threshold']).astype(np.uint8) * 255).save(output / f'{sample}_prediction.png')
        heat = np.stack([entropy*238, (1-entropy)*35+entropy*129, (1-entropy)*48+entropy*73], axis=-1).astype(np.uint8)
        Image.fromarray(heat).save(output / f'{sample}_entropy.png')
        score = next(r for r in metrics['per_image'] if r['id'] == sample)
        images.append({'id':sample,'image':f'/vision/{sample}.png','mask':f'/vision/{sample}_mask.png','prediction':f'/vision/{sample}_prediction.png','uncertainty':f'/vision/{sample}_entropy.png','dice':score['dice'],'iou':score['iou'],'slice':'held-out synthetic'})
    bundle={'description':'Learned pixel classifier on generated micrographs. Training, threshold tuning and test images are disjoint.','images':images,'summary':{'dice':metrics['splits']['test']['mean_image_dice'],'iou':metrics['splits']['test']['mean_image_iou']}}
    (output/'manifest.json').write_text(json.dumps(bundle,indent=2))
    shutil.copy(artifacts/'metrics.json',output/'report.json')
    print(f'Exported {len(rows)} text predictions and {len(images)} vision samples.')

if __name__ == '__main__':
    main()
