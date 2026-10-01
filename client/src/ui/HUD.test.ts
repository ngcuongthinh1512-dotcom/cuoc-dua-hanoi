import { describe, expect, it } from 'vitest';
import { hudWidgets as W } from '../config.ts';
import { formatClock, formatSpeed, PlaceLabel } from './HUD.ts';

describe('HUD (pure parts)', () => {
  it('clock mm:ss, h:mm:ss past an hour; speed in km/h', () => {
    expect(formatClock(37)).toBe('00:37');
    expect(formatClock(37.9)).toBe('00:37');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-1)).toBe('00:00');
    expect(formatClock(null)).toBe('--:--'); // Phase 7: no start time entered yet
    expect(formatSpeed(5.2)).toBe('19 km/h');
    expect(formatSpeed(0)).toBe('0 km/h');
  });

  it('place label: a new street shows it for streetSeconds; same street not again; a new district again', () => {
    const l = new PlaceLabel();
    expect(l.update('Rue Royale', 8, 0)).toBe(true);
    expect(l.update('Rue Royale', 8, W.streetSeconds - 0.1)).toBe(true);
    expect(l.update('Rue Royale', 8, W.streetSeconds + 0.1)).toBe(false);
    expect(l.update(undefined, 8, 20)).toBe(false); // a park: no name, nothing new
    expect(l.street).toBe('Rue Royale');
    expect(l.update('Rue Royale', 8, 21)).toBe(false); // back on the same street
    expect(l.update('Rue Royale', 1, 22)).toBe(true); // district changed, street kept
    expect([l.street, l.district]).toEqual(['Rue Royale', 1]);
    expect(l.update('Rue de Rivoli', 1, 40)).toBe(true);
    expect(l.update('Rue de Rivoli', 1, 40 + W.streetSeconds)).toBe(false);
  });
});
