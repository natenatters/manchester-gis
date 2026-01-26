# Manchester Historical Land Ownership 3D GIS Mapping Project

## Project Specification v1.0

**Goal:** Create an interactive 3D web application that visualizes land ownership and control in the Greater Manchester area from 1086 (Domesday Book) to the present day, with a time slider to animate changes through the centuries.

---

## 1. Project Overview

### 1.1 Scope
- **Geographic Area:** Greater Manchester, centred on the historic Salford Hundred
- **Time Period:** 1086 CE to present
- **Core Feature:** Interactive 3D map with temporal slider showing ownership changes
- **Output:** Web application (JavaScript/WebGL)

### 1.2 Key Visualization Goals
- Plot medieval settlement centres (moated sites, manor houses, churches)
- Show territorial boundaries (townships, parishes, manors)
- Animate ownership transfers between families/entities over time
- Overlay historical maps on 3D terrain
- Highlight archaeological features (Nico Ditch, Roman roads)

---

## 2. Data Sources

### 2.1 FREE GIS Data - Direct Downloads

#### Historic England Open Data Hub
**URL:** https://opendata-historicengland.hub.arcgis.com/

| Dataset | Format | Use |
|---------|--------|-----|
| Scheduled Monuments | GeoJSON, Shapefile, KML, CSV | Medieval moated sites, Nico Ditch sections, Roman features |
| Listed Buildings | GeoJSON, Shapefile | Historic manor houses, churches, halls |
| Registered Parks & Gardens | GeoJSON, Shapefile | Later estate boundaries |

**Direct link:** https://historicengland.org.uk/listing/the-list/data-downloads/

**Licence:** Open Government Licence (free to use)

#### Atlas of Rural Settlement in England
**URL:** https://historicengland.org.uk/research/current/heritage-science/atlas-of-rural-settlement-in-england/

- Shapefile + KMZ formats
- Maps 19th century settlement patterns
- Settlement provinces and terrain zones
- Useful for understanding nucleated vs dispersed settlement

#### Environment Agency LIDAR
**URL:** https://environment.data.gov.uk/DefraDataDownload/?Mode=survey

- High-resolution terrain elevation data
- Reveals earthworks (Nico Ditch sections, moats, field systems)
- 1m and 2m resolution available
- Free download by tile

#### National Library of Scotland - Historic Maps
**URL:** https://maps.nls.uk/

- Georeferenced historic Ordnance Survey maps (1840s onwards)
- XYZ tile layers for direct use in web maps
- Tithe maps (some areas)

#### Ordnance Survey Open Data
**URL:** https://osdatahub.os.uk/downloads/open

- Modern boundaries (parishes, districts)
- Terrain 50 (elevation)
- Open Roads, Open Rivers

### 2.2 Greater Manchester Historic Environment Record (GMAAS)

**Contact:** gmaas@salford.ac.uk | 0161 295 6910

**What they have:**
- ~20,000 monument/site records
- 54,000 Historic Landscape Characterisation polygons
- Medieval moated sites with coordinates
- Anglo-Saxon finds and features
- Historic township/parish boundaries

**How to request:**
1. Email requesting GIS data for research project
2. Specify: medieval moated sites, manor locations, Anglo-Saxon sites, historic boundaries
3. Request format: ESRI Shapefile or GeoJSON
4. Usually free/low-cost for personal research

**Alternative access:** https://www.heritagegateway.org.uk/gateway/
- Online search interface
- Can filter by period (Early Medieval, Medieval)
- Can filter by monument type
- Select "Greater Manchester" HER

### 2.3 Historical Documentary Sources (for ownership data)

#### Victoria County History (FREE)
**URL:** https://www.british-history.ac.uk/vch/lancs

- Complete township-by-township histories
- Ownership chains from medieval period
- Manorial descent documented
- **Essential for building the ownership database**

#### Key Documentary Records by Period

