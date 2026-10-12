# ship_interior_localization_project_page

Project page for Manhattan-world multi-hypothesis global localization inside a ship's double-bottom structure.

## Viewing locally

The interactive demos load JSON with `fetch`, so open the page over HTTP rather than as a file:

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Contents

| Path | What it is |
|------|------------|
| `index.html` | The project page (Korean), with an interactive demo for each of the 9 pipeline stages |
| `static/js/demos.js` | The stage demos, drawn on canvas from the recorded pipeline traces |
| `static/css/style.css` | Page styles |
| `static/data/case_a.json`, `case_b.json` | Recorded intermediate results for two scans (no_yaw 0: decisive; no_yaw 2: ambiguous), plus per-point normals |
| `static/data/map.json` | Map walls around compartment c = 2 at sensor height, plane lists and the x signature |
| `scripts/build_demo_data.py` | Rebuilds the three JSON files from the localization repo: `python3 scripts/build_demo_data.py <localization_repo> static/data` |
| `static/videos/pipeline_walkthrough.mp4` | Supplementary video: the 9-stage localization pipeline on real scans |
| `static/videos/dataset_scans.mp4` | Supplementary video: the two scan datasets (no_yaw, yes_yaw) placed at ground-truth poses, 1080p |
| `static/videos/dataset_scans_poster.jpg` | Poster frame for the dataset video |
| `static/images/*.jpg` | Stills from the pipeline video (problem, stages, results) |
| `static/images/mm_*.png` | How the Manhattan map is built: classification, yaw vote, Y/Z planes, X signature |
| `static/images/tracking_intuition.png` | Why a single scan is ambiguous along x and how tracking resolves it |
| `static/data/summary.json` | Benchmark summary for both datasets |
| `reference/method_walkthrough.html` | Detailed method notes (Korean) used as source material for the page |
