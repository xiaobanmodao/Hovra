import { useEffect, useRef, useState } from "react";
import type { Point } from "../cursor/cursorController";
import type { GestureOutput } from "../gesture/types";

type PlaygroundProps = {
  cursor: Point | null;
  output: GestureOutput;
};

const containsPoint = (bounds: DOMRect, point: Point): boolean => (
  point.x >= bounds.left
  && point.x <= bounds.right
  && point.y >= bounds.top
  && point.y <= bounds.bottom
);

export function Playground({ cursor, output }: PlaygroundProps) {
  const [clickCount, setClickCount] = useState(0);
  const [cardPosition, setCardPosition] = useState<Point | null>(null);
  const clickTargetRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<Point | null>(null);

  useEffect(() => {
    if (!output.click || !cursor || !clickTargetRef.current) {
      return;
    }

    if (containsPoint(clickTargetRef.current.getBoundingClientRect(), cursor)) {
      setClickCount((count) => count + 1);
    }
  }, [output.click]);

  useEffect(() => {
    if (!output.dragStart || !cursor || !cardRef.current) {
      return;
    }

    const bounds = cardRef.current.getBoundingClientRect();
    if (containsPoint(bounds, cursor)) {
      dragOffsetRef.current = {
        x: cursor.x - bounds.left,
        y: cursor.y - bounds.top,
      };
    }
  }, [output.dragStart]);

  useEffect(() => {
    if (
      output.state !== "dragging"
      || !cursor
      || !dragOffsetRef.current
      || !surfaceRef.current
    ) {
      return;
    }

    const surfaceBounds = surfaceRef.current.getBoundingClientRect();
    const cardBounds = cardRef.current?.getBoundingClientRect();
    if (!cardBounds) {
      return;
    }

    const maxX = Math.max(0, surfaceBounds.width - cardBounds.width);
    const maxY = Math.max(0, surfaceBounds.height - cardBounds.height);
    const nextX = cursor.x - surfaceBounds.left - dragOffsetRef.current.x;
    const nextY = cursor.y - surfaceBounds.top - dragOffsetRef.current.y;
    setCardPosition({
      x: Math.min(maxX, Math.max(0, nextX)),
      y: Math.min(maxY, Math.max(0, nextY)),
    });
  }, [cursor, output.state]);

  useEffect(() => {
    if (output.dragEnd) {
      dragOffsetRef.current = null;
    }
  }, [output.dragEnd]);

  return (
    <section className="playground" aria-labelledby="playground-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Interaction playground</p>
          <h2 id="playground-title">Try click and drag</h2>
        </div>
        <p className="gesture-hint">Short pinch to click. Hold the pinch to drag.</p>
      </div>

      <div ref={surfaceRef} className="playground-surface">
        <div ref={clickTargetRef} className="click-target">
          <span>Pinch here</span>
          <strong>Clicks: {clickCount}</strong>
        </div>

        <div
          ref={cardRef}
          className={`draggable-card${output.state === "dragging" ? " is-dragging" : ""}`}
          data-testid="draggable-card"
          style={cardPosition ? { left: cardPosition.x, top: cardPosition.y } : undefined}
        >
          <span aria-hidden="true">&#x2726;</span>
          <strong>Drag me</strong>
          <small>Pinch and hold</small>
        </div>
      </div>
    </section>
  );
}
