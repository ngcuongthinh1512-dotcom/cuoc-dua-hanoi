import { afterEach, describe, expect, it } from 'vitest';
import { graphics8c, menu } from '../config.ts';
import { pickQuality } from '../world/graphics.ts';
import { clampSensitivity, loadSettings, mountQualitySetting, saveQuality, saveSettings, type SettingsStore, settings } from './settings.ts';

const fake = (init: Record<string, string> = {}) => {
  const data = { ...init };
  const store: SettingsStore = { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
  return { data, store };
};
const broken: SettingsStore = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

afterEach(() => loadSettings(fake().store)); // back to defaults for the next test

describe('settings storage', () => {
  it('defaults without anything stored (importing in Node touched no storage)', () => {
    loadSettings(fake().store);
    expect(settings).toEqual({ invertY: false, mouseSensitivity: 1 });
  });

  it('round trip through the store under menu.storageKey', () => {
    const { data, store } = fake();
    settings.invertY = true;
    settings.mouseSensitivity = 1.75;
    saveSettings(store);
    expect(JSON.parse(data[menu.storageKey]!)).toEqual({ invertY: true, mouseSensitivity: 1.75 });
    loadSettings(fake().store); // defaults
    expect(settings.invertY).toBe(false);
    loadSettings(store);
    expect(settings).toEqual({ invertY: true, mouseSensitivity: 1.75 });
  });

  it('a store that throws → defaults, no crash, saving is silent', () => {
    settings.invertY = true;
    loadSettings(broken);
    expect(settings).toEqual({ invertY: false, mouseSensitivity: 1 });
    expect(() => saveSettings(broken)).not.toThrow();
    expect(() => loadSettings(undefined)).not.toThrow(); // no localStorage at all
  });

  it('broken JSON or wrong types → defaults for those fields; the object keeps its identity', () => {
    const before = settings;
    loadSettings(fake({ [menu.storageKey]: '{oops' }).store);
    expect(settings).toEqual({ invertY: false, mouseSensitivity: 1 });
    loadSettings(fake({ [menu.storageKey]: JSON.stringify({ invertY: 'yes', mouseSensitivity: '2' }) }).store);
    expect(settings).toEqual({ invertY: false, mouseSensitivity: 1 });
    loadSettings(fake({ [menu.storageKey]: JSON.stringify({ invertY: true }) }).store);
    expect(settings).toEqual({ invertY: true, mouseSensitivity: 1 });
    expect(settings).toBe(before);
  });

  it('quality (8C): saved under graphics8c.quality.storageKey, read back by pickQuality; blocked storage → false', () => {
    const { data, store } = fake();
    expect(saveQuality('low', store)).toBe(true);
    expect(data[graphics8c.quality.storageKey]).toBe('low');
    expect(pickQuality(null, data[graphics8c.quality.storageKey]!, 'NVIDIA GeForce RTX 3060')).toBe('low');
    expect(saveQuality('high', store)).toBe(true);
    expect(pickQuality(null, data[graphics8c.quality.storageKey]!, 'Google SwiftShader')).toBe('high');
    expect(saveQuality('high', broken)).toBe(false);
    expect(saveQuality('high', undefined)).toBe(false);
    expect(() => mountQualitySetting()).not.toThrow(); // Node: no DOM, no-op
  });

  it('sensitivity is clamped into [min, max], on load and by clampSensitivity', () => {
    const { min, max } = menu.sensitivity;
    expect(clampSensitivity(0)).toBe(min);
    expect(clampSensitivity(99)).toBe(max);
    expect(clampSensitivity(1.5)).toBe(1.5);
    expect(clampSensitivity(NaN)).toBe(1);
    loadSettings(fake({ [menu.storageKey]: JSON.stringify({ mouseSensitivity: 50 }) }).store);
    expect(settings.mouseSensitivity).toBe(max);
    loadSettings(fake({ [menu.storageKey]: JSON.stringify({ mouseSensitivity: -2 }) }).store);
    expect(settings.mouseSensitivity).toBe(min);
  });
});
