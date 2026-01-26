# API Reference Guide

This document provides practical examples and gotchas for each API used in this project.

---

## 1. Historic England - ArcGIS REST API

### Base URL
```
https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer
```

### Layers
| Layer ID | Name |
|----------|------|
| 0 | Listed Buildings (points) |
| 6 | Scheduled Monuments |
| 7 | Parks and Gardens |

### Example Query
```bash
curl "https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer/0/query" \
  --data-urlencode "where=1=1" \
  --data-urlencode "geometry=351000,389000,406000,421000" \
  --data-urlencode "geometryType=esriGeometryEnvelope" \
  --data-urlencode "inSR=27700" \
  --data-urlencode "outSR=4326" \
  --data-urlencode "outFields=*" \
  --data-urlencode "f=geojson" \
  --data-urlencode "resultRecordCount=1000" \
  --data-urlencode "resultOffset=0"
```

### Key Parameters
| Parameter | Description |
|-----------|-------------|
| `geometry` | Bounding box: `xmin,ymin,xmax,ymax` |
| `inSR` | Input spatial reference (27700 = British National Grid) |
| `outSR` | Output spatial reference (4326 = WGS84 for web maps) |
| `resultRecordCount` | Max records per request (max 2000) |
| `resultOffset` | For pagination |
| `f` | Format: `geojson` or `json` |

### Greater Manchester Bounding Box (BNG)
```
xmin: 351000
ymin: 389000
xmax: 406000
ymax: 421000
```

### Gotchas

1. **Coordinate System**: Data is in British National Grid (EPSG:27700). Always use `inSR=27700` and `outSR=4326` to convert to WGS84.

2. **Max Records**: API returns max 2000 records per request. Use `resultOffset` for pagination:
   ```python
   offset = 0
   while True:
       response = query(resultOffset=offset, resultRecordCount=2000)
       if len(response.features) < 2000:
           break
       offset += 2000
   ```

3. **No Construction Dates**: The API provides `ListDate` (when listed) not construction date. Buildings are centuries older than their listing dates.

4. **Rate Limiting**: No strict rate limit observed, but be respectful. 1-2 second delays recommended.

5. **Field Names**: Use `outFields=*` to get all fields. Key fields:
   - `Name` - Building name
   - `Grade` - I, II*, or II
   - `ListEntry` - Unique identifier
   - `ListDate` - Milliseconds timestamp of listing date

---

## 2. Wikidata SPARQL API

### Endpoint
```
https://query.wikidata.org/sparql
```

### Example Query
```sparql
SELECT DISTINCT ?item ?itemLabel (SAMPLE(?coord) AS ?coord) (SAMPLE(?inception) AS ?inception)
WHERE {
  ?item wdt:P131 wd:Q21525592 .  # Located in Manchester
  ?item wdt:P625 ?coord .         # Has coordinates
  OPTIONAL { ?item wdt:P571 ?inception . }  # Inception date (optional)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?item ?itemLabel
LIMIT 500
OFFSET 0
```

### Key Properties (P-codes)
| Property | Code | Description |
|----------|------|-------------|
| Located in | P131 | Administrative location |
| Coordinates | P625 | Geographic coordinates |
| Inception | P571 | Date founded/built |
| Image | P18 | Photo |
| Heritage designation | P1435 | Listed status |

### Greater Manchester Borough IDs
```python
GM_BOROUGHS = {
    # Must include BOTH city and metropolitan borough for each area
    "Q21525592": "Manchester",  # metropolitan borough
    "Q18125": "Manchester",     # city
    "Q207231": "Salford",       # city
    "Q1435428": "Salford",      # metropolitan borough
    "Q746176": "Bolton",        # town
    "Q894548": "Bolton",        # metropolitan borough
    # ... etc
}
```

### Gotchas

