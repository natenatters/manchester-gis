/**
 * Viewer - Cesium wrapper with time-based layer management
 */

import * as CesiumModule from 'cesium';
const Cesium = window.Cesium || CesiumModule;
import { createImageryProvider } from './imagery/index.js';

function dateFromYear(year) {
    const d = new Date(0);
    d.setFullYear(year);
    d.setMonth(6);
    d.setDate(1);
    return d;
}

export class Viewer {
    constructor(containerId) {
        const cesiumToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
        if (cesiumToken) {
            Cesium.Ion.defaultAccessToken = cesiumToken;
        }

        this.cesium = new Cesium.Viewer(containerId, {
            timeline: false,
            animation: false,
            baseLayerPicker: false,
            geocoder: false,
            homeButton: true,
            sceneModePicker: true,
            navigationHelpButton: false,
            imageryProvider: false,
            requestRenderMode: true,
            maximumRenderTimeChange: Infinity,
            targetFrameRate: 30,
            useBrowserRecommendedResolution: true,
            shadows: false,
            terrainShadows: Cesium.ShadowMode.DISABLED
        });

        // Disable expensive effects
        this.cesium.scene.fog.enabled = false;
        this.cesium.scene.globe.showGroundAtmosphere = false;
        this.cesium.scene.skyAtmosphere.show = false;
        this.cesium.scene.highDynamicRange = false;
        this.cesium.scene.skyBox.show = false;
        this.cesium.scene.sun.show = false;
        this.cesium.scene.moon.show = false;
        this.cesium.infoBox.frame.sandbox = 'allow-same-origin allow-popups allow-forms allow-scripts';

        // State
        this._handlers = {};
        this._layers = [];           // All imagery layers (created once at init)
        this._tilesets = [];         // All tilesets (created once at init)
        this._czmlDataSource = null;
        this._terrainEnabled = false;
        this._baseExaggeration = 1.0;

        // Clock bounds
        const clock = this.cesium.clock;
        clock.startTime = Cesium.JulianDate.fromDate(dateFromYear(1));
        clock.stopTime = Cesium.JulianDate.fromDate(dateFromYear(2100));
        clock.clockRange = Cesium.ClockRange.CLAMPED;

        // Camera persistence
        this.cesium.camera.changed.addEventListener(() => this._saveCamera());

        // Year change → update layer visibility
        Cesium.knockout.getObservable(this.cesium.clockViewModel, 'currentTime').subscribe(() => {
            const year = this._clockYear();
            this._updateLayerVisibility(year);
            this._emit('yearChange', year);
            this.requestRender();
        });

        // Entity events
        this.cesium.entities.collectionChanged.addEventListener(() => {
            this._emit('entitiesChange', this.cesium.entities.values);
        });
        this.cesium.selectedEntityChanged.addEventListener((entity) => {
            this._emit('entitySelect', entity);
        });
    }

    // --- Event Bus ---
    on(event, callback) {
        if (!this._handlers[event]) this._handlers[event] = [];
        this._handlers[event].push(callback);
    }

    _emit(event, ...args) {
        (this._handlers[event] || []).forEach(h => h(...args));
    }

    // --- Clock ---
    _clockYear() {
        return Cesium.JulianDate.toGregorianDate(this.cesium.clock.currentTime).year;
    }

    setYear(year) {
        this.cesium.clock.currentTime = Cesium.JulianDate.fromDate(dateFromYear(year));
    }

    // --- Public API ---
    async init(config) {
        this.clear();
        console.log(`Loading project: ${config.name}`);

        // Camera
        const savedCamera = this._loadCamera();
        this.setCamera(savedCamera || config.center);

        // Terrain
        if (config.terrain?.enabled) {
            this.cesium.scene.setTerrain(Cesium.Terrain.fromWorldTerrain());
            this._terrainEnabled = true;
        }
        this._baseExaggeration = config.terrain?.exaggeration || 1.0;
        this.cesium.scene.verticalExaggeration = this._baseExaggeration;

        // Create all layers upfront
        await this._initLayers(config.layers || []);

        // Load entities
        if (config.entities?.endsWith('.czml')) {
            await this._loadCzml(config.entities);
        } else if (config.entities) {
            const data = await this._loadJson(config.entities);
            if (data) this._loadEntities(data);
        }

        // Apply initial visibility
        this._updateLayerVisibility(this._clockYear());
    }

