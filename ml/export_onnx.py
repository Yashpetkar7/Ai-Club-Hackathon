"""Export the fine-tuned claim model to the format the browser already runs (ONNX, 8-bit weights).

Run from the repo root after ml/finetune_claims.py:  python -I -X utf8 ml/export_onnx.py
Writes public/models/paper-trail-nli-scifact/ (config, tokenizer, onnx/model_quantized.onnx) and adds
the quantised model's held-out SciFact scores to ml/results/finetune.json, so the number we report is the
number of the file we ship, not of the full-precision weights.
"""
import json
import os
import shutil
import sys

import numpy as np
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from transformers import AutoModelForSequenceClassification, AutoTokenizer

ROOT = os.getcwd()
SRC = os.path.join(ROOT, os.environ.get('SRC', 'ml/work/finetuned'))
NAME = os.environ.get('NAME', 'paper-trail-nli-scifact')
DEST = os.path.join(ROOT, 'public/models', NAME)
WORK = os.path.join(ROOT, 'ml/work/onnx-' + NAME)
RESULTS = os.path.join(ROOT, 'ml/results/finetune.json')

os.makedirs(WORK, exist_ok=True)
os.makedirs(os.path.join(DEST, 'onnx'), exist_ok=True)

tok = AutoTokenizer.from_pretrained(SRC)
model = AutoModelForSequenceClassification.from_pretrained(SRC).eval()
model.config.return_dict = False

enc = tok(['A sentence from an abstract.'], ['A claim about it.'], return_tensors='pt')
full = os.path.join(WORK, 'model.onnx')
torch.onnx.export(
    model,
    (enc['input_ids'], enc['attention_mask']),
    full,
    input_names=['input_ids', 'attention_mask'],
    output_names=['logits'],
    dynamic_axes={'input_ids': {0: 'batch', 1: 'seq'}, 'attention_mask': {0: 'batch', 1: 'seq'}, 'logits': {0: 'batch'}},
    opset_version=14,
    do_constant_folding=True,
    dynamo=False,
)
q = os.path.join(DEST, 'onnx', 'model_quantized.onnx')
quantize_dynamic(full, q, weight_type=QuantType.QInt8)

for f in ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'added_tokens.json']:
    p = os.path.join(SRC, f)
    if os.path.exists(p):
        shutil.copy(p, os.path.join(DEST, f))
print('wrote', DEST, round(os.path.getsize(q) / 1e6, 1), 'MB')

# Held-out SciFact dev, scored with the shipped quantised file.
sys.argv = ['x']
sess = ort.InferenceSession(q, providers=['CPUExecutionProvider'])
with torch.no_grad():
    ref = model(**enc)[0].softmax(-1).numpy()
got = sess.run(None, {'input_ids': enc['input_ids'].numpy(), 'attention_mask': enc['attention_mask'].numpy()})[0]
got = np.exp(got - got.max(-1, keepdims=True))
got = got / got.sum(-1, keepdims=True)
print('fp32 vs int8 on a smoke pair', ref.round(3).tolist(), got.round(3).tolist())

if os.environ.get('EVAL', '1') == '1' and os.path.exists(RESULTS):
    import importlib.util
    spec = importlib.util.spec_from_file_location('pairs', os.path.join(ROOT, 'ml/scifact_pairs.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    dev = m.dev_pairs(m.label_ids(model.config.label2id))
    probs = []
    for i in range(0, len(dev), 32):
        b = dev[i:i + 32]
        e = tok([x[0] for x in b], [x[1] for x in b], truncation=True, max_length=192, padding=True, return_tensors='np')
        lg = sess.run(None, {'input_ids': e['input_ids'], 'attention_mask': e['attention_mask']})[0]
        p = np.exp(lg - lg.max(-1, keepdims=True))
        probs.append(p / p.sum(-1, keepdims=True))
    metrics = m.metrics(np.concatenate(probs), np.array([x[2] for x in dev]), model.config.label2id)
    res = json.load(open(RESULTS, encoding='utf-8'))
    res.setdefault('shipped', {})[NAME] = {'file': f'public/models/{NAME}/onnx/model_quantized.onnx', 'mb': round(os.path.getsize(q) / 1e6, 1), 'dev': metrics}
    json.dump(res, open(RESULTS, 'w', encoding='utf-8'), indent=1)
    print('int8 dev', metrics)
