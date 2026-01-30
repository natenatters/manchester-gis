/**
 * Viewer - Pure Cesium wrapper
 *
 * Manages:
 * - Cesium.Viewer instance
 * - Camera position + localStorage persistence
 * - Terrain
 * - Clock/time
 * - Layer rendering (imagery + tilesets)
 * - Entities
 *
 * Emits events via callbacks:
 * - onYearChange(year)
 * - onEntitiesChange(entities)
 */

import * as Cesium from 'cesium';
import { createImageryProvider } from './imagery/index.js';

export class Viewer {
    constructor(containerId) {
        // Set Cesium Ion token if available
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

        // Terrain state
        this._terrainEnabled = false;
        this._baseExaggeration = 1.0;

        // Event bus
        this._handlers = {};

        // Layer state
        this._layerConfigs = [];
        this._layerVisibility = new Map();
        this._imageryLayers = [];
        this._activeTilesetConfig = null;
        this._loadedTilesets = new Map();

        // Persist camera to localStorage on change
        this.cesium.camera.changed.addEventListener(() => this._saveCamera());

        // Entity change event
        this.cesium.entities.collectionChanged.addEventListener(() => {
            this._emit('entitiesChange', this.cesium.entities.values);
        });

        // Clock state
        this._lastYear = null;
        const clock = this.cesium.clock;
        clock.startTime = Cesium.JulianDate.fromDate(new Date(1000, 6, 1));
        clock.stopTime = Cesium.JulianDate.fromDate(new Date(2100, 6, 1));
        clock.clockRange = Cesium.ClockRange.CLAMPED;
        clock.onTick.addEventListener(async () => {
            const year = this.year;
            if (year === this._lastYear) return;
            this._lastYear = year;
            await this.applyLayerState(this._getLayerState(year), year);
            if (year !== this.year) return;
            this._emit('yearChange', year);
            this.requestRender();
        });

        // Entity selection event
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
        for (const handler of this._handlers[event] || []) {
            handler(...args);
        }
    }

    clearSelection() {
        this.cesium.selectedEntity = undefined;
    }

    // --- Clock ---

    get year() {
        return Cesium.JulianDate.toDate(this.cesium.clock.currentTime).getFullYear();
    }

    setYear(year) {
        this.cesium.clock.currentTime = Cesium.JulianDate.fromDate(new Date(year, 6, 1));
    }

    // --- Public API ---

    async init(config) {
        this.clear();

        console.log(`Loading project: ${config.name}`);

        this._initFromConfig(config);

        // Load entities
        if (config.entities) {
            const data = await this._loadJson(config.entities);
            if (data) this._loadEntities(data);
        }
    }

    getLayerInfo(year) {
        const state = this._getLayerState(year);
        return {
            imagery: state.imagery.map((l, i) => ({
                name: l.config.name || 'Unknown',
                visible: l.visible,
                index: i
            })),
            tileset: state.tileset?.name || null
        };
    }

    toggleImagery(index) {
        const imagery = this._getMatchingLayers(this.year, 'imagery');
        if (imagery[index]) {
            const current = this._layerVisibility.get(imagery[index]) ?? true;
            this._layerVisibility.set(imagery[index], !current);
        }
        this.applyLayerState(this._getLayerState(this.year));
        this.requestRender();
    }

    toggleGroup(groupKey, visible) {
        for (const entity of this.cesium.entities.values) {
            const group = entity.properties?.group?.getValue?.() || entity.properties?.group;
            if (group === groupKey) {
                entity.show = visible;
            }
        }
        this.requestRender();
    }

    clear() {
        this.cesium.entities.removeAll();
        for (const layer of this._imageryLayers) {
            this.cesium.imageryLayers.remove(layer, false);
        }
        this._imageryLayers = [];

        for (const tileset of this._loadedTilesets.values()) {
            this.cesium.scene.primitives.remove(tileset);
        }
        this._loadedTilesets.clear();
        this._activeTilesetConfig = null;
    }

    requestRender() {
        this.cesium.scene.requestRender();
    }

    // --- Internal ---

    async _loadJson(url) {
        try {
            const response = await fetch(url);
            if (response.ok) return response.json();
        } catch (err) {
            console.warn(`Could not load ${url}:`, err.message);
        }
        return null;
    }

    _loadEntities(data) {
        for (const entity of data.entities || []) {
            this._addEntity(entity);
        }
        console.log(`Loaded ${data.entities?.length || 0} entities`);
    }

