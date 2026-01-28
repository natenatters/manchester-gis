#!/usr/bin/env python3
"""
Generate Roman Fort 3D Geometry

Reads fort parameters from reconstructions.json and generates explicit
polygon coordinates for walls, towers, buildings, etc.

Input:  data/projects/example/reconstructions.json (parameters)
Output: data/projects/example/fort_entities.json (geometry)

Usage:
    python scripts/generate_roman_forts.py
"""

import json
import math
from pathlib import Path

# Project paths
PROJECT_DIR = Path(__file__).parent.parent
DATA_DIR = PROJECT_DIR / "data" / "projects" / "example"
INPUT_FILE = DATA_DIR / "reconstructions.json"
OUTPUT_FILE = DATA_DIR / "fort_entities.json"


def to_lat_deg(meters):
    """Convert meters to latitude degrees."""
    return meters / 111000


def to_lon_deg(meters, lat):
    """Convert meters to longitude degrees at given latitude."""
    return meters / (111000 * math.cos(math.radians(lat)))


def rotate_point(x, y, angle_deg):
    """Rotate point around origin by angle in degrees."""
    rad = math.radians(angle_deg)
    return (
        x * math.cos(rad) - y * math.sin(rad),
        x * math.sin(rad) + y * math.cos(rad)
    )


def offsets_to_coords(cx, cy, offsets, rotation):
    """Convert meter offsets from center to lon/lat coordinates."""
    coords = []
    for x, y in offsets:
        rx, ry = rotate_point(x, y, rotation)
        lon = cx + to_lon_deg(rx, cy)
        lat = cy + to_lat_deg(ry)
        coords.append([lon, lat])
    return coords


def calculate_from_corners(corners):
    """Calculate center, rotation, and dimensions from corner points."""
    center = [
        (corners["SW"][0] + corners["SE"][0] + corners["NE"][0] + corners["NW"][0]) / 4,
        (corners["SW"][1] + corners["SE"][1] + corners["NE"][1] + corners["NW"][1]) / 4
    ]

    cos_lat = math.cos(math.radians(center[1]))

    # Rotation from SW->SE edge
    d_lng = corners["SE"][0] - corners["SW"][0]
    d_lat = corners["SE"][1] - corners["SW"][1]
    dx = d_lng * 111000 * cos_lat
    dy = d_lat * 111000
    rotation = math.degrees(math.atan2(dy, dx))

    # Dimensions
    length = math.sqrt(dx*dx + dy*dy)

    d_lng2 = corners["NE"][0] - corners["SE"][0]
    d_lat2 = corners["NE"][1] - corners["SE"][1]
    dx2 = d_lng2 * 111000 * cos_lat
    dy2 = d_lat2 * 111000
    width = math.sqrt(dx2*dx2 + dy2*dy2)

    return {"center": center, "rotation": rotation, "length": length, "width": width}


def generate_wall_segments(hL, hW, wt, gate_w, is_ruins=False):
    """Generate wall segment polygons (with gaps for gates)."""
    if is_ruins:
        # Partial ruins - just north wall fragments
        return [
            [[-hL, hW - wt], [-gate_w - 5, hW - wt], [-gate_w - 5, hW], [-hL, hW]],
            [[gate_w + 5, hW - wt], [hL * 0.3, hW - wt], [hL * 0.3, hW], [gate_w + 5, hW]],
        ]

    # Full walls with 4 gates
    return [
        # South wall (2 segments around gate)
        [[-hL, -hW], [-gate_w, -hW], [-gate_w, -hW + wt], [-hL, -hW + wt]],
        [[gate_w, -hW], [hL, -hW], [hL, -hW + wt], [gate_w, -hW + wt]],
        # North wall
        [[-hL, hW - wt], [-gate_w, hW - wt], [-gate_w, hW], [-hL, hW]],
        [[gate_w, hW - wt], [hL, hW - wt], [hL, hW], [gate_w, hW]],
        # West wall
        [[-hL, -hW], [-hL + wt, -hW], [-hL + wt, -gate_w], [-hL, -gate_w]],
        [[-hL, gate_w], [-hL + wt, gate_w], [-hL + wt, hW], [-hL, hW]],
        # East wall
        [[hL - wt, -hW], [hL, -hW], [hL, -gate_w], [hL - wt, -gate_w]],
        [[hL - wt, gate_w], [hL, gate_w], [hL, hW], [hL - wt, hW]],
    ]


