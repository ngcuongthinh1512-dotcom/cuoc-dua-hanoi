import { afterEach, describe, expect, it } from 'vitest';
import { graphics8c, menu } from '../config.ts';
import { pickQuality } from '../world/graphics.ts';
import { clampSensitivity, loadSettings, pickAvatar, saveQuality, saveSettings, type SettingsStore, settings } from './settings.ts';

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
    expect(settings).toEqual({ invertY: false, mouseSensitivity: 1, avatar: 0 });
  });

  it('round trip through the store under menu.storageKey', () => {
    const { data, store } = fake();
    settings.invertY = true;
    settings.mouseSensitivity = 1.75;
    saveSettings(store);
    expect(JSON.parse(data[menu.storageKey]!)).toEqual({ invertY: true, mouseSensitivity: 1.75, avatar: 0 });
    loadSettings(fake().store); // defaults
    expect(settings.invertY).toBe(false);
    loadSettings(store);
    expect(settings).toEqual({ invertY: true, mouseSensitivity: 1.75, avatar: 0 });
  });

  it('a store that throws → defaults, no crash, saving is silent', () => {
    settings.invertY = true;
    loadSettings(broken);
    expect(settings).toEqual({ invertY: false, mouseSensitivity: 1, avatar: 0 });
    expect(() => saveSettings(broken)).not.toThrow();
    expect(() => loadSettings(undefined)).not.toThrow(); // no localStorage at all
  });

  it('broken JSON or wrong types → defaults for those fields; the object keeps its identity', () => {
    const before = settings;
    loadSettings(fake({ [menu.storageKey]: '{oops' }).store);
    expect(settings).toEqual({ invertY: false, mouseSensitivity: 1, avatar: 0 });
    loadSettings(fake({ [menu.storageKey]: JSON.stringify({ invertY: 'yes', mouseSensitivity: '2' }) }).store);
    expect(settings).toEqual({ invertY: false, mouseSensitivity: 1, avatar: 0 });
    loadSettings(fake({ [menu.storageKey]: JSON.stringify({ invertY: true }) }).store);
    expect(settings).toEqual({ invertY: true, mouseSensitivity: 1, avatar: 0 });
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
  });

  it('avatar (Leg 2 "Nhân vật"): stored 0 | 1 only (default 0 = Nam); offline ?avatar= wins, never in a race', () => {
    const { data, store } = fake();
    settings.avatar = 1;
    saveSettings(store);
    loadSettings(store);
    expect(settings.avatar).toBe(1);
    expect(JSON.parse(data[menu.storageKey]!).avatar).toBe(1);
    for (const bad of [2, '1', null, -1]) {
      loadSettings(fake({ [menu.storageKey]: JSON.stringify({ avatar: bad }) }).store);
      expect(settings.avatar).toBe(0);
    }
    const q = (s: string) => new URLSearchParams(s);
    expect(pickAvatar(q('avatar=1'), false)).toBe(1);
    expect(pickAvatar(q('avatar=1'), true)).toBe(0); // a real race: the stored choice
    expect(pickAvatar(q('avatar=7'), false)).toBe(0);
    settings.avatar = 1;
    expect(pickAvatar(q(''), true)).toBe(1);
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