    getLayerInfo(year) {
        const inRange = (l) => year >= l._yearStart && year <= l._yearEnd;
        return {
            imagery: this._layers.filter(inRange).map((l, i) => ({
                name: l._config.name || 'Unknown',
                visible: l._userVisible,
                index: i
            })),
            tileset: this._tilesets.find(t => inRange(t) && t.show)?._config.name || null
        };
    }

    toggleImagery(index) {
        const year = this._clockYear();
        const inRange = (l) => year >= l._yearStart && year <= l._yearEnd;
        const visibleLayers = this._layers.filter(inRange);
        if (visibleLayers[index]) {
            visibleLayers[index]._userVisible = !visibleLayers[index]._userVisible;
            this._updateLayerVisibility(year);
            this.requestRender();
        }
    }

    toggleGroup(groupKey, visible) {
        const toggle = (entities) => {
            for (const entity of entities) {
                const group = entity.properties?.group?.getValue?.() || entity.properties?.group;
                if (group === groupKey) entity.show = visible;
            }
        };
        toggle(this.cesium.entities.values);
        if (this._czmlDataSource) toggle(this._czmlDataSource.entities.values);
        this.requestRender();
    }

    clearSelection() {
        this.cesium.selectedEntity = undefined;
    }

    requestRender() {
        this.cesium.scene.requestRender();
    }

    clear() {
        this.cesium.entities.removeAll();
        this.cesium.dataSources.removeAll();
        this._czmlDataSource = null;

        for (const layer of this._layers) {
            this.cesium.imageryLayers.remove(layer, false);
        }
        this._layers = [];

        for (const tileset of this._tilesets) {
            this.cesium.scene.primitives.remove(tileset);
        }
        this._tilesets = [];
    }

    // --- Layer Management (the simple part) ---

    async _initLayers(configs) {
        for (const config of configs) {
            try {
                if (config.kind === 'imagery') {
                    const provider = createImageryProvider(config);
                    const layer = this.cesium.imageryLayers.addImageryProvider(provider);
                    layer._config = config;
                    layer._yearStart = config.yearStart ?? -Infinity;
                    layer._yearEnd = config.yearEnd ?? Infinity;
                    layer._userVisible = true;
                    layer.alpha = config.alpha ?? 1.0;
                    layer.show = false;
                    this._layers.push(layer);
                } else if (config.kind === 'tileset') {
                    const tileset = await this._createTileset(config);
                    if (tileset) {
                        tileset._config = config;
                        tileset._yearStart = config.yearStart ?? -Infinity;
                        tileset._yearEnd = config.yearEnd ?? Infinity;
                        tileset.show = false;
                        this.cesium.scene.primitives.add(tileset);
                        this._tilesets.push(tileset);
                    }
                }
            } catch (err) {
                console.warn(`Could not create layer ${config.name}:`, err.message);
            }
        }
    }

    _updateLayerVisibility(year) {
        // Imagery: show if in range AND user hasn't hidden it
        for (const layer of this._layers) {
            const inRange = year >= layer._yearStart && year <= layer._yearEnd;
            layer.show = inRange && layer._userVisible;
        }

        // Tilesets: show first matching one
        let activeTileset = null;
        for (const tileset of this._tilesets) {
            const inRange = year >= tileset._yearStart && year <= tileset._yearEnd;
            tileset.show = inRange && !activeTileset;
            if (tileset.show) activeTileset = tileset;
        }

        // Adjust terrain exaggeration when 3D tileset is active
        this.cesium.scene.verticalExaggeration = activeTileset ? 1.0 : this._baseExaggeration;
    }

