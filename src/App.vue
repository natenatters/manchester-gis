<template>
  <div id="cesiumContainer" ref="cesiumContainer"></div>

  <!-- Controls Panel -->
  <div id="controls">
    <div class="controls-panel">
      <div class="controls-header">
        <h2>{{ title }}</h2>
        <button class="toggle-btn" @click="controlsOpen = !controlsOpen">
          {{ controlsOpen ? '-' : '+' }}
        </button>
      </div>
      <div v-show="controlsOpen" id="controlsContent">
        <!-- Year Slider -->
        <div class="layer-group">
          <div class="layer-group-title">Time Period</div>
          <div class="year-display">{{ year }} AD</div>
          <input
            id="yearSlider"
            type="range"
            min="0"
            max="2026"
            :value="year"
            @input="onYearInput"
          >
          <!-- Imagery Toggles -->
          <div class="imagery-display">
            <template v-if="layers.imagery.length === 0">
              <span class="no-imagery">No imagery</span>
            </template>
            <template v-else>
              <label v-for="layer in layers.imagery" :key="layer.index" class="imagery-toggle">
                <input
                  type="checkbox"
                  :checked="layer.visible"
                  @change="toggleImagery(layer.index)"
                >
                {{ layer.name }}
              </label>
            </template>
          </div>
        </div>

        <!-- Group Toggles -->
        <div v-for="group in groups" :key="group" class="layer-group">
          <div class="layer-group-title">
            <label>
              <input
                type="checkbox"
                checked
                @change="e => toggleGroup(group, e.target.checked)"
              >
              {{ group }}
            </label>
          </div>
        </div>

        <div class="status">Ready</div>
      </div>
    </div>
  </div>

  <!-- Entity Panel -->
  <div id="entityPanel" class="building-editor" :class="{ visible: selectedEntity }">
    <div class="editor-header">
      <span>{{ entityName }}</span>
      <button class="editor-close" @click="clearSelection">&times;</button>
    </div>
    <div class="editor-content">
      <table v-if="selectedEntity" class="cesium-infoBox-defaultTable">
        <tr><th>ID</th><td>{{ selectedEntity.id || '--' }}</td></tr>
        <tr v-if="entityGroup"><th>Group</th><td>{{ entityGroup }}</td></tr>
        <tr v-if="entityPeriod"><th>Period</th><td>{{ entityPeriod }}</td></tr>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { Viewer } from './viewer.js';

// Props
const props = defineProps({
  config: Object
});

// State
const title = ref('Historical GIS');
const year = ref(2000);
const defaultYear = ref(2000);
const groups = ref([]);
const layers = ref({ imagery: [] });
const selectedEntity = ref(null);
const controlsOpen = ref(true);

// Viewer instance
let viewer = null;

// Computed
const entityName = computed(() => {
  if (!selectedEntity.value) return 'Select an entity';
  return selectedEntity.value.name || selectedEntity.value.id || 'Unknown';
});

const entityGroup = computed(() => {
  if (!selectedEntity.value) return null;
  const props = selectedEntity.value.properties;
  return props?.group?.getValue?.() || props?.group || null;
});

const entityPeriod = computed(() => {
  if (!selectedEntity.value?.availability) return null;
  const start = selectedEntity.value.availability.start?.toString?.() || '';
  const stop = selectedEntity.value.availability.stop?.toString?.() || '';
  if (!start && !stop) return null;
  const startYear = start ? new Date(start).getFullYear() : '?';
  const stopYear = stop ? new Date(stop).getFullYear() : '?';
  return `${startYear} - ${stopYear}`;
});

// Methods
function onYearInput(e) {
  const newYear = parseInt(e.target.value);
  localStorage.setItem('year', newYear);
  viewer?.setYear(newYear);
}

function toggleImagery(index) {
  viewer?.toggleImagery(index);
  layers.value = viewer?.getLayerInfo(viewer.year) || { imagery: [] };
}

function toggleGroup(group, visible) {
  viewer?.toggleGroup(group, visible);
}

function clearSelection() {
  viewer?.clearSelection();
}

// Lifecycle
onMounted(async () => {
  // Create viewer
  viewer = new Viewer('cesiumContainer');

  // Listen to viewer events
  viewer.on('yearChange', (y) => {
    year.value = y;
    layers.value = viewer.getLayerInfo(y);
  });

  viewer.on('entitiesChange', (entities) => {
    const groupSet = new Set();
    for (const entity of entities) {
      const group = entity.properties?.group?.getValue?.() || entity.properties?.group;
      if (group) groupSet.add(group);
    }
    groups.value = [...groupSet];
  });

  viewer.on('entitySelect', (entity) => {
    selectedEntity.value = entity;
  });

  // Initialize
  title.value = props.config.name || 'Historical GIS';
  defaultYear.value = props.config.defaultYear || 2000;

  await viewer.init(props.config);

  // Set initial year from localStorage or default
  const saved = localStorage.getItem('year');
  const initialYear = saved !== null ? parseInt(saved, 10) : defaultYear.value;
  viewer.setYear(initialYear);
});
</script>
