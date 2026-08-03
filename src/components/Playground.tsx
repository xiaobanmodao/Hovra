import { useEffect, useRef, useState } from "react";
import type { Point } from "../cursor/cursorController";
import type { GestureOutput } from "../gesture/types";
import { clampToViewport, type Position } from "./viewportBounds";

type PlaygroundProps = {
  cursor: Point | null;
  output: GestureOutput;
};

const VIEWPORT_MARGIN = 16;
const CLICK_TARGET_SIZE = 144;

const getViewport = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

const getInitialTargetPosition = (): Position => clampToViewport(
  { x: window.innerWidth - CLICK_TARGET_SIZE - 32, y: 32 },
  { width: CLICK_TARGET_SIZE, height: CLICK_TARGET_SIZE },
  getViewport(),
  VIEWPORT_MARGIN,
);

const containsPoint = (bounds: DOMRect, point: Point): boolean => (
  point.x >= bounds.left
  && point.x <= bounds.right
  && point.y >= bounds.top
  && point.y <= bounds.bottom
);

export function Playground({ cursor, output }: PlaygroundProps) {
  const [clickCount, setClickCount] = useState(0);
  const [clickTargetPosition] = useState<Position>(getInitialTargetPosition);
  const [cardPosition, setCardPosition] = useState<Position>({ x: 136, y: 205 });
  const clickTargetRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
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
    ) {
      return;
    }

    const cardBounds = cardRef.current?.getBoundingClientRect();
    if (!cardBounds) {
      return;
    }

    setCardPosition(clampToViewport(
      {
        x: cursor.x - dragOffsetRef.current.x,
        y: cursor.y - dragOffsetRef.current.y,
      },
      { width: cardBounds.width, height: cardBounds.height },
      getViewport(),
      VIEWPORT_MARGIN,
    ));
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

      <div className="interaction-layer">
        <div
          ref={clickTargetRef}
          className="click-target"
          style={{ left: clickTargetPosition.x, top: clickTargetPosition.y }}
        >
          <span>Pinch here</span>
          <strong>Clicks: {clickCount}</strong>
        </div>

        <div
          ref={cardRef}
          className={`draggable-card${output.state === "dragging" ? " is-dragging" : ""}`}
          data-testid="draggable-card"
          style={{ left: cardPosition.x, top: cardPosition.y }}
        >
          <span aria-hidden="true">&#x2726;</span>
          <strong>Drag me</strong>
          <small>Pinch and hold</small>
        </div>
      </div>
    </section>
  );
}
