#!/usr/bin/env python3
"""
Consolidate multiple historical data sources into a single unified GeoJSON.

This script reads JSON/GeoJSON files from data/sources/, normalizes the schema,
tags each record with its source, and outputs a unified GeoJSON file.
"""

import json
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).parent.parent
SOURCES_DIR = PROJECT_ROOT / "data" / "sources"
OUTPUT_FILE = PROJECT_ROOT / "data" / "unified_sites.geojson"

# Sources to skip during consolidation (for debugging/testing)
# Add filenames here to temporarily exclude them without deleting the data
DISABLED_SOURCES = [
    "he_aerial_archaeology.json",  # TODO: fix date parsing, causes slowness
    "he_scheduled_monuments.json",
    "he_listed_buildings.json",
    "he_parks_gardens.json",
    "he_heritage_at_risk.json",
    "he_battlefields.json",
    "he_conservation_areas.json",
    "wikidata_sites.json",
    "osm_dated_buildings.json",
    # "domesday_sites.json",  # 1086 - keep
    "gb1900_sites.json",
    # "roman_roads.json",  # Roman era - keep
    # "curated_ancient_sites.json",  # Roman/medieval curated - keep
]


def ms_to_year(ms_timestamp):
    """Convert milliseconds timestamp to year, or None if invalid."""
    if ms_timestamp is None:
        return None
    try:
        return datetime.fromtimestamp(ms_timestamp / 1000).year
    except (ValueError, OSError):
        return None


# Default year for sites without known construction dates
# Sites will only appear when slider reaches this year, keeping historical views clean
UNKNOWN_DATE_YEAR = datetime.now().year


def normalize_he_scheduled_monuments(data: dict) -> list:
    """Normalize Historic England Scheduled Monuments GeoJSON."""
    features = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})

        # Get centroid for polygons
        coords = geom.get("coordinates", [])
        if geom.get("type") == "Polygon" and coords:
            # Use first point of first ring as approximate location
            ring = coords[0] if coords else []
            if ring:
                lon = sum(p[0] for p in ring) / len(ring)
                lat = sum(p[1] for p in ring) / len(ring)
            else:
                continue
        elif geom.get("type") == "MultiPolygon" and coords:
            # Use first polygon's centroid
            ring = coords[0][0] if coords and coords[0] else []
            if ring:
                lon = sum(p[0] for p in ring) / len(ring)
                lat = sum(p[1] for p in ring) / len(ring)
            else:
                continue
        else:
            continue

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "name": props.get("Name", "Unknown"),
                "source": "he_scheduled_monuments",
                "source_display": "Scheduled Monument",
                "site_type": "Scheduled Monument",
                "list_entry": props.get("ListEntry"),
                "hyperlink": props.get("hyperlink"),
                "ngr": props.get("NGR"),
                "grade": None,
                "listed_year": ms_to_year(props.get("SchedDate")),
                "start_year": UNKNOWN_DATE_YEAR,  # Default to 2026 until real date known
                "end_year": None,
                "owners": [],
                "has_ownership_data": False,
                # Additional HE fields
                "object_id": props.get("OBJECTID"),
                "amend_date": ms_to_year(props.get("AmendDate")),
                "capture_scale": props.get("CaptureScale"),
                "area_ha": props.get("area_ha"),
                "easting": props.get("Easting"),
                "northing": props.get("Northing"),
            }
        })

    return features


def normalize_he_listed_buildings(data: dict) -> list:
    """Normalize Historic England Listed Buildings GeoJSON."""
    features = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})

        # Handle MultiPoint geometry
        coords = geom.get("coordinates", [])
        if geom.get("type") == "MultiPoint" and coords:
            lon, lat = coords[0][0], coords[0][1]
        elif geom.get("type") == "Point" and coords:
            lon, lat = coords[0], coords[1]
        else:
            continue

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "name": props.get("Name", "Unknown"),
                "source": "he_listed_buildings",
                "source_display": "Listed Building",
                "site_type": "Listed Building",
                "list_entry": props.get("ListEntry"),
                "hyperlink": props.get("hyperlink"),
                "ngr": props.get("NGR"),
                "grade": props.get("Grade"),
                "listed_year": ms_to_year(props.get("ListDate")),
                "start_year": UNKNOWN_DATE_YEAR,  # Default to 2026 until real date known
                "end_year": None,
                "owners": [],
                "has_ownership_data": False,
                # Additional HE fields
                "object_id": props.get("OBJECTID"),
                "amend_date": ms_to_year(props.get("AmendDate")),
                "capture_scale": props.get("CaptureScale"),
                "easting": props.get("Easting"),
                "northing": props.get("Northing"),
            }
        })

    return features


