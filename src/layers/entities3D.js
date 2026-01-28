/**
 * 3D Entity Loader
 *
 * Simple loader for pre-generated 3D geometry.
 * Reads fort_entities.json and creates Cesium entities.
 */

import * as Cesium from 'cesium';

/**
 * Load 3D entities from generated data
 * @param {string} projectPath - Path to project folder
 * @param {number} currentYear - Current year for visibility
 * @returns {Promise<Cesium.CustomDataSource>}
 */
export async function loadEntities3D(projectPath, currentYear = 200) {
    const dataSource = new Cesium.CustomDataSource('entities3d');

    try {
        const response = await fetch(`${projectPath}/fort_entities.json`);
        if (!response.ok) {
            console.warn('No fort_entities.json found');
            return dataSource;
        }

        const data = await response.json();
        const materials = buildMaterials(data.materials);

        for (const fort of data.forts) {
            const show = currentYear >= fort.startYear && currentYear <= fort.endYear;

            for (const entity of fort.entities) {
                addEntity(dataSource, entity, fort, materials, show);
            }
        }

        // Store for visibility updates
        dataSource._forts = data.forts;

        console.log(`Loaded ${data.forts.length} forts with pre-generated geometry`);

    } catch (err) {
        console.warn('Could not load fort entities:', err);
    }

    return dataSource;
}

/**
 * Add a single entity to the data source
 */
function addEntity(dataSource, entity, fort, materials, show) {
    const mat = materials[fort.material] || materials.stone;

    const config = {
        id: entity.id,
        name: entity.name,
        show
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
 * Update visibility based on year
 */
export function updateEntities3DVisibility(dataSource, year) {
    if (!dataSource?._forts) return;

    for (const fort of dataSource._forts) {
        const show = year >= fort.startYear && year <= fort.endYear;

        for (const entity of fort.entities) {
            const e = dataSource.entities.getById(entity.id);
            if (e) e.show = show;
        }
    }
}
