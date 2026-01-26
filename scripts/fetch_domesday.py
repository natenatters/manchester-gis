#!/usr/bin/env python3
"""
Fetch Domesday Book (1086) data from Open Domesday for Greater Manchester.

Since the Open Domesday API is currently returning 404s, this script scrapes
the HTML pages directly. The Greater Manchester area was recorded as the
Salford Hundred in 1086 (under Cheshire, not Lancashire).

Usage:
    python scripts/fetch_domesday.py
    python scripts/fetch_domesday.py --dry-run
"""

import argparse
import json
import re
import requests
import time
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple, Dict, List

PROJECT_ROOT = Path(__file__).parent.parent
SOURCES_DIR = PROJECT_ROOT / "data" / "sources"

BASE_URL = "https://opendomesday.org"
SALFORD_HUNDRED_URL = f"{BASE_URL}/hundred/salford/"

# Known places in the Salford Hundred from Open Domesday
# Format: (url_path, name)
SALFORD_HUNDRED_PLACES = [
    ("/place/SJ8298/salford/", "Salford"),
    ("/place/SJ8398/manchester/", "Manchester"),
    ("/place/SD7807/radcliffe/", "Radcliffe"),
    ("/place/SD8913/rochdale/", "Rochdale"),
    ("/place/SJ9399/ashton-under-lyne/", "Ashton-under-Lyne"),
]

REQUEST_DELAY = 1  # Seconds between requests (be nice to the server)
REQUEST_TIMEOUT = 30

HEADERS = {
    "User-Agent": "ManchesterGIS/1.0 (Historical research project; https://github.com/)"
}


def fetch_page(url: str, retries: int = 3) -> Optional[str]:
    """Fetch a page with retries."""
    for attempt in range(retries):
        try:
            response = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
            if response.status_code == 200:
                return response.text
            print(f"  HTTP {response.status_code} for {url}")
            return None
        except requests.exceptions.Timeout:
            if attempt < retries - 1:
                print(f"  Timeout, retry {attempt + 2}...")
                time.sleep(5)
            else:
                print(f"  Timeout, giving up on {url}")
                return None
        except Exception as e:
            print(f"  Error: {e}")
            return None
    return None


def parse_grid_ref(url_path: str) -> Optional[str]:
    """Extract grid reference from URL path like /place/SJ8398/manchester/"""
    match = re.search(r"/place/([A-Z]{2}\d+)/", url_path)
    return match.group(1) if match else None


def parse_coordinates_from_html(html: str) -> Optional[Tuple[float, float]]:
    """
    Extract coordinates from the page.
    Open Domesday embeds coords in JavaScript for the map.
    Look for patterns like: lat: 53.48, lng: -2.25
    """
    # Try to find lat/lng in JavaScript
    lat_match = re.search(r"lat['\"]?\s*[:=]\s*([0-9.-]+)", html)
    lng_match = re.search(r"lng['\"]?\s*[:=]\s*([0-9.-]+)", html)

    if lat_match and lng_match:
        try:
            lat = float(lat_match.group(1))
            lng = float(lng_match.group(1))
            return (lng, lat)  # GeoJSON order: [lon, lat]
        except ValueError:
            pass

    # Alternative: look for coordinates in meta tags or data attributes
    coord_match = re.search(r"([0-9.-]+),\s*([0-9.-]+)", html)
    if coord_match:
        try:
            # Could be lat,lng or lng,lat - check if in UK range
            a, b = float(coord_match.group(1)), float(coord_match.group(2))
            if 50 < a < 60 and -10 < b < 5:
                return (b, a)  # a is lat, b is lng
            elif 50 < b < 60 and -10 < a < 5:
                return (a, b)  # a is lng, b is lat
        except ValueError:
            pass

    return None


