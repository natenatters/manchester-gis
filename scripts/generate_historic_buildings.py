#!/usr/bin/env python3
"""
Generate Historic Building 3D Geometry

Reads building parameters and generates explicit polygon coordinates.
Expands buildings into separate entities per map period with positions baked in.

Input:  data/projects/example/buildings_1650.json (parameters)
        data/projects/example/buildings/*.json (custom buildings)
Output: data/projects/example/building_entities.json (flattened geometry)

Usage:
    python scripts/generate_historic_buildings.py
"""

import json
import math
from pathlib import Path

# Project paths
PROJECT_DIR = Path(__file__).parent.parent
DATA_DIR = PROJECT_DIR / "public" / "data" / "projects" / "example"
INPUT_FILE = DATA_DIR / "buildings_1650.json"
BUILDINGS_DIR = DATA_DIR / "buildings"
OUTPUT_FILE = DATA_DIR / "building_entities.json"

# Map periods - aligned with config.json imagery layers
# Each building will be expanded into entities for relevant periods
MAP_PERIODS = {
    "roman": {"start": 0, "stop": 410},
    "medieval": {"start": 411, "stop": 1649},
    "berry_1650": {"start": 1650, "stop": 1749},
    "berry_1750": {"start": 1750, "stop": 1844},
    "os_1845": {"start": 1845, "stop": 1889},
    "os_1950s": {"start": 1890, "stop": 1949},
    "modern": {"start": 1950, "stop": 2100},
}

# Which map periods use "modern" (geo-correct) positioning
# Roman/Medieval have no historic maps, so they use modern geo-correct positions
GEO_CORRECT_PERIODS = {"roman", "medieval", "os_1845", "os_1950s", "modern"}


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


def transform_coords(coords, original_center, target_center, original_rotation, target_rotation, scale=1.0):
    """Transform coordinates from original position to target position."""
    delta_lng = target_center[0] - original_center[0]
    delta_lat = target_center[1] - original_center[1]
    delta_rotation = target_rotation - original_rotation

    if delta_rotation == 0 and scale == 1.0:
        # Simple translation
        return [[lng + delta_lng, lat + delta_lat] for lng, lat in coords]

    # Rotation + scale + translation
    radians = math.radians(delta_rotation)
    cos_r = math.cos(radians)
    sin_r = math.sin(radians)

    result = []
    for lng, lat in coords:
        # Translate to origin (relative to original center)
        rel_lng = lng - original_center[0]
        rel_lat = lat - original_center[1]

        # Scale
        rel_lng *= scale
        rel_lat *= scale

        # Rotate
        rot_lng = rel_lng * cos_r - rel_lat * sin_r
        rot_lat = rel_lng * sin_r + rel_lat * cos_r

        # Translate to target
        result.append([
            target_center[0] + rot_lng + delta_lng,
            target_center[1] + rot_lat + delta_lat
        ])

    return result


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

    walls = [[-hL, -hW], [hL, -hW], [hL, hW], [-hL, hW]]
    entities.append({
        "id": f"{building['id']}_walls",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, walls, rotation),
        "height": 0,
        "extrudedHeight": height,
        "material": "wall"
    })

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

    span = building.get("span", 50)
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

    # Piers
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
            "height": -2,
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
    """Generate a neoclassical church (like St Peter's Manchester)."""
    cx, cy = building["center"]
    rotation = building.get("rotation", 0)

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

    # Main body
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

    # Side wings
    wing_hw = wing_width / 2

    north_wing = [[-wing_hw, hW], [wing_hw, hW], [wing_hw, hW + wing_depth], [-wing_hw, hW + wing_depth]]
    entities.append({
        "id": f"{building['id']}_wing_north",
        "name": f"{building['name']} - North Wing",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, north_wing, rotation),
        "height": 0,
        "extrudedHeight": nave_height * 0.8,
        "material": "wall"
    })

    south_wing = [[-wing_hw, -hW - wing_depth], [wing_hw, -hW - wing_depth], [wing_hw, -hW], [-wing_hw, -hW]]
    entities.append({
        "id": f"{building['id']}_wing_south",
        "name": f"{building['name']} - South Wing",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, south_wing, rotation),
        "height": 0,
        "extrudedHeight": nave_height * 0.8,
        "material": "wall"
    })

    # Tower
    ts = tower_size / 2
    tower = [[-hL, -ts], [-hL + tower_size, -ts], [-hL + tower_size, ts], [-hL, ts]]
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

    outer_length = building.get("length", 40)
    outer_width = building.get("width", 35)
    wing_depth = building.get("wingDepth", 8)
    height = building.get("height", 10)

    entities = []
    hL = outer_length / 2
    hW = outer_width / 2
    wd = wing_depth

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


