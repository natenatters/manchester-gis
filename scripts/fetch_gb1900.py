#!/usr/bin/env python3
"""
Fetch and filter GB1900 gazetteer data for Greater Manchester.

The GB1900 gazetteer contains 2.5 million place names transcribed from
1888-1913 Ordnance Survey maps. This script filters to ~1,400 historically
significant sites in Greater Manchester (halls, manors, churches, etc.).

Source: Vision of Britain - https://www.visionofbritain.org.uk/data/#tabgb1900
License: CC-BY-SA (Creative Commons Attribution Share Alike)

The full dataset is cached locally to avoid repeated 140MB downloads.
"""

import csv
import json
import re
import zipfile
from pathlib import Path
from typing import List, Dict, Optional
import codecs

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
CACHE_DIR = PROJECT_ROOT / "data" / "cache"
OUTPUT_DIR = PROJECT_ROOT / "data" / "sources"

CACHE_ZIP = CACHE_DIR / "gb1900_complete.zip"
CSV_FILENAME = "GB1900_gazetteer_complete_july_2018/gb1900_gazetteer_complete_july_2018.csv"
OUTPUT_FILE = OUTPUT_DIR / "gb1900_sites.json"

# Greater Manchester local authorities (modern names used in GB1900)
GM_AUTHORITIES = {
    "Manchester",
    "Salford",
    "Bolton",
    "Bury",
    "Oldham",
    "Rochdale",
    "Stockport",
    "Tameside",
    "Trafford",
    "Wigan",
}

# Terms indicating historically significant sites (case-insensitive)
INCLUDE_TERMS = [
    r"\bhall\b",
    r"\bmanor\b",
    r"\bcastle\b",
    r"\babbey\b",
    r"\bpriory\b",
    r"\bgrange\b",
    r"\bmoat\b",
    r"\bcross\b",
    r"\btower\b",
    r"\brectory\b",
    r"\bvicarage\b",
    r"\bchurch\b",
    r"\bchapel\b",
    r"\bparsonage\b",
]

# Terms to exclude (street names, modern buildings, etc.)
EXCLUDE_TERMS = [
    r"\bstreet\b",
    r"\broad\b",
    r"\blane\b",
    r"\bavenue\b",
    r"\bterrace\b",
    r"\bdrill hall\b",
    r"\bmission hall\b",
    r"\btown hall\b",
    r"\bclub house\b",
    r"\bvalve house\b",
    r"\bboat house\b",
    r"\bengine house\b",
    r"\bpump house\b",
    r"\bwheel house\b",
    r"\bmusic hall\b",
    r"\bconcert hall\b",
    r"\blecture hall\b",
    r"\bpublic hall\b",
    r"\bmarket hall\b",
    r"\bsidings\b",  # Railway sidings
]


def is_all_caps_street(name: str) -> bool:
    """Check if name is an all-caps street name like 'CHURCH STREET' or 'HALL ST.'"""
    # If mostly uppercase and ends with common street suffixes
    if name.isupper() or sum(1 for c in name if c.isupper()) > len(name) * 0.7:
        street_endings = ['ST', 'ST.', 'RD', 'RD.', 'AV', 'AV.', 'LA', 'LA.']
        name_upper = name.upper().strip()
        for ending in street_endings:
            if name_upper.endswith(ending) or name_upper.endswith(ending + '.'):
                return True
    return False

# Compile regex patterns
INCLUDE_PATTERN = re.compile("|".join(INCLUDE_TERMS), re.IGNORECASE)
EXCLUDE_PATTERN = re.compile("|".join(EXCLUDE_TERMS), re.IGNORECASE)


def should_include(name: str) -> bool:
    """Check if a place name should be included based on historical significance."""
    if not INCLUDE_PATTERN.search(name):
        return False
    if EXCLUDE_PATTERN.search(name):
        return False
    if is_all_caps_street(name):
        return False
    return True


def extract_and_filter() -> List[Dict]:
    """Extract GB1900 data from cached zip and filter for GM historical sites."""

    if not CACHE_ZIP.exists():
        print(f"ERROR: Cache file not found: {CACHE_ZIP}")
        print("Download from: https://www.visionofbritain.org.uk/downloads/GB1900_gazetteer_complete_july_2018.zip")
        return []

    features = []
    total_rows = 0
    gm_rows = 0

    print(f"Reading from cached zip: {CACHE_ZIP}")

    with zipfile.ZipFile(CACHE_ZIP, 'r') as zf:
        with zf.open(CSV_FILENAME) as f:
            # File is UTF-16LE encoded
            text_wrapper = codecs.getreader('utf-16-le')(f)
            reader = csv.DictReader(text_wrapper)

            for row in reader:
                total_rows += 1

                # Filter to Greater Manchester
                local_auth = row.get('local_authority', '')
                if not any(gm in local_auth for gm in GM_AUTHORITIES):
                    continue

                gm_rows += 1

                # Filter to historically significant names
                name = row.get('final_text', '')
                if not should_include(name):
                    continue

                # Parse coordinates
                try:
                    lat = float(row.get('latitude', 0))
                    lon = float(row.get('longitude', 0))
                except (ValueError, TypeError):
                    continue

                # Skip invalid coordinates
                if lat == 0 or lon == 0:
                    continue

                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [lon, lat]
                    },
                    "properties": {
                        "pin_id": row.get('pin_id', ''),
                        "name": name,
                        "local_authority": local_auth,
                        "parish": row.get('parish', ''),
                        "osgb_east": row.get('osgb_east', ''),
                        "osgb_north": row.get('osgb_north', ''),
                        "notes": row.get('notes', ''),
                    }
                })

                if len(features) % 500 == 0:
                    print(f"  Found {len(features)} historical sites...")

    print(f"Processed {total_rows:,} total rows")
    print(f"  {gm_rows:,} in Greater Manchester")
    print(f"  {len(features):,} historical sites after filtering")

    return features


def main():
    """Main entry point."""
    print("=" * 60)
    print("GB1900 Gazetteer - Greater Manchester Historical Sites")
    print("=" * 60)

    features = extract_and_filter()

    if not features:
        print("No features found!")
        return

    # Create output
    output = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "GB1900 Gazetteer (Vision of Britain)",
            "source_url": "https://www.visionofbritain.org.uk/data/#tabgb1900",
            "license": "CC-BY-SA",
            "description": "Historical place names from 1888-1913 OS maps, filtered for significant sites",
            "date_range": "1888-1913",
            "feature_count": len(features),
        },
        "features": features
    }

    # Write output
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved {len(features)} features to {OUTPUT_FILE}")

    # Show sample
    print("\nSample sites:")
    for feat in features[:10]:
        print(f"  - {feat['properties']['name']} ({feat['properties']['local_authority']})")


if __name__ == "__main__":
    main()
