const STORAGE_KEY = 'vesz-settings';
const DEFAULT_SETTINGS = { unfall: true, feuer: true, wetter: true, sonstiges: true };

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Einstellungen konnten nicht gespeichert werden', e);
  }
}

const settings = loadSettings();

document.querySelectorAll('input[data-category]').forEach((input) => {
  const key = input.dataset.category;
  input.checked = settings[key] !== false;

  input.addEventListener('change', () => {
    const current = loadSettings();
    current[key] = input.checked;
    saveSettings(current);
  });
});