    _addEntity(entity) {
        const color = Cesium.Color.fromCssColorString(entity.color || '#888888');
        const toJulian = (year) => Cesium.JulianDate.fromDate(new Date(year, 6, 1));
        const availability = entity.availability
            ? new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({
                start: toJulian(entity.availability.start || 0),
                stop: toJulian(entity.availability.stop || 2100)
            })])
            : undefined;

        const config = {
            id: entity.id,
            name: entity.name,
            availability,
            properties: { group: entity.group, ...entity.properties }
        };

        if (entity.type === 'point') {
            config.position = Cesium.Cartesian3.fromDegrees(entity.coords[0], entity.coords[1]);
            config.point = {
                pixelSize: 8,
                color,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            };
        } else if (entity.type === 'polyline') {
            config.polyline = {
                positions: Cesium.Cartesian3.fromDegreesArray(entity.coords.flat()),
                width: 4,
                material: color,
                clampToGround: true
            };
        } else if (entity.type === 'polygon') {
            config.polygon = {
                hierarchy: Cesium.Cartesian3.fromDegreesArray(entity.coords.flat()),
                height: entity.height || 0,
                extrudedHeight: entity.extrudedHeight || 0,
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                material: color,
                outline: true,
                outlineColor: Cesium.Color.BLACK
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

    _initFromConfig(config) {
        // Store layer configs
        this._layerConfigs = config.layers || [];
        this._layerVisibility = new Map();
        for (const layer of this._layerConfigs) {
            this._layerVisibility.set(layer, true);
        }

        // Camera (restore from localStorage or use config default)
        const savedCamera = this._loadCamera();
        this.setCamera(savedCamera || config.center);

        // Terrain
        if (config.terrain?.enabled) {
            this.enableTerrain();
        }
        const exaggeration = config.terrain?.exaggeration || 1.0;
        this._baseExaggeration = exaggeration;
        this.cesium.scene.verticalExaggeration = exaggeration;
    }

    // --- Layer State ---

    _getLayerState(year) {
        const imagery = this._getMatchingLayers(year, 'imagery').map(config => ({
            config,
            visible: this._layerVisibility.get(config) ?? true
        }));
        const tileset = this._getMatchingLayers(year, 'tileset')[0] || null;
        return { imagery, tileset };
    }

    _getMatchingLayers(year, kind) {
        return this._layerConfigs.filter(l =>
            l.kind === kind &&
            year >= (l.yearStart ?? -Infinity) &&
            year <= (l.yearEnd ?? Infinity)
        );
    }

    _saveCamera() {
        const camera = this.cesium.camera;
        const pos = camera.positionCartographic;
        localStorage.setItem('camera', JSON.stringify({
            lon: Cesium.Math.toDegrees(pos.longitude),
            lat: Cesium.Math.toDegrees(pos.latitude),
            height: pos.height,
            heading: camera.heading,
            pitch: camera.pitch
        }));
    }

    _loadCamera() {
        try {
            const saved = localStorage.getItem('camera');
            if (saved) return JSON.parse(saved);
        } catch (e) { /* ignore */ }
        return null;
    }

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

    enableTerrain() {
        if (!this._terrainEnabled) {
            this.cesium.scene.setTerrain(Cesium.Terrain.fromWorldTerrain());
            this._terrainEnabled = true;
        }
    }

    // --- Layer Rendering ---

    async applyLayerState(state, year) {
        if (year !== undefined && year !== this.year) return;
        await this._applyImagery(state.imagery);
        if (year !== undefined && year !== this.year) return;
        await this._applyTileset(state.tileset, year);
    }

    async _applyImagery(imageryState) {
        const newConfigs = imageryState.map(i => i.config);
        const oldConfigs = this._imageryLayers.map(l => l._config);

        const configsChanged = newConfigs.length !== oldConfigs.length ||
            newConfigs.some((c, i) => c !== oldConfigs[i]);

        if (configsChanged) {
            for (const layer of this._imageryLayers) {
                this.cesium.imageryLayers.remove(layer, false);
            }
            this._imageryLayers = [];

            for (const { config, visible } of imageryState) {
                try {
                    const provider = createImageryProvider(config);
                    const layer = this.cesium.imageryLayers.addImageryProvider(provider);
                    layer.alpha = config.alpha ?? 1.0;
                    layer.show = visible;
                    layer._config = config;
                    this._imageryLayers.push(layer);
                } catch (err) {
                    console.warn(`Could not create imagery layer ${config.name}:`, err.message);
                }
            }
        } else {
            for (let i = 0; i < imageryState.length; i++) {
                if (this._imageryLayers[i]) {
                    this._imageryLayers[i].show = imageryState[i].visible;
                }
            }
        }
    }

    async _applyTileset(tilesetConfig, year) {
        if (this._activeTilesetConfig && this._activeTilesetConfig !== tilesetConfig) {
            const tileset = this._loadedTilesets.get(this._activeTilesetConfig);
            if (tileset) tileset.show = false;
        }

        if (tilesetConfig) {
            let tileset = this._loadedTilesets.get(tilesetConfig);

            if (!tileset) {
                try {
                    tileset = await this._createTileset(tilesetConfig);
                    if (year !== undefined && year !== this.year) return;
                    if (tileset) {
                        this.cesium.scene.primitives.add(tileset);
                        this._loadedTilesets.set(tilesetConfig, tileset);
                    }
                } catch (err) {
                    console.warn(`Could not load tileset ${tilesetConfig.name}:`, err.message);
                }
            }

            if (year !== undefined && year !== this.year) return;
            if (tileset) {
                tileset.show = true;
                this._activeTilesetConfig = tilesetConfig;
            }
        } else {
            this._activeTilesetConfig = null;
        }

        this.cesium.scene.verticalExaggeration = this._activeTilesetConfig ? 1.0 : this._baseExaggeration;
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
}
