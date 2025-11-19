import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Your Supabase project details
const SUPABASE_URL = 'https://ntynbjvsxmwjqrnblnga.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50eW5ianZzeG13anFybmJsbmdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MDAwODksImV4cCI6MjA3OTA3NjA4OX0.2e8CcWu2oho9EzW0wM04nSzDLmLSevl9CuI9oOusduU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STORAGE_KEY_LOCAL = 'reptile_sightings_local';
const STORAGE_KEY_UNSYNCED = 'reptile_sightings_unsynced';
const STORAGE_KEY_FARMER = 'reptile_farmer_code';

const logBtn = document.getElementById('log-btn');
const exportBtn = document.getElementById('export-btn');
const statusEl = document.getElementById('status');
const listEl = document.getElementById('sightings-list');
const farmerInput = document.getElementById('farmer-code');
const saveCodeBtn = document.getElementById('save-code-btn');

// New fields
const speciesInput = document.getElementById('species');
const notesInput = document.getElementById('notes');
const photoInput = document.getElementById('photo'); // placeholder for future photo support

function loadJson(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getFarmerCode() {
  return localStorage.getItem(STORAGE_KEY_FARMER) || '';
}

function setFarmerCode(code) {
  localStorage.setItem(STORAGE_KEY_FARMER, code);
}

function loadLocalSightings() {
  return loadJson(STORAGE_KEY_LOCAL);
}

function saveLocalSightings(list) {
  saveJson(STORAGE_KEY_LOCAL, list);
}

function loadUnsynced() {
  return loadJson(STORAGE_KEY_UNSYNCED);
}

function saveUnsynced(list) {
  saveJson(STORAGE_KEY_UNSYNCED, list);
}

function renderSightings() {
  const sightings = loadLocalSightings();
  listEl.innerHTML = '';

  if (sightings.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No sightings logged yet.';
    listEl.appendChild(li);
    return;
  }

  sightings.forEach(s => {
    const li = document.createElement('li');
    const dt = new Date(s.timestamp);
    let line =
      `${dt.toLocaleString()} — ` +
      `${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)} ` +
      `(${s.farmer_code || 'no code'})`;

    if (s.species) {
      line += ` [${s.species}]`;
    }
    if (s.notes) {
      line += ` — ${s.notes}`;
    }

    li.textContent = line;
    listEl.appendChild(li);
  });
}

async function syncUnsynced() {
  const unsynced = loadUnsynced();
  if (!unsynced.length) return;
  if (!navigator.onLine) return;

  statusEl.textContent = 'Syncing sightings to server...';

  try {
    const { error } = await supabase.from('sightings').insert(
      unsynced.map(s => ({
        created_at: s.timestamp,      // Supabase will parse ISO string
        farmer_code: s.farmer_code,
        latitude: s.latitude,
        longitude: s.longitude,
        species: s.species || null,
        notes: s.notes || null
      }))
    );

    if (error) {
      console.error('Supabase insert error', error);
      statusEl.textContent = 'Could not sync to server (will retry later).';
      return;
    }

    saveUnsynced([]);
    statusEl.textContent = 'All unsynced sightings uploaded.';
  } catch (e) {
    console.error('Sync error', e);
    statusEl.textContent = 'Sync failed (will retry later).';
  }
}

function logLocally(record) {
  const local = loadLocalSightings();
  local.unshift(record); // newest first
  saveLocalSightings(local);

  const unsynced = loadUnsynced();
  unsynced.push(record);
  saveUnsynced(unsynced);

  renderSightings();
}

function logError(msg) {
  statusEl.textContent = msg;
}

function logInfo(msg) {
  statusEl.textContent = msg;
}

function exportCsv() {
  const sightings = loadLocalSightings();
  if (!sightings.length) {
    logInfo('No data to export.');
    return;
  }

  let csv = 'timestamp,farmer_code,latitude,longitude,species,notes\n';
  for (const s of sightings) {
    const safeSpecies = (s.species || '').replace(/"/g, '""');
    const safeNotes = (s.notes || '').replace(/"/g, '""');
    csv += `"${s.timestamp}","${s.farmer_code || ''}",${s.latitude},${s.longitude},"${safeSpecies}","${safeNotes}"\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'reptile_sightings.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  logInfo('CSV exported (check your downloads).');
}

function initFarmerCodeUI() {
  const existing = getFarmerCode();
  farmerInput.value = existing;

  saveCodeBtn.addEventListener('click', () => {
    const code = farmerInput.value.trim();
    if (!code) {
      logError('Please enter a farm code.');
      return;
    }
    setFarmerCode(code);
    logInfo('Farm code saved.');
  });
}

function logSighting() {
  const farmerCode = getFarmerCode().trim();
  if (!farmerCode) {
    logError('Please enter and save your farm code first.');
    return;
  }

  if (!navigator.geolocation) {
    logError('Geolocation is not supported on this device.');
    return;
  }

  const species = speciesInput ? speciesInput.value.trim() : '';
  const notes = notesInput ? notesInput.value.trim() : '';

  logBtn.disabled = true;
  logInfo('Getting location...');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const now = new Date();

      const record = {
        timestamp: now.toISOString(),
        farmer_code: farmerCode,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        species: species,
        notes: notes
        // photo: could be added later
      };

      logLocally(record);

      // Clear optional fields for next entry
      if (speciesInput) speciesInput.value = '';
      if (notesInput) notesInput.value = '';
      if (photoInput) photoInput.value = '';

      logInfo('Sighting logged locally.');
      logBtn.disabled = false;

      // Try to sync in the background
      syncUnsynced();
    },
    (err) => {
      logError('Error getting location: ' + err.message);
      logBtn.disabled = false;
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

// Service worker registration (for offline)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .catch(err => console.error('Service worker registration failed', err));
  });
}

// Events
logBtn.addEventListener('click', logSighting);
exportBtn.addEventListener('click', exportCsv);
window.addEventListener('online', syncUnsynced);

// Init
initFarmerCodeUI();
renderSightings();
syncUnsynced();
