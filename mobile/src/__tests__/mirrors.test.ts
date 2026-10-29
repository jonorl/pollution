import { readFileSync } from 'fs';
import { join } from 'path';
import * as webBands from '../../../frontend/src/bands';
import * as webSizes from '../../../frontend/src/sizes';
import { BANDS, WHO_GUIDELINE_24H } from '../bands';
import { SIZE_CLASSES } from '../sizes';

// bands.ts and sizes.ts are copies of the web's; these catch one being changed without the other.

describe('bands', () => {
  it('match the web dashboard', () => {
    expect(BANDS).toEqual(webBands.BANDS);
    expect(WHO_GUIDELINE_24H).toBe(webBands.WHO_GUIDELINE_24H);
  });

  it("match the firmware's LED colours", () => {
    const led = readFileSync(join(__dirname, '../../../firmware/src/led.rs'), 'utf8');
    const rows = [...led.matchAll(/\(([\d.]+|f32::INFINITY), \[0x(\w\w), 0x(\w\w), 0x(\w\w)\]\)/g)].map(
      ([, max, r, g, b]) => ({ max: max === 'f32::INFINITY' ? Infinity : Number(max), color: `#${r}${g}${b}` }),
    );
    expect(rows).toEqual(BANDS.map(({ max, color }) => ({ max, color })));
  });
});

describe('size classes', () => {
  it('match the web dashboard', () => {
    expect(SIZE_CLASSES).toEqual(webSizes.SIZE_CLASSES);
  });
});