def parse_place_page(html: str, url_path: str, name: str) -> Optional[Dict]:
    """Parse a place detail page and extract Domesday data."""
    place = {
        "name": name,
        "grid_ref": parse_grid_ref(url_path),
        "url": f"{BASE_URL}{url_path}",
        "hundred": "Salford",
        "county": "Cheshire",
        "year": 1086,
    }

    # Extract coordinates
    coords = parse_coordinates_from_html(html)
    if coords:
        place["coordinates"] = coords
    else:
        # Fallback coordinates based on grid reference (approximate centers)
        grid_coords = {
            "SJ8298": (-2.27, 53.49),   # Salford
            "SJ8398": (-2.25, 53.48),   # Manchester
            "SD7807": (-2.33, 53.56),   # Radcliffe
            "SD8913": (-2.15, 53.62),   # Rochdale
            "SJ9399": (-2.10, 53.49),   # Ashton-under-Lyne
        }
        place["coordinates"] = grid_coords.get(place["grid_ref"], (-2.24, 53.48))

    # Extract households
    households_match = re.search(r"(\d+)\s+households?", html, re.IGNORECASE)
    place["households"] = int(households_match.group(1)) if households_match else 0

    # Extract lords/landholders
    # 1066 lords
    lords_1066 = []
    lord_1066_section = re.search(
        r"Lord[s]?\s+in\s+1066[:\s]*(.+?)(?:Lord|Tenant|Overlord|<|$)",
        html,
        re.IGNORECASE | re.DOTALL
    )
    if lord_1066_section:
        # Extract names, handling HTML tags
        text = re.sub(r"<[^>]+>", " ", lord_1066_section.group(1))
        names = re.findall(r"([A-Z][a-zA-Z\s\-()]+?)(?:;|,|$)", text)
        lords_1066 = [n.strip() for n in names if n.strip() and len(n.strip()) > 2]

    # 1086 lords
    lords_1086 = []
    lord_1086_section = re.search(
        r"Lord[s]?\s+in\s+1086[:\s]*(.+?)(?:Lord|Tenant|Overlord|<|$)",
        html,
        re.IGNORECASE | re.DOTALL
    )
    if lord_1086_section:
        text = re.sub(r"<[^>]+>", " ", lord_1086_section.group(1))
        names = re.findall(r"([A-Z][a-zA-Z\s\-()]+?)(?:;|,|$)", text)
        lords_1086 = [n.strip() for n in names if n.strip() and len(n.strip()) > 2]

    # Tenant-in-chief
    tenant_match = re.search(
        r"Tenant-in-chief[:\s]*(.+?)(?:<|Lord|Overlord|$)",
        html,
        re.IGNORECASE | re.DOTALL
    )
    tenant = None
    if tenant_match:
        text = re.sub(r"<[^>]+>", " ", tenant_match.group(1))
        name_match = re.search(r"([A-Z][a-zA-Z\s\-()]+)", text)
        if name_match:
            tenant = name_match.group(1).strip()

    place["lords_1066"] = lords_1066
    place["lords_1086"] = lords_1086
    place["tenant_in_chief"] = tenant

    # Extract resources
    resources = {}

    churches_match = re.search(r"(\d+)\s+church(?:es)?", html, re.IGNORECASE)
    if churches_match:
        resources["churches"] = int(churches_match.group(1))

    church_lands_match = re.search(r"([0-9.]+)\s+church\s+lands?", html, re.IGNORECASE)
    if church_lands_match:
        resources["church_lands"] = float(church_lands_match.group(1))

    mills_match = re.search(r"(\d+)\s+mills?", html, re.IGNORECASE)
    if mills_match:
        resources["mills"] = int(mills_match.group(1))

    ploughlands_match = re.search(r"([0-9.]+)\s+(?:ploughlands?|carucates?)", html, re.IGNORECASE)
    if ploughlands_match:
        resources["ploughlands"] = float(ploughlands_match.group(1))

    place["resources"] = resources

    # Extract Phillimore reference
    phillimore_match = re.search(r"Phillimore[:\s]+([A-Za-z]+\s+[A-Z0-9,]+)", html)
    if phillimore_match:
        place["phillimore_ref"] = phillimore_match.group(1)

    # Extract folio number
    folio_match = re.search(r"folio\s+(\d+)", html, re.IGNORECASE)
    if folio_match:
        place["folio"] = int(folio_match.group(1))

    return place


def to_geojson_feature(place: dict) -> dict:
    """Convert a place dict to a GeoJSON Feature."""
    coords = place.get("coordinates", [-2.24, 53.48])

    # Build owners list for timeline display
    owners = []
    for lord in place.get("lords_1066", []):
        owners.append({"name": lord, "start_year": 1066, "end_year": 1086})
    for lord in place.get("lords_1086", []):
        owners.append({"name": lord, "start_year": 1086, "end_year": None})

    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": list(coords)
        },
        "properties": {
            "name": place["name"],
            "grid_ref": place.get("grid_ref"),
            "hundred": place.get("hundred"),
            "county": place.get("county"),
            "year": place.get("year", 1086),
            "households": place.get("households", 0),
            "lords_1066": place.get("lords_1066", []),
            "lords_1086": place.get("lords_1086", []),
            "tenant_in_chief": place.get("tenant_in_chief"),
            "resources": place.get("resources", {}),
            "phillimore_ref": place.get("phillimore_ref"),
            "folio": place.get("folio"),
            "url": place.get("url"),
            "owners": owners,
        }
    }


def main():
    parser = argparse.ArgumentParser(description="Fetch Open Domesday data")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be fetched")
    args = parser.parse_args()

    print("Open Domesday Fetcher - Greater Manchester (Salford Hundred)")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"Places to fetch: {len(SALFORD_HUNDRED_PLACES)}")
    print()

    if args.dry_run:
        print("DRY RUN - would fetch:")
        for url_path, name in SALFORD_HUNDRED_PLACES:
            print(f"  {name}: {BASE_URL}{url_path}")
        return

    features = []

    for url_path, name in SALFORD_HUNDRED_PLACES:
        url = f"{BASE_URL}{url_path}"
        print(f"Fetching {name}...", end=" ", flush=True)

        html = fetch_page(url)
        if html:
            place = parse_place_page(html, url_path, name)
            if place:
                feature = to_geojson_feature(place)
                features.append(feature)
                households = place.get("households", 0)
                print(f"OK ({households} households)")
            else:
                print("parse failed")
        else:
            print("fetch failed")

        time.sleep(REQUEST_DELAY)

    print(f"\nFetched {len(features)} places")

    # Save output
    SOURCES_DIR.mkdir(parents=True, exist_ok=True)

    output = {
        "type": "FeatureCollection",
        "features": features,
        "_fetch_metadata": {
            "fetched_at": datetime.now().isoformat(),
            "source": "Open Domesday (opendomesday.org)",
            "source_url": "https://opendomesday.org",
            "region": "Salford Hundred (Greater Manchester)",
            "year": 1086,
            "feature_count": len(features),
            "note": "Scraped from HTML as API endpoints return 404"
        }
    }

    output_path = SOURCES_DIR / "domesday_sites.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Saved: {output_path}")

    # Print summary
    total_households = sum(f["properties"]["households"] for f in features)
    with_churches = sum(1 for f in features if f["properties"]["resources"].get("churches"))
    print(f"\nSummary:")
    print(f"  Total households: {total_households}")
    print(f"  Places with churches: {with_churches}")


if __name__ == "__main__":
    main()