def normalize_he_parks_gardens(data: dict) -> list:
    """Normalize Historic England Parks and Gardens GeoJSON."""
    features = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})

        # Get centroid for polygons
        coords = geom.get("coordinates", [])
        if geom.get("type") == "Polygon" and coords:
            ring = coords[0] if coords else []
            if ring:
                lon = sum(p[0] for p in ring) / len(ring)
                lat = sum(p[1] for p in ring) / len(ring)
            else:
                continue
        elif geom.get("type") == "MultiPolygon" and coords:
            ring = coords[0][0] if coords and coords[0] else []
            if ring:
                lon = sum(p[0] for p in ring) / len(ring)
                lat = sum(p[1] for p in ring) / len(ring)
            else:
                continue
        else:
            continue

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "name": props.get("Name", "Unknown"),
                "source": "he_parks_gardens",
                "source_display": "Park/Garden",
                "site_type": "Registered Park/Garden",
                "list_entry": props.get("ListEntry"),
                "hyperlink": props.get("hyperlink"),
                "ngr": props.get("NGR"),
                "grade": props.get("Grade"),
                "listed_year": ms_to_year(props.get("RegDate")),
                "start_year": UNKNOWN_DATE_YEAR,  # Default to 2026 until real date known
                "end_year": None,
                "owners": [],
                "has_ownership_data": False,
                # Additional HE fields
                "object_id": props.get("OBJECTID"),
                "amend_date": ms_to_year(props.get("AmendDate")),
                "capture_scale": props.get("CaptureScale"),
                "area_ha": props.get("area_ha"),
                "easting": props.get("Easting"),
                "northing": props.get("Northing"),
            }
        })

    return features


def normalize_curated_historic_sites(data: dict) -> list:
    """Normalize curated historic sites with researched dates and ownership."""
    features = []
    for site in data.get("sites", []):
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [site["lon"], site["lat"]]},
            "properties": {
                "name": site["name"],
                "source": "curated",
                "source_display": "Curated Research",
                "site_type": site.get("type", "Historic site"),
                "list_entry": None,
                "hyperlink": None,
                "ngr": None,
                "grade": None,
                "listed_year": None,
                "start_year": site.get("start"),
                "end_year": site.get("end"),
                "owners": site.get("owners", []),
                "has_ownership_data": bool(site.get("owners"))
            }
        })
    return features


def normalize_wikidata_sites(data: dict) -> list:
    """Normalize Wikidata sites GeoJSON."""
    features = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})
        coords = geom.get("coordinates", [])

        if not coords or len(coords) < 2:
            continue

        inception = props.get("inception_year")

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": coords},
            "properties": {
                "name": props.get("name", "Unknown"),
                "source": "wikidata",
                "source_display": "Wikidata",
                "site_type": "Wikidata Site",
                "list_entry": None,
                "hyperlink": props.get("wikidata_url"),
                "ngr": None,
                "grade": None,
                "listed_year": None,
                "start_year": inception if inception else UNKNOWN_DATE_YEAR,
                "end_year": None,
                "owners": [],
                "has_ownership_data": False,
                # Additional Wikidata fields
                "wikidata_id": props.get("wikidata_id"),
                "borough": props.get("borough"),
                "inception_year": inception,
            }
        })

    return features


