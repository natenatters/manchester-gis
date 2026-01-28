/**
 * 3D Reconstructions Loader
 *
 * Generic loader for 3D reconstructions from project data.
 * Reads fort definitions from reconstructions.json and generates 3D geometry.
 */

import * as Cesium from 'cesium';

// =============================================
// COORDINATE HELPERS
// =============================================

const toLatDeg = (m) => m / 111000;
const toLonDeg = (m, lat) => m / (111000 * Math.cos(lat * Math.PI / 180));

function rotatePoint(x, y, angleDeg) {
    const rad = angleDeg * Math.PI / 180;
    return [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)];
}

function toCartesian(cx, cy, offsets, rotationDeg) {
    return offsets.map(([x, y]) => {
        const [rx, ry] = rotatePoint(x, y, rotationDeg);
        return Cesium.Cartesian3.fromDegrees(cx + toLonDeg(rx, cy), cy + toLatDeg(ry));
    });
}

/**
 * Calculate center and dimensions from corner points
 */
function calculateFromCorners(corners) {
    const center = [
        (corners.SW[0] + corners.SE[0] + corners.NE[0] + corners.NW[0]) / 4,
        (corners.SW[1] + corners.SE[1] + corners.NE[1] + corners.NW[1]) / 4
    ];

    const cosLat = Math.cos(center[1] * Math.PI / 180);

    // Calculate rotation from SW->SE edge
    const dLng = corners.SE[0] - corners.SW[0];
    const dLat = corners.SE[1] - corners.SW[1];
    const dxMeters = dLng * 111000 * cosLat;
    const dyMeters = dLat * 111000;
    const rotation = Math.atan2(dyMeters, dxMeters) * 180 / Math.PI;

    // Calculate dimensions
    const length = Math.sqrt(dxMeters * dxMeters + dyMeters * dyMeters);

    const dLng2 = corners.NE[0] - corners.SE[0];
    const dLat2 = corners.NE[1] - corners.SE[1];
    const dx2 = dLng2 * 111000 * cosLat;
    const dy2 = dLat2 * 111000;
    const width = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    return { center, rotation, length, width };
}

/**
 * Convert hex color to Cesium Color
 */
function hexToColor(hex, alpha = 1.0) {
    return Cesium.Color.fromCssColorString(hex).withAlpha(alpha);
}

/**
 * Load reconstructions data and create DataSource
 * @param {string} projectPath - Path to project folder
 * @param {number} currentYear - Current year for visibility
 * @returns {Promise<Cesium.CustomDataSource>}
 */
export async function loadReconstructionsDataSource(projectPath, currentYear = 200) {
    const dataSource = new Cesium.CustomDataSource('reconstructions3d');

    try {
        const response = await fetch(`${projectPath}/reconstructions.json`);
        if (!response.ok) {
            console.warn('No reconstructions.json found');
            return dataSource;
        }

        const data = await response.json();
        buildReconstructions(dataSource, data, currentYear);

        // Store data for visibility updates
        dataSource._reconstructionData = data;

    } catch (err) {
        console.warn('Could not load reconstructions:', err);
    }

    return dataSource;
}

/**
 * Build 3D geometry from reconstruction data
 */