1. **DISTINCT is Critical**: Items can have multiple coordinates. Without `DISTINCT` + `GROUP BY`, pagination with OFFSET will skip items:
   ```sparql
   -- BAD: Items with 2 coords appear twice, pagination breaks
   SELECT ?item ?coord WHERE { ... } LIMIT 500 OFFSET 500

   -- GOOD: Use SAMPLE() to get one coord per item
   SELECT DISTINCT ?item (SAMPLE(?coord) AS ?coord) WHERE { ... } GROUP BY ?item
   ```

2. **City vs Borough**: Wikidata has separate entities for "Manchester" the city (Q18125) and "Manchester" the metropolitan borough (Q21525592). Buildings may be tagged with either. Query BOTH.

3. **Timeouts**: Complex queries timeout after 60s. Solutions:
   - Query each borough separately
   - Avoid recursive paths like `wdt:P131+` (located in hierarchy)
   - Use pagination (LIMIT/OFFSET)

4. **User-Agent Required**: Always include a User-Agent header:
   ```python
   headers = {
       "Accept": "application/sparql-results+json",
       "User-Agent": "MyProject/1.0 (contact@example.com)"
   }
   ```

5. **Rate Limiting**: Wikidata is generous but will block abuse. Use 1-2 second delays between requests.

6. **Coordinate Format**: Returns `Point(lng lat)` format, needs parsing:
   ```python
   def parse_coord(point_str):
       # "Point(-2.244 53.486)" -> (-2.244, 53.486)
       coords = point_str.replace("Point(", "").replace(")", "").split()
       return float(coords[0]), float(coords[1])
   ```

---

## 3. OpenStreetMap Overpass API

### Endpoint
```
https://overpass-api.de/api/interpreter
```

### Example Query
```
[out:json][timeout:90];
(
  way["building"]["start_date"](53.45,-2.35,53.52,-2.20);
  node["historic"]["start_date"](53.45,-2.35,53.52,-2.20);
  way["historic"]["start_date"](53.45,-2.35,53.52,-2.20);
);
out center;
```

### Query Syntax
```
[out:json]           # Output format
[timeout:90]         # Query timeout in seconds
[bbox:s,w,n,e]       # Alternative bbox syntax

way["key"]           # Ways with this key
way["key"="value"]   # Ways with key=value
way["key"](bbox)     # Ways in bounding box

out center;          # Output with center point for ways
out geom;            # Output with full geometry
```

### Useful Tags for Historic Buildings
| Tag | Description |
|-----|-------------|
| `start_date` | Construction date (various formats) |
| `building` | Building type |
| `architect` | Architect name |
| `heritage` | Heritage grade |
| `wikidata` | Wikidata Q-ID |
| `wikipedia` | Wikipedia article |
| `building:levels` | Number of floors |

### Gotchas

1. **Timeouts (504/503)**: Large areas timeout. Split into chunks:
   ```python
   GM_CHUNKS = [
       (53.45, -2.35, 53.52, -2.20),  # Manchester core
       (53.52, -2.35, 53.58, -2.20),  # North Manchester
       # ... more chunks
   ]
   ```

2. **Auto-Split on Failure**: Implement recursive splitting:
   ```python
   def query_chunk(bbox, depth=0):
       result = query(bbox)
       if timeout and depth < 2:
           # Split into 4 quadrants and retry
           for sub_bbox in split_bbox(bbox):
               result += query_chunk(sub_bbox, depth+1)
       return result
   ```

3. **Rate Limiting**: Overpass prefers 5-10 second delays between requests. Getting rate limited (429) means wait 60+ seconds.

4. **Date Formats**: `start_date` has many formats:
   ```python
   def parse_date(s):
       if s.endswith('s'):        # "1870s" -> 1870
           return int(s[:-1])
       if '-' in s:               # "1880-1890" -> 1880
           return int(s.split('-')[0][:4])
       return int(s[:4])          # "1890-01-01" -> 1890
   ```

5. **Center vs Geom**: Use `out center` for ways to get a single point. `out geom` returns full polygon (larger response).

