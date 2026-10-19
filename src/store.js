// localStorage persistence (browser only). Every access is wrapped in try/catch so the app
// still works (in memory) when storage is blocked, full or unavailable.
import { createEmptyState, validateState } from './lib/model.js';

export const STORAGE_KEY = 'aeoGeoVisibilityLab.v1';

/** Load saved state. Returns { state, warning }. */
export function loadState() {
  let raw = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { state: createEmptyState(), warning: 'Browser storage is unavailable, so changes will not be saved after you close this tab. Use "Back up data" to keep a copy.' };
  }
  if (!raw) return { state: createEmptyState(), warning: '' };
  try {
    const result = validateState(JSON.parse(raw));
    if (result.ok) return { state: result.state, warning: '' };
    return { state: createEmptyState(), warning: `Saved data could not be read (${result.errors[0]}). Starting empty — restore a backup if you have one.` };
  } catch {
    return { state: createEmptyState(), warning: 'Saved data was corrupted and could not be read. Starting empty — restore a backup if you have one.' };
  }
}

/** Save state. Returns an error message, or '' on success. */
export function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return '';
  } catch {
    return 'Could not save to browser storage (it may be full or blocked). Use "Back up data" to keep a copy.';
  }
}

export function clearState() {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