function buildReconstructions(dataSource, data, currentYear) {
    const entityIds = [];
    const materials = buildMaterials(data.materials);
    const refPoints = data.referencePoints || {};

    for (const fort of data.forts) {
        // Resolve center/dimensions from reference points or direct values
        let center, length, width, rotation;

        if (fort.centerFrom && refPoints[fort.centerFrom]) {
            const calc = calculateFromCorners(refPoints[fort.centerFrom].corners);
            center = fort.center || calc.center;
            length = fort.length || calc.length;
            width = fort.width || calc.width;
            rotation = fort.rotation !== undefined ? fort.rotation : calc.rotation;
        } else {
            center = fort.center;
            length = fort.length;
            width = fort.width;
            rotation = fort.rotation || 0;
        }

        if (!center || !length || !width) {
            console.warn(`Skipping fort ${fort.id}: missing geometry`);
            continue;
        }

        const [cx, cy] = center;
        const hL = length / 2, hW = width / 2;
        const wt = fort.wallThickness;
        const show = currentYear >= fort.startYear && currentYear <= fort.endYear;
        const mat = materials[fort.material] || materials.stone;
        const isRuins = fort.material === 'ruins';

        const add = (config) => {
            config.show = show;
            // Auto-add terrain-relative heights to all polygons
            if (config.polygon) {
                config.polygon.heightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
                config.polygon.extrudedHeightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
            }
            dataSource.entities.add(config);
            entityIds.push(config.id);
        };

        // === DEFENSIVE DITCH ===
        if (fort.ditchDepth > 0) {
            const ditchOuter = [[-hL - fort.ditchWidth - 5, -hW - fort.ditchWidth - 5],
                                [hL + fort.ditchWidth + 5, -hW - fort.ditchWidth - 5],
                                [hL + fort.ditchWidth + 5, hW + fort.ditchWidth + 5],
                                [-hL - fort.ditchWidth - 5, hW + fort.ditchWidth + 5]];
            const ditchInner = [[-hL - 5, -hW - 5], [hL + 5, -hW - 5],
                               [hL + 5, hW + 5], [-hL - 5, hW + 5]];
            add({
                id: `${fort.id}_ditch`,
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(
                        toCartesian(cx, cy, ditchOuter, rotation),
                        [new Cesium.PolygonHierarchy(toCartesian(cx, cy, ditchInner, rotation))]
                    ),
                    height: -fort.ditchDepth,
                    extrudedHeight: 0,
                    material: materials.ditch
                }
            });
        }

        // === FORT WALLS ===
        const gateW = 8;
        const wallSegments = (isRuins || fort.partialWalls) ? [
            [[-hL, hW - wt], [-gateW - 5, hW - wt], [-gateW - 5, hW], [-hL, hW]],
            [[gateW + 5, hW - wt], [hL * 0.3, hW - wt], [hL * 0.3, hW], [gateW + 5, hW]],
        ] : [
            [[-hL, -hW], [-gateW, -hW], [-gateW, -hW + wt], [-hL, -hW + wt]],
            [[gateW, -hW], [hL, -hW], [hL, -hW + wt], [gateW, -hW + wt]],
            [[-hL, hW - wt], [-gateW, hW - wt], [-gateW, hW], [-hL, hW]],
            [[gateW, hW - wt], [hL, hW - wt], [hL, hW], [gateW, hW]],
            [[-hL, -hW], [-hL + wt, -hW], [-hL + wt, -gateW], [-hL, -gateW]],
            [[-hL, gateW], [-hL + wt, gateW], [-hL + wt, hW], [-hL, hW]],
            [[hL - wt, -hW], [hL, -hW], [hL, -gateW], [hL - wt, -gateW]],
            [[hL - wt, gateW], [hL, gateW], [hL, hW], [hL - wt, hW]],
        ];

        wallSegments.forEach((seg, i) => {
            add({
                id: `${fort.id}_wall_${i}`,
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy, seg, rotation)),
                    height: 0, extrudedHeight: fort.wallHeight,
                    material: mat.wall, outline: true, outlineColor: Cesium.Color.BLACK
                }
            });
        });

        if (!isRuins && !fort.partialWalls) {
            // === CORNER TOWERS ===
            const tSize = 5;
            [[-hL, -hW], [hL, -hW], [hL, hW], [-hL, hW]].forEach(([tx, ty], i) => {
                const tower = [[tx - tSize/2, ty - tSize/2], [tx + tSize/2, ty - tSize/2],
                               [tx + tSize/2, ty + tSize/2], [tx - tSize/2, ty + tSize/2]];
                add({
                    id: `${fort.id}_tower_${i}`,
                    polygon: {
                        hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy, tower, rotation)),
                        height: 0, extrudedHeight: fort.towerHeight,
                        material: mat.tower, outline: true, outlineColor: Cesium.Color.BLACK
                    }
                });
            });

            // === GATE TOWERS ===
            const gtSize = 4;
            const gateTowers = [
                [-gateW - gtSize/2, -hW + wt/2], [gateW + gtSize/2, -hW + wt/2],
                [-gateW - gtSize/2, hW - wt/2], [gateW + gtSize/2, hW - wt/2],
                [-hL + wt/2, -gateW - gtSize/2], [-hL + wt/2, gateW + gtSize/2],
                [hL - wt/2, -gateW - gtSize/2], [hL - wt/2, gateW + gtSize/2],
            ];
            gateTowers.forEach(([tx, ty], i) => {
                const tower = [[tx - gtSize/2, ty - gtSize/2], [tx + gtSize/2, ty - gtSize/2],
                               [tx + gtSize/2, ty + gtSize/2], [tx - gtSize/2, ty + gtSize/2]];
                add({
                    id: `${fort.id}_gatetower_${i}`,
                    polygon: {
                        hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy, tower, rotation)),
                        height: 0, extrudedHeight: fort.towerHeight - 1,
                        material: mat.tower, outline: true, outlineColor: Cesium.Color.BLACK
                    }
                });
            });

            // === INTERVAL TOWERS (if defined) ===
            if (fort.intervalTowerHeight) {
                buildIntervalTowers(add, fort, cx, cy, hL, hW, wt, gateW, rotation, mat);
            }

            // === RAMPART & CRENELLATIONS ===
            if (fort.rampartWidth) {
                buildRampart(add, fort, cx, cy, hL, hW, wt, rotation, mat);
                buildCrenellations(add, fort, cx, cy, hL, hW, gateW, rotation, mat);
            }

            // === INTERNAL BUILDINGS ===
            const buildings = fort.buildings || getDefaultBuildings(fort.material === 'stone');
            buildInternalBuildings(add, fort, buildings, cx, cy, length, width, rotation, mat);

            // === ROADS ===
            buildRoads(add, fort, cx, cy, hL, hW, wt, length, width, rotation, mat);
        }

        // === LABEL ===
        add({
            id: `${fort.id}_label`,
            position: Cesium.Cartesian3.fromDegrees(cx, cy, fort.towerHeight + 10),
            label: {
                text: `${fort.name}\n(${fort.startYear}-${fort.endYear > 2026 ? 'present' : fort.endYear} AD)`,
                font: 'bold 14px sans-serif',
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                outlineWidth: 3, outlineColor: Cesium.Color.BLACK,
                fillColor: Cesium.Color.WHITE,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 25000)
            }
        });
    }

    dataSource._entityIds = entityIds;
    dataSource._forts = data.forts;
}

