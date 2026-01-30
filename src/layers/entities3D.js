/**
 * 3D Entity Loader
 *
 * Simple loader for pre-generated 3D geometry.
 * Reads fort_entities.json and building_entities.json and creates Cesium entities.
 *
 * Buildings can be tied to specific map layers via the `maps` property.
 * When a map layer is visible, buildings with that map defined will render at that position.
 */

import * as Cesium from 'cesium';

// Map layer name to map ID mapping
// Keys are the layer names from config.json, values are the map IDs used in building data
const MAP_LAYER_TO_ID = {
    '1650 Berry Sketch': 'berry_1650',
    '1750 Berry Map': 'berry_1750',
    '1845 OS Lancashire': 'os_1845',
    'OS 1:10,560 (1940s-1960s)': 'os_1950s',
    'Modern (Google Satellite)': 'modern'
};

// Reverse mapping
const MAP_ID_TO_LAYER = Object.fromEntries(
    Object.entries(MAP_LAYER_TO_ID).map(([k, v]) => [v, k])
);

/**
 * Load 3D entities from generated data files
 * @param {string} projectPath - Path to project folder
 * @param {number} currentYear - Current year for visibility
 * @returns {Promise<Cesium.CustomDataSource>}
 */
export async function loadEntities3D(projectPath, currentYear = 200) {
    const dataSource = new Cesium.CustomDataSource('entities3d');
    dataSource._allItems = []; // Track all forts + buildings for visibility
    dataSource._visibleMaps = new Set(); // Track which map layers are visible
    dataSource._buildingsByMap = {}; // Map ID -> array of buildings on that map
    dataSource._materials = null; // Store materials for later entity creation

    // Load forts
    await loadEntityFile(dataSource, `${projectPath}/fort_entities.json`, 'forts', currentYear);

    // Load historic buildings
    await loadEntityFile(dataSource, `${projectPath}/building_entities.json`, 'buildings', currentYear);

    return dataSource;
}

/**
 * Load entities from a single JSON file
 */
async function loadEntityFile(dataSource, url, itemKey, currentYear) {
    try {
        const response = await fetch(url);
        if (!response.ok) return;

        const data = await response.json();
        const materials = buildMaterials(data.materials);
        dataSource._materials = materials; // Store for later
        const items = data[itemKey] || data.forts || data.buildings || [];

        for (const item of items) {
            const inTimeRange = currentYear >= item.startYear && currentYear <= item.endYear;

            // Store original coords for each entity (for transforms)
            for (const entity of item.entities) {
                if (entity.coords) {
                    entity._originalCoords = entity.coords.map(c => [...c]);
                }
                if (entity.outer) {
                    entity._originalOuter = entity.outer.map(c => [...c]);
                }
                if (entity.inner) {
                    entity._originalInner = entity.inner.map(c => [...c]);
                }
                if (entity.position) {
                    entity._originalPosition = [...entity.position];
                }
            }

            // Check if building uses map-based positioning
            if (item.maps) {
                // Map-based building: create entities for each map it's on
                // Initially hidden until map visibility is set
                for (const [mapId, mapData] of Object.entries(item.maps)) {
                    // Index building by map
                    if (!dataSource._buildingsByMap[mapId]) {
                        dataSource._buildingsByMap[mapId] = [];
                    }
                    dataSource._buildingsByMap[mapId].push(item);

                    // Create entities for this map instance (initially hidden)
                    const show = false; // Will be shown when map visibility is set
                    createBuildingEntitiesForMap(dataSource, item, mapId, mapData, materials, show && inTimeRange);
                }
            } else {
                // Legacy building without maps: show based on year only
                for (const entity of item.entities) {
                    addEntity(dataSource, entity, item, materials, inTimeRange, null);
                }
            }

            dataSource._allItems.push(item);
        }

        console.log(`Loaded ${items.length} ${itemKey} from ${url.split('/').pop()}`);

    } catch (err) {
        console.warn(`Error loading ${url}:`, err);
    }
}

/**
 * Create building entities positioned for a specific map
 */
