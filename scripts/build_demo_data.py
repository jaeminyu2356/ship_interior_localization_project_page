#!/usr/bin/env python3
"""Builds the compact JSON files that drive the interactive demos on the project page.

Inputs come from the localization repo: the pipeline traces written by pipeline_trace
(supplementary/trace_case_*.json), the raw scans they reference (for per-point normals),
and the voxelized map point cloud (for the top-view map around the compartment).

Usage:
    python3 scripts/build_demo_data.py <localization_repo> static/data
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

NORMAL_RADIUS = 0.3  # same as the localizer's normal estimation
MAP_VIEW = (50.0, 86.0, -4.0, 36.0)  # x0, x1, y0, y1 around compartment c = 2
MAP_GRID = 0.15
# Height band around the sensor drawn in the top views: walls only, without the bottom
# plating ~0.45 m below the sensor and the inner bottom ~1.5 m above it.
BAND = (-0.25, 1.0)


def load_pcd_xyz(path):
    with open(path, "rb") as f:
        header = {}
        while True:
            key, *values = f.readline().decode().split()
            header[key] = values
            if key == "DATA":
                break
        count, fields = int(header["POINTS"][0]), len(header["FIELDS"])
        return np.frombuffer(f.read(count * fields * 4), dtype=np.float32).reshape(count, fields)[:, :3].astype(float)


def normals_at(query, cloud, radius):
    tree = cKDTree(cloud)
    out = np.full((len(query), 3), np.nan)
    for i, nbrs in enumerate(tree.query_ball_point(query, radius)):
        if len(nbrs) < 3:
            continue
        q = cloud[nbrs]
        w, v = np.linalg.eigh(np.cov((q - q.mean(0)).T))
        out[i] = v[:, 0]
    return out


def r(a, nd=3):
    return np.round(np.asarray(a, float), nd).tolist()


def pose(p):
    return [round(p["x"], 3), round(p["y"], 3), round(p["z"], 3), round(p["yaw"], 5)]


def build_case(trace_path, repo):
    t = json.load(open(trace_path))
    scan_path = Path(t["scan_file"])
    if not scan_path.exists():
        scan_path = repo / "datasets" / scan_path.parent.parent.name / "scans" / scan_path.name
    raw = load_pcd_xyz(scan_path)
    raw = raw[np.isfinite(raw).all(1)]
    scan = np.array(t["scan"])
    normals = normals_at(scan, raw, NORMAL_RADIUS)
    ok = np.isfinite(normals).all(1)

    stages = []
    for st in t["yaw_stages"]:
        stages.append({
            "yaw": round(st["yaw"], 5),
            "y_local": [[round(o, 3), n] for o, n in st["y_planes_local"]],
            "z_local": [[round(o, 3), n] for o, n in st["z_planes_local"]],
            "y_options": r(st["y_options"]),
            "z_options": r(st["z_options"]),
            "sig_origin": round(st["local_signature"]["origin"], 4),
            "sig_bins": [int(b) for b in st["local_signature"]["bins"]],
            "x_peaks": [[round(x, 3), round(s, 4)] for x, s in st["x_peaks"]],
        })
    truth = t["truth"]
    true_stage = min(range(len(stages)),
                     key=lambda i: abs(math.remainder(stages[i]["yaw"] - truth["yaw"], 2 * math.pi)))
    best_terms = np.array(t["best_terms"])
    rivals = {}
    for key in ("tie", "rejected"):
        if key in t:
            rv = t[key]
            rivals[key] = {"pose": pose(rv["pose"]), "z": round(rv["z"], 3),
                           "terms": r(rv["terms"], 3)}
    return {
        "name": scan_path.parent.parent.name + "/" + scan_path.name,
        "raw_points": t["raw_points"],
        "truth": pose(truth),
        "true_stage": true_stage,
        "compartments": r(t["compartments"]),
        "compartment": t["compartment"],
        "scan": r(scan[ok]),
        "normals": r(normals[ok]),
        "wall_headings": r(t["wall_headings"], 4),
        "stages": stages,
        "screened": [pose(h["pose"]) + [round(h["score"], 4)] for h in t["screened"]],
        "rescored": [pose(h["pose"]) + [round(h["score"], 4)] for h in t["rescored"]],
        "modes": [pose(h["pose"]) + [round(h["score"], 4)] for h in t["modes"]],
        "refine_paths": [[pose(p) for p in path] for path in t["refine_paths"]],
        "final": [pose(h["pose"]) + [round(h["score"], 4)] for h in t["final_ranking"]],
        "paired_z": r(t["paired_z"], 3),
        "kept": t["kept"],
        "hypotheses": [pose(h["pose"]) + [round(h["score"], 4), round(h["weight"], 4)]
                       for h in t["multi_compartment"]["hypotheses"]],
        "decisive": t["multi_compartment"]["decisive"],
        "whole_ship": [pose(h["pose"]) + [round(h["score"], 4)] for h in t["multi_whole_ship"]["hypotheses"]],
        "scored_points": r(t["scored_points"]),
        "best_terms": r(best_terms, 3),
        "rivals": rivals,
        "vote_margin": t["vote_margin"],
        "z_threshold": t["z_threshold"],
        "config": t["config"],
    }, t


def build_map(repo, trace):
    pts = load_pcd_xyz(repo / "scripts/output/shipyard_scene_voxel0.2.pcd")
    x0, x1, y0, y1 = MAP_VIEW
    z = trace["truth"]["z"]
    sel = (pts[:, 0] > x0) & (pts[:, 0] < x1) & (pts[:, 1] > y0) & (pts[:, 1] < y1) & \
          (pts[:, 2] > z + BAND[0]) & (pts[:, 2] < z + BAND[1])
    cells = np.unique(np.floor(pts[sel, :2] / MAP_GRID).astype(int), axis=0)
    xy = (cells + 0.5) * MAP_GRID
    return {
        "view": list(MAP_VIEW),
        "grid": MAP_GRID,
        "band": list(BAND),
        "xy": np.round(xy.ravel(), 2).tolist(),
        "y_planes": r(trace["map_planes"]["y"]),
        "z_planes": r(trace["map_planes"]["z"]),
        "sig_origin": trace["map_signature"]["origin"],
        "sig_res": trace["map_signature"]["resolution"],
        "sig_bins": [int(b) for b in trace["map_signature"]["bins"]],
    }


def main():
    repo, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    traces = {}
    for key, name in (("a", "trace_case_0.json"), ("b", "trace_case_2.json")):
        case, traces[key] = build_case(repo / "supplementary" / name, repo)
        (out / f"case_{key}.json").write_text(json.dumps(case, separators=(",", ":"), ensure_ascii=False))
        print(f"case_{key}: {len(case['scan'])} scan points")
    m = build_map(repo, traces["b"])
    (out / "map.json").write_text(json.dumps(m, separators=(",", ":")))
    print(f"map: {len(m['xy']) // 2} cells")


if __name__ == "__main__":
    main()
