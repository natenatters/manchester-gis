#!/usr/bin/env python3
"""
Fetch historic site data from Wikidata for Greater Manchester.

Queries each borough separately to avoid timeouts.

Usage:
    python scripts/fetch_wikidata.py
    python scripts/fetch_wikidata.py --dry-run
"""

import argparse
import json
import requests
import time
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).parent.parent
SOURCES_DIR = PROJECT_ROOT / "data" / "sources"

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"

# Greater Manchester boroughs with Wikidata IDs
# Include both metropolitan borough and city/town IDs where they differ
GM_BOROUGHS = {
    # Manchester - borough and city are separate entities
    "Q21525592": "Manchester",  # metropolitan borough
    "Q18125": "Manchester",     # city
    # Salford
    "Q207231": "Salford",       # city
    "Q1435428": "Salford",      # metropolitan borough
    # Bolton
    "Q746176": "Bolton",        # town
    "Q894548": "Bolton",        # metropolitan borough
    # Bury
    "Q664892": "Bury",          # town
    "Q896629": "Bury",          # metropolitan borough
    # Oldham
    "Q664617": "Oldham",        # town
    "Q896627": "Oldham",        # metropolitan borough
    # Rochdale
    "Q1434508": "Rochdale",     # town
    "Q896628": "Rochdale",      # metropolitan borough
    # Stockport
    "Q1022453": "Stockport",    # town
    "Q896625": "Stockport",     # metropolitan borough
    # Tameside
    "Q1022377": "Tameside",     # metropolitan borough (no separate town)
    # Trafford
    "Q215026": "Trafford",      # metropolitan borough (no separate town)
    # Wigan
    "Q216295": "Wigan",         # town
    "Q896630": "Wigan",         # metropolitan borough
}

REQUEST_DELAY = 2  # Seconds between requests


def query_borough(borough_id: str, borough_name: str, retries: int = 3) -> list:
    """Query items with coordinates and dates in a single borough. Handles pagination."""
    all_results = []
    offset = 0
    page_size = 500

    while True:
        query = f"""
        SELECT DISTINCT ?item ?itemLabel (SAMPLE(?coord) AS ?coord) (SAMPLE(?inception) AS ?inception) WHERE {{
          ?item wdt:P131 wd:{borough_id} .
          ?item wdt:P625 ?coord .
          OPTIONAL {{ ?item wdt:P571 ?inception . }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
        }}
        GROUP BY ?item ?itemLabel
        LIMIT {page_size}
        OFFSET {offset}
        """

        for attempt in range(retries):
            try:
                response = requests.get(
                    WIKIDATA_SPARQL,
                    params={"query": query},
                    headers={
                        "Accept": "application/sparql-results+json",
                        "User-Agent": "ManchesterGIS/1.0"
                    },
                    timeout=90
                )

                if response.status_code == 429:
                    print(f"rate limited, waiting 30s...")
                    time.sleep(30)
                    continue

                if response.status_code != 200:
                    print(f"HTTP {response.status_code}")
                    return all_results

                data = response.json()
                results = data.get("results", {}).get("bindings", [])
                all_results.extend(results)

                # If we got fewer than page_size, we're done
                if len(results) < page_size:
                    return all_results

                # Otherwise, get next page
                offset += page_size
                time.sleep(1)  # Brief delay between pages
                break  # Break retry loop, continue pagination loop

            except requests.exceptions.Timeout:
                if attempt < retries - 1:
                    print(f"timeout, retry {attempt + 2}...")
                    time.sleep(10)
                else:
                    print("timeout, giving up")
                    return all_results
            except Exception as e:
                print(f"error: {e}")
                return all_results
        else:
            # Exhausted retries
            return all_results

    return all_results


def parse_coord(coord_str: str) -> tuple:
    """Parse 'Point(lon lat)' to (lon, lat)."""
    coord_str = coord_str.replace("Point(", "").replace(")", "")
    parts = coord_str.split()
    return float(parts[0]), float(parts[1])


def parse_year(date_str: str) -> int:
    """Extract year from date string."""
    if date_str:
        try:
            return int(date_str[:4])
        except (ValueError, IndexError):
            pass
    return None


def normalize_results(results: list, borough_name: str) -> list:
    """Convert Wikidata results to GeoJSON features."""
    features = []

    for r in results:
        coord_value = r.get("coord", {}).get("value", "")
        if not coord_value:
            continue

        try:
            lon, lat = parse_coord(coord_value)
        except:
            continue

        item_id = r.get("item", {}).get("value", "").split("/")[-1]
        name = r.get("itemLabel", {}).get("value", "Unknown")
        inception = parse_year(r.get("inception", {}).get("value", ""))

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "name": name,
                "wikidata_id": item_id,
                "wikidata_url": f"https://www.wikidata.org/wiki/{item_id}",
                "borough": borough_name,
                "inception_year": inception,
            }
        })

    return features


def main():
    parser = argparse.ArgumentParser(description="Fetch Wikidata heritage sites")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("Wikidata Fetcher - Greater Manchester")
    print("=" * 50)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"Boroughs: {len(GM_BOROUGHS)}")
    print()

    if args.dry_run:
        print("DRY RUN - would query each borough")
        return

    all_features = []

    for borough_id, borough_name in GM_BOROUGHS.items():
        print(f"Querying {borough_name}...", end=" ", flush=True)

        results = query_borough(borough_id, borough_name)
        features = normalize_results(results, borough_name)
        all_features.extend(features)

        print(f"{len(features)} items")
        time.sleep(REQUEST_DELAY)

    # Deduplicate by wikidata_id
    seen = set()
    unique = []
    for f in all_features:
        wid = f["properties"]["wikidata_id"]
        if wid not in seen:
            seen.add(wid)
            unique.append(f)

    print(f"\nTotal unique: {len(unique)}")

    # Stats
    with_dates = sum(1 for f in unique if f["properties"]["inception_year"])
    print(f"With inception dates: {with_dates}")

    # Save
    SOURCES_DIR.mkdir(parents=True, exist_ok=True)

    output = {
        "type": "FeatureCollection",
        "features": unique,
        "_fetch_metadata": {
            "fetched_at": datetime.now().isoformat(),
            "source": "Wikidata SPARQL",
            "region": "Greater Manchester",
            "feature_count": len(unique)
        }
    }

    output_path = SOURCES_DIR / "wikidata_sites.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved: {output_path}")


if __name__ == "__main__":
    main()
