#!/usr/bin/env python3
"""
Consolidate all entity data into a single entities.json file.

Reads:
  - building_entities.json (3D buildings, already flattened by generate_historic_buildings.py)
  - unified_sites.geojson (reference data from various sources)
  - sites.json (curated project data)
  - layers.json (group definitions and color mappings)

Outputs:
  - entities.json (everything ready for frontend)

Usage:
    python scripts/consolidate_entities.py
"""

import json
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
DATA_DIR = PROJECT_DIR / "public" / "data" / "projects" / "example"

# Input files
BUILDINGS_FILE = DATA_DIR / "building_entities.json"
UNIFIED_FILE = PROJECT_DIR / "public" / "data" / "unified_sites.geojson"
SITES_FILE = DATA_DIR / "sites.json"
LAYERS_FILE = DATA_DIR / "layers.json"

# Output
OUTPUT_FILE = DATA_DIR / "entities.json"


def load_json(path):
    """Load JSON file, return None if not found."""
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def convert_geojson_feature(feature, color, group, index):
    """Convert a GeoJSON feature to our entity format."""
    props = feature.get("properties", {})
    geom = feature.get("geometry", {})
    geom_type = geom.get("type")
    coords = geom.get("coordinates", [])

    # Build availability from year range
    start_year = props.get("start_year")
    end_year = props.get("end_year")
    availability = None
    if start_year is not None or end_year is not None:
        availability = {
            "start": start_year or 0,
            "stop": end_year or 2100
        }

    # Create unique ID using index
    base_id = f"{props.get('source', 'site')}_{index}"

    # Convert geometry type
    if geom_type == "Point":
        return {
            "id": base_id,
            "name": props.get("name", "Unnamed"),
            "type": "point",
            "coords": coords,
            "color": color,
            "group": group,
            "availability": availability,
            "properties": props
        }
    elif geom_type in ("LineString", "MultiLineString"):
        # Flatten MultiLineString
        if geom_type == "MultiLineString":
            coords = [c for segment in coords for c in segment]
        return {
            "id": base_id,
            "name": props.get("name", "Unnamed"),
            "type": "polyline",
            "coords": coords,
            "color": color,
            "group": group,
            "availability": availability,
            "properties": props
        }
    elif geom_type == "Polygon":
        return {
            "id": base_id,
            "name": props.get("name", "Unnamed"),
            "type": "polygon",
            "coords": coords[0],  # Outer ring
            "color": color,
            "group": group,
            "availability": availability,
            "properties": props
        }

    return None


def main():
    print("Consolidating entities...")

    # Load layer config for colors and group mappings
    layers_config = load_json(LAYERS_FILE) or {"groups": {}, "layers": {}}
    groups = layers_config.get("groups", {})
    layer_defs = layers_config.get("layers", {})

    # Build source -> (color, group) mapping
    source_to_style = {}
    for layer_key, layer_def in layer_defs.items():
        source = layer_def.get("source")
        if source:
            source_to_style[source] = {
                "color": layer_def.get("color", "#888888"),
                "group": layer_def.get("group", "reference")
            }

    all_entities = []

    # 1. Load 3D building entities (already flattened)
    buildings = load_json(BUILDINGS_FILE)
    if buildings:
        building_entities = buildings.get("entities", [])

        # Find the entities3d layer for color
        entities3d_color = "#C9B896"  # Default
        entities3d_group = "curated"
        for layer_def in layer_defs.values():
            if layer_def.get("type") == "entities3d":
                entities3d_color = layer_def.get("color", entities3d_color)
                entities3d_group = layer_def.get("group", entities3d_group)
                break

        for entity in building_entities:
            # Add color and group to building entities
            entity["color"] = entities3d_color
            entity["group"] = entities3d_group
            all_entities.append(entity)

        print(f"  Added {len(building_entities)} building entities")

    # 2. Load unified_sites.geojson (reference data)
    unified = load_json(UNIFIED_FILE)
    if unified:
        features = unified.get("features", [])
        count = 0
        for i, feature in enumerate(features):
            props = feature.get("properties", {})
            source = props.get("source", "unknown")

            style = source_to_style.get(source, {"color": "#888888", "group": "reference"})
            entity = convert_geojson_feature(feature, style["color"], style["group"], len(all_entities) + i)

            if entity:
                all_entities.append(entity)
                count += 1

        print(f"  Added {count} unified site entities")

    # 3. Load sites.json (curated project data)
    sites = load_json(SITES_FILE)
    if sites:
        features = sites.get("features", [])
        count = 0
        for i, feature in enumerate(features):
            props = feature.get("properties", {})
            layer_key = props.get("layer", "curated")

            layer_def = layer_defs.get(layer_key, {})
            color = layer_def.get("color", "#888888")
            group = layer_def.get("group", "curated")

            entity = convert_geojson_feature(feature, color, group, len(all_entities) + i)

            if entity:
                all_entities.append(entity)
                count += 1

        print(f"  Added {count} curated site entities")

    # Build output
    output = {
        "description": "Consolidated entities for Manchester Historical GIS",
        "generator": "scripts/consolidate_entities.py",
        "groups": groups,
        "entities": all_entities
    }

    print(f"Writing: {OUTPUT_FILE}")
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Done! {len(all_entities)} total entities")


if __name__ == "__main__":
    main()