/**
 * Build materials lookup from data
 */
function buildMaterials(materialsData) {
    const materials = {};

    for (const [key, colors] of Object.entries(materialsData)) {
        if (key === 'ditch') {
            materials.ditch = hexToColor(colors, 0.6);
        } else {
            materials[key] = {};
            const opacity = colors.opacity || (key === 'ruins' ? 0.8 : 1.0);
            for (const [part, hex] of Object.entries(colors)) {
                if (part !== 'opacity') {
                    materials[key][part] = hexToColor(hex, opacity);
                }
            }
        }
    }

    return materials;
}

/**
 * Build interval towers for stone forts
 */
function buildIntervalTowers(add, fort, cx, cy, hL, hW, wt, gateW, rotation, mat) {
    const itSize = 4.5;
    const itHeight = fort.intervalTowerHeight;
    const spacing = 30;

    for (let x = -hL + spacing; x < hL - spacing/2; x += spacing) {
        if (Math.abs(x) > gateW + 6) {
            add({
                id: `${fort.id}_itower_s_${x}`,
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy,
                        [[x - itSize/2, -hW - itSize/3], [x + itSize/2, -hW - itSize/3],
                         [x + itSize/2, -hW + wt + itSize/3], [x - itSize/2, -hW + wt + itSize/3]], rotation)),
                    height: 0, extrudedHeight: itHeight,
                    material: mat.tower, outline: true, outlineColor: Cesium.Color.BLACK
                }
            });
            add({
                id: `${fort.id}_itower_n_${x}`,
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy,
                        [[x - itSize/2, hW - wt - itSize/3], [x + itSize/2, hW - wt - itSize/3],
                         [x + itSize/2, hW + itSize/3], [x - itSize/2, hW + itSize/3]], rotation)),
                    height: 0, extrudedHeight: itHeight,
                    material: mat.tower, outline: true, outlineColor: Cesium.Color.BLACK
                }
            });
        }
    }

    for (let y = -hW + spacing; y < hW - spacing/2; y += spacing) {
        if (Math.abs(y) > gateW + 6) {
            add({
                id: `${fort.id}_itower_w_${y}`,
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy,
                        [[-hL - itSize/3, y - itSize/2], [-hL + wt + itSize/3, y - itSize/2],
                         [-hL + wt + itSize/3, y + itSize/2], [-hL - itSize/3, y + itSize/2]], rotation)),
                    height: 0, extrudedHeight: itHeight,
                    material: mat.tower, outline: true, outlineColor: Cesium.Color.BLACK
                }
            });
            add({
                id: `${fort.id}_itower_e_${y}`,
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy,
                        [[hL - wt - itSize/3, y - itSize/2], [hL + itSize/3, y - itSize/2],
                         [hL + itSize/3, y + itSize/2], [hL - wt - itSize/3, y + itSize/2]], rotation)),
                    height: 0, extrudedHeight: itHeight,
                    material: mat.tower, outline: true, outlineColor: Cesium.Color.BLACK
                }
            });
        }
    }
}