6. **Connection Errors**: Overpass can be flaky. Implement retry logic:
   ```python
   for attempt in range(3):
       try:
           response = requests.post(url, data=query, timeout=120)
           if response.status_code == 200:
               return response.json()
       except requests.exceptions.ConnectionError:
           time.sleep(10)
   ```

---

## 4. Open Domesday (HTML Scraping)

### Website
```
https://opendomesday.org/
```

### Status
As of January 2026, the documented REST API endpoints (`/api/1.0/*`) return 404 errors. The website still functions, so we scrape the HTML pages directly.

### URL Patterns
| Pattern | Description |
|---------|-------------|
| `/place/{grid_ref}/{name}/` | Individual place page |
| `/hundred/{name}/` | Hundred (admin division) with place list |
| `/map/` | Interactive map |

### Example URLs
```
https://opendomesday.org/place/SJ8398/manchester/
https://opendomesday.org/place/SJ8298/salford/
https://opendomesday.org/hundred/salford/
```

### Greater Manchester Coverage
The modern Greater Manchester area was the **Salford Hundred** in 1086, recorded under Cheshire (not Lancashire). Only 5 places are named:

| Place | Grid Ref | Households |
|-------|----------|------------|
| Salford | SJ8298 | 63 |
| Manchester | SJ8398 | 0 (church lands) |
| Radcliffe | SD7807 | 0 |
| Rochdale | SD8913 | 0 |
| Ashton-under-Lyne | SJ9399 | 0 |

Note: The "21 berewicks" (sub-manors) mentioned in Domesday are NOT individually named.

### Data Available
- Settlement name and location (WGS84 coordinates)
- Grid reference (British National Grid)
- Hundred and county
- Household count
- Landholders in 1066 and 1086
- Tenant-in-chief
- Resources (churches, mills, ploughlands, etc.)
- Phillimore reference and folio number

### Gotchas

1. **API Down**: The REST API (`/api/1.0/*`) returns 404s. Use HTML scraping instead.

2. **HTML Parsing**: Page structure may change. The fetcher uses regex patterns that may need updating if the site redesigns.

3. **Limited Coverage**: Only settlements that can be located today are included. Many 1086 places are lost.

4. **License**: Data is CC BY-NC-SA - non-commercial use only.

5. **Lancashire Doesn't Exist**: In 1086, "Lancashire" didn't exist as a county. The area was recorded as "Inter Ripam et Mersham" (between Ribble and Mersey) under Cheshire.

6. **Rate Limiting**: Be respectful - 1 second delay between requests recommended.

### Implementation
See `scripts/fetch_domesday.py` which:
1. Fetches the Salford hundred page for place list
2. Scrapes each place's detail page
3. Parses coordinates, households, resources via regex
4. Outputs to `data/sources/domesday_sites.json`

---

## Common Patterns

### Pagination Template
```python
def fetch_all(query_fn, page_size=500):
    all_results = []
    offset = 0
    while True:
        results = query_fn(limit=page_size, offset=offset)
        all_results.extend(results)
        if len(results) < page_size:
            break
        offset += page_size
        time.sleep(1)
    return all_results
```

### Retry with Backoff
```python
def retry_request(fn, max_retries=3):
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(10 * (attempt + 1))
            else:
                raise
```

### Coordinate Conversion (BNG to WGS84)
```python
# Using pyproj
from pyproj import Transformer
transformer = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)
lng, lat = transformer.transform(easting, northing)

# Or let the API do it with inSR/outSR parameters
```

---

## Testing APIs

### Quick Health Checks
```bash
# Historic England - should return JSON
curl "https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer/0?f=json"

# Wikidata - should return SPARQL results
curl -H "Accept: application/json" "https://query.wikidata.org/sparql?query=SELECT%20*%20WHERE%20%7B%20wd%3AQ18125%20%3Fp%20%3Fo%20%7D%20LIMIT%201"

# Overpass - should return JSON
curl -d "data=[out:json];node(53.48,-2.25,53.49,-2.24);out;" "https://overpass-api.de/api/interpreter"
```
