import { expect, test } from 'vitest';
import { graphics8c } from '../../client/src/config.ts';
import { SETS, sourceFile } from './textures.ts';

test('T3 processes only roof slates + asphalt (SPEC §17.20)', () => {
  expect([...SETS]).toEqual(['roof_slates_03', 'asphalt_02']);
  expect(sourceFile('asphalt_02', 'nor_gl')).toBe('polyhaven/textures/asphalt_02/asphalt_02_nor_gl_2k.jpg');
});

test('T3 config: both items on, tiles positive', () => {
  expect(graphics8c.roofs.enabled && graphics8c.asphalt.enabled).toBe(true);
  expect(graphics8c.roofs.tile).toBeGreaterThan(0);
  expect(graphics8c.asphalt.tile).toBeGreaterThan(0);
});
