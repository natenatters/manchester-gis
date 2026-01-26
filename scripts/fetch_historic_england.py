#!/usr/bin/env python3
"""
Fetch Historic England data from their ArcGIS REST API.

Downloads heritage data for Greater Manchester and saves to data/sources/.
Run this infrequently to refresh the local data cache.

Usage:
    python scripts/fetch_historic_england.py           # Fetch all layers
    python scripts/fetch_historic_england.py --dry-run # Show what would be fetched
    python scripts/fetch_historic_england.py --layer listed_buildings  # Fetch one layer
"""

import argparse
import json
import requests
import sys
import time
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).parent.parent
SOURCES_DIR = PROJECT_ROOT / "data" / "sources"

# National Heritage List for England (NHLE) API
NHLE_BASE = "https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer"

# Layer configuration
LAYERS = {
    "listed_buildings": {
        "id": 0,
        "name": "Listed Building points",
        "description": "Grade I, II*, and II listed buildings"
    },
    "scheduled_monuments": {
        "id": 6,
        "name": "Scheduled Monuments",
        "description": "Nationally important archaeological sites"
    },
    "parks_gardens": {
        "id": 7,
        "name": "Parks and Gardens",
        "description": "Registered historic parks and gardens"
    },
}

# Greater Manchester bounding box in British National Grid (EPSG:27700)
# Covers: Bolton, Bury, Manchester, Oldham, Rochdale, Salford, Stockport, Tameside, Trafford, Wigan
# Converted from WGS84: SW 53.35,-2.75 NE 53.70,-1.90
GM_BBOX_BNG = "351000,389000,406000,421000"

# Pagination settings
PAGE_SIZE = 1000  # Max records per request (API limit)
REQUEST_DELAY = 0.5  # Seconds between requests (be nice to the server)


def get_layer_count(layer_id: int) -> int:
    """Get total feature count for a layer within the bounding box."""
    url = f"{NHLE_BASE}/{layer_id}/query"
    params = {
        "where": "1=1",
        "geometry": GM_BBOX_BNG,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "27700",
        "spatialRel": "esriSpatialRelIntersects",
        "returnCountOnly": "true",
        "f": "json"
    }

    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()

    if "error" in data:
        raise Exception(f"API error: {data['error']}")

    return data.get("count", 0)


def fetch_layer_page(layer_id: int, offset: int) -> dict:
    """Fetch a single page of features from a layer."""
    url = f"{NHLE_BASE}/{layer_id}/query"
    params = {
        "where": "1=1",
        "outFields": "*",
        "f": "geojson",
        "geometry": GM_BBOX_BNG,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "27700",
        "outSR": "4326",  # Output as WGS84 for web mapping
        "spatialRel": "esriSpatialRelIntersects",
        "resultOffset": offset,
        "resultRecordCount": PAGE_SIZE
    }

    response = requests.get(url, params=params, timeout=60)
    response.raise_for_status()
    data = response.json()

    if "error" in data:
        raise Exception(f"API error: {data['error']}")

    return data


def fetch_layer(layer_key: str, layer_config: dict, dry_run: bool = False) -> dict:
    """
    Fetch all features for a layer with pagination.

    Returns a GeoJSON FeatureCollection with all features.
    """
    layer_id = layer_config["id"]
    layer_name = layer_config["name"]

    print(f"\n{'='*60}")
    print(f"Layer: {layer_name}")
    print(f"{'='*60}")

    # Get total count first
    print("Querying feature count...", end=" ", flush=True)
    total_count = get_layer_count(layer_id)
    print(f"{total_count:,} features in Greater Manchester")

    if dry_run:
        pages_needed = (total_count + PAGE_SIZE - 1) // PAGE_SIZE
        print(f"Would fetch {pages_needed} page(s) of {PAGE_SIZE} records each")
        return {"type": "FeatureCollection", "features": [], "_dry_run": True, "_count": total_count}

    if total_count == 0:
        print("No features to fetch")
        return {"type": "FeatureCollection", "features": []}

    # Fetch all pages
    all_features = []
    offset = 0
    page_num = 1
    total_pages = (total_count + PAGE_SIZE - 1) // PAGE_SIZE

    while offset < total_count:
        print(f"  Fetching page {page_num}/{total_pages} (offset {offset:,})...", end=" ", flush=True)

        try:
            data = fetch_layer_page(layer_id, offset)
            features = data.get("features", [])
            all_features.extend(features)
            print(f"got {len(features)} features")

            # If we got fewer than PAGE_SIZE, we've reached the end
            if len(features) < PAGE_SIZE:
                break

            offset += PAGE_SIZE
            page_num += 1

            # Be nice to the server
            if offset < total_count:
                time.sleep(REQUEST_DELAY)

        except Exception as e:
            print(f"ERROR: {e}")
            print(f"  Retrying in 5 seconds...")
            time.sleep(5)
            continue

    print(f"  Total fetched: {len(all_features):,} features")

    # Sanity check
    if len(all_features) != total_count:
        print(f"  WARNING: Expected {total_count}, got {len(all_features)}")

    return {
        "type": "FeatureCollection",
        "features": all_features
    }