/**
 * Build rampart walkway
 */
function buildRampart(add, fort, cx, cy, hL, hW, wt, rotation, mat) {
    const rampW = fort.rampartWidth;
    const rampH = fort.wallHeight - 0.8;
    const rampOuter = [[-hL + wt, -hW + wt], [hL - wt, -hW + wt], [hL - wt, hW - wt], [-hL + wt, hW - wt]];
    const rampInner = [[-hL + wt + rampW, -hW + wt + rampW], [hL - wt - rampW, -hW + wt + rampW],
                      [hL - wt - rampW, hW - wt - rampW], [-hL + wt + rampW, hW - wt - rampW]];
    add({
        id: `${fort.id}_rampart`,
        polygon: {
            hierarchy: new Cesium.PolygonHierarchy(
                toCartesian(cx, cy, rampOuter, rotation),
                [new Cesium.PolygonHierarchy(toCartesian(cx, cy, rampInner, rotation))]
            ),
            height: rampH - 1,
            extrudedHeight: rampH,
            material: mat.parapet || mat.wall,
            outline: true, outlineColor: Cesium.Color.DARKGRAY
        }
    });
}

/**
 * Build crenellations/merlons
 */
function buildCrenellations(add, fort, cx, cy, hL, hW, gateW, rotation, mat) {
    const merlonW = 1.2, merlonD = 0.8, merlonH = 1.5;
    const merlonSpacing = 3;

    for (let x = -hL + 2; x < hL - 2; x += merlonSpacing) {
        if (Math.abs(x) > gateW + 4) {
            add({
                id: `${fort.id}_merlon_s_${x}`,
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy,
                        [[x - merlonW/2, -hW], [x + merlonW/2, -hW],
                         [x + merlonW/2, -hW + merlonD], [x - merlonW/2, -hW + merlonD]], rotation)),
                    height: fort.wallHeight, extrudedHeight: fort.wallHeight + merlonH,
                    material: mat.parapet || mat.wall
                }
            });
            add({
                id: `${fort.id}_merlon_n_${x}`,
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy,
                        [[x - merlonW/2, hW - merlonD], [x + merlonW/2, hW - merlonD],
                         [x + merlonW/2, hW], [x - merlonW/2, hW]], rotation)),
                    height: fort.wallHeight, extrudedHeight: fort.wallHeight + merlonH,
                    material: mat.parapet || mat.wall
                }
            });
        }
    }
}

/**
 * Get default building layout if not specified
 */
function getDefaultBuildings(isStone) {
    const buildings = [
        { name: 'Principia (HQ)', x: 0, y: 5, w: 35, h: 30, height: isStone ? 7 : 6, type: 'hq' },
        { name: 'Praetorium', x: 0, y: -25, w: 25, h: 20, height: isStone ? 6 : 5, type: 'commander' },
        { name: 'Horreum', x: -32, y: -25, w: 15, h: 28, height: isStone ? 5 : 4, type: 'granary' },
        { name: 'Horreum', x: 32, y: -25, w: 15, h: 28, height: isStone ? 5 : 4, type: 'granary' },
        { name: 'Barracks', x: -40, y: 28, w: 12, h: 42, height: isStone ? 4 : 3.5, type: 'barracks' },
        { name: 'Barracks', x: -25, y: 28, w: 12, h: 42, height: isStone ? 4 : 3.5, type: 'barracks' },
        { name: 'Barracks', x: 25, y: 28, w: 12, h: 42, height: isStone ? 4 : 3.5, type: 'barracks' },
        { name: 'Barracks', x: 40, y: 28, w: 12, h: 42, height: isStone ? 4 : 3.5, type: 'barracks' },
    ];
    return buildings;
}

