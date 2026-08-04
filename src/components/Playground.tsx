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
  const [clickTargetPosition, setClickTargetPosition] = useState<Position>(getInitialTargetPosition);
  const clickTargetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!output.click || !cursor || !clickTargetRef.current) {
      return;
    }

    if (containsPoint(clickTargetRef.current.getBoundingClientRect(), cursor)) {
      setClickCount((count) => count + 1);
    }
  }, [output.click]);

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

    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <section className="playground" aria-labelledby="playground-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">交互测试区</p>
          <h2 id="playground-title">基础操作测试</h2>
        </div>
        <p className="gesture-hint">
          移动光标 · 拇指 + 食指：左键点击 · 张开手掌：停止
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

      </div>
    </section>
  );
}