    async _createTileset(config) {
        const sse = config.maximumScreenSpaceError || 16;
        switch (config.type) {
            case 'google_3d':
                return Cesium.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true });
            case 'osm_buildings':
                return Cesium.createOsmBuildingsAsync();
            case 'url':
                return Cesium.Cesium3DTileset.fromUrl(config.url, { maximumScreenSpaceError: sse });
            case 'ion':
                return Cesium.Cesium3DTileset.fromIonAssetId(config.assetId, { maximumScreenSpaceError: sse });
            default:
                return null;
        }
    }

    // --- Entity Loading ---

    async _loadJson(url) {
        try {
            const fullUrl = url.startsWith('/') ? `${import.meta.env.BASE_URL}${url.slice(1)}` : url;
            const response = await fetch(fullUrl);
            if (response.ok) return response.json();
        } catch (err) {
            console.warn(`Could not load ${url}:`, err.message);
        }
        return null;
    }

    async _loadCzml(url) {
        try {
            const fullUrl = url.startsWith('/') ? `${import.meta.env.BASE_URL}${url.slice(1)}` : url;
            const dataSource = await Cesium.CzmlDataSource.load(fullUrl);
            this.cesium.dataSources.add(dataSource);
            this._czmlDataSource = dataSource;
            console.log(`Loaded CZML with ${dataSource.entities.values.length} entities`);
        } catch (err) {
            console.warn(`Could not load CZML ${url}:`, err.message);
        }
    }

    _loadEntities(data) {
        this._entityIdCounts = {};
        for (const entity of data.entities || []) {
            this._addEntity(entity);
        }
        console.log(`Loaded ${data.entities?.length || 0} entities`);
    }

    _addEntity(entity) {
        const color = Cesium.Color.fromCssColorString(entity.color || '#888888');
        const toJulian = (year) => Cesium.JulianDate.fromDate(dateFromYear(year));
        const availability = entity.availability
            ? new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({
                start: toJulian(entity.availability.start || 0),
                stop: toJulian(entity.availability.stop || 2100)
            })])
            : undefined;

        const baseId = entity.id || `entity_${Date.now()}`;
        this._entityIdCounts[baseId] = (this._entityIdCounts[baseId] || 0) + 1;
        const uniqueId = this._entityIdCounts[baseId] > 1 ? `${baseId}__${this._entityIdCounts[baseId]}` : baseId;

        const config = {
            id: uniqueId,
            name: entity.name,
            availability,
            properties: { group: entity.group, ...entity.properties }
        };

        if (entity.type === 'point') {
            config.position = Cesium.Cartesian3.fromDegrees(entity.coords[0], entity.coords[1]);
            config.point = {
                pixelSize: 8, color,
                outlineColor: Cesium.Color.BLACK, outlineWidth: 1,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            };
        } else if (entity.type === 'polyline') {
            config.polyline = {
                positions: Cesium.Cartesian3.fromDegreesArray(entity.coords.flat()),
                width: 4, material: color, clampToGround: true
            };
        } else if (entity.type === 'polygon') {
            config.polygon = {
                hierarchy: Cesium.Cartesian3.fromDegreesArray(entity.coords.flat()),
                height: entity.height || 0,
                extrudedHeight: entity.extrudedHeight || 0,
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                material: color, outline: true, outlineColor: Cesium.Color.BLACK
            };
        }

        if (entity.properties) {
            config.description = this._buildDescription(entity.properties);
        }

        this.cesium.entities.add(config);
    }

    _buildDescription(props) {
        const fields = [
            ['Type', props.site_type],
            ['Source', props.source_display],
            ['Date', props.start_year ? `${props.start_year}${props.end_year ? ' - ' + props.end_year : ''}` : null],
            ['Grade', props.grade],
            ['Description', props.description]
        ].filter(([, v]) => v);

        if (fields.length === 0) return undefined;

        let html = '<table class="cesium-infoBox-defaultTable">';
        for (const [label, value] of fields) {
            html += `<tr><th>${label}</th><td>${value}</td></tr>`;
        }
        if (props.hyperlink) {
            html += `<tr><th>Link</th><td><a href="${props.hyperlink}" target="_blank">More info</a></td></tr>`;
        }
        return html + '</table>';
    }

    // --- Camera ---

    setCamera(pos) {
        if (!pos) return;
        this.cesium.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.height || 50000),
            orientation: {
                heading: pos.heading ?? 0,
                pitch: pos.pitch ?? Cesium.Math.toRadians(-90),
                roll: 0
            }
        });
    }

    _saveCamera() {
        const cam = this.cesium.camera;
        const pos = cam.positionCartographic;
        localStorage.setItem('camera', JSON.stringify({
            lon: Cesium.Math.toDegrees(pos.longitude),
            lat: Cesium.Math.toDegrees(pos.latitude),
            height: pos.height,
            heading: cam.heading,
            pitch: cam.pitch
        }));
    }

    _loadCamera() {
        try {
            const saved = localStorage.getItem('camera');
            if (saved) return JSON.parse(saved);
        } catch (e) { /* ignore */ }
        return null;
    }
}
