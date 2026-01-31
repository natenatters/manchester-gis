#!/usr/bin/env python3
"""
Build CZML - Single script to generate Cesium-native CZML from all data sources.

Reads:
  - buildings_1650.json (parametric buildings)
  - buildings/*.json (custom buildings)
  - sites.json (curated GeoJSON)
  - unified_sites.geojson (reference data)
  - layers.json (colors and groups)
  - config.json (map periods from layer yearStart/yearEnd)

Outputs:
  - entities.czml (native Cesium format)

Usage:
    python scripts/build_czml.py
"""

import json
import math
from pathlib import Path
from datetime import datetime

# Project paths
PROJECT_DIR = Path(__file__).parent.parent
DATA_DIR = PROJECT_DIR / "public" / "data" / "projects" / "example"

# Input files
BUILDINGS_1650_FILE = DATA_DIR / "buildings_1650.json"
BUILDINGS_DIR = DATA_DIR / "buildings"
SITES_FILE = DATA_DIR / "sites.json"
UNIFIED_FILE = PROJECT_DIR / "public" / "data" / "unified_sites.geojson"
LAYERS_FILE = DATA_DIR / "layers.json"
CONFIG_FILE = DATA_DIR / "config.json"

# Output
OUTPUT_FILE = DATA_DIR / "entities.czml"

# Map periods - derived from config.json layer yearStart/yearEnd
# These define when buildings get different positions for non-geo-correct maps
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
GEO_CORRECT_PERIODS = {"roman", "medieval", "os_1845", "os_1950s", "modern"}


# =============================================================================
# CZML Utilities
# =============================================================================

def year_to_iso(year):
    """Convert a year integer to ISO8601 date string."""
    return f"{year:04d}-07-01T00:00:00Z"


def availability_interval(start_year, end_year):
    """Create CZML availability interval string."""
    return f"{year_to_iso(start_year)}/{year_to_iso(end_year)}"


def hex_to_rgba(hex_color, alpha=255):
    """Convert hex color (#RRGGBB) to RGBA array [r, g, b, a]."""
    hex_color = hex_color.lstrip('#')
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return [r, g, b, alpha]


def coords_to_cartographic(coords, height=0):
    """Convert [[lon, lat], ...] to flat [lon, lat, h, lon, lat, h, ...]."""
    result = []
    for lon, lat in coords:
        result.extend([lon, lat, height])
    return result


def make_polygon_packet(id, name, coords, height, extruded_height, color_rgba, availability_str, group="curated", properties=None):
    """Create a CZML packet for a polygon entity."""
    packet = {
        "id": id,
        "name": name,
        "availability": availability_str,
        "polygon": {
            "positions": {
                "cartographicDegrees": coords_to_cartographic(coords)
            },
            "height": height,
            "extrudedHeight": extruded_height,
            "heightReference": "RELATIVE_TO_GROUND",
            "extrudedHeightReference": "RELATIVE_TO_GROUND",
            "material": {
                "solidColor": {
                    "color": {"rgba": color_rgba}
                }
            },
            "outline": True,
            "outlineColor": {"rgba": [0, 0, 0, 255]}
        },
        "properties": {
            "group": group
        }
    }
    if properties:
        packet["properties"].update(properties)
    return packet


def make_point_packet(id, name, lon, lat, color_rgba, availability_str, group="curated", properties=None):
    """Create a CZML packet for a point entity."""
    packet = {
        "id": id,
        "name": name,
        "availability": availability_str,
        "position": {
            "cartographicDegrees": [lon, lat, 0]
        },
        "point": {
            "pixelSize": 8,
            "color": {"rgba": color_rgba},
            "outlineColor": {"rgba": [0, 0, 0, 255]},
            "outlineWidth": 1,
            "heightReference": "CLAMP_TO_GROUND",
            "disableDepthTestDistance": 1e10
        },
        "properties": {
            "group": group
        }
    }
    if properties:
        packet["properties"].update(properties)
    return packet


def make_polyline_packet(id, name, coords, color_rgba, availability_str, group="curated", properties=None):
    """Create a CZML packet for a polyline entity."""
    packet = {
        "id": id,
        "name": name,
        "availability": availability_str,
        "polyline": {
            "positions": {
                "cartographicDegrees": coords_to_cartographic(coords)
            },
            "width": 4,
            "material": {
                "solidColor": {
                    "color": {"rgba": color_rgba}
                }
            },
            "clampToGround": True
        },
        "properties": {
            "group": group
        }
    }
    if properties:
        packet["properties"].update(properties)
    return packet


