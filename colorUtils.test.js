import { rgbToRgbw } from './colorUtils.js';

describe('RGB to RGBW conversion', () => {
  test('extracts white channel correctly', () => {
    const result = rgbToRgbw(255, 255, 255);
    expect(result).toEqual({ r: 0, g: 0, b: 0, w: 255 });
  });

  test('keeps colors without white intact', () => {
    const result = rgbToRgbw(255, 0, 0);
    expect(result).toEqual({ r: 255, g: 0, b: 0, w: 0 });
  });

  test('handles mixed colors', () => {
    const result = rgbToRgbw(200, 100, 50);
    expect(result).toEqual({ r: 150, g: 50, b: 0, w: 50 });
  });
});