| Period | Source | Detail Level |
|--------|--------|--------------|
| 1086 | Domesday Book | Sparse - only major holders named |
| 1212 | Lancashire Survey | Named holders for major manors |
| 13th-14th c | Inquisitions Post Mortem | Detailed ownership on death |
| 13th c+ | Manorial records, charters | Variable |
| 1780s-1832 | Land Tax Returns | Annual owner lists |
| 1830s-40s | Tithe Maps | Every parcel with owner/occupier |
| 1910 | Valuation Office Survey | Detailed maps with owners |

---

## 3. Historical Context (Background for Implementation)

### 3.1 The 1086 Baseline (Domesday Book)

**Salford Hundred in 1086:**
- King Edward held Salford in 1066: 3 hides, forest 3 leagues square
- Manchester: Churches of St Mary and St Michael held 1 carucate
- **21 berewicks** (sub-manors) held by 21 thegns - only Rochdale (held by Gamal) is named
- Post-Conquest: Roger de Poitou granted land to knights (Nigel, Warin, Geoffrey, Gamal)
- Total recorded: ~52 people, 22 ploughs, worth £7

**Critical limitation:** The 21 berewicks are NOT individually named. This is a data gap that cannot be filled with certainty.

### 3.2 Key Landholding Families to Track

| Family | Primary Holdings | Period |
|--------|-----------------|--------|
| de Greslé/Grelley | Manor of Manchester (barony) | c.1100-1310 |
| de la Warre | Inherited Manchester manor | 1310-1579 |
| Mosley | Purchased Manchester manor | 1596+ |
| de Trafford | Trafford, Stretford | Medieval-present |
| Byron | Clayton | Medieval-17th c |
| Radcliffe | Ordsall, Radcliffe | Medieval-17th c |
| Barlow | Barlow, Chorlton | Medieval+ |
| Chetham | Various (banking family) | 15th-17th c |
| de Lacy | Penwortham, Tottington fees | 13th c+ |
| Booth | Barton, Dunham | Medieval+ |
| Arderne | Harden, later Bredbury | Medieval+ |

### 3.3 Physical Evidence for Early Settlement

**Confirmed structures from 1086:**
- St Mary's Church, Manchester (now Cathedral site)
- St Michael's Church (possibly Ashton-under-Lyne)

**Nico Ditch (Anglo-Saxon earthwork):**
- 6-mile linear earthwork, 5th-11th century
- Route: Ashton-under-Lyne → Denton → Reddish → Gorton → Levenshulme → Burnage → Rusholme → Platt Fields → Withington → Chorlton-cum-Hardy → Stretford
- Scheduled Ancient Monument sections at Platt Fields and Denton Golf Course
- Proves organized territorial administration pre-1086

**Medieval moated sites (likely berewick centres):**
- Bury Castle (c.1469)
- Radcliffe Tower (c.1403)
- Peel Hall, Wythenshawe
- Timperley Old Hall
- Stayley Hall
- Baguley Hall
- Clayton Hall

**Place-name evidence for settlement origins:**
- British names: Eccles, Chadderton (northwest)
- Anglian -ton names: Clayton, Gorton, Moston (east) - likely berewick centres
- Danish -hulme names: Cheadle Hulme, Davyhulme, Hulme, Levenshulme (southwest)

---

## 4. Technical Architecture

### 4.1 Recommended Stack

**Data Processing (Python):**
```
geopandas          # Read/write shapefiles, GeoJSON
pandas             # Historical ownership tables
shapely            # Geometry operations
pyproj             # Coordinate transformation (BNG to WGS84)
```

**3D Visualization (JavaScript):**
```
CesiumJS           # Recommended - built-in terrain, time slider, map overlays
                   # Alternative: deck.gl for data-heavy visualization
```

**Why CesiumJS:**
- Native 3D globe with terrain
- Built-in timeline/time slider widget
- Supports GeoJSON, KML directly
- Historical imagery overlay support
- Free for non-commercial use

### 4.2 Data Model