def normalize_osm_dated_buildings(data: dict) -> list:
    """Normalize OpenStreetMap buildings with start_date."""
    features = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})
        coords = geom.get("coordinates", [])

        if not coords or len(coords) < 2:
            continue

        start_year = props.get("start_year")
        osm_tags = props.get("osm_tags", {})

        # Extract useful fields from OSM tags
        architect = osm_tags.get("architect")
        levels = osm_tags.get("building:levels")
        heritage = osm_tags.get("heritage") or osm_tags.get("heritage:operator")
        wikidata_id = osm_tags.get("wikidata")
        wikipedia = osm_tags.get("wikipedia")
        addr_street = osm_tags.get("addr:street")
        addr_number = osm_tags.get("addr:housenumber")
        addr_city = osm_tags.get("addr:city")
        addr_postcode = osm_tags.get("addr:postcode")

        # Build address string if available
        address = None
        if addr_number and addr_street:
            address = f"{addr_number} {addr_street}"
        elif addr_street:
            address = addr_street

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": coords},
            "properties": {
                "name": props.get("name", "Building"),
                "source": "osm",
                "source_display": "OpenStreetMap",
                "site_type": props.get("building_type", "building").title(),
                "list_entry": None,
                "hyperlink": f"https://www.openstreetmap.org/{props.get('osm_id', '')}" if props.get("osm_id") else None,
                "ngr": None,
                "grade": None,
                "listed_year": None,
                "start_year": start_year if start_year else UNKNOWN_DATE_YEAR,
                "end_year": None,
                "owners": [],
                "has_ownership_data": False,
                # Additional OSM data
                "osm_id": props.get("osm_id"),
                "building_type": props.get("building_type"),
                "start_date_raw": props.get("start_date_raw"),
                "architect": architect,
                "building_levels": levels,
                "heritage": heritage,
                "wikidata_id": wikidata_id,
                "wikipedia": wikipedia,
                "address": address,
                "addr_city": addr_city,
                "addr_postcode": addr_postcode,
                # Pass through all OSM tags for exploration
                "osm_tags": osm_tags,
            }
        })

    return features


def normalize_domesday_sites(data: dict) -> list:
    """Normalize Open Domesday (1086) settlement data."""
    features = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})
        coords = geom.get("coordinates", [])

        if not coords or len(coords) < 2:
            continue

        # Build owners list from lords data
        owners = props.get("owners", [])
        # If no owners parsed, add tenant-in-chief if known
        if not owners and props.get("tenant_in_chief"):
            owners = [{"name": props["tenant_in_chief"], "start_year": 1086, "end_year": None}]

        # Build description from resources
        resources = props.get("resources", {})
        resource_parts = []
        households = props.get("households", 0)
        if households:
            resource_parts.append(f"{households} households")
        if resources.get("churches"):
            resource_parts.append(f"{resources['churches']} church(es)")
        if resources.get("ploughlands"):
            resource_parts.append(f"{resources['ploughlands']} ploughlands")
        if resources.get("mills"):
            resource_parts.append(f"{resources['mills']} mill(s)")

        description = "; ".join(resource_parts) if resource_parts else "recorded as waste"

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": coords},
            "properties": {
                "name": props.get("name", "Unknown"),
                "source": "domesday",
                "source_display": "Domesday Book (1086)",
                "site_type": "Domesday Settlement",
                "list_entry": None,
                "hyperlink": props.get("url"),
                "ngr": props.get("grid_ref"),
                "grade": None,
                "listed_year": None,
                "start_year": 1086,  # Fixed: the year of the Domesday survey
                "end_year": None,
                "owners": owners,
                "has_ownership_data": bool(owners),
                # Additional Domesday data
                "hundred": props.get("hundred"),
                "county_1086": props.get("county"),
                "households": props.get("households"),
                "resources": resources,
                "description": description,
                "phillimore_ref": props.get("phillimore_ref"),
                "folio": props.get("folio"),
            }
        })

    return features


# Map source filenames to their normalizer functions
def normalize_he_heritage_at_risk(data: dict) -> list:
    """Normalize Historic England Heritage at Risk Register."""
    features = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})

        # Handle point geometry
        if geom.get("type") == "Point":
            coords = geom.get("coordinates", [])
            if not coords or len(coords) < 2:
                continue
            lon, lat = coords[0], coords[1]
        else:
            continue

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "name": props.get("EntryName", "Unknown"),
                "source": "he_heritage_at_risk",
                "source_display": "Heritage at Risk",
                "site_type": props.get("HeritageCa", "Heritage at Risk"),
                "list_entry": props.get("List_Entry"),
                "hyperlink": props.get("URL"),
                "ngr": None,
                "grade": None,
                "listed_year": None,
                "start_year": UNKNOWN_DATE_YEAR,
                "end_year": None,
                "owners": [],
                "has_ownership_data": False,
                # Additional HAR fields
                "heritage_category": props.get("HeritageCa"),
                "risk_methodology": props.get("Risk_Metho"),
                "uid": props.get("uid"),
            }
        })

    return features


