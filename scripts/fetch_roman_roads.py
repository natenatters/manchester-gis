#!/usr/bin/env python3
"""
Fetch Roman Roads data for Greater Manchester from the Itiner-e dataset.

Source: Itiner-e - A high-resolution dataset of roads of the Roman Empire
URL: https://zenodo.org/records/17122148
License: CC-BY 4.0

Roman roads date from ~43 AD (Roman invasion) to ~410 AD (Roman withdrawal).
Mamucium (Manchester) was a Roman fort established around 79 AD.
"""

import json
import math
from pathlib import Path
from urllib.request import urlretrieve
from typing import List, Dict, Tuple

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
CACHE_DIR = PROJECT_ROOT / "data" / "cache"
OUTPUT_DIR = PROJECT_ROOT / "data" / "sources"

DOWNLOAD_URL = "https://zenodo.org/records/17122148/files/itinere_roads.geojson?download=1"
CACHE_FILE = CACHE_DIR / "itinere_roads.geojson"
OUTPUT_FILE = OUTPUT_DIR / "roman_roads.json"

# Greater Manchester bounding box (WGS84)
GM_BBOX = {
    "lon_min": -2.75,
    "lon_max": -1.90,
    "lat_min": 53.35,
    "lat_max": 53.70,
}


def mercator_to_wgs84(x: float, y: float) -> Tuple[float, float]:
    """Convert EPSG:3395 (World Mercator) to WGS84."""
    a = 6378137.0  # Semi-major axis
    f = 1/298.257223563  # Inverse flattening
    e = math.sqrt(2*f - f*f)  # Eccentricity

    lon = math.degrees(x / a)

    # Iterative calculation for latitude
    t = math.exp(-y / a)
    lat = math.pi/2 - 2*math.atan(t)
    for _ in range(10):
        phi = lat
        sin_phi = math.sin(phi)
        lat = math.pi/2 - 2*math.atan(t * ((1 - e*sin_phi)/(1 + e*sin_phi))**(e/2))
        if abs(lat - phi) < 1e-12:
            break

    return (lon, math.degrees(lat))


def point_in_bbox(x: float, y: float) -> bool:
    """Check if a point (in EPSG:3395) falls within GM bounding box."""
    lon, lat = mercator_to_wgs84(x, y)
    return (GM_BBOX["lon_min"] <= lon <= GM_BBOX["lon_max"] and
            GM_BBOX["lat_min"] <= lat <= GM_BBOX["lat_max"])


def line_in_bbox(coords: List) -> bool:
    """Check if any point of a line falls within the bounding box."""
    for coord in coords:
        if point_in_bbox(coord[0], coord[1]):
            return True
    return False


def convert_line_coords(coords: List) -> List[Tuple[float, float]]:
    """Convert line coordinates from EPSG:3395 to WGS84."""
    return [mercator_to_wgs84(c[0], c[1]) for c in coords]


def download_data():
    """Download Itiner-e dataset if not cached."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    if CACHE_FILE.exists():
        print(f"Using cached file: {CACHE_FILE}")
        return

    print(f"Downloading Itiner-e Roman roads data (74MB)...")
    urlretrieve(DOWNLOAD_URL, CACHE_FILE)
    print(f"Downloaded to: {CACHE_FILE}")


def extract_and_filter() -> List[Dict]:
    """Extract and filter roads for Greater Manchester."""
    print("Loading Itiner-e data...")
    with open(CACHE_FILE) as f:
        data = json.load(f)

    print(f"Total roads in dataset: {len(data['features'])}")

    features = []
    seen_names = set()  # Track unique road names for summary

    for f in data["features"]:
        props = f["properties"]
        geom = f["geometry"]

        # Check if road passes through GM
        in_gm = False
        if geom["type"] == "LineString":
            if line_in_bbox(geom["coordinates"]):
                in_gm = True
        elif geom["type"] == "MultiLineString":
            for line in geom["coordinates"]:
                if line_in_bbox(line):
                    in_gm = True
                    break

        if not in_gm:
            continue

        # Convert coordinates to WGS84
        if geom["type"] == "LineString":
            new_coords = convert_line_coords(geom["coordinates"])
            new_geom = {"type": "LineString", "coordinates": new_coords}
        else:  # MultiLineString
            new_coords = [convert_line_coords(line) for line in geom["coordinates"]]
            new_geom = {"type": "MultiLineString", "coordinates": new_coords}

        name = props.get("Name") or "Roman Road"
        seen_names.add(name)

        features.append({
            "type": "Feature",
            "geometry": new_geom,
            "properties": {
                "name": name,
                "route_type": props.get("Route_Type"),
                "road_type": props.get("Type"),
                "lower_date": props.get("Lower_Date"),
                "upper_date": props.get("Upper_Date"),
                "description": props.get("Descriptio"),
                "certainty": props.get("Cons_per_e"),
                "itinerary": props.get("Itinerary"),
                "length_m": props.get("Shape_Leng"),
            }
        })

    print(f"Roads in Greater Manchester: {len(features)}")
    print(f"Unique road names: {len(seen_names)}")

    return features


def main():
    """Main entry point."""
    print("=" * 60)
    print("Roman Roads - Greater Manchester (Itiner-e Dataset)")
    print("=" * 60)

    download_data()
    features = extract_and_filter()

    output = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "Itiner-e - Roman Empire Roads Dataset",
            "source_url": "https://zenodo.org/records/17122148",
            "license": "CC-BY 4.0",
            "description": "Roman roads in Britain, ~43 AD - 410 AD. Mamucium (Manchester) was founded ~79 AD.",
            "feature_count": len(features),
        },
        "features": features
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved {len(features)} road segments to {OUTPUT_FILE}")

    if features:
        # Show unique road names
        names = sorted(set(f["properties"]["name"] for f in features))
        print("\nRoads found:")
        for name in names:
            print(f"  - {name}")


if __name__ == "__main__":
    main()
