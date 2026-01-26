#!/usr/bin/env python3
"""
Fetch buildings with start_date from OpenStreetMap via Overpass API.

Queries in chunks to avoid timeouts.

Usage:
    python scripts/fetch_osm.py
    python scripts/fetch_osm.py --dry-run
"""

import argparse
import json
import requests
import time
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).parent.parent
SOURCES_DIR = PROJECT_ROOT / "data" / "sources"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Greater Manchester bounding box split into chunks to avoid timeouts
# Format: (south, west, north, east)
GM_CHUNKS = [
    # Manchester & Salford core
    (53.45, -2.35, 53.52, -2.20),
    # North Manchester
    (53.52, -2.35, 53.58, -2.20),
    # East (Oldham/Tameside)
    (53.45, -2.20, 53.55, -2.00),
    # South (Stockport/Trafford)
    (53.35, -2.35, 53.45, -2.10),
    # West (Salford/Wigan)
    (53.45, -2.55, 53.55, -2.35),
    # Bolton/Bury
    (53.55, -2.55, 53.65, -2.30),
    # Rochdale
    (53.55, -2.30, 53.65, -2.05),
    # Far south (Stockport)
    (53.35, -2.20, 53.45, -1.95),
]

REQUEST_DELAY = 5  # Seconds between requests (Overpass prefers longer delays)


def query_chunk_raw(bbox: tuple, retries: int = 3) -> tuple:
    """Query a single bounding box chunk. Returns (elements, success)."""
    south, west, north, east = bbox

    query = f"""
    [out:json][timeout:90];
    (
      way["building"]["start_date"]({south},{west},{north},{east});
      node["historic"]["start_date"]({south},{west},{north},{east});
      way["historic"]["start_date"]({south},{west},{north},{east});
    );
    out center;
    """

    for attempt in range(retries):
        try:
            response = requests.post(
                OVERPASS_URL,
                data={"data": query},
                timeout=120
            )

            if response.status_code == 429:
                print("rate limited, waiting 60s...")
                time.sleep(60)
                continue  # Retry

            if response.status_code in (504, 503):
                return [], False  # Timeout/overload - can retry with smaller chunks

            if response.status_code != 200:
                print(f"HTTP {response.status_code}")
                return [], True  # Other error - don't retry

            data = response.json()
            return data.get("elements", []), True

        except requests.exceptions.Timeout:
            return [], False  # Timeout - can retry with smaller chunks
        except requests.exceptions.ConnectionError:
            if attempt < retries - 1:
                print(f"connection error, retry {attempt + 2}/{retries}...", end=" ", flush=True)
                time.sleep(10)
                continue
            return [], False  # Connection failed - try splitting
        except Exception as e:
            print(f"error: {e}")
            return [], True  # Other error - don't retry

    return [], False  # Exhausted retries


def split_bbox(bbox: tuple) -> list:
    """Split a bounding box into 4 quadrants."""
    south, west, north, east = bbox
    mid_lat = (south + north) / 2
    mid_lon = (west + east) / 2
    return [
        (south, west, mid_lat, mid_lon),      # SW
        (south, mid_lon, mid_lat, east),      # SE
        (mid_lat, west, north, mid_lon),      # NW
        (mid_lat, mid_lon, north, east),      # NE
    ]


def query_chunk(bbox: tuple, chunk_label: str, depth: int = 0) -> tuple:
    """Query a chunk, automatically splitting if it times out. Returns (elements, failed_bboxes)."""
    elements, success = query_chunk_raw(bbox)

    if success:
        return elements, []

    # Failed - try splitting if not too deep
    if depth >= 2:
        print(f"failed (max depth)")
        return [], [bbox]

    print(f"splitting...")
    time.sleep(REQUEST_DELAY)

    sub_chunks = split_bbox(bbox)
    all_elements = []
    all_failed = []

    for i, sub_bbox in enumerate(sub_chunks):
        sub_label = f"{chunk_label}.{i+1}"
        print(f"  Sub-chunk {sub_label}...", end=" ", flush=True)

        sub_elements, sub_failed = query_chunk(sub_bbox, sub_label, depth + 1)
        all_elements.extend(sub_elements)
        all_failed.extend(sub_failed)

        if sub_elements:
            print(f"{len(sub_elements)} features")
        elif not sub_failed:
            print("0 features")

        time.sleep(REQUEST_DELAY)

    return all_elements, all_failed


def parse_start_date(date_str: str) -> int:
    """Parse OSM start_date to year. Handles various formats."""
    if not date_str:
        return None

    date_str = date_str.strip()

    # Handle decade format like "1870s"
    if date_str.endswith('s') and date_str[:-1].isdigit():
        return int(date_str[:-1])

    # Handle "early 19th century", "late 1800s", etc.
    if 'century' in date_str.lower():
        return None  # Too vague

    # Handle year ranges like "1880-1890"
    if '-' in date_str:
        parts = date_str.split('-')
        try:
            return int(parts[0][:4])
        except:
            pass

    # Handle full dates like "1890-01-01"
    if len(date_str) >= 4:
        try:
            return int(date_str[:4])
        except:
            pass

    return None