function createBuildingEntitiesForMap(dataSource, building, mapId, mapData, materials, show) {
    const originalCenter = building.center;
    const originalRotation = building.rotation || 0;
    const targetCenter = mapData.center || originalCenter;
    const targetRotation = mapData.rotation !== undefined ? mapData.rotation : originalRotation;

    // Calculate transform
    const deltaLng = targetCenter[0] - originalCenter[0];
    const deltaLat = targetCenter[1] - originalCenter[1];
    const deltaRotation = targetRotation - originalRotation;

    for (const entityDef of building.entities) {
        // Clone entity definition with transformed coords
        const transformedEntity = { ...entityDef };

        if (entityDef._originalCoords) {
            transformedEntity.coords = transformCoords(
                entityDef._originalCoords,
                originalCenter,
                deltaLng, deltaLat, deltaRotation
            );
        }
        if (entityDef._originalOuter) {
            transformedEntity.outer = transformCoords(
                entityDef._originalOuter,
                originalCenter,
                deltaLng, deltaLat, deltaRotation
            );
        }
        if (entityDef._originalInner) {
            transformedEntity.inner = transformCoords(
                entityDef._originalInner,
                originalCenter,
                deltaLng, deltaLat, deltaRotation
            );
        }
        if (entityDef._originalPosition) {
            transformedEntity.position = transformCoords(
                [entityDef._originalPosition],
                originalCenter,
                deltaLng, deltaLat, deltaRotation
            )[0];
        }

        addEntity(dataSource, transformedEntity, building, materials, show, mapId);
    }
}

/**
 * Add a single entity to the data source
 * @param {string|null} mapId - If provided, suffix entity ID with map ID
 */
function addEntity(dataSource, entity, fort, materials, show, mapId = null) {
    const mat = materials[fort.material] || materials.stone;
    const entityId = mapId ? `${entity.id}__${mapId}` : entity.id;

    const config = {
        id: entityId,
        name: entity.name,
        show,
        properties: {
            _mapId: mapId,
            _buildingId: fort.id,
            _startYear: fort.startYear,
            _endYear: fort.endYear
        }
    };

    if (entity.type === 'polygon') {
        config.polygon = {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(entity.coords.flat()),
            height: entity.height,
            extrudedHeight: entity.extrudedHeight,
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            material: getMaterial(entity.material, mat, materials),
            outline: true,
            outlineColor: Cesium.Color.BLACK
        };
    } else if (entity.type === 'polygon_with_hole') {
        config.polygon = {
            hierarchy: new Cesium.PolygonHierarchy(
                Cesium.Cartesian3.fromDegreesArray(entity.outer.flat()),
                [new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(entity.inner.flat()))]
            ),
            height: entity.height,
            extrudedHeight: entity.extrudedHeight,
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            material: materials.ditch
        };
    } else if (entity.type === 'label') {
        config.position = Cesium.Cartesian3.fromDegrees(entity.position[0], entity.position[1], 15);
        config.label = {
            text: `${entity.text}\n(${entity.startYear}-${entity.endYear > 2026 ? 'present' : entity.endYear} AD)`,
            font: 'bold 14px sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 3,
            outlineColor: Cesium.Color.BLACK,
            fillColor: Cesium.Color.WHITE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 25000)
        };
    }

    dataSource.entities.add(config);
}

/**
 * Get material color for entity part
 */
function getMaterial(partName, fortMat, materials) {
    // Direct material reference
    if (fortMat[partName]) return fortMat[partName];

    // Building type colors
    const buildingColors = {
        hq: fortMat.building,
        commander: fortMat.building,
        granary: fortMat.building,
        barracks: fortMat.roof,
        bath: Cesium.Color.fromCssColorString('#C4A77D'),
        workshop: Cesium.Color.fromCssColorString('#8B7355'),
        road: Cesium.Color.fromCssColorString('#5C4033').withAlpha(0.8)
    };

    return buildingColors[partName] || fortMat.building || Cesium.Color.GRAY;
}

/**
 * Build materials lookup from data
 */