# =============================================================================
# Geometry Utilities (from generate_historic_buildings.py)
# =============================================================================

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
        return [[lng + delta_lng, lat + delta_lat] for lng, lat in coords]

    radians = math.radians(delta_rotation)
    cos_r = math.cos(radians)
    sin_r = math.sin(radians)

    result = []
    for lng, lat in coords:
        rel_lng = lng - original_center[0]
        rel_lat = lat - original_center[1]
        rel_lng *= scale
        rel_lat *= scale
        rot_lng = rel_lng * cos_r - rel_lat * sin_r
        rot_lat = rel_lng * sin_r + rel_lat * cos_r
        result.append([target_center[0] + rot_lng, target_center[1] + rot_lat])

    return result


# =============================================================================
# Building Generators (from generate_historic_buildings.py)
# =============================================================================

def generate_simple_building(building):
    """Generate a simple rectangular building."""
    cx, cy = building["center"]
    hL = building["length"] / 2
    hW = building["width"] / 2
    height = building["height"]
    rotation = building.get("rotation", 0)

    entities = []
    walls = [[-hL, -hW], [hL, -hW], [hL, hW], [-hL, hW]]
    entities.append({
        "id": f"{building['id']}_walls",
        "name": f"{building['name']}",
        "type": "polygon",
        "coords": offsets_to_coords(cx, cy, walls, rotation),
        "height": 0,
        "extrudedHeight": height,
        "material": "wall"
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
    """Generate a neoclassical church."""
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
    """Generate a simple chapel."""
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
    """Generate a medieval courtyard building."""
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


# =============================================================================
# Period Expansion
# =============================================================================

def get_position_for_period(building, period_id):
    """Get the position for a building in a specific map period."""
    maps = building.get("maps", {})
    default_center = building["center"]
    default_rotation = building.get("rotation", 0)

    if period_id in maps:
        map_data = maps[period_id]
        return {
            "center": map_data.get("center", default_center),
            "rotation": map_data.get("rotation", default_rotation),
            "scale": map_data.get("scale", 1.0)
        }

    if period_id in GEO_CORRECT_PERIODS:
        if "modern" in maps:
            map_data = maps["modern"]
            return {
                "center": map_data.get("center", default_center),
                "rotation": map_data.get("rotation", default_rotation),
                "scale": map_data.get("scale", 1.0)
            }

    return {
        "center": default_center,
        "rotation": default_rotation,
        "scale": 1.0
    }


def expand_building_to_czml(building, base_entities, default_color):
    """Expand a building into CZML packets for each relevant map period."""
    start_year = building.get("startYear", 0)
    end_year = building.get("endYear", 2100)

    packets = []
    original_center = building["center"]
    original_rotation = building.get("rotation", 0)

    for period_id, period in MAP_PERIODS.items():
        period_start = max(start_year, period["start"])
        period_end = min(end_year, period["stop"])

        if period_start > period_end:
            continue

        pos = get_position_for_period(building, period_id)
        avail = availability_interval(period_start, period_end)

        for entity in base_entities:
            transformed_coords = transform_coords(
                entity["coords"],
                original_center,
                pos["center"],
                original_rotation,
                pos["rotation"],
                pos["scale"]
            )

            packet = make_polygon_packet(
                id=f"{entity['id']}__{period_id}",
                name=entity.get("name", ""),
                coords=transformed_coords,
                height=entity.get("height", 0),
                extruded_height=entity.get("extrudedHeight", 0),
                color_rgba=default_color,
                availability_str=avail,
                group="curated"
            )
            packets.append(packet)

    return packets


# =============================================================================
# Data Loaders
# =============================================================================

def load_json(path):
    """Load JSON file, return None if not found."""
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def load_layers_config():
    """Load layer configuration for colors and groups."""
    layers_config = load_json(LAYERS_FILE) or {"groups": {}, "layers": {}}
    groups = layers_config.get("groups", {})
    layer_defs = layers_config.get("layers", {})

    # Build source -> style mapping
    source_to_style = {}
    for layer_key, layer_def in layer_defs.items():
        source = layer_def.get("source")
        if source:
            source_to_style[source] = {
                "color": layer_def.get("color", "#888888"),
                "group": layer_def.get("group", "reference")
            }

    # Get 3D entities color
    entities3d_color = "#CD853F"
    for layer_def in layer_defs.values():
        if layer_def.get("type") == "entities3d":
            entities3d_color = layer_def.get("color", entities3d_color)
            break

    return {
        "groups": groups,
        "source_to_style": source_to_style,
        "entities3d_color": entities3d_color
    }


def process_buildings(buildings_data, custom_buildings, default_color_hex):
    """Process all buildings and return CZML packets."""
    packets = []
    default_color = hex_to_rgba(default_color_hex)

    # Process parametric buildings from buildings_1650.json
    if buildings_data:
        for building in buildings_data.get("buildings", []):
            print(f"  Building: {building['name']}")
            if building.get("type") == "custom":
                base_entities = building["entities"]
            else:
                base_entities = generate_building(building)
            packets.extend(expand_building_to_czml(building, base_entities, default_color))

    # Process custom buildings from buildings/*.json
    for building in custom_buildings:
        print(f"  Custom: {building['name']}")
        if building.get("type") == "custom":
            base_entities = building["entities"]
        else:
            base_entities = generate_building(building)
        packets.extend(expand_building_to_czml(building, base_entities, default_color))

    return packets


def process_geojson_feature(feature, color_hex, group, index):
    """Convert a GeoJSON feature to CZML packet."""
    props = feature.get("properties", {})
    geom = feature.get("geometry", {})
    geom_type = geom.get("type")
    coords = geom.get("coordinates", [])

    start_year = props.get("start_year", 0)
    end_year = props.get("end_year", 2100)
    avail = availability_interval(start_year, end_year)

    name = props.get("name", "Unnamed")
    base_id = f"{props.get('source', 'site')}_{index}"
    color = hex_to_rgba(color_hex)

    if geom_type == "Point":
        return make_point_packet(
            id=base_id,
            name=name,
            lon=coords[0],
            lat=coords[1],
            color_rgba=color,
            availability_str=avail,
            group=group,
            properties=props
        )
    elif geom_type in ("LineString", "MultiLineString"):
        if geom_type == "MultiLineString":
            coords = [c for segment in coords for c in segment]
        return make_polyline_packet(
            id=base_id,
            name=name,
            coords=coords,
            color_rgba=color,
            availability_str=avail,
            group=group,
            properties=props
        )
    elif geom_type == "Polygon":
        return make_polygon_packet(
            id=base_id,
            name=name,
            coords=coords[0],  # Outer ring
            height=0,
            extruded_height=0,
            color_rgba=color,
            availability_str=avail,
            group=group,
            properties=props
        )

    return None


def process_unified_sites(unified_data, source_to_style, start_index):
    """Process unified_sites.geojson into CZML packets."""
    packets = []
    if not unified_data:
        return packets

    features = unified_data.get("features", [])
    for i, feature in enumerate(features):
        props = feature.get("properties", {})
        source = props.get("source", "unknown")
        style = source_to_style.get(source, {"color": "#888888", "group": "reference"})

        packet = process_geojson_feature(feature, style["color"], style["group"], start_index + i)
        if packet:
            packets.append(packet)

    return packets


def process_sites(sites_data, layers_config, start_index):
    """Process sites.json into CZML packets."""
    packets = []
    if not sites_data:
        return packets

    layer_defs = load_json(LAYERS_FILE) or {}
    layer_defs = layer_defs.get("layers", {})

    features = sites_data.get("features", [])
    for i, feature in enumerate(features):
        props = feature.get("properties", {})
        layer_key = props.get("layer", "curated")

        layer_def = layer_defs.get(layer_key, {})
        color = layer_def.get("color", "#888888")
        group = layer_def.get("group", "curated")

        packet = process_geojson_feature(feature, color, group, start_index + i)
        if packet:
            packets.append(packet)

    return packets


# =============================================================================
# Main
# =============================================================================

def main():
    print("Building CZML...")

    # Load configuration
    layers_config = load_layers_config()

    # Initialize CZML document
    czml = [{
        "id": "document",
        "name": "Manchester Historical GIS",
        "version": "1.0",
        "clock": {
            "interval": "0001-01-01T00:00:00Z/2100-12-31T00:00:00Z",
            "currentTime": "1650-07-01T00:00:00Z",
            "multiplier": 1
        }
    }]

    # Load and process buildings
    print("Processing buildings...")
    buildings_data = load_json(BUILDINGS_1650_FILE)
    custom_buildings = []
    if BUILDINGS_DIR.exists():
        for building_file in sorted(BUILDINGS_DIR.glob("*.json")):
            try:
                with open(building_file) as f:
                    custom_buildings.append(json.load(f))
            except Exception as e:
                print(f"  Warning: Could not load {building_file.name}: {e}")

    building_packets = process_buildings(
        buildings_data,
        custom_buildings,
        layers_config["entities3d_color"]
    )
    czml.extend(building_packets)
    print(f"  Added {len(building_packets)} building entities")

    # Load and process unified sites
    print("Processing unified sites...")
    unified_data = load_json(UNIFIED_FILE)
    unified_packets = process_unified_sites(
        unified_data,
        layers_config["source_to_style"],
        len(czml)
    )
    czml.extend(unified_packets)
    print(f"  Added {len(unified_packets)} unified site entities")

    # Load and process curated sites
    print("Processing curated sites...")
    sites_data = load_json(SITES_FILE)
    sites_packets = process_sites(sites_data, layers_config, len(czml))
    czml.extend(sites_packets)
    print(f"  Added {len(sites_packets)} curated site entities")

    # Write output
    print(f"Writing: {OUTPUT_FILE}")
    with open(OUTPUT_FILE, "w") as f:
        json.dump(czml, f, indent=2)

    total_entities = len(czml) - 1  # Exclude document packet
    print(f"Done! {total_entities} total entities in CZML")


if __name__ == "__main__":
    main()
