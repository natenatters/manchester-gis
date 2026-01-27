# Local Map Tiles

Place georeferenced map images here for use with the `single_tile` imagery provider.

## Usage

Add to your project's `config.json`:

```json
{
  "type": "single_tile",
  "name": "1650 Berry Sketch",
  "url": "/data/tiles/berry_1650.jpg",
  "yearStart": 1600,
  "yearEnd": 1700,
  "bounds": {
    "west": -2.255,
    "south": 53.478,
    "east": -2.238,
    "north": 53.488
  },
  "credit": "Source attribution"
}
```

## Georeferencing Tips

1. Use QGIS or similar to georeference your scanned map
2. Note the corner coordinates (WGS84 / EPSG:4326)
3. Export as JPG or PNG
4. Adjust `bounds` in config to match

## Current Maps

- `berry_1650.jpg` - "A Plan of Manchester and Salford taken about 1650"
