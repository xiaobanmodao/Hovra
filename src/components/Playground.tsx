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
const CARD_SIZE = { width: 160, height: 118.4 };

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

const getInitialCardPosition = (): Position => clampToViewport(
  { x: 136, y: 205 },
  CARD_SIZE,
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
  const [rightClickCount, setRightClickCount] = useState(0);
  const [doubleClickCount, setDoubleClickCount] = useState(0);
  const [scrollTotal, setScrollTotal] = useState(0);
  const [clickTargetPosition, setClickTargetPosition] = useState<Position>(getInitialTargetPosition);
  const [cardPosition, setCardPosition] = useState<Position>(getInitialCardPosition);
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
    if (output.rightClick) {
      setRightClickCount((count) => count + 1);
    }
  }, [output.rightClick]);

  useEffect(() => {
    if (output.doubleClick) {
      setDoubleClickCount((count) => count + 1);
    }
  }, [output.doubleClick]);

  useEffect(() => {
    if (output.scrollY !== 0) {
      setScrollTotal((total) => total + output.scrollY);
    }
  }, [output.scrollY]);

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

  useEffect(() => {
    const handleResize = () => {
      const targetBounds = clickTargetRef.current?.getBoundingClientRect();
      if (targetBounds) {
        setClickTargetPosition((position) => {
          const nextPosition = clampToViewport(
            position,
            { width: targetBounds.width, height: targetBounds.height },
            getViewport(),
            VIEWPORT_MARGIN,
          );

          return nextPosition.x === position.x && nextPosition.y === position.y
            ? position
            : nextPosition;
        });
      }

      const cardBounds = cardRef.current?.getBoundingClientRect();
      if (cardBounds) {
        setCardPosition((position) => {
          const nextPosition = clampToViewport(
            position,
            { width: cardBounds.width, height: cardBounds.height },
            getViewport(),
            VIEWPORT_MARGIN,
          );

          return nextPosition.x === position.x && nextPosition.y === position.y
            ? position
            : nextPosition;
        });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <section className="playground" aria-labelledby="playground-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">交互测试区</p>
          <h2 id="playground-title">测试全部手势</h2>
        </div>
        <p className="gesture-hint">
          拇指 + 食指：点击 / 拖动 · 拇指 + 中指：右键 · 拇指 + 无名指：双击 · 双指：滚动
        </p>
      </div>

      <div className="interaction-layer">
        <div
          ref={clickTargetRef}
          className="click-target"
          style={{ left: clickTargetPosition.x, top: clickTargetPosition.y }}
        >
          <span>在此捏合</span>
          <strong>点击次数：{clickCount}</strong>
        </div>

        <div
          ref={cardRef}
          className={`draggable-card${output.state === "dragging" ? " is-dragging" : ""}`}
          data-testid="draggable-card"
          style={{ left: cardPosition.x, top: cardPosition.y }}
        >
          <span aria-hidden="true">&#x2726;</span>
          <strong>拖动我</strong>
          <small>捏合并保持</small>
        </div>

        <div className="gesture-diagnostics" aria-live="polite">
          <strong>右键次数：{rightClickCount}</strong>
          <strong>双击次数：{doubleClickCount}</strong>
          <strong>滚动：{scrollTotal}</strong>
        </div>
      </div>
    </section>
  );
}
