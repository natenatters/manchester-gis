#!/usr/bin/env python3
"""
Generate Historic Building 3D Geometry

Reads building parameters from buildings_1650.json and generates explicit
polygon coordinates for walls, roofs, etc.

Input:  data/projects/example/buildings_1650.json (parameters)
Output: data/projects/example/building_entities.json (geometry)

Usage:
    python scripts/generate_historic_buildings.py
"""

import json
import math
from pathlib import Path

# Project paths
PROJECT_DIR = Path(__file__).parent.parent
DATA_DIR = PROJECT_DIR / "data" / "projects" / "example"
INPUT_FILE = DATA_DIR / "buildings_1650.json"
BUILDINGS_DIR = DATA_DIR / "buildings"  # Individual building files
OUTPUT_FILE = DATA_DIR / "building_entities.json"


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


# ==============================================
# BUILDING GENERATORS
# ==============================================

def generate_simple_building(building):
    """Generate a simple rectangular building with pitched roof."""
    cx, cy = building["center"]
    hL = building["length"] / 2
    hW = building["width"] / 2
    height = building["height"]
    rotation = building.get("rotation", 0)

    entities = []

    # Main walls
    walls = [
        [-hL, -hW], [hL, -hW], [hL, hW], [-hL, hW]
    ]
    entities.append({
        "id": f"{building['id']}_walls",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, walls, rotation),
        "height": 0,
        "extrudedHeight": height,
        "material": "wall"
    })

    # Simple flat roof (can enhance later with pitched roof)
    entities.append({
        "id": f"{building['id']}_roof",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, walls, rotation),
        "height": height,
        "extrudedHeight": height + 0.5,
        "material": "roof"
    })

    return entities


def generate_church(building):
    """Generate a medieval church with tower, nave, and aisles."""
    cx, cy = building["center"]
    rotation = building.get("rotation", 0)

    # Church dimensions (can be overridden in data)
    nave_length = building.get("naveLength", 40)
    nave_width = building.get("naveWidth", 12)
    nave_height = building.get("naveHeight", 15)
    tower_size = building.get("towerSize", 10)
    tower_height = building.get("towerHeight", 30)
    aisle_width = building.get("aisleWidth", 5)

    entities = []
    hL = nave_length / 2
    hW = nave_width / 2

    # Nave
    nave = [[-hL, -hW], [hL, -hW], [hL, hW], [-hL, hW]]
    entities.append({
        "id": f"{building['id']}_nave",
        "name": f"{building['name']} - Nave",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, nave, rotation),
        "height": 0,
        "extrudedHeight": nave_height,
        "material": "wall"
    })

    # Tower (west end)
    ts = tower_size / 2
    tower = [[-hL - tower_size, -ts], [-hL, -ts], [-hL, ts], [-hL - tower_size, ts]]
    entities.append({
        "id": f"{building['id']}_tower",
        "name": f"{building['name']} - Tower",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, tower, rotation),
        "height": 0,
        "extrudedHeight": tower_height,
        "material": "tower"
    })

    # North aisle
    n_aisle = [[-hL, hW], [hL * 0.7, hW], [hL * 0.7, hW + aisle_width], [-hL, hW + aisle_width]]
    entities.append({
        "id": f"{building['id']}_north_aisle",
        "name": f"{building['name']} - North Aisle",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, n_aisle, rotation),
        "height": 0,
        "extrudedHeight": nave_height * 0.7,
        "material": "wall"
    })

    # South aisle
    s_aisle = [[-hL, -hW - aisle_width], [hL * 0.7, -hW - aisle_width], [hL * 0.7, -hW], [-hL, -hW]]
    entities.append({
        "id": f"{building['id']}_south_aisle",
        "name": f"{building['name']} - South Aisle",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, s_aisle, rotation),
        "height": 0,
        "extrudedHeight": nave_height * 0.7,
        "material": "wall"
    })

    # Chancel (east end)
    chancel_length = nave_length * 0.3
    chancel = [[hL, -hW * 0.8], [hL + chancel_length, -hW * 0.8],
               [hL + chancel_length, hW * 0.8], [hL, hW * 0.8]]
    entities.append({
        "id": f"{building['id']}_chancel",
        "name": f"{building['name']} - Chancel",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, chancel, rotation),
        "height": 0,
        "extrudedHeight": nave_height * 0.9,
        "material": "wall"
    })

    return entities