def normalize_elements(elements: list) -> list:
    """Convert OSM elements to GeoJSON features."""
    features = []

    for e in elements:
        tags = e.get("tags", {})
        start_date = tags.get("start_date", "")
        year = parse_start_date(start_date)

        # Get coordinates (center for ways)
        if e.get("type") == "node":
            lon, lat = e.get("lon"), e.get("lat")
        elif "center" in e:
            lon, lat = e["center"].get("lon"), e["center"].get("lat")
        else:
            continue

        if not lon or not lat:
            continue

        name = tags.get("name", tags.get("addr:housename", tags.get("building", "Building")))
        building_type = tags.get("building", tags.get("historic", "building"))

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "name": name,
                "osm_id": f"{e.get('type')}/{e.get('id')}",
                "building_type": building_type,
                "start_date_raw": start_date,
                "start_year": year,
                # Include all OSM tags for richer data
                "osm_tags": tags,
            }
        })

    return features


def main():
    parser = argparse.ArgumentParser(description="Fetch OSM buildings with start_date")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--debug", action="store_true", help="Show detailed tag info")
    args = parser.parse_args()

    print("OpenStreetMap Fetcher - Buildings with start_date")
    print("=" * 50)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"Chunks: {len(GM_CHUNKS)}")
    print()

    if args.dry_run:
        print("DRY RUN - would query each chunk")
        return

    all_features = []
    failed_chunks = []

    for i, bbox in enumerate(GM_CHUNKS):
        chunk_label = str(i + 1)
        print(f"Chunk {chunk_label}/{len(GM_CHUNKS)} {bbox}...", end=" ", flush=True)

        elements, failed = query_chunk(bbox, chunk_label)
        features = normalize_elements(elements)
        all_features.extend(features)

        for fb in failed:
            failed_chunks.append({"index": i, "bbox": fb})

        if failed:
            print(f"  Chunk {chunk_label} partial: {len(features)} features, {len(failed)} sub-chunks failed")
        elif elements:
            print(f"{len(features)} features")
        else:
            print("0 features")

        if i < len(GM_CHUNKS) - 1:
            time.sleep(REQUEST_DELAY)

    # Deduplicate by osm_id
    seen = set()
    unique = []
    for f in all_features:
        oid = f["properties"]["osm_id"]
        if oid not in seen:
            seen.add(oid)
            unique.append(f)

    print(f"\nTotal unique: {len(unique)}")

    with_years = sum(1 for f in unique if f["properties"]["start_year"])
    print(f"With parseable year: {with_years}")

    # Analyze all tags across the dataset
    all_tag_keys = {}
    for f in unique:
        tags = f["properties"].get("osm_tags", {})
        for key in tags:
            all_tag_keys[key] = all_tag_keys.get(key, 0) + 1

    print(f"\nTag frequency (out of {len(unique)} features):")
    for key, count in sorted(all_tag_keys.items(), key=lambda x: -x[1]):
        print(f"  {key}: {count}")

    # Show features with interesting tags
    if args.debug:
        print("\n" + "=" * 50)
        print("Features with rich data:")
        print("=" * 50)
        for f in unique:
            tags = f["properties"].get("osm_tags", {})
            interesting = {k: v for k, v in tags.items()
                          if k in ("architect", "heritage", "wikidata", "wikipedia",
                                   "building:levels", "historic", "designation")}
            if interesting:
                name = f["properties"]["name"]
                year = f["properties"]["start_year"]
                osm_id = f["properties"]["osm_id"]
                print(f"\n{name} ({year}) - {osm_id}")
                for k, v in interesting.items():
                    print(f"  {k}: {v}")

    # Show oldest
    dated = [(f["properties"]["name"], f["properties"]["start_year"])
             for f in unique if f["properties"]["start_year"]]
    dated.sort(key=lambda x: x[1])

    print(f"\nOldest sites:")
    for name, year in dated[:10]:
        print(f"  {year}: {name}")

    # Save
    SOURCES_DIR.mkdir(parents=True, exist_ok=True)

    output = {
        "type": "FeatureCollection",
        "features": unique,
        "_fetch_metadata": {
            "fetched_at": datetime.now().isoformat(),
            "source": "OpenStreetMap Overpass API",
            "region": "Greater Manchester",
            "feature_count": len(unique),
            "failed_chunks": failed_chunks,
            "chunks_total": len(GM_CHUNKS),
            "chunks_failed": len(failed_chunks)
        }
    }

    if failed_chunks:
        print(f"\nWARNING: {len(failed_chunks)} chunks failed to fetch:")
        for fc in failed_chunks:
            print(f"  Chunk {fc['index']+1}: {fc['bbox']}")

    output_path = SOURCES_DIR / "osm_dated_buildings.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved: {output_path}")


if __name__ == "__main__":
    main()