def get_position_for_period(building, period_id):
    """Get the position (center, rotation, scale) for a building in a specific map period."""
    maps = building.get("maps", {})
    default_center = building["center"]
    default_rotation = building.get("rotation", 0)

    # Check if there's a specific position for this period
    if period_id in maps:
        map_data = maps[period_id]
        return {
            "center": map_data.get("center", default_center),
            "rotation": map_data.get("rotation", default_rotation),
            "scale": map_data.get("scale", 1.0)
        }

    # For geo-correct periods without explicit override, use default (modern) position
    if period_id in GEO_CORRECT_PERIODS:
        # Check if there's a "modern" override
        if "modern" in maps:
            map_data = maps["modern"]
            return {
                "center": map_data.get("center", default_center),
                "rotation": map_data.get("rotation", default_rotation),
                "scale": map_data.get("scale", 1.0)
            }

    # Default position
    return {
        "center": default_center,
        "rotation": default_rotation,
        "scale": 1.0
    }


def expand_building_to_periods(building, base_entities):
    """Expand a building into entities for each relevant map period."""
    start_year = building.get("startYear", 0)
    end_year = building.get("endYear", 2100)
    has_maps = "maps" in building

    expanded = []
    original_center = building["center"]
    original_rotation = building.get("rotation", 0)

    for period_id, period in MAP_PERIODS.items():
        # Check if building exists during this period
        period_start = max(start_year, period["start"])
        period_end = min(end_year, period["stop"])

        if period_start > period_end:
            continue  # Building doesn't exist in this period

        # Get position for this period
        pos = get_position_for_period(building, period_id)

        # Transform entities to this position
        for entity in base_entities:
            transformed = {
                "id": f"{entity['id']}__{period_id}",
                "name": entity.get("name", ""),
                "type": entity["type"],
                "height": entity.get("height", 0),
                "extrudedHeight": entity.get("extrudedHeight", 0),
                "material": entity.get("material", "wall"),
                "availability": {
                    "start": period_start,
                    "stop": period_end
                }
            }

            # Transform coordinates
            if "coords" in entity:
                transformed["coords"] = transform_coords(
                    entity["coords"],
                    original_center,
                    pos["center"],
                    original_rotation,
                    pos["rotation"],
                    pos["scale"]
                )
            if "outer" in entity:
                transformed["outer"] = transform_coords(
                    entity["outer"],
                    original_center,
                    pos["center"],
                    original_rotation,
                    pos["rotation"],
                    pos["scale"]
                )
            if "inner" in entity:
                transformed["inner"] = transform_coords(
                    entity["inner"],
                    original_center,
                    pos["center"],
                    original_rotation,
                    pos["rotation"],
                    pos["scale"]
                )
            if "position" in entity:
                transformed["position"] = transform_coords(
                    [entity["position"]],
                    original_center,
                    pos["center"],
                    original_rotation,
                    pos["rotation"],
                    pos["scale"]
                )[0]

            expanded.append(transformed)

    return expanded


def process_building(building, materials):
    """Process a building and return flattened entities."""
    # Generate or use existing entities
    if building.get("type") == "custom":
        # Custom building with pre-defined entities
        base_entities = building["entities"]
    else:
        # Generate entities from parameters
        base_entities = generate_building(building)

    # Expand to map periods
    return expand_building_to_periods(building, base_entities)


def main():
    print(f"Reading: {INPUT_FILE}")
    with open(INPUT_FILE) as f:
        data = json.load(f)

    materials = data.get("materials", {})
    all_entities = []

    # Process buildings from main file
    for building in data["buildings"]:
        print(f"  Processing: {building['name']}")
        entities = process_building(building, materials)
        all_entities.extend(entities)

    # Load individual building files from buildings/ directory
    if BUILDINGS_DIR.exists():
        for building_file in sorted(BUILDINGS_DIR.glob("*.json")):
            try:
                with open(building_file) as f:
                    building = json.load(f)
                print(f"  Processing custom: {building['name']}")
                entities = process_building(building, materials)
                all_entities.extend(entities)
            except Exception as e:
                print(f"  Warning: Could not load {building_file.name}: {e}")

    output = {
        "description": "Flattened building entities with availability for Cesium clock",
        "generator": "scripts/generate_historic_buildings.py",
        "materials": materials,
        "entities": all_entities
    }

    print(f"Writing: {OUTPUT_FILE}")
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Done! Generated {len(all_entities)} entities from {len(data['buildings'])} buildings")


if __name__ == "__main__":
    main()
