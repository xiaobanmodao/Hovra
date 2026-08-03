export type Point = {
  x: number;
  y: number;
};

export type Viewport = {
  width: number;
  height: number;
};

export const mapMirroredPoint = (point: Point, viewport: Viewport): Point => ({
  x: (1 - point.x) * viewport.width,
  y: point.y * viewport.height,
});

export const smoothPoint = (previous: Point, target: Point, factor: number): Point => ({
  x: previous.x + (target.x - previous.x) * factor,
  y: previous.y + (target.y - previous.y) * factor,
});