/**
 * Build internal buildings
 */
function buildInternalBuildings(add, fort, buildings, cx, cy, length, width, rotation, mat) {
    const scale = Math.min(length / 160, width / 130);
    const isStone = fort.material === 'stone';

    buildings.forEach((b, i) => {
        const bx = b.x * scale, by = b.y * scale;
        const bw = b.w * scale / 2, bh = b.h * scale / 2;
        const rect = [[bx - bw, by - bh], [bx + bw, by - bh], [bx + bw, by + bh], [bx - bw, by + bh]];

        let bMat = mat.roof;
        if (b.type === 'hq' || b.type === 'commander' || b.type === 'granary') {
            bMat = mat.building;
        } else if (b.type === 'bath' && isStone) {
            bMat = hexToColor('#C4A77D');
        } else if (b.type === 'workshop' && isStone) {
            bMat = hexToColor('#8B7355');
        }

        add({
            id: `${fort.id}_building_${i}`,
            name: `${fort.name} - ${b.name}`,
            polygon: {
                hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy, rect, rotation)),
                height: 0.1, extrudedHeight: b.height * scale,
                material: bMat, outline: true, outlineColor: Cesium.Color.BLACK
            }
        });

        // Add roof for main buildings
        if (isStone && (b.type === 'hq' || b.type === 'commander' || b.type === 'bath')) {
            const roofInset = 0.5;
            const roofRect = [[bx - bw + roofInset, by - bh + roofInset],
                             [bx + bw - roofInset, by - bh + roofInset],
                             [bx + bw - roofInset, by + bh - roofInset],
                             [bx - bw + roofInset, by + bh - roofInset]];
            add({
                id: `${fort.id}_roof_${i}`,
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy, roofRect, rotation)),
                    height: b.height * scale, extrudedHeight: b.height * scale + 1.5,
                    material: mat.roof
                }
            });
        }
    });
}

/**
 * Build internal roads
 */
function buildRoads(add, fort, cx, cy, hL, hW, wt, length, width, rotation, mat) {
    const scale = Math.min(length / 160, width / 130);
    const isStone = fort.material === 'stone';
    const roadW = isStone ? 7 * scale : 6 * scale;
    const roadMat = mat.road || hexToColor('#5C4033', 0.8);

    // Via Principalis
    add({
        id: `${fort.id}_via_principalis`,
        polygon: {
            hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy,
                [[-hL + wt + 2, -roadW/2], [hL - wt - 2, -roadW/2],
                 [hL - wt - 2, roadW/2], [-hL + wt + 2, roadW/2]], rotation)),
            height: 0.08,
            material: roadMat
        }
    });

    // Via Praetoria
    add({
        id: `${fort.id}_via_praetoria`,
        polygon: {
            hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy,
                [[-roadW/2, -hW + wt + 2], [roadW/2, -hW + wt + 2],
                 [roadW/2, -5], [-roadW/2, -5]], rotation)),
            height: 0.08,
            material: roadMat
        }
    });

    // Via Decumana
    add({
        id: `${fort.id}_via_decumana`,
        polygon: {
            hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy,
                [[-roadW/2, 20], [roadW/2, 20],
                 [roadW/2, hW - wt - 2], [-roadW/2, hW - wt - 2]], rotation)),
            height: 0.08,
            material: roadMat
        }
    });

    // Parade ground (stone forts)
    if (isStone) {
        const paradeGround = [[-15, -8], [15, -8], [15, -18], [-15, -18]];
        add({
            id: `${fort.id}_parade`,
            polygon: {
                hierarchy: new Cesium.PolygonHierarchy(toCartesian(cx, cy,
                    paradeGround.map(p => [p[0] * scale, p[1] * scale]), rotation)),
                height: 0.03,
                material: hexToColor('#A0927A', 0.6)
            }
        });
    }
}

/**
 * Update reconstruction visibility based on year
 */
export function updateReconstructionsVisibility(dataSource, year) {
    if (!dataSource || !dataSource._forts) return;

    for (const fort of dataSource._forts) {
        const show = year >= fort.startYear && year <= fort.endYear;
        dataSource._entityIds
            .filter(eid => eid.startsWith(fort.id))
            .forEach(eid => {
                const e = dataSource.entities.getById(eid);
                if (e) e.show = show;
            });
    }
}
