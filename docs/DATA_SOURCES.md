# Data Sources for Manchester Historical GIS

This document describes all data sources integrated into the project, plus potential future sources identified through research.

## Currently Integrated Sources

### 1. Historic England - Listed Buildings
- **Script:** `scripts/fetch_historic_england.py --layer listed_buildings`
- **API:** [ArcGIS REST API](https://opendata-historicengland.hub.arcgis.com/)
- **Endpoint:** `https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer/0`
- **Features:** 4,694
- **With construction dates:** 0 (only listing dates available)
- **Fields:** Name, Grade (I/II*/II), List Entry, NGR, hyperlink to HE
- **License:** Open Government Licence
- **Notes:** Listing date ≠ construction date. Buildings default to year 2026 in timeline.

### 2. Historic England - Scheduled Monuments
- **Script:** `scripts/fetch_historic_england.py --layer scheduled_monuments`
- **API:** Same as above, Layer 6
- **Features:** 82
- **With construction dates:** 0
- **Fields:** Name, List Entry, hyperlink
- **Notes:** Ancient sites - dates often prehistoric/unknown

### 3. Historic England - Parks & Gardens
- **Script:** `scripts/fetch_historic_england.py --layer parks_gardens`
- **API:** Same as above, Layer 7
- **Features:** 34
- **With construction dates:** 0
- **Fields:** Name, Grade, List Entry, hyperlink

### 4. Wikidata
- **Script:** `scripts/fetch_wikidata.py`
- **API:** [Wikidata SPARQL](https://query.wikidata.org/sparql)
- **Features:** 1,827
- **With construction dates:** 421 (23%)
- **Fields:** Name, inception year, Wikidata URL, borough
- **License:** CC0
- **Notes:**
  - Queries each GM borough separately to avoid timeouts
  - Must query both "city" and "metropolitan borough" entities (e.g., Q18125 and Q21525592 for Manchester)
  - Pagination added to handle >500 results per borough
  - Oldest entry: 1301 (Manchester)

### 5. OpenStreetMap
- **Script:** `scripts/fetch_osm.py`
- **API:** [Overpass API](https://overpass-api.de/api/interpreter)
- **Features:** 4,649
- **With construction dates:** 4,634 (99%)
- **Fields:** Name, start_year, architect, building_levels, address, wikidata ID, wikipedia link, heritage status
- **License:** ODbL
- **Notes:**
  - Queries buildings with `start_date` tag
  - Auto-splits chunks on timeout (max depth 2)
  - Richest metadata of all sources
  - Some chunks may fail - check warnings in output
  - Oldest entry: 1552 (The Old Wellington Inn)

## Data Pipeline

```
fetch_historic_england.py  ─┐
fetch_wikidata.py          ─┼─► data/sources/*.json ─► consolidate_data.py ─► data/unified_sites.geojson
fetch_osm.py               ─┘
```

Run all fetchers then consolidate:
```bash
python scripts/fetch_historic_england.py
python scripts/fetch_wikidata.py
python scripts/fetch_osm.py
python scripts/consolidate_data.py
```

## Potential Future Sources

### Open Domesday (1086 Medieval Data)
- **Website:** https://opendomesday.org/
- **API Docs:** https://opendomesday.org/api/
- **Data:** Medieval settlements from Domesday Book with coordinates
- **Endpoints:**
  - `PlacesNear` - places within radius of point
  - `Place` - individual location with WGS84 coords
  - `Manor` - economic/population statistics
  - `Hundred` - administrative divisions
- **License:** CC BY-NC-SA
- **Status:** API may have changed - needs testing
- **Value:** Would add 1086 baseline data for Greater Manchester area

### Greater Manchester Historic Environment Record (HER)
- **Website:** https://gmaas.salford.ac.uk/historic-environment-record/
- **Data:** ~20,000 entries covering archaeological sites, historic buildings, find-spots
- **Access:**
  - Free online search via [Heritage Gateway](https://www.heritagegateway.org.uk/)
  - Data requests: contact Lesley Dunkley at l.dunkley@salford.ac.uk or 0161 295 6910
  - Commercial use subject to admin fee
  - Non-commercial may be free
- **Formats:** ESRI shapefiles, PDF maps, PDF reports
- **Value:** Most comprehensive local dataset, includes non-designated sites

### Heritage Gateway
- **Website:** https://www.heritagegateway.org.uk/
- **Data:** Cross-searches 60+ heritage resources
- **Access:** Free web search, no bulk API
- **Notes:** Good for manual research, not automated fetching

### Archaeology Data Service (ADS)
- **Website:** https://archaeologydataservice.ac.uk/
- **SPARQL:** Available via STELLAR project
- **Data:** Archaeological archives with linked data
- **License:** Varies by dataset
- **Value:** Academic archaeological data

### Ordnance Survey NGD Buildings
- **Website:** https://www.ordnancesurvey.co.uk/products/os-ngd-buildings
- **Data:** Building ages, construction materials, floor areas
- **Access:**
  - Free for PSGA (Public Sector Geospatial Agreement) members
  - Licensed for others
- **Notes:** Released March 2024, very comprehensive but restricted access

### Victoria County History (VCH)
- **Website:** https://www.british-history.ac.uk/vch/lancs
- **Data:** Detailed parish histories including buildings and ownership
- **Access:** Free text online
- **Notes:** No API - would require text scraping/manual extraction
- **Value:** Authoritative ownership chains, especially pre-1900

## Not Viable Sources

| Source | Reason |
|--------|--------|
| Pevsner Guides | Books only, no digital API |
| VOA Dwelling Ages | Aggregated by LSOA, not individual buildings |
| Verisk UKBuildings | Commercial/paid |
| Doorda Building Age | Commercial/paid |

## Schema

All sources are normalized to this schema in `unified_sites.geojson`:

```json
{
  "type": "Feature",
  "geometry": {"type": "Point", "coordinates": [lng, lat]},
  "properties": {
    "name": "Building Name",
    "source": "osm|wikidata|he_listed_buildings|...",
    "source_display": "Human readable source",
    "site_type": "Listed Building|Church|House|...",
    "list_entry": "HE list entry number",
    "hyperlink": "URL to source",
    "ngr": "National Grid Reference",
    "grade": "I|II*|II",
    "listed_year": 1967,
    "start_year": 1850,
    "end_year": null,
    "owners": [],
    "has_ownership_data": false,
    "architect": "Architect name (OSM only)",
    "building_levels": "3 (OSM only)",
    "address": "Street address (OSM only)",
    "heritage": "Heritage status (OSM only)",
    "wikidata_id": "Q12345 (OSM only)",
    "wikipedia": "en:Article_Name (OSM only)"
  }
}
```

## Notes on Dates

- `start_year`: When the building was constructed
- `listed_year`: When it was designated/listed (HE sources)
- Sites without `start_year` default to 2026 so they only appear at max slider position
- This keeps historical timeline views clean

## Known Data Quality Issues

### Non-Building Entries
Some Wikidata entries are places/settlements rather than buildings:
- **"Manchester" (1301)** - The city itself, not a building. Wikidata inception date refers to first recorded mention.

### Moved Buildings
- **"The Old Wellington Inn" (1552)** - Originally built 1552, but was physically moved 300 meters in 1999 during post-IRA bombing reconstruction. The current location differs from the original. This is not documented in any data source.

### Missing Construction Dates
Notable buildings with known construction dates that are missing from automated sources:
- **Chetham's Hospital/Library (1653)** - One of Manchester's oldest buildings. Exists in HE Listed Buildings but without construction date. Would need manual addition to curated dataset.

### Duplicate Entries
Buildings may appear in multiple sources (OSM, Wikidata, HE) as separate points. No automatic deduplication is performed. Examples:
- The Old Wellington Inn appears 3 times (OSM, Wikidata, HE)
- Many HE listed buildings also have Wikidata entries

### Imprecise Dates
- OSM `start_date` values like "1870s" are parsed to 1870
- Date ranges like "1880-1890" use the start year
- "Century" dates are skipped as too vague

### Potential Improvements
1. Filter out non-building Wikidata entries (settlements, cities)
2. Add notes field for significant historical events (moves, rebuilds)
3. Create curated dataset for notable buildings with researched dates
4. Implement deduplication based on coordinates or wikidata IDs

## Contact for Data Requests

**Greater Manchester Archaeological Advisory Service (GMAAS)**
- Email: gmaas@salford.ac.uk
- HER Officer: Lesley Dunkley - l.dunkley@salford.ac.uk
- Phone: 0161 295 6910
- Address: University of Salford
