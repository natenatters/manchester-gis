/**
 * Building Editor
 *
 * Allows selecting and adjusting building position/rotation in the viewer.
 * Edits are stored in localStorage and can be copied for updating source data.
 */

import * as Cesium from 'cesium';

// Editor state
let app = null;
let entities3dDataSource = null;
let selectedBuilding = null;
let selectedMapId = null;  // Which map instance is selected (e.g., "berry_1750")
let buildingEdits = {};  // localStorage cache - keyed by "buildingId__mapId"

// Movement/rotation increments (defaults)
let moveStep = 0.00001;  // ~1 meter
let rotateStep = 1;      // degrees
let scaleStep = 0.05;    // 5% per click

/**
 * Initialize the building editor
 */
export function initBuildingEditor(appInstance) {
    app = appInstance;

    // Find the entities3d layer
    for (const layer of Object.values(app.layers)) {
        if (layer.config?.type === 'entities3d') {
            entities3dDataSource = layer.dataSource;
            break;
        }
    }

    // Load saved edits from localStorage
    loadEdits();

    // Create editor panel (hidden initially)
    createEditorPanel();

    // Add click handler for entity selection
    setupClickHandler();

    // Apply any saved edits to existing entities
    applyAllEdits();

    console.log('Building editor initialized', entities3dDataSource ? `with ${entities3dDataSource._allItems?.length || 0} buildings` : '(no dataSource found)');
}

/**
 * Load edits from localStorage
 */
function loadEdits() {
    try {
        const saved = localStorage.getItem('buildingEdits');
        if (saved) {
            buildingEdits = JSON.parse(saved);
        }
    } catch (e) {
        console.warn('Could not load building edits:', e);
    }
}

/**
 * Save edits to localStorage
 */
function saveEdits() {
    try {
        localStorage.setItem('buildingEdits', JSON.stringify(buildingEdits));
    } catch (e) {
        console.warn('Could not save building edits:', e);
    }
}

/**
 * Create the editor panel HTML
 */