def generate_corner_towers(hL, hW, size=5):
    """Generate corner tower polygons."""
    towers = []
    for tx, ty in [[-hL, -hW], [hL, -hW], [hL, hW], [-hL, hW]]:
        s = size / 2
        towers.append([
            [tx - s, ty - s], [tx + s, ty - s],
            [tx + s, ty + s], [tx - s, ty + s]
        ])
    return towers


def generate_gate_towers(hL, hW, wt, gate_w, size=4):
    """Generate gate tower polygons (2 per gate, 4 gates = 8 towers)."""
    s = size / 2
    positions = [
        [-gate_w - s, -hW + wt/2], [gate_w + s, -hW + wt/2],  # South gate
        [-gate_w - s, hW - wt/2], [gate_w + s, hW - wt/2],    # North gate
        [-hL + wt/2, -gate_w - s], [-hL + wt/2, gate_w + s],  # West gate
        [hL - wt/2, -gate_w - s], [hL - wt/2, gate_w + s],    # East gate
    ]
    towers = []
    for tx, ty in positions:
        towers.append([
            [tx - s, ty - s], [tx + s, ty - s],
            [tx + s, ty + s], [tx - s, ty + s]
        ])
    return towers


def generate_ditch(hL, hW, ditch_width):
    """Generate ditch as polygon with hole."""
    margin = 5
    outer = [
        [-hL - ditch_width - margin, -hW - ditch_width - margin],
        [hL + ditch_width + margin, -hW - ditch_width - margin],
        [hL + ditch_width + margin, hW + ditch_width + margin],
        [-hL - ditch_width - margin, hW + ditch_width + margin]
    ]
    inner = [
        [-hL - margin, -hW - margin],
        [hL + margin, -hW - margin],
        [hL + margin, hW + margin],
        [-hL - margin, hW + margin]
    ]
    return {"outer": outer, "inner": inner}


def generate_buildings(buildings, length, width):
    """Generate building polygons from layout."""
    scale = min(length / 160, width / 130)
    result = []

    for b in buildings:
        bx, by = b["x"] * scale, b["y"] * scale
        bw, bh = b["w"] * scale / 2, b["h"] * scale / 2

        result.append({
            "name": b["name"],
            "type": b.get("type", "building"),
            "coords": [
                [bx - bw, by - bh], [bx + bw, by - bh],
                [bx + bw, by + bh], [bx - bw, by + bh]
            ],
            "height": b["height"] * scale
        })

    return result


def generate_roads(hL, hW, wt, length, width, is_stone):
    """Generate road polygons."""
    scale = min(length / 160, width / 130)
    road_w = (7 if is_stone else 6) * scale
    hw = road_w / 2

    return [
        {
            "name": "Via Principalis",
            "coords": [[-hL + wt + 2, -hw], [hL - wt - 2, -hw],
                      [hL - wt - 2, hw], [-hL + wt + 2, hw]]
        },
        {
            "name": "Via Praetoria",
            "coords": [[-hw, -hW + wt + 2], [hw, -hW + wt + 2],
                      [hw, -5], [-hw, -5]]
        },
        {
            "name": "Via Decumana",
            "coords": [[-hw, 20], [hw, 20],
                      [hw, hW - wt - 2], [-hw, hW - wt - 2]]
        }
    ]


def get_default_buildings(is_stone):
    """Default Roman fort building layout."""
    h = 1 if is_stone else 0  # Height bonus for stone
    return [
        {"name": "Principia (HQ)", "x": 0, "y": 5, "w": 35, "h": 30, "height": 6 + h, "type": "hq"},
        {"name": "Praetorium", "x": 0, "y": -25, "w": 25, "h": 20, "height": 5 + h, "type": "commander"},
        {"name": "Horreum", "x": -32, "y": -25, "w": 15, "h": 28, "height": 4 + h, "type": "granary"},
        {"name": "Horreum", "x": 32, "y": -25, "w": 15, "h": 28, "height": 4 + h, "type": "granary"},
        {"name": "Barracks", "x": -40, "y": 28, "w": 12, "h": 42, "height": 3.5 + h*0.5, "type": "barracks"},
        {"name": "Barracks", "x": -25, "y": 28, "w": 12, "h": 42, "height": 3.5 + h*0.5, "type": "barracks"},
        {"name": "Barracks", "x": 25, "y": 28, "w": 12, "h": 42, "height": 3.5 + h*0.5, "type": "barracks"},
        {"name": "Barracks", "x": 40, "y": 28, "w": 12, "h": 42, "height": 3.5 + h*0.5, "type": "barracks"},
    ]