def generate_bridge(building):
    """Generate a medieval stone bridge with arches."""
    cx, cy = building["center"]
    rotation = building.get("rotation", 0)

    # Bridge dimensions
    span = building.get("span", 50)  # Total length
    width = building.get("width", 6)
    height = building.get("height", 8)
    num_arches = building.get("numArches", 5)

    entities = []
    hS = span / 2
    hW = width / 2

    # Bridge deck
    deck = [[-hS, -hW], [hS, -hW], [hS, hW], [-hS, hW]]
    entities.append({
        "id": f"{building['id']}_deck",
        "name": f"{building['name']} - Deck",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, deck, rotation),
        "height": height - 1,
        "extrudedHeight": height,
        "material": "stone"
    })

    # Piers (simplified as rectangles)
    pier_width = span / (num_arches * 2 + 1)
    for i in range(num_arches + 1):
        px = -hS + pier_width * (i * 2)
        pier = [[px, -hW - 1], [px + pier_width, -hW - 1],
                [px + pier_width, hW + 1], [px, hW + 1]]
        entities.append({
            "id": f"{building['id']}_pier_{i}",
            "name": f"{building['name']} - Pier {i+1}",
            "type": "polygon",
            "coords": offsets_to_coords(cx, cy, pier, rotation),
            "height": -2,  # Below water level
            "extrudedHeight": height - 1,
            "material": "stone"
        })

    # Parapets
    for side, y_off in [("north", hW), ("south", -hW - 0.5)]:
        parapet = [[-hS, y_off], [hS, y_off], [hS, y_off + 0.5], [-hS, y_off + 0.5]]
        entities.append({
            "id": f"{building['id']}_parapet_{side}",
            "name": f"{building['name']} - {side.title()} Parapet",
            "type": "polygon",
            "coords": offsets_to_coords(cx, cy, parapet, rotation),
            "height": height,
            "extrudedHeight": height + 1.2,
            "material": "stone"
        })

    return entities


def generate_neoclassical_church(building):
    """Generate a neoclassical church (like St Peter's Manchester).

    Layout based on historic plan:
    - Long rectangular body
    - Two small side wings in middle
    - Tower flush with entrance end
    """
    cx, cy = building["center"]
    rotation = building.get("rotation", 0)

    # Church dimensions
    nave_length = building.get("naveLength", 30)
    nave_width = building.get("naveWidth", 15)
    nave_height = building.get("naveHeight", 12)
    tower_size = building.get("towerSize", 8)
    tower_height = building.get("towerHeight", 25)
    wing_depth = building.get("wingDepth", 4)
    wing_width = building.get("wingWidth", 6)

    entities = []
    hL = nave_length / 2
    hW = nave_width / 2

    # Main body (one long rectangle)
    body = [[-hL, -hW], [hL, -hW], [hL, hW], [-hL, hW]]
    entities.append({
        "id": f"{building['id']}_body",
        "name": f"{building['name']} - Body",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, body, rotation),
        "height": 0,
        "extrudedHeight": nave_height,
        "material": "wall"
    })

    # Side wings (small projections in middle of each side)
    wing_hw = wing_width / 2

    # North wing
    north_wing = [
        [-wing_hw, hW],
        [wing_hw, hW],
        [wing_hw, hW + wing_depth],
        [-wing_hw, hW + wing_depth]
    ]
    entities.append({
        "id": f"{building['id']}_wing_north",
        "name": f"{building['name']} - North Wing",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, north_wing, rotation),
        "height": 0,
        "extrudedHeight": nave_height * 0.8,
        "material": "wall"
    })

    # South wing
    south_wing = [
        [-wing_hw, -hW - wing_depth],
        [wing_hw, -hW - wing_depth],
        [wing_hw, -hW],
        [-wing_hw, -hW]
    ]
    entities.append({
        "id": f"{building['id']}_wing_south",
        "name": f"{building['name']} - South Wing",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, south_wing, rotation),
        "height": 0,
        "extrudedHeight": nave_height * 0.8,
        "material": "wall"
    })

    # Tower (flush with entrance end, centered)
    ts = tower_size / 2
    tower = [
        [-hL, -ts],
        [-hL + tower_size, -ts],
        [-hL + tower_size, ts],
        [-hL, ts]
    ]
    entities.append({
        "id": f"{building['id']}_tower",
        "name": f"{building['name']} - Tower",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, tower, rotation),
        "height": nave_height,
        "extrudedHeight": tower_height,
        "material": "tower"
    })

    return entities


def generate_chapel(building):
    """Generate a simple chapel with optional small tower."""
    cx, cy = building["center"]
    rotation = building.get("rotation", 0)

    length = building.get("length", 15)
    width = building.get("width", 8)
    height = building.get("height", 7)
    tower_height = building.get("towerHeight", 10)

    entities = []
    hL = length / 2
    hW = width / 2

    # Main chapel body
    body = [[-hL, -hW], [hL, -hW], [hL, hW], [-hL, hW]]
    entities.append({
        "id": f"{building['id']}_body",
        "name": f"{building['name']} - Body",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, body, rotation),
        "height": 0,
        "extrudedHeight": height,
        "material": "wall"
    })

    # Small tower at west end
    tw = width * 0.4
    tower = [[-hL - tw, -tw/2], [-hL, -tw/2], [-hL, tw/2], [-hL - tw, tw/2]]
    entities.append({
        "id": f"{building['id']}_tower",
        "name": f"{building['name']} - Tower",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, tower, rotation),
        "height": 0,
        "extrudedHeight": tower_height,
        "material": "wall"
    })

    return entities