#### Locations Table
```
location_id     VARCHAR PRIMARY KEY
name            VARCHAR
type            VARCHAR     -- 'manor', 'township', 'parish', 'moated_site', 'church'
geometry        GEOMETRY    -- Point or Polygon
earliest_date   INTEGER     -- Year first attested
source          VARCHAR     -- 'domesday', 'her', 'vch', etc.
notes           TEXT
```

#### Ownership Table
```
ownership_id    SERIAL PRIMARY KEY
location_id     VARCHAR REFERENCES locations
owner_name      VARCHAR
owner_family    VARCHAR     -- For grouping/colouring
owner_type      VARCHAR     -- 'individual', 'family', 'institution', 'crown'
start_year      INTEGER
end_year        INTEGER     -- NULL if current
acquisition     VARCHAR     -- 'inheritance', 'purchase', 'grant', 'conquest'
source          VARCHAR
certainty       VARCHAR     -- 'certain', 'probable', 'inferred'
```

#### Boundaries Table
```
boundary_id     SERIAL PRIMARY KEY
name            VARCHAR
type            VARCHAR     -- 'parish', 'township', 'hundred', 'manor'
geometry        POLYGON
valid_from      INTEGER
valid_to        INTEGER
source          VARCHAR
```

### 4.3 Coordinate Systems

**Input data will likely be in:**
- British National Grid (EPSG:27700) - Historic England data
- WGS84 (EPSG:4326) - Most web sources

**Output for CesiumJS:**
- WGS84 (EPSG:4326)

**Conversion:**
```python
import geopandas as gpd

# Read BNG data
gdf = gpd.read_file("scheduled_monuments.shp")

# Convert to WGS84
gdf_wgs84 = gdf.to_crs(epsg=4326)

# Export to GeoJSON
gdf_wgs84.to_file("monuments.geojson", driver="GeoJSON")
```

---

## 5. Implementation Phases

### Phase 1: Data Acquisition & Processing
1. Download Historic England datasets (Scheduled Monuments, Listed Buildings)
2. Filter to Greater Manchester bounding box
3. Request GMAAS data via email
4. Download LIDAR tiles for area
5. Convert all to WGS84 GeoJSON

### Phase 2: Historical Research & Database
1. Extract ownership data from VCH (township by township)
2. Build ownership table with temporal attributes
3. Link locations to ownership records
4. Digitize/acquire historic boundary data

### Phase 3: Basic 3D Viewer
1. Set up CesiumJS application
2. Load terrain (Cesium World Terrain or LIDAR-derived)
3. Display monument points with popups
4. Add historic map overlay (NLS tiles)

### Phase 4: Temporal Features
1. Implement time slider
2. Colour-code by owner/family
3. Animate boundary changes
4. Add ownership info panels

### Phase 5: Enhancement
1. 3D building models for key sites
2. Tour/narrative mode
3. Search functionality
4. Export/share features

---

## 6. Bounding Box

**Greater Manchester approximate bounds (WGS84):**
```
Southwest: 53.35, -2.75
Northeast: 53.70, -1.90
```

**For filtering Historic England data:**
```python
# Filter GeoDataFrame to Greater Manchester
bbox = (-2.75, 53.35, -1.90, 53.70)
gdf_gm = gdf.cx[bbox[0]:bbox[2], bbox[1]:bbox[3]]
```

---

## 7. Key Challenges & Mitigations

| Challenge | Mitigation |
|-----------|------------|
| 21 berewicks unnamed in Domesday | Use moated sites + -ton place names as proxies |
| Saxon→Norman discontinuity | Accept gap; trace forward from 1212 survey |
| Boundary changes over time | Multiple boundary layers with temporal validity |
| Data gaps pre-1200 | Mark certainty levels; use "inferred" category |
| Coordinate system mismatches | Standardize all to WGS84 early in pipeline |

---

## 8. Sample Code Snippets

