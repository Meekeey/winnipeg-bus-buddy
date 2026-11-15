// Small map-math helpers.

export type LatLon = [number, number];

export const WINNIPEG_CENTRE: LatLon = [49.8951, -97.1384];

// Distance in metres between two points (good enough for a city).
export function distanceMetres(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toRad;
  const dLon = (b[1] - a[1]) * toRad;
  const lat1 = a[0] * toRad;
  const lat2 = b[0] * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

// Index of the point in `line` that is closest to `point`.
export function nearestPointIndex(line: LatLon[], point: LatLon, startAt = 0): number {
  let bestIndex = startAt;
  let bestDistance = Infinity;
  for (let i = startAt; i < line.length; i++) {
    const d = distanceMetres(line[i], point);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }
  return bestIndex;
}

// The point a given fraction (0..1) of the way along a line.
export function pointAlongLine(line: LatLon[], fraction: number): LatLon {
  if (line.length === 0) return WINNIPEG_CENTRE;
  if (line.length === 1) return line[0];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const d = distanceMetres(line[i - 1], line[i]);
    lengths.push(d);
    total += d;
  }
  let target = total * Math.min(1, Math.max(0, fraction));
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] === 0 ? 0 : Math.min(1, target / lengths[i]);
      const a = line[i];
      const b = line[i + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    target -= lengths[i];
  }
  return line[line.length - 1];
}