def generate_courtyard_building(building):
    """Generate a medieval courtyard building (like Chetham's)."""
    cx, cy = building["center"]
    rotation = building.get("rotation", 0)

    # Dimensions
    outer_length = building.get("length", 40)
    outer_width = building.get("width", 35)
    wing_depth = building.get("wingDepth", 8)
    height = building.get("height", 10)

    entities = []
    hL = outer_length / 2
    hW = outer_width / 2
    wd = wing_depth

    # Four wings around courtyard
    wings = [
        ("north", [[-hL, hW - wd], [hL, hW - wd], [hL, hW], [-hL, hW]]),
        ("south", [[-hL, -hW], [hL, -hW], [hL, -hW + wd], [-hL, -hW + wd]]),
        ("east", [[hL - wd, -hW + wd], [hL, -hW + wd], [hL, hW - wd], [hL - wd, hW - wd]]),
        ("west", [[-hL, -hW + wd], [-hL + wd, -hW + wd], [-hL + wd, hW - wd], [-hL, hW - wd]]),
    ]

    for name, coords in wings:
        entities.append({
            "id": f"{building['id']}_{name}_wing",
            "name": f"{building['name']} - {name.title()} Wing",
            "type": "polygon",
            "coords": offsets_to_coords(cx, cy, coords, rotation),
            "height": 0,
            "extrudedHeight": height,
            "material": "wall"
        })

    # Gatehouse (south wing, taller section)
    gate = [[-3, -hW], [3, -hW], [3, -hW + wd], [-3, -hW + wd]]
    entities.append({
        "id": f"{building['id']}_gatehouse",
        "name": f"{building['name']} - Gatehouse",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, gate, rotation),
        "height": height,
        "extrudedHeight": height + 5,
        "material": "wall"
    })

    return entities


# ==============================================
# GENERATOR REGISTRY
# ==============================================

GENERATORS = {
    "house": generate_simple_building,
    "church": generate_church,
    "neoclassical_church": generate_neoclassical_church,
    "chapel": generate_chapel,
    "bridge": generate_bridge,
    "courtyard": generate_courtyard_building,
}


def generate_building(building):
    """Generate entities for a building based on its type."""
    building_type = building.get("type", "house")
    generator = GENERATORS.get(building_type, generate_simple_building)
    return generator(building)


def main():
    print(f"Reading: {INPUT_FILE}")
    with open(INPUT_FILE) as f:
        data = json.load(f)

    materials = data.get("materials", {})

    output = {
        "description": "Generated 1650 Manchester building geometry",
        "generator": "scripts/generate_historic_buildings.py",
        "source": data.get("source", ""),
        "materials": materials,
        "buildings": []
    }

    for building in data["buildings"]:
        print(f"  Generating: {building['name']}")
        entities = generate_building(building)

        building_output = {
            "id": building["id"],
            "name": building["name"],
            "type": building.get("type", "house"),
            "startYear": building.get("startYear", 1600),
            "endYear": building.get("endYear", 1800),
            "material": building.get("material", "stone"),
            # Source parameters for UI editing
            "center": building.get("center"),
            "rotation": building.get("rotation", 0),
            "entities": entities
        }
        # Pass through dimension parameters (varies by type)
        for field in ["naveLength", "naveWidth", "naveHeight", "towerSize",
                      "towerHeight", "aisleWidth", "porticoDepth", "porticoWidth",
                      "length", "width", "height", "span", "numArches", "wingDepth"]:
            if field in building:
                building_output[field] = building[field]
        # Pass through optional metadata fields
        for field in ["images", "references", "notes"]:
            if field in building:
                building_output[field] = building[field]
        output["buildings"].append(building_output)

    # Load individual building files from buildings/ directory
    if BUILDINGS_DIR.exists():
        for building_file in sorted(BUILDINGS_DIR.glob("*.json")):
            try:
                with open(building_file) as f:
                    building = json.load(f)
                print(f"  Loading custom: {building['name']}")
                # Custom buildings have pre-defined entities, pass through directly
                output["buildings"].append(building)
            except Exception as e:
                print(f"  Warning: Could not load {building_file.name}: {e}")

    print(f"Writing: {OUTPUT_FILE}")
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    total_entities = sum(len(b["entities"]) for b in output["buildings"])
    print(f"Done! Generated {total_entities} entities for {len(output['buildings'])} buildings")


if __name__ == "__main__":
    main()
