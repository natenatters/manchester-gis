# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Historical GIS mapping project for Greater Manchester (1086 - present). Interactive 3D web map with time slider showing buildings through the centuries.

## Tech Stack

- **Frontend:** Vue 3, CesiumJS (3D globe)
- **Data:** Python script generates CZML from building JSON files

## Quick Start

```bash
npm install
npm run dev           # Start dev server
npm run build:data    # Rebuild CZML from buildings
```

## Project Structure

```
src/                  # Vue/Cesium frontend
public/data/projects/example/
├── buildings/        # Individual building JSON files
├── project.json      # Project config (layers, periods, colors)
├── entity_styles.json # Entity styling for data sources
└── entities.czml     # Generated (built by CI)
data/scripts/
└── build_czml.py     # Builds entities.czml from buildings
```

## Adding Buildings

Each building gets its own JSON file in `public/data/projects/example/buildings/`.

**Format:**
```json
{
  "name": "Building Name",
  "startYear": 1421,
  "endYear": 2100,
  "material": "wall",
  "center": [-2.248, 53.485],
  "polygon": [[lon, lat], ...],
  "maps": {
    "berry_1650": { "center": [-2.248, 53.485], "rotation": 0 }
  }
}
```

- `material`: Color lookup - `wall`, `tower`, `stone`, `roof`, `timber`
- `maps`: Per-period position adjustments for historical map alignment
- Map IDs: `berry_1650`, `berry_1750`, `os_1845`, `os_1950s`, `modern`

**After editing, rebuild:**
```bash
python3 data/scripts/build_czml.py
```

## Project Configuration

The `project.json` file configures everything:

```json
{
  "name": "Greater Manchester Historical GIS",
  "bounds": { "west": -2.75, "south": 53.35, "east": -1.90, "north": 53.70 },
  "center": { "lon": -2.25, "lat": 53.48, "height": 5000 },
  "defaultYear": 1650,
  "terrain": { "enabled": true, "exaggeration": 2.0 },
  "entities": "/data/projects/example/entities.czml",
  "mapPeriods": [...],
  "materialColors": {...},
  "layers": [...]
}
```

## Extended Data Sources

The `feature/extended-sources` branch contains scripts to fetch data from:
- Historic England (listed buildings, monuments)
- Wikidata
- OpenStreetMap (dated buildings)
- Domesday Book

See `docs/API_REFERENCE.md` and `docs/DATA_SOURCES.md` on that branch for details.

## Coordinate Reference

**Greater Manchester bounds (WGS84):**
- Southwest: 53.35, -2.75
- Northeast: 53.70, -1.90
