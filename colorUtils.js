export function rgbToRgbw(r, g, b) {
  const w = Math.min(r, g, b);
  return {
    r: r - w,
    g: g - w,
    b: b - w,
    w: w
  };
}