def normalize_he_battlefields(data: dict) -> list:
    """Normalize Historic England Registered Battlefields."""
    import re
    features = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})

        # Get centroid for polygons
        coords = geom.get("coordinates", [])
        if geom.get("type") == "Polygon" and coords:
            ring = coords[0] if coords else []
            if ring:
                lon = sum(p[0] for p in ring) / len(ring)
                lat = sum(p[1] for p in ring) / len(ring)
            else:
                continue
        elif geom.get("type") == "MultiPolygon" and coords:
            ring = coords[0][0] if coords and coords[0] else []
            if ring:
                lon = sum(p[0] for p in ring) / len(ring)
                lat = sum(p[1] for p in ring) / len(ring)
            else:
                continue
        else:
            continue

        name = props.get("Name", "Unknown Battlefield")

        # Extract year from name like "Battle of Winwick 1648"
        battle_year = None
        year_match = re.search(r'\b(\d{4})\b', name)
        if year_match:
            battle_year = int(year_match.group(1))

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "name": name,
                "source": "he_battlefields",
                "source_display": "Registered Battlefield",
                "site_type": "Battlefield",
                "list_entry": props.get("ListEntry"),
                "hyperlink": f"https://historicengland.org.uk/listing/the-list/list-entry/{props.get('ListEntry')}" if props.get("ListEntry") else None,
                "ngr": None,
                "grade": None,
                "listed_year": None,
                "start_year": battle_year if battle_year else UNKNOWN_DATE_YEAR,
                "end_year": battle_year,  # Battle happened in a single year
                "owners": [],
                "has_ownership_data": False,
                # Additional battlefield fields
                "area_hectares": props.get("HECTARES"),
                "constituency": props.get("PCON24NM"),
            }
        })

    return features


def normalize_he_conservation_areas(data: dict) -> list:
    """Normalize Historic England Conservation Areas."""
    features = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})

        # Get centroid for polygons
        coords = geom.get("coordinates", [])
        if geom.get("type") == "Polygon" and coords:
            ring = coords[0] if coords else []
            if ring:
                lon = sum(p[0] for p in ring) / len(ring)
                lat = sum(p[1] for p in ring) / len(ring)
            else:
                continue
        elif geom.get("type") == "MultiPolygon" and coords:
            ring = coords[0][0] if coords and coords[0] else []
            if ring:
                lon = sum(p[0] for p in ring) / len(ring)
                lat = sum(p[1] for p in ring) / len(ring)
            else:
                continue
        else:
            continue

        # Parse designation date (format: DD/MM/YYYY)
        designation_year = None
        date_str = props.get("DATE_OF_DE", "")
        if date_str and "/" in date_str:
            try:
                parts = date_str.split("/")
                if len(parts) == 3:
                    designation_year = int(parts[2])
            except (ValueError, IndexError):
                pass

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "name": props.get("NAME", "Unknown Conservation Area"),
                "source": "he_conservation_areas",
                "source_display": "Conservation Area",
                "site_type": "Conservation Area",
                "list_entry": props.get("UID"),
                "hyperlink": None,
                "ngr": None,
                "grade": None,
                "listed_year": designation_year,
                "start_year": designation_year if designation_year else UNKNOWN_DATE_YEAR,
                "end_year": None,
                "owners": [],
                "has_ownership_data": False,
                # Additional CA fields
                "local_authority": props.get("LPA"),
                "designation_date": props.get("DATE_OF_DE"),
                "area_sqm": props.get("Shape__Area"),
            }
        })

    return features