function createEditorPanel() {
    const panel = document.createElement('div');
    panel.id = 'buildingEditor';
    panel.className = 'building-editor';
    panel.innerHTML = `
        <div class="editor-header">
            <span id="editorTitle">No building selected</span>
            <button id="editorClose" class="editor-close">&times;</button>
        </div>
        <div id="editorContent" class="editor-content" style="display: none;">
            <div class="editor-section">
                <div class="editor-label">Position <input type="number" id="moveStepInput" value="1" min="1" max="500" step="1" class="step-input" title="Meters per click">m</div>
                <div class="editor-controls">
                    <button data-action="move-up" class="editor-btn" title="Move North">&#9650;</button>
                </div>
                <div class="editor-controls">
                    <button data-action="move-left" class="editor-btn" title="Move West">&#9664;</button>
                    <button data-action="move-right" class="editor-btn" title="Move East">&#9654;</button>
                </div>
                <div class="editor-controls">
                    <button data-action="move-down" class="editor-btn" title="Move South">&#9660;</button>
                </div>
            </div>
            <div class="editor-section">
                <div class="editor-label">Rotation: <span id="rotationValue">0</span>&deg;</div>
                <div class="editor-controls rotation-controls">
                    <button data-action="rotate-ccw" class="editor-btn" title="Rotate Counter-clockwise">&#8634;</button>
                    <button data-action="rotate-cw" class="editor-btn" title="Rotate Clockwise">&#8635;</button>
                </div>
            </div>
            <div class="editor-section">
                <div class="editor-label">Scale: <span id="scaleValue">100</span>%</div>
                <div class="editor-controls rotation-controls">
                    <button data-action="scale-down" class="editor-btn" title="Shrink">−</button>
                    <button data-action="scale-up" class="editor-btn" title="Grow">+</button>
                </div>
            </div>
            <div class="editor-section">
                <div class="editor-label">Center: <span id="centerValue">--</span></div>
            </div>
            <div class="editor-actions">
                <button id="copyChanges" class="editor-btn copy-btn">Copy Changes</button>
                <button id="resetChanges" class="editor-btn reset-btn">Reset</button>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    // Attach event listeners
    document.getElementById('editorClose').addEventListener('click', deselectBuilding);
    document.getElementById('copyChanges').addEventListener('click', copyChangesToClipboard);
    document.getElementById('resetChanges').addEventListener('click', resetCurrentBuilding);

    // Movement/rotation buttons
    panel.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            handleAction(action);
        });
    });

    // Step input listener
    document.getElementById('moveStepInput').addEventListener('change', (e) => {
        const meters = parseFloat(e.target.value) || 1;
        moveStep = meters * 0.00001;  // Convert meters to degrees (approx)
    });
}

/**
 * Setup click handler for entity selection
 */
function setupClickHandler() {
    const handler = new Cesium.ScreenSpaceEventHandler(app.viewer.cesium.scene.canvas);

    handler.setInputAction((click) => {
        const picked = app.viewer.cesium.scene.pick(click.position);

        if (Cesium.defined(picked) && picked.id) {
            const entityId = picked.id.id || picked.id;
            selectBuildingByEntityId(entityId);
        } else {
            // Clicked empty space - deselect
            deselectBuilding();
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

/**
 * Find parent building from entity ID
 * Entity IDs can be:
 *   - Legacy: "st_peters_church_body"
 *   - Map-based: "sacred_trinity_tower__berry_1650" (suffixed with __mapId)
 * Building ID is: "st_peters_church" or "sacred_trinity"
 */
function findBuildingByEntityId(entityId) {
    if (!entities3dDataSource?._allItems) return null;

    // Strip map suffix if present (e.g., "sacred_trinity_tower__berry_1650" -> "sacred_trinity_tower")
    const baseEntityId = entityId.includes('__') ? entityId.split('__')[0] : entityId;

    for (const item of entities3dDataSource._allItems) {
        for (const entity of item.entities) {
            if (entity.id === baseEntityId || entity.id === entityId) {
                return item;
            }
        }
    }
    return null;
}

/**
 * Select a building by clicking one of its entities
 */
function selectBuildingByEntityId(entityId) {
    const building = findBuildingByEntityId(entityId);
    if (!building) return;

    // Extract map ID from entity ID if present (e.g., "sacred_trinity_tower__berry_1750" -> "berry_1750")
    const mapId = entityId.includes('__') ? entityId.split('__')[1] : null;

    selectBuilding(building, mapId);
}

/**
 * Select a building for editing
 * @param {Object} building - The building data
 * @param {string|null} mapId - The map instance being edited (e.g., "berry_1750")
 */
function selectBuilding(building, mapId = null) {
    selectedBuilding = building;
    selectedMapId = mapId;

    // Get edit key (building__map or just building for legacy)
    const editKey = mapId ? `${building.id}__${mapId}` : building.id;

    // Get original values from map-specific data or building defaults
    const mapData = mapId && building.maps?.[mapId] ? building.maps[mapId] : {};
    const originalCenter = mapData.center || building.center;
    const originalRotation = mapData.rotation ?? building.rotation ?? 0;

    // Get current values (from edits or original)
    const edits = buildingEdits[editKey] || {};
    const center = edits.center || originalCenter;
    const rotation = edits.rotation ?? originalRotation;
    const scale = edits.scale ?? mapData.scale ?? 1.0;

    // Update panel title with map info
    const mapLabel = mapId ? ` (${mapId.replace('_', ' ')})` : '';
    document.getElementById('editorTitle').textContent = building.name + mapLabel;
    document.getElementById('editorContent').style.display = 'block';
    document.getElementById('rotationValue').textContent = rotation;
    document.getElementById('scaleValue').textContent = Math.round(scale * 100);
    document.getElementById('centerValue').textContent =
        `${center[0].toFixed(5)}, ${center[1].toFixed(5)}`;

    // Show the panel
    document.getElementById('buildingEditor').classList.add('visible');
}

/**
 * Deselect current building
 */
function deselectBuilding() {
    selectedBuilding = null;
    document.getElementById('buildingEditor').classList.remove('visible');
    document.getElementById('editorContent').style.display = 'none';
    document.getElementById('editorTitle').textContent = 'No building selected';
}

/**
 * Handle move/rotate actions
 */
function handleAction(action) {
    if (!selectedBuilding) return;

    // Get edit key (building__map or just building for legacy)
    const editKey = selectedMapId ? `${selectedBuilding.id}__${selectedMapId}` : selectedBuilding.id;

    // Get original values from map-specific data or building defaults
    const mapData = selectedMapId && selectedBuilding.maps?.[selectedMapId] ? selectedBuilding.maps[selectedMapId] : {};
    const originalCenter = mapData.center || selectedBuilding.center;
    const originalRotation = mapData.rotation ?? selectedBuilding.rotation ?? 0;
    const originalScale = mapData.scale ?? 1.0;

    // Get or create edits for this building+map
    if (!buildingEdits[editKey]) {
        buildingEdits[editKey] = {
            center: [...originalCenter],
            rotation: originalRotation,
            scale: originalScale
        };
    }

    const edits = buildingEdits[editKey];
    if (edits.scale === undefined) edits.scale = originalScale;

    switch (action) {
        case 'move-up':
            edits.center[1] += moveStep;
            break;
        case 'move-down':
            edits.center[1] -= moveStep;
            break;
        case 'move-left':
            edits.center[0] -= moveStep;
            break;
        case 'move-right':
            edits.center[0] += moveStep;
            break;
        case 'rotate-cw':
            edits.rotation = (edits.rotation - rotateStep + 360) % 360;
            break;
        case 'rotate-ccw':
            edits.rotation = (edits.rotation + rotateStep) % 360;
            break;
        case 'scale-up':
            edits.scale = Math.min(edits.scale + scaleStep, 3.0);  // max 300%
            break;
        case 'scale-down':
            edits.scale = Math.max(edits.scale - scaleStep, 0.25); // min 25%
            break;
    }

    // Save and apply
    saveEdits();
    applyEditsToBuilding(selectedBuilding.id, selectedMapId, editKey);

    // Update display
    document.getElementById('rotationValue').textContent = edits.rotation;
    document.getElementById('scaleValue').textContent = Math.round(edits.scale * 100);
    document.getElementById('centerValue').textContent =
        `${edits.center[0].toFixed(5)}, ${edits.center[1].toFixed(5)}`;

    // Request render
    app.viewer.cesium.scene.requestRender();
}

/**
 * Apply edits to a building's entities
 * This recalculates entity positions based on new center/rotation
 * @param {string} buildingId - The building ID
 * @param {string|null} mapId - If provided, only update entities for this map
 * @param {string} editKey - The key in buildingEdits (buildingId or buildingId__mapId)
 */
function applyEditsToBuilding(buildingId, mapId = null, editKey = null) {
    const building = entities3dDataSource._allItems.find(b => b.id === buildingId);
    if (!building) return;

    const key = editKey || (mapId ? `${buildingId}__${mapId}` : buildingId);
    const edits = buildingEdits[key];
    if (!edits) return;

    // Get original values from map-specific data or building defaults
    const mapData = mapId && building.maps?.[mapId] ? building.maps[mapId] : {};
    const originalCenter = mapData.center || building.center;
    const originalRotation = mapData.rotation ?? building.rotation ?? 0;

    const newCenter = edits.center;
    const newRotation = edits.rotation;
    const scale = edits.scale ?? mapData.scale ?? 1.0;

    // Calculate deltas
    const dLon = newCenter[0] - originalCenter[0];
    const dLat = newCenter[1] - originalCenter[1];
    const dRot = newRotation - originalRotation;

    // Update each entity - only for the specific map if mapId is set
    for (const entityDef of building.entities) {
        // Get original coords (use _originalCoords if available, else coords)
        const originalCoords = entityDef._originalCoords || entityDef.coords;
        if (!originalCoords) continue;

        // Transform coords
        const newCoords = transformCoords(
            originalCoords,
            originalCenter,
            dLon,
            dLat,
            dRot,
            scale
        );

        // Find the entity to update
        let entity;
        if (mapId) {
            // Only update the specific map instance
            entity = entities3dDataSource.entities.getById(`${entityDef.id}__${mapId}`);
        } else {
            // Legacy: update base entity
            entity = entities3dDataSource.entities.getById(entityDef.id);
        }

        if (entity && entity.polygon) {
            entity.polygon.hierarchy = new Cesium.PolygonHierarchy(
                Cesium.Cartesian3.fromDegreesArray(newCoords.flat())
            );
        }
    }
}

/**
 * Transform coordinates by translation, rotation, and scale
 */
function transformCoords(coords, center, dLon, dLat, dRotDeg, scale = 1.0) {
    const dRotRad = dRotDeg * Math.PI / 180;
    const cosR = Math.cos(dRotRad);
    const sinR = Math.sin(dRotRad);

    return coords.map(([lon, lat]) => {
        // Translate to center-relative
        let x = lon - center[0];
        let y = lat - center[1];

        // Apply scale
        x *= scale;
        y *= scale;

        // Rotate around center
        const xr = x * cosR - y * sinR;
        const yr = x * sinR + y * cosR;

        // Translate back and apply movement
        return [
            center[0] + xr + dLon,
            center[1] + yr + dLat
        ];
    });
}

/**
 * Apply all saved edits to entities
 */
function applyAllEdits() {
    for (const editKey of Object.keys(buildingEdits)) {
        // Parse editKey - could be "buildingId" or "buildingId__mapId"
        const parts = editKey.split('__');
        const buildingId = parts[0];
        const mapId = parts.length > 1 ? parts[1] : null;
        applyEditsToBuilding(buildingId, mapId, editKey);
    }
}

/**
 * Copy current building changes to clipboard
 */
function copyChangesToClipboard() {
    if (!selectedBuilding) return;

    const editKey = selectedMapId ? `${selectedBuilding.id}__${selectedMapId}` : selectedBuilding.id;
    const edits = buildingEdits[editKey];
    if (!edits) {
        alert('No changes to copy');
        return;
    }

    // Format output for pasting into building JSON
    let output;
    if (selectedMapId) {
        // Map-specific edit - output in maps.mapId format
        output = {
            _comment: `Paste into maps.${selectedMapId}`,
            center: [
                parseFloat(edits.center[0].toFixed(5)),
                parseFloat(edits.center[1].toFixed(5))
            ],
            rotation: edits.rotation
        };
        if (edits.scale && edits.scale !== 1.0) {
            output.scale = parseFloat(edits.scale.toFixed(2));
        }
    } else {
        // Legacy building edit
        output = {
            id: selectedBuilding.id,
            center: [
                parseFloat(edits.center[0].toFixed(5)),
                parseFloat(edits.center[1].toFixed(5))
            ],
            rotation: edits.rotation
        };
        if (edits.scale && edits.scale !== 1.0) {
            output.scale = parseFloat(edits.scale.toFixed(2));
        }
    }

    const text = JSON.stringify(output, null, 2);

    navigator.clipboard.writeText(text).then(() => {
        // Flash the button to indicate success
        const btn = document.getElementById('copyChanges');
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = 'Copy Changes';
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy:', err);
        // Fallback: show in alert
        alert(`Copy this:\n${text}`);
    });
}

/**
 * Reset current building to original values
 */
function resetCurrentBuilding() {
    if (!selectedBuilding) return;

    // Remove edits for this specific building+map combo
    const editKey = selectedMapId ? `${selectedBuilding.id}__${selectedMapId}` : selectedBuilding.id;
    delete buildingEdits[editKey];
    saveEdits();

    // Re-apply original coords (reload entities)
    // For now, alert user to refresh - full reload would require storing original coords
    const mapLabel = selectedMapId ? ` (${selectedMapId})` : '';
    alert(`Building${mapLabel} reset. Refresh the page to see original position.`);
    deselectBuilding();
}