### 8.1 Download and Filter Historic England Data
```python
import geopandas as gpd
import requests
from io import BytesIO
from zipfile import ZipFile

# Historic England Scheduled Monuments GeoJSON API
url = "https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/Scheduled_Monuments/FeatureServer/0/query"
params = {
    "where": "1=1",
    "outFields": "*",
    "f": "geojson",
    "geometry": "-2.75,53.35,-1.90,53.70",
    "geometryType": "esriGeometryEnvelope",
    "inSR": "4326",
    "spatialRel": "esriSpatialRelIntersects"
}

response = requests.get(url, params=params)
gdf = gpd.read_file(BytesIO(response.content))

print(f"Found {len(gdf)} scheduled monuments in Greater Manchester")
gdf.to_file("gm_scheduled_monuments.geojson", driver="GeoJSON")
```

### 8.2 Basic CesiumJS Setup
```html
<!DOCTYPE html>
<html>
<head>
    <script src="https://cesium.com/downloads/cesiumjs/releases/1.104/Build/Cesium/Cesium.js"></script>
    <link href="https://cesium.com/downloads/cesiumjs/releases/1.104/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
    <style>
        #cesiumContainer { width: 100%; height: 100vh; margin: 0; padding: 0; }
    </style>
</head>
<body>
    <div id="cesiumContainer"></div>
    <script>
        // Initialize viewer centred on Manchester
        const viewer = new Cesium.Viewer('cesiumContainer', {
            terrainProvider: Cesium.createWorldTerrain(),
            timeline: true,
            animation: true
        });

        // Fly to Manchester
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-2.24, 53.48, 50000),
            orientation: {
                heading: Cesium.Math.toRadians(0),
                pitch: Cesium.Math.toRadians(-45),
                roll: 0
            }
        });

        // Load GeoJSON monuments
        Cesium.GeoJsonDataSource.load('gm_scheduled_monuments.geojson', {
            stroke: Cesium.Color.RED,
            fill: Cesium.Color.RED.withAlpha(0.5),
            strokeWidth: 2,
            markerSymbol: '🏰'
        }).then(dataSource => {
            viewer.dataSources.add(dataSource);
        });

        // Set time range for historical data
        viewer.timeline.zoomTo(
            Cesium.JulianDate.fromIso8601('1086-01-01'),
            Cesium.JulianDate.fromIso8601('2025-01-01')
        );
    </script>
</body>
</html>
```

### 8.3 Adding Temporal Properties
```javascript
// For entities with time-based visibility
entity.availability = new Cesium.TimeIntervalCollection([
    new Cesium.TimeInterval({
        start: Cesium.JulianDate.fromIso8601('1100-01-01'),
        stop: Cesium.JulianDate.fromIso8601('1310-12-31')
    })
]);

// Entity only visible when timeline is in this range
```

---

## 9. Output Deliverables

1. **Web Application** - Interactive 3D map with time slider
2. **GeoJSON Files** - Processed spatial data
3. **Ownership Database** - CSV/JSON with temporal ownership records
4. **Documentation** - Data sources, methodology, known gaps

---

## 10. Resources & Links

### Data Downloads
- Historic England Open Data: https://opendata-historicengland.hub.arcgis.com/
- Historic England Downloads: https://historicengland.org.uk/listing/the-list/data-downloads/
- Atlas of Rural Settlement: https://historicengland.org.uk/research/current/heritage-science/atlas-of-rural-settlement-in-england/
- Heritage Gateway: https://www.heritagegateway.org.uk/gateway/
- NLS Historic Maps: https://maps.nls.uk/
- OS Open Data: https://osdatahub.os.uk/downloads/open
- LIDAR Data: https://environment.data.gov.uk/DefraDataDownload/?Mode=survey

### Historical Sources
- Victoria County History Lancashire: https://www.british-history.ac.uk/vch/lancs
- Domesday Book Online: https://opendomesday.org/

### Technical Documentation
- CesiumJS: https://cesium.com/learn/cesiumjs/
- GeoPandas: https://geopandas.org/
- EPSG:27700 (BNG): https://epsg.io/27700

### Contact
- GMAAS: gmaas@salford.ac.uk | 0161 295 6910

---

*Spec Version 1.0 | January 2026*
