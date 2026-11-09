'use strict';
const { readJSON, writeJSON } = require('./atomic_json');

const DEFAULT_BOUNDS = Object.freeze({ width: 1200, height: 820 });
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const MAX_DIMENSION = 16384;

function validDimension(value, min) {
  return Number.isInteger(value) && value >= min && value <= MAX_DIMENSION;
}

function validCoordinate(value) {
  return Number.isInteger(value) && value >= -32768 && value <= 32768;
}

function sanitizeWindowState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const width = Number.isFinite(raw.width) ? Math.round(raw.width) : null;
  const height = Number.isFinite(raw.height) ? Math.round(raw.height) : null;
  if (!validDimension(width, MIN_WIDTH) || !validDimension(height, MIN_HEIGHT)) return null;
  const x = Number.isFinite(raw.x) ? Math.round(raw.x) : null;
  const y = Number.isFinite(raw.y) ? Math.round(raw.y) : null;
  const hasPosition = validCoordinate(x) && validCoordinate(y);
  return {
    schema_version: 1,
    width,
    height,
    x: hasPosition ? x : null,
    y: hasPosition ? y : null,
    maximized: Boolean(raw.maximized),
    full_screen: Boolean(raw.full_screen)
  };
}

function visibleOnDisplays(state, displays) {
  if (!Array.isArray(displays) || !displays.length || state.x === null || state.y === null) return false;
  return displays.some(display => {
    const area = display?.workArea || display?.bounds;
    if (!area) return false;
    const overlapX = Math.min(state.x + state.width, area.x + area.width) - Math.max(state.x, area.x);
    const overlapY = Math.min(state.y + state.height, area.y + area.height) - Math.max(state.y, area.y);
    return overlapX >= 120 && overlapY >= 80;
  });
}

class WindowStateStore {
  constructor(file = null) {
    this.file = file;
    this.state = null;
    if (file) {
      try {
        this.state = sanitizeWindowState(readJSON(file));
      } catch {
        this.state = null;
      }
    }
  }

  restore(screen = null) {
    if (!this.state) return { ...DEFAULT_BOUNDS, maximized: false, full_screen: false };
    const displays = screen?.getAllDisplays?.() || [];
    const primaryArea = screen?.getPrimaryDisplay?.()?.workArea;
    let { width, height, x, y, maximized, full_screen } = this.state;
    if (displays.length && !visibleOnDisplays(this.state, displays)) {
      x = null;
      y = null;
      if (primaryArea) {
        width = Math.max(MIN_WIDTH, Math.min(width, primaryArea.width));
        height = Math.max(MIN_HEIGHT, Math.min(height, primaryArea.height));
      }
    }
    return {
      width,
      height,
      ...(x !== null && y !== null ? { x, y } : {}),
      maximized,
      full_screen
    };
  }

  save(bounds) {
    const next = sanitizeWindowState({
      ...this.state,
      ...bounds
    });
    if (!next) return null;
    if (JSON.stringify(this.state) === JSON.stringify(next)) return next;
    this.state = next;
    if (this.file) {
      try { writeJSON(this.file, next); } catch {}
    }
    return { ...next };
  }

  recordWindow(win) {
    if (!win || win.isDestroyed?.()) return null;
    try {
      const maximized = Boolean(win.isMaximized?.());
      const fullScreen = Boolean(win.isFullScreen?.());
      const bounds = win.getBounds?.();
      if (!bounds) return null;
      return this.save({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        maximized,
        full_screen: fullScreen
      });
    } catch {
      return null;
    }
  }
}

module.exports = { WindowStateStore, sanitizeWindowState, visibleOnDisplays, DEFAULT_BOUNDS, MIN_WIDTH, MIN_HEIGHT };