def save_layer(layer_key: str, data: dict, layer_config: dict) -> Path:
    """Save layer data with metadata."""
    if data.get("_dry_run"):
        return None

    timestamp = datetime.now().isoformat()

    # Add fetch metadata
    data["_fetch_metadata"] = {
        "fetched_at": timestamp,
        "source": "Historic England NHLE API",
        "source_url": NHLE_BASE,
        "layer_id": layer_config["id"],
        "layer_name": layer_config["name"],
        "bbox_bng": GM_BBOX_BNG,
        "region": "Greater Manchester",
        "feature_count": len(data.get("features", []))
    }

    filename = f"he_{layer_key}.json"
    output_path = SOURCES_DIR / filename

    with open(output_path, "w") as f:
        json.dump(data, f)  # No indent to save space - these files are large

    # Report file size
    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"  Saved: {output_path.name} ({size_mb:.1f} MB)")

    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Fetch Historic England data for Greater Manchester",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                          # Fetch all layers
  %(prog)s --dry-run                # Show counts without downloading
  %(prog)s --layer listed_buildings # Fetch only listed buildings
  %(prog)s --layer scheduled_monuments --layer parks_gardens
        """
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be fetched without downloading"
    )
    parser.add_argument(
        "--layer",
        action="append",
        choices=list(LAYERS.keys()),
        help="Specific layer(s) to fetch (default: all)"
    )
    args = parser.parse_args()

    # Determine which layers to fetch
    layers_to_fetch = args.layer if args.layer else list(LAYERS.keys())

    print("Historic England Data Fetcher")
    print("=" * 60)
    print(f"Region: Greater Manchester")
    print(f"Bounding box (BNG): {GM_BBOX_BNG}")
    print(f"API: {NHLE_BASE}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"Layers: {', '.join(layers_to_fetch)}")
    if args.dry_run:
        print("Mode: DRY RUN (no downloads)")

    # Ensure output directory exists
    SOURCES_DIR.mkdir(parents=True, exist_ok=True)

    # Fetch each layer
    results = {}
    for layer_key in layers_to_fetch:
        config = LAYERS[layer_key]
        try:
            data = fetch_layer(layer_key, config, dry_run=args.dry_run)
            output_path = save_layer(layer_key, data, config)
            results[layer_key] = {
                "success": True,
                "count": len(data.get("features", [])) or data.get("_count", 0),
                "path": str(output_path) if output_path else None
            }
        except Exception as e:
            print(f"  ERROR: {e}")
            results[layer_key] = {"success": False, "error": str(e)}

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    total_features = 0
    for layer_key, result in results.items():
        status = "OK" if result["success"] else "FAILED"
        count = result.get("count", 0)
        total_features += count
        print(f"  {layer_key}: {status} ({count:,} features)")

    print(f"\nTotal features: {total_features:,}")

    if not args.dry_run:
        print(f"\nNext step: Run 'python scripts/consolidate_data.py' to merge the data")

    # Exit with error if any layer failed
    if any(not r["success"] for r in results.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