def generate_fort(fort, ref_points):
    """Generate all geometry for a single fort."""
    # Resolve center/dimensions
    if fort.get("centerFrom") and fort["centerFrom"] in ref_points:
        calc = calculate_from_corners(ref_points[fort["centerFrom"]]["corners"])
        center = fort.get("center") or calc["center"]
        length = fort.get("length") or calc["length"]
        width = fort.get("width") or calc["width"]
        rotation = fort.get("rotation", calc["rotation"])
    else:
        center = fort["center"]
        length = fort["length"]
        width = fort["width"]
        rotation = fort.get("rotation", 0)

    cx, cy = center
    hL, hW = length / 2, width / 2
    wt = fort["wallThickness"]
    gate_w = 8
    is_stone = fort["material"] == "stone"
    is_ruins = fort["material"] == "ruins"

    entities = []

    # Ditch
    if fort.get("ditchDepth", 0) > 0:
        ditch = generate_ditch(hL, hW, fort["ditchWidth"])
        entities.append({
            "id": f"{fort['id']}_ditch",
            "type": "polygon_with_hole",
            "outer": offsets_to_coords(cx, cy, ditch["outer"], rotation),
            "inner": offsets_to_coords(cx, cy, ditch["inner"], rotation),
            "height": -fort["ditchDepth"],
            "extrudedHeight": 0,
            "material": "ditch"
        })

    # Walls
    walls = generate_wall_segments(hL, hW, wt, gate_w, is_ruins or fort.get("partialWalls"))
    for i, seg in enumerate(walls):
        entities.append({
            "id": f"{fort['id']}_wall_{i}",
            "type": "polygon",
            "coords": offsets_to_coords(cx, cy, seg, rotation),
            "height": 0,
            "extrudedHeight": fort["wallHeight"],
            "material": "wall"
        })

    if not is_ruins and not fort.get("partialWalls"):
        # Corner towers
        for i, tower in enumerate(generate_corner_towers(hL, hW)):
            entities.append({
                "id": f"{fort['id']}_tower_{i}",
                "type": "polygon",
                "coords": offsets_to_coords(cx, cy, tower, rotation),
                "height": 0,
                "extrudedHeight": fort["towerHeight"],
                "material": "tower"
            })

        # Gate towers
        for i, tower in enumerate(generate_gate_towers(hL, hW, wt, gate_w)):
            entities.append({
                "id": f"{fort['id']}_gatetower_{i}",
                "type": "polygon",
                "coords": offsets_to_coords(cx, cy, tower, rotation),
                "height": 0,
                "extrudedHeight": fort["towerHeight"] - 1,
                "material": "tower"
            })

        # Buildings
        buildings = fort.get("buildings") or get_default_buildings(is_stone)
        for i, b in enumerate(generate_buildings(buildings, length, width)):
            entities.append({
                "id": f"{fort['id']}_building_{i}",
                "name": b["name"],
                "type": "polygon",
                "coords": offsets_to_coords(cx, cy, b["coords"], rotation),
                "height": 0.1,
                "extrudedHeight": b["height"],
                "material": b["type"]
            })

        # Roads
        for i, road in enumerate(generate_roads(hL, hW, wt, length, width, is_stone)):
            entities.append({
                "id": f"{fort['id']}_road_{i}",
                "name": road["name"],
                "type": "polygon",
                "coords": offsets_to_coords(cx, cy, road["coords"], rotation),
                "height": 0.05,
                "extrudedHeight": 0.1,
                "material": "road"
            })

    # Label position
    entities.append({
        "id": f"{fort['id']}_label",
        "type": "label",
        "position": center,
        "text": fort["name"],
        "startYear": fort["startYear"],
        "endYear": fort["endYear"]
    })

    return {
        "id": fort["id"],
        "name": fort["name"],
        "startYear": fort["startYear"],
        "endYear": fort["endYear"],
        "material": fort["material"],
        "entities": entities
    }


def main():
    print(f"Reading: {INPUT_FILE}")
    with open(INPUT_FILE) as f:
        data = json.load(f)

    ref_points = data.get("referencePoints", {})
    materials = data.get("materials", {})

    output = {
        "description": "Generated Roman fort geometry",
        "generator": "scripts/generate_roman_forts.py",
        "materials": materials,
        "forts": []
    }

    for fort in data["forts"]:
        print(f"  Generating: {fort['name']}")
        output["forts"].append(generate_fort(fort, ref_points))

    print(f"Writing: {OUTPUT_FILE}")
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    total_entities = sum(len(f["entities"]) for f in output["forts"])
    print(f"Done! Generated {total_entities} entities for {len(output['forts'])} forts")


if __name__ == "__main__":
    main()
