# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a historical GIS mapping project visualizing land ownership in Greater Manchester from 1086 (Domesday Book) to present day. The application is an interactive 3D web map with a time slider showing ownership changes through the centuries.

## Tech Stack

**Data Processing (Python):**
- geopandas - Read/write shapefiles, GeoJSON
- pandas - Historical ownership tables
- shapely - Geometry operations
- pyproj - Coordinate transformation (BNG to WGS84)

**3D Visualization (JavaScript):**
- CesiumJS - 3D globe with terrain, timeline widget, map overlays

## Coordinate Systems

- Input data is typically British National Grid (EPSG:27700) from Historic England
- All output for CesiumJS must be WGS84 (EPSG:4326)
- Always convert BNG to WGS84 early in the data pipeline

**Greater Manchester bounding box (WGS84):**
```
Southwest: 53.35, -2.75
Northeast: 53.70, -1.90
```

## Data Model

Three core tables:
- **Locations** - Points/polygons for manors, townships, parishes, moated sites, churches
- **Ownership** - Temporal records linking locations to owners with start/end years
- **Boundaries** - Parish, township, hundred, manor polygons with temporal validity

Ownership records include certainty levels: 'certain', 'probable', 'inferred' (pre-1200 data often inferred).

## Key Historical Context

- 1086 Domesday lists 21 berewicks (sub-manors) but does NOT name them individually - this gap cannot be filled with certainty
- Use moated sites and -ton place names as proxies for berewick locations
- Trace ownership forward from the 1212 Lancashire Survey when possible
- The Nico Ditch (6-mile Anglo-Saxon earthwork) proves organized territorial administration pre-1086

## Data Sources

Primary free sources:
- Historic England Open Data Hub - Scheduled monuments, listed buildings
- Environment Agency LIDAR - Terrain elevation, reveals earthworks
- National Library of Scotland - Georeferenced historic OS maps
- Victoria County History (british-history.ac.uk/vch/lancs) - Township ownership chains

Contact GMAAS (gmaas@salford.ac.uk) for Greater Manchester HER data including medieval moated sites and historic boundaries.

## Validating Buildings with Chrome

When Chrome integration is enabled (`claude --chrome`), validate buildings visually:

1. Start dev server: `npm run dev`
2. Use Chrome tools to navigate to `http://localhost:5173`
3. Take screenshots of the map showing buildings
4. Check console for errors
5. Verify buildings appear at correct positions

Quick validation command for Claude:
```
Start the dev server, open localhost:5173 in Chrome, wait for the map to load,
take a screenshot, and check the console for any errors related to buildings.
```

## Adding Buildings Workflow

**Priority 1: Good, accurate information.** All research must be documented in the building's JSON file (references, images, notes). This project is as much about preserving historical knowledge as it is about visualization.

**Priority 2: Build the model from the information.** The quality of data varies:
- **Best case:** Actual geo data (Historic England coordinates, OSM footprints)
- **Good case:** Historical photos, architectural drawings, floor plans
- **Common case:** Need to combine multiple sources - photos, drawings, street names, contemporary descriptions - to estimate a building's shape and position

**Building files:** Each building gets its own JSON file in `public/data/projects/example/buildings/`. Hard-code unique polygon geometry for each building - do NOT use generic templates. Study photos to understand:
- Tower position (west end? central? corner?)
- Nave/body shape (rectangular? cruciform? aisles?)
- Wings, transepts, porticos, porches
- Relative proportions

**After editing buildings, rebuild:**
```bash
python3 scripts/build_czml.py
```

**Building format:**
```json
{
  "startYear": 1421, "endYear": 2100,
  "material": "wall",
  "maps": { "berry_1650": { "center": [-2.248, 53.485], "rotation": 0 } }
}
```

- `material`: Color lookup - one of `wall`, `tower`, `stone`, `roof`, `timber`
- `maps`: Per-period position adjustments for historical map alignment
- Available map IDs: `berry_1650`, `berry_1750`, `os_1845`, `os_1950s`, `modern`

## Data Pipeline

**Building data (one command):**
```bash
python3 scripts/build_czml.py
```

This reads from:
- `buildings/*.json` - Individual building definitions
- `buildings_1650.json` - Parametric buildings
- `sites.json` - Curated reference points
- `project.json` - Map periods, material colors, project config

And outputs:
- `entities.czml` - Native Cesium format (loaded directly by viewer)

**Reference data (optional, for research):**

The project can also pull from external APIs:

```
scripts/fetch_historic_england.py  → data/sources/he_*.json
scripts/fetch_wikidata.py          → data/sources/wikidata_sites.json
scripts/fetch_osm.py               → data/sources/osm_dated_buildings.json
                    ↓
scripts/consolidate_data.py        → data/unified_sites.geojson
```

**To refresh reference data:**
```bash
python3 scripts/fetch_historic_england.py
python3 scripts/fetch_wikidata.py
python3 scripts/fetch_osm.py
python3 scripts/consolidate_data.py
```

See `docs/API_REFERENCE.md` for detailed API documentation and gotchas.
See `docs/DATA_SOURCES.md` for source descriptions and known data quality issues.

## Project Configuration

The `project.json` file configures location-specific settings:

```json
{
  "name": "Greater Manchester Historical GIS",
  "bounds": { "west": -2.75, "south": 53.35, "east": -1.90, "north": 53.70 },
  "center": { "lon": -2.25, "lat": 53.48, "height": 5000 },
  "defaultYear": 1650,
  "mapPeriods": [
    {"id": "medieval", "start": 411, "stop": 1649, "geoCorrect": true},
    {"id": "berry_1650", "start": 1650, "stop": 1749, "geoCorrect": false}
  ],
  "materialColors": {
    "wall": [201, 184, 150, 255],
    "timber": [139, 115, 85, 255]
  }
}
```

To create a new project for a different location, copy the `example/` folder and edit `project.json`.

## API Quick Reference

### Historic England (ArcGIS REST)
- Endpoint: `https://services-eu1.arcgis.com/.../FeatureServer`
- Layers: 0=Listed Buildings, 6=Monuments, 7=Parks
- Gotcha: Data is BNG (EPSG:27700), use `inSR=27700&outSR=4326`
- Gotcha: Max 2000 records per request, use pagination

### Wikidata (SPARQL)
- Endpoint: `https://query.wikidata.org/sparql`
- Gotcha: Use `DISTINCT` + `GROUP BY` - items can have multiple coordinates
- Gotcha: Query both city AND metropolitan borough IDs (e.g., Q18125 AND Q21525592 for Manchester)
- Gotcha: Timeouts common - query each borough separately

### OpenStreetMap (Overpass)
- Endpoint: `https://overpass-api.de/api/interpreter`
- Query: `way["building"]["start_date"](bbox);out center;`
- Gotcha: Large areas timeout - split into chunks
- Gotcha: Implement auto-split on 504/503 errors
- Gotcha: `start_date` formats vary ("1870s", "1880-1890", "1890-01-01")

## Greater Manchester Bounding Boxes

**WGS84 (lat/lng for Overpass):**
```
South: 53.35, North: 53.70
West: -2.75, East: -1.90
```

**British National Grid (for Historic England):**
```
xmin: 351000, xmax: 406000
ymin: 389000, ymax: 421000
```

## Wikidata Borough IDs

Query BOTH the city/town AND metropolitan borough:
```
Manchester: Q18125 (city), Q21525592 (borough)
Salford: Q207231 (city), Q1435428 (borough)
Bolton: Q746176 (town), Q894548 (borough)
Bury: Q664892 (town), Q896629 (borough)
```