function buildMaterials(materialsData) {
    const materials = {};

    for (const [key, colors] of Object.entries(materialsData)) {
        if (key === 'ditch') {
            materials.ditch = Cesium.Color.fromCssColorString(colors).withAlpha(0.6);
        } else {
            materials[key] = {};
            const opacity = colors.opacity || (key === 'ruins' ? 0.8 : 1.0);
            for (const [part, hex] of Object.entries(colors)) {
                if (part !== 'opacity') {
                    materials[key][part] = Cesium.Color.fromCssColorString(hex).withAlpha(opacity);
                }
            }
        }
    }

    return materials;
}

/**
 * Update visibility based on year (for time slider)
 * Only affects entities within their startYear-endYear range
 */
export function updateEntities3DVisibility(dataSource, year) {
    if (!dataSource?._allItems) return;

    dataSource._currentYear = year;

    // Update all entities based on year AND map visibility
    const entities = dataSource.entities.values;
    for (const entity of entities) {
        const props = entity.properties;
        if (!props) continue;

        const startYear = props._startYear?.getValue();
        const endYear = props._endYear?.getValue();
        const mapId = props._mapId?.getValue();

        // Check year range
        const inTimeRange = (startYear === undefined && endYear === undefined) ||
            (year >= (startYear || 0) && year <= (endYear || 9999));

        if (mapId) {
            // Map-based entity: visible if in time range AND map is visible
            const mapVisible = dataSource._visibleMaps.has(mapId);
            entity.show = inTimeRange && mapVisible;
        } else {
            // Legacy entity: visible if in time range
            entity.show = inTimeRange;
        }
    }
}

/**
 * Update visibility when a map layer is toggled
 * @param {Cesium.CustomDataSource} dataSource
 * @param {string} layerName - Layer name from config (e.g., "1650 Berry Sketch")
 * @param {boolean} visible - Whether the layer is now visible
 */
export function updateMapLayerVisibility(dataSource, layerName, visible) {
    if (!dataSource) return;

    const mapId = MAP_LAYER_TO_ID[layerName];
    if (!mapId) return; // Not a mapped layer

    if (visible) {
        dataSource._visibleMaps.add(mapId);
    } else {
        dataSource._visibleMaps.delete(mapId);
    }

    console.log(`Map visibility: ${layerName} (${mapId}) = ${visible}. Visible maps:`, [...dataSource._visibleMaps]);

    // Update entity visibility
    const year = dataSource._currentYear || 2000;
    updateEntities3DVisibility(dataSource, year);
}

/**
 * Get the map ID for a layer name
 */
export function getMapIdForLayer(layerName) {
    return MAP_LAYER_TO_ID[layerName] || null;
}

/**
 * Get available map IDs
 */
export function getAvailableMapIds() {
    return Object.values(MAP_LAYER_TO_ID);
}

/**
 * Transform coordinates by translation and rotation
 * @param {Array} coords - Array of [lng, lat] coordinates
 * @param {Array} center - Original center point [lng, lat]
 * @param {number} deltaLng - Longitude offset
 * @param {number} deltaLat - Latitude offset
 * @param {number} deltaRotation - Rotation delta in degrees
 * @returns {Array} Transformed coordinates
 */
function transformCoords(coords, center, deltaLng, deltaLat, deltaRotation) {
    if (deltaRotation === 0) {
        // Simple translation
        return coords.map(([lng, lat]) => [lng + deltaLng, lat + deltaLat]);
    }

    // Rotation + translation
    const radians = (deltaRotation * Math.PI) / 180;
    const cosR = Math.cos(radians);
    const sinR = Math.sin(radians);

    return coords.map(([lng, lat]) => {
        // Translate to origin (relative to center)
        const relLng = lng - center[0];
        const relLat = lat - center[1];

        // Rotate
        const rotLng = relLng * cosR - relLat * sinR;
        const rotLat = relLng * sinR + relLat * cosR;

        // Translate back + apply delta
        return [
            center[0] + rotLng + deltaLng,
            center[1] + rotLat + deltaLat
        ];
    });
}
