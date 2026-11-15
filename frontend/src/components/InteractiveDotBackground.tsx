import { useEffect, useRef } from "react";

interface InteractiveDotBackgroundProps {
  className?: string;
  gridSpacing?: number;
  dotRadius?: number;
  influenceRadius?: number;
}

export function InteractiveDotBackground({
  className = "",
  gridSpacing = 24,
  dotRadius = 1.5,
  influenceRadius = 200,
}: InteractiveDotBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Pointer coordinates & activity intensity (0.0 = inactive, 1.0 = fully active)
    let pointerX = -1000;
    let pointerY = -1000;
    let targetPointerX = -1000;
    let targetPointerY = -1000;
    let pointerIntensity = 0;
    let targetPointerIntensity = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    resize();
    window.addEventListener("resize", resize);

    // Mouse handlers
    const onMouseMove = (e: MouseEvent) => {
      targetPointerX = e.clientX;
      targetPointerY = e.clientY;
      targetPointerIntensity = 1;
    };

    const onMouseLeave = () => {
      targetPointerIntensity = 0;
    };

    // Touch handlers for mobile / iPad / tablet
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        targetPointerX = e.touches[0].clientX;
        targetPointerY = e.touches[0].clientY;
        targetPointerIntensity = 1;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        targetPointerX = e.touches[0].clientX;
        targetPointerY = e.touches[0].clientY;
        targetPointerIntensity = 1;
      }
    };

    const onTouchEnd = () => {
      targetPointerIntensity = 0;
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    let startTime = performance.now();

    const render = (time: number) => {
      const elapsed = (time - startTime) * 0.001; // seconds

      // Smooth lerp pointer position & fade out intensity
      pointerX += (targetPointerX - pointerX) * 0.18;
      pointerY += (targetPointerY - pointerY) * 0.18;
      pointerIntensity += (targetPointerIntensity - pointerIntensity) * 0.08;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cols = Math.ceil(width / gridSpacing) + 1;
      const rows = Math.ceil(height / gridSpacing) + 1;

      const baseR = dotRadius;
      const infR = influenceRadius;

      for (let i = 0; i < cols; i++) {
        const x = i * gridSpacing;
        for (let j = 0; j < rows; j++) {
          const y = j * gridSpacing;

          // Subtle ambient idle wave traveling diagonally across the grid
          const ambientWave = Math.sin(x * 0.015 + y * 0.015 - elapsed * 1.2);
          const ambientFactor = Math.max(0, ambientWave) * 0.28; // Subtle amplitude

          // Interactive touch/mouse calculation with smooth fade-out intensity
          let touchFactor = 0;
          if (pointerIntensity > 0.01) {
            const dx = pointerX - x;
            const dy = pointerY - y;
            const dist = Math.hypot(dx, dy);
            if (dist < infR) {
              touchFactor = (1 - dist / infR) * pointerIntensity;
            }
          }

          // Combined influence (touch takes priority, idle wave keeps it alive)
          const totalFactor = Math.min(1, touchFactor + ambientFactor);

          if (totalFactor > 0.02) {
            const currentR = baseR + totalFactor * 1.5; // Radius up to 3.0px

            // Interpolate from Slate-500 (#64748B = 100, 116, 139) to Indigo-600 (#4F46E5 = 79, 70, 229)
            const r = Math.round(100 + (79 - 100) * totalFactor);
            const g = Math.round(116 + (70 - 116) * totalFactor);
            const b = Math.round(139 + (229 - 139) * totalFactor);
            const alpha = 0.45 + totalFactor * 0.45; // 0.45 up to 0.90

            ctx.beginPath();
            ctx.arc(x, y, currentR, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.arc(x, y, baseR, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(100, 116, 139, 0.42)"; // Crisp Slate-500 dots
            ctx.fill();
          }
        }
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [gridSpacing, dotRadius, influenceRadius]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ backgroundColor: "#F8FAFC" }}
      className={`pointer-events-none fixed inset-0 -z-10 ${className}`}
    />
  );
}
