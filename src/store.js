// localStorage persistence (browser only). Every access is wrapped in try/catch so the app
// still works (in memory) when storage is blocked, full or unavailable.
import { createEmptyState, validateState } from './lib/model.js';

export const STORAGE_KEY = 'aeoGeoVisibilityLab.v1';
/** Set when the visitor chose to start empty (or reset), so the sample is not auto-loaded again. */
export const START_EMPTY_KEY = `${STORAGE_KEY}.startEmpty`;

/** Load saved state. Returns { state, warning, found } — found is false only when nothing was saved. */
export function loadState() {
  let raw = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { state: createEmptyState(), found: false, warning: 'Browser storage is unavailable, so changes will not be saved after you close this tab. Use "Back up data" to keep a copy.' };
  }
  if (!raw) return { state: createEmptyState(), warning: '', found: false };
  try {
    const result = validateState(JSON.parse(raw));
    if (result.ok) return { state: result.state, warning: '', found: true };
    return { state: createEmptyState(), found: true, warning: `Saved data could not be read (${result.errors[0]}). Starting empty — restore a backup if you have one.` };
  } catch {
    return { state: createEmptyState(), found: true, warning: 'Saved data was corrupted and could not be read. Starting empty — restore a backup if you have one.' };
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

/** True when the visitor previously chose to start empty or reset everything. */
export function startEmptyChosen() {
  try { return window.localStorage.getItem(START_EMPTY_KEY) === '1'; } catch { return false; }
}

export function rememberStartEmpty() {
  try { window.localStorage.setItem(START_EMPTY_KEY, '1'); } catch { /* storage unavailable */ }
}
