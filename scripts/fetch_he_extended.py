#!/usr/bin/env python3
"""
Fetch additional Historic England datasets from their ArcGIS REST services.

This fetches datasets beyond the main NHLE (Listed Buildings, Monuments, Parks):
- Heritage at Risk Register
- Registered Battlefields
- World Heritage Sites
- Conservation Areas

Usage:
    python scripts/fetch_he_extended.py           # Fetch all
    python scripts/fetch_he_extended.py --dry-run # Show what would be fetched
    python scripts/fetch_he_extended.py --layer heritage_at_risk
"""

import argparse
import json
import requests
import sys
import time
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List

PROJECT_ROOT = Path(__file__).parent.parent
SOURCES_DIR = PROJECT_ROOT / "data" / "sources"

# ArcGIS services base URL
ARCGIS_BASE = "https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services"

# Layer configuration - each dataset has its own service
LAYERS = {
    "heritage_at_risk": {
        "service": "HAR_2025_OTHR_WGS84_Point",
        "layer_id": 0,
        "name": "Heritage at Risk Register 2025",
        "description": "Buildings, monuments, and areas at risk",
        "output_file": "he_heritage_at_risk.json"
    },
    "battlefields": {
        "service": "Battlefields_",
        "layer_id": 0,
        "name": "Registered Battlefields",
        "description": "Nationally important historic battlefields",
        "output_file": "he_battlefields.json"
    },
    "world_heritage_sites": {
        "service": "World_Heritage_Sites_Points",
        "layer_id": 0,
        "name": "World Heritage Sites",
        "description": "UNESCO World Heritage Sites in England",
        "output_file": "he_world_heritage.json"
    },
    "conservation_areas": {
        "service": "Conservation_Areas",
        "layer_id": 0,
        "name": "Conservation Areas",
        "description": "Areas of special architectural or historic interest",
        "output_file": "he_conservation_areas.json"
    },
}

# Greater Manchester bounding boxes
GM_BBOX_WGS84 = "-2.75,53.35,-1.90,53.70"  # For services already in WGS84
GM_BBOX_BNG = "351000,389000,406000,421000"  # For services in British National Grid

PAGE_SIZE = 1000
REQUEST_DELAY = 0.5


def get_service_url(service_name: str, layer_id: int) -> str:
    """Build the query URL for a service."""
    return f"{ARCGIS_BASE}/{service_name}/FeatureServer/{layer_id}/query"


def detect_spatial_reference(service_name: str, layer_id: int) -> str:
    """Detect the spatial reference of a service to use correct bbox."""
    url = f"{ARCGIS_BASE}/{service_name}/FeatureServer/{layer_id}"
    params = {"f": "json"}

    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        extent = data.get("extent", {})
        sr = extent.get("spatialReference", {})
        wkid = sr.get("wkid") or sr.get("latestWkid")

        if wkid == 4326:
            return "wgs84"
        elif wkid == 27700:
            return "bng"
        else:
            # Default to WGS84 bbox and let API transform
            return "wgs84"
    except Exception:
        return "wgs84"


