export type Size = {
  width: number;
  height: number;
};

export type Position = {
  x: number;
  y: number;
};

function clampAxis(
  position: number,
  itemSize: number,
  viewportSize: number,
  margin: number,
): number {
  if (viewportSize < itemSize + margin * 2) {
    return 0;
  }

  const maximum = Math.max(0, viewportSize - itemSize - margin);
  return Math.min(Math.max(position, margin), maximum);
}

export function clampToViewport(
  position: Position,
  item: Size,
  viewport: Size,
  margin: number,
): Position {
  return {
    x: clampAxis(position.x, item.width, viewport.width, margin),
    y: clampAxis(position.y, item.height, viewport.height, margin),
  };
}