def normalize_gb1900_sites(data: dict) -> list:
    """Normalize GB1900 gazetteer sites (1888-1913 OS map labels)."""
    features = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})

        coords = geom.get("coordinates", [])
        if len(coords) < 2:
            continue

        lon, lat = coords[0], coords[1]
        name = props.get("name", "Unknown")

        # Determine site type from name
        name_lower = name.lower()
        if "church" in name_lower or "chapel" in name_lower:
            site_type = "Church"
        elif "hall" in name_lower:
            site_type = "Hall"
        elif "manor" in name_lower:
            site_type = "Manor"
        elif "grange" in name_lower:
            site_type = "Grange"
        elif "castle" in name_lower:
            site_type = "Castle"
        elif "abbey" in name_lower or "priory" in name_lower:
            site_type = "Religious House"
        elif "moat" in name_lower:
            site_type = "Moated Site"
        elif "rectory" in name_lower or "vicarage" in name_lower or "parsonage" in name_lower:
            site_type = "Rectory"
        elif "cross" in name_lower:
            site_type = "Cross"
        elif "tower" in name_lower:
            site_type = "Tower"
        else:
            site_type = "Historic Site"

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "name": name,
                "source": "gb1900",
                "source_display": "GB1900 Gazetteer (1888-1913)",
                "site_type": site_type,
                "list_entry": None,
                "hyperlink": "https://www.visionofbritain.org.uk/data/#tabgb1900",
                "ngr": None,
                "grade": None,
                "listed_year": None,
                "start_year": 1900,  # Maps from 1888-1913, use 1900 as midpoint
                "end_year": None,
                "owners": [],
                "has_ownership_data": False,
                # Additional GB1900 fields
                "pin_id": props.get("pin_id"),
                "local_authority": props.get("local_authority"),
                "parish": props.get("parish"),
                "osgb_east": props.get("osgb_east"),
                "osgb_north": props.get("osgb_north"),
                "notes": props.get("notes"),
            }
        })

    return features


def normalize_roman_roads(data: dict) -> list:
    """Normalize Roman Roads data (preserves line geometry)."""
    features = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})

        coords = geom.get("coordinates", [])
        if not coords:
            continue

        name = props.get("name", "Roman Road")
        description = props.get("description", "") or ""
        certainty = props.get("certainty")

        # Compute evidence level from description and certainty field
        # Levels: 'excavated', 'surveyed', 'inferred', 'conjecture'
        desc_lower = description.lower()
        if certainty == "excavated" or "excavat" in desc_lower:
            evidence_level = "excavated"
        elif certainty == "surveyed" or "survey" in desc_lower or "aerial" in desc_lower:
            evidence_level = "surveyed"
        elif "conjecture" in desc_lower or "hypothe" in desc_lower or "straight line" in desc_lower:
            evidence_level = "conjecture"
        elif certainty == "inferred" or "infer" in desc_lower or "probable" in desc_lower:
            evidence_level = "inferred"
        elif certainty:
            evidence_level = certainty  # Use raw certainty if provided
        else:
            evidence_level = "unknown"  # No certainty info available

        features.append({
            "type": "Feature",
            "geometry": geom,  # Preserve original geometry (LineString or MultiLineString)
            "properties": {
                "name": name,
                "source": "roman_roads",
                "source_display": "Roman Road (~43-410 AD)",
                "site_type": "Roman Road",
                "list_entry": None,
                "hyperlink": "https://zenodo.org/records/17122148",
                "ngr": None,
                "grade": None,
                "listed_year": None,
                "start_year": 79,  # Mamucium (Manchester) fort founded
                "end_year": 410,  # Roman withdrawal
                "owners": [],
                "has_ownership_data": False,
                # Additional fields
                "road_type": props.get("road_type"),
                "route_type": props.get("route_type"),
                "certainty": certainty,
                "evidence_level": evidence_level,  # Computed: excavated/surveyed/inferred/conjecture/unknown
                "description": description,
            }
        })

    return features