def get_layer_count(service_name: str, layer_id: int, bbox: str, in_sr: str) -> int:
    """Get total feature count for a layer within the bounding box."""
    url = get_service_url(service_name, layer_id)
    params = {
        "where": "1=1",
        "geometry": bbox,
        "geometryType": "esriGeometryEnvelope",
        "inSR": in_sr,
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


def fetch_layer_page(service_name: str, layer_id: int, bbox: str, in_sr: str, offset: int) -> dict:
    """Fetch a single page of features."""
    url = get_service_url(service_name, layer_id)
    params = {
        "where": "1=1",
        "outFields": "*",
        "f": "geojson",
        "geometry": bbox,
        "geometryType": "esriGeometryEnvelope",
        "inSR": in_sr,
        "outSR": "4326",  # Always output as WGS84
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


def fetch_all_records(service_name: str, layer_id: int, dry_run: bool = False) -> dict:
    """Fetch all features for a service with pagination."""
    # Detect spatial reference
    sr_type = detect_spatial_reference(service_name, layer_id)
    if sr_type == "bng":
        bbox = GM_BBOX_BNG
        in_sr = "27700"
    else:
        bbox = GM_BBOX_WGS84
        in_sr = "4326"

    print(f"  Spatial ref: {sr_type.upper()}, using bbox: {bbox}")

    # Get count
    print("  Querying count...", end=" ", flush=True)
    try:
        total_count = get_layer_count(service_name, layer_id, bbox, in_sr)
    except Exception as e:
        # Some services don't support count queries - just try fetching
        print(f"count failed ({e}), will fetch directly")
        total_count = 10000  # Assume max
    else:
        print(f"{total_count} features")

    if dry_run:
        return {"type": "FeatureCollection", "features": [], "_dry_run": True, "_count": total_count}

    if total_count == 0:
        return {"type": "FeatureCollection", "features": []}

    # Fetch all pages
    all_features = []
    offset = 0
    page_num = 1

    while True:
        print(f"  Fetching page {page_num} (offset {offset})...", end=" ", flush=True)

        try:
            data = fetch_layer_page(service_name, layer_id, bbox, in_sr, offset)
            features = data.get("features", [])
            all_features.extend(features)
            print(f"got {len(features)} features")

            # If we got fewer than PAGE_SIZE, we've reached the end
            if len(features) < PAGE_SIZE:
                break

            offset += PAGE_SIZE
            page_num += 1
            time.sleep(REQUEST_DELAY)

        except Exception as e:
            print(f"ERROR: {e}")
            if offset == 0:
                # First page failed - service might not support this query
                break
            # Otherwise, we got some data, stop here
            break

    print(f"  Total: {len(all_features)} features")

    return {
        "type": "FeatureCollection",
        "features": all_features
    }


def save_layer(data: dict, config: dict) -> Optional[Path]:
    """Save layer data with metadata."""
    if data.get("_dry_run"):
        return None

    if not data.get("features"):
        print("  No features to save")
        return None

    data["_fetch_metadata"] = {
        "fetched_at": datetime.now().isoformat(),
        "source": "Historic England ArcGIS",
        "service": config["service"],
        "layer_name": config["name"],
        "region": "Greater Manchester",
        "feature_count": len(data.get("features", []))
    }

    output_path = SOURCES_DIR / config["output_file"]

    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)

    size_kb = output_path.stat().st_size / 1024
    print(f"  Saved: {output_path.name} ({size_kb:.1f} KB)")

    return output_path


def main():
    parser = argparse.ArgumentParser(description="Fetch extended Historic England datasets")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be fetched")
    parser.add_argument("--layer", action="append", choices=list(LAYERS.keys()),
                        help="Specific layer(s) to fetch (default: all)")
    args = parser.parse_args()

    layers_to_fetch = args.layer if args.layer else list(LAYERS.keys())

    print("Historic England Extended Data Fetcher")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"Layers: {', '.join(layers_to_fetch)}")
    if args.dry_run:
        print("Mode: DRY RUN")
    print()

    SOURCES_DIR.mkdir(parents=True, exist_ok=True)

    results = {}
    for layer_key in layers_to_fetch:
        config = LAYERS[layer_key]
        print(f"\n{'='*60}")
        print(f"Layer: {config['name']}")
        print(f"Service: {config['service']}")
        print(f"{'='*60}")

        try:
            data = fetch_all_records(config["service"], config["layer_id"], dry_run=args.dry_run)
            output_path = save_layer(data, config)
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
        print(f"  {layer_key}: {status} ({count} features)")

    print(f"\nTotal features: {total_features}")

    if not args.dry_run and total_features > 0:
        print("\nNext: Update consolidate_data.py and run consolidation")


if __name__ == "__main__":
    main()
