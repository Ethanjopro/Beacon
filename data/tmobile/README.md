# T-Mobile track data (local only)

Put the files T-Mobile provides here: the synthetic message set, the scam
taxonomy and the baseline classifier (or its predictions). This directory is
**gitignored** except for this README, so don't commit the data unless the
track's license explicitly allows redistribution.

Then add `mapping.json` describing the columns, for example:

```json
{
  "format": "csv",
  "file": "messages.csv",
  "text": "message",
  "label": "is_scam",
  "positiveLabel": "1",
  "type": "category",
  "baselinePrediction": "baseline_pred"
}
```

`packages/scenarios/src/tmobile/` reads this. Run `pnpm eval --dataset tmobile`.
