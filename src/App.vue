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
            min="1"
            max="2026"
            :value="year"
            @input="onYearInput"
          >
          <!-- Imagery Toggles -->
          <div class="imagery-display">
            <template v-if="layers.length === 0">
              <span class="no-imagery">No imagery</span>
            </template>
            <template v-else>
              <label v-for="layer in layers" :key="layer.index" class="imagery-toggle">
                <input
                  type="checkbox"
                  :checked="layer.visible"
                  @change="toggleLayer(layer.index)"
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
        <tbody>
          <tr><th>ID</th><td>{{ selectedEntity.id || '--' }}</td></tr>
          <tr v-if="entityGroup"><th>Group</th><td>{{ entityGroup }}</td></tr>
          <tr v-if="entityPeriod"><th>Period</th><td>{{ entityPeriod }}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { Viewer } from './viewer.js';

const props = defineProps({ config: Object });

// State
const title = ref('Historical GIS');
const year = ref(2000);
const groups = ref([]);
const layers = ref([]);
const selectedEntity = ref(null);
const controlsOpen = ref(true);

let viewer = null;

// Computed
const entityName = computed(() => {
  if (!selectedEntity.value) return 'Select an entity';
  return selectedEntity.value.name || selectedEntity.value.id || 'Unknown';
});

const entityGroup = computed(() => {
  const props = selectedEntity.value?.properties;
  return props?.group?.getValue?.() || props?.group || null;
});

const entityPeriod = computed(() => {
  const avail = selectedEntity.value?.availability;
  if (!avail) return null;
  const start = avail.start?.toString?.() || '';
  const stop = avail.stop?.toString?.() || '';
  if (!start && !stop) return null;
  return `${start ? new Date(start).getFullYear() : '?'} - ${stop ? new Date(stop).getFullYear() : '?'}`;
});

// Methods
function onYearInput(e) {
  const y = parseInt(e.target.value);
  localStorage.setItem('year', y);
  viewer.year = y;
}

function toggleLayer(index) {
  viewer?.toggleLayer(index);
  layers.value = viewer?.getVisibleLayers(year.value) || [];
}

function toggleGroup(group, visible) {
  viewer?.toggleGroup(group, visible);
}

function clearSelection() {
  viewer.cesium.selectedEntity = undefined;
}

// Lifecycle
onMounted(async () => {
  viewer = new Viewer('cesiumContainer');
  title.value = props.config.name || 'Historical GIS';

  // Year change callback
  viewer.onYearChange = (y) => {
    year.value = y;
    layers.value = viewer.getVisibleLayers(y);
  };

  // Entity selection
  viewer.cesium.selectedEntityChanged.addEventListener((entity) => {
    selectedEntity.value = entity;
  });

  // Init
  await viewer.init(props.config);

  // Extract groups from loaded entities
  const groupSet = new Set();
  for (const e of viewer._dataSource?.entities.values || []) {
    const g = e.properties?.group?.getValue?.() || e.properties?.group;
    if (g) groupSet.add(g);
  }
  groups.value = [...groupSet];

  // Set initial year
  const saved = localStorage.getItem('year');
  viewer.year = saved !== null ? parseInt(saved, 10) : (props.config.defaultYear || 2000);
});
</script>