def normalize_curated_ancient_sites(data: dict) -> list:
    """Normalize curated ancient sites (Roman forts, prehistoric sites, etc.)."""
    features = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})

        coords = geom.get("coordinates", [])
        if len(coords) < 2:
            continue

        lon, lat = coords[0], coords[1]
        name = props.get("name", "Ancient Site")

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "name": name,
                "source": "curated",
                "source_display": f"Curated ({props.get('period', 'Ancient')})",
                "site_type": props.get("site_type", "Ancient Site"),
                "list_entry": None,
                "hyperlink": props.get("hyperlink"),
                "ngr": None,
                "grade": None,
                "listed_year": None,
                "start_year": props.get("start_year"),
                "end_year": props.get("end_year"),
                "owners": [],
                "has_ownership_data": False,
                # Additional fields
                "period": props.get("period"),
                "description": props.get("description"),
            }
        })

    return features


SOURCE_NORMALIZERS = {
    "he_scheduled_monuments.json": normalize_he_scheduled_monuments,
    "he_listed_buildings.json": normalize_he_listed_buildings,
    "he_parks_gardens.json": normalize_he_parks_gardens,
    "he_heritage_at_risk.json": normalize_he_heritage_at_risk,
    "he_battlefields.json": normalize_he_battlefields,
    "he_conservation_areas.json": normalize_he_conservation_areas,
    "wikidata_sites.json": normalize_wikidata_sites,
    "osm_dated_buildings.json": normalize_osm_dated_buildings,
    "domesday_sites.json": normalize_domesday_sites,
    "gb1900_sites.json": normalize_gb1900_sites,
    "roman_roads.json": normalize_roman_roads,
    "curated_ancient_sites.json": normalize_curated_ancient_sites,
    # "curated_historic_sites.json": normalize_curated_historic_sites,  # Manual data, disabled for now
}


def load_source(filepath: Path) -> dict:
    """Load a JSON source file."""
    with open(filepath, "r") as f:
        return json.load(f)


def consolidate_sources() -> dict:
    """
    Read all source files and consolidate into unified GeoJSON.

    Returns a GeoJSON FeatureCollection with all sites.
    """
    features = []
    sources_processed = []

    for source_file in SOURCES_DIR.glob("*.json"):
        filename = source_file.name

        # Skip old demo data files
        if filename in ("scheduled_monuments.json", "listed_buildings.json"):
            print(f"Skipping old demo file: {filename}")
            continue

        # Skip disabled sources
        if filename in DISABLED_SOURCES:
            print(f"Skipping disabled source: {filename}")
            continue

        normalizer = SOURCE_NORMALIZERS.get(filename)

        if normalizer is None:
            print(f"Warning: No normalizer for {filename}, skipping")
            continue

        print(f"Processing {filename}...")
        data = load_source(source_file)

        # Get fetch metadata if present
        fetch_meta = data.get("_fetch_metadata", {})
        if fetch_meta:
            print(f"  Fetched: {fetch_meta.get('fetched_at', 'unknown')}")

        normalized = normalizer(data)
        features.extend(normalized)

        sources_processed.append({
            "filename": filename,
            "record_count": len(normalized),
            "fetched_at": fetch_meta.get("fetched_at")
        })
        print(f"  Added {len(normalized)} features")

    # Build metadata
    all_types = sorted(set(f["properties"]["site_type"] for f in features))
    all_sources = sorted(set(f["properties"]["source"] for f in features))
    all_grades = sorted(set(
        f["properties"]["grade"]
        for f in features
        if f["properties"]["grade"]
    ))

    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "generated": datetime.now().isoformat(),
            "sources_processed": sources_processed,
            "total_features": len(features),
            "available_filters": {
                "source": all_sources,
                "site_type": all_types,
                "grade": all_grades
            }
        },
        "features": features
    }

    return geojson


def main():
    """Main entry point."""
    print("Consolidating data sources...\n")

    # Ensure output directory exists
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Consolidate all sources
    geojson = consolidate_sources()

    # Write output
    with open(OUTPUT_FILE, "w") as f:
        json.dump(geojson, f, indent=2)

    print(f"\nOutput written to: {OUTPUT_FILE}")
    print(f"Total features: {geojson['metadata']['total_features']}")
    print(f"Available site types: {geojson['metadata']['available_filters']['site_type']}")
    print(f"Available sources: {geojson['metadata']['available_filters']['source']}")
    if geojson['metadata']['available_filters']['grade']:
        print(f"Available grades: {geojson['metadata']['available_filters']['grade']}")


if __name__ == "__main__":
    main()
