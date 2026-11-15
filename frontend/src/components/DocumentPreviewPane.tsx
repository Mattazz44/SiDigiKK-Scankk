import { useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { Contrast, RotateCw, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

interface DocumentPreviewPaneProps {
  previewUrl: string;
  preprocessedUrl?: string | null;
  title?: string;
}

export function DocumentPreviewPane({
  previewUrl,
  preprocessedUrl,
  title = "Preview Dokumen Asli",
}: DocumentPreviewPaneProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [highContrast, setHighContrast] = useState(false);
  const [usePreprocessed, setUsePreprocessed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef({ x: 0, y: 0, startPanX: 0, startPanY: 0 });

  const activeSrc = usePreprocessed && preprocessedUrl ? preprocessedUrl : previewUrl;

  const clampZoom = (next: number) => Math.min(3, Math.max(0.5, Number(next.toFixed(2))));

  const handleZoomIn = () => setZoom((z) => clampZoom(z + 0.25));
  const handleZoomOut = () => setZoom((z) => clampZoom(z - 0.25));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    setHighContrast(false);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.15 : -0.15;
    setZoom((z) => clampZoom(z + delta));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    dragOrigin.current = {
      x: event.clientX,
      y: event.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setPan({
      x: dragOrigin.current.startPanX + (event.clientX - dragOrigin.current.x),
      y: dragOrigin.current.startPanY + (event.clientY - dragOrigin.current.y),
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  return (
    <div className="flex flex-col rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <span className="text-xs font-semibold text-slate-800">{title}</span>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Perkecil gambar"
            title="Perkecil"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded border border-slate-200 bg-white px-2 text-slate-700 hover:bg-slate-50 lg:min-h-[30px] lg:min-w-[30px]"
          >
            <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="min-w-[46px] text-center font-mono tabular-nums text-xs font-medium text-slate-700">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Perbesar gambar"
            title="Perbesar"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded border border-slate-200 bg-white px-2 text-slate-700 hover:bg-slate-50 lg:min-h-[30px] lg:min-w-[30px]"
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleRotate}
            aria-label="Putar 90 derajat"
            title="Putar 90°"
            className="inline-flex min-h-[36px] items-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50 lg:min-h-[30px]"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{rotation}°</span>
          </button>
          <button
            type="button"
            onClick={() => setHighContrast((prev) => !prev)}
            aria-pressed={highContrast}
            title="Toggle Kontras Tinggi"
            className={`inline-flex min-h-[36px] items-center gap-1 rounded border px-2 text-xs font-medium lg:min-h-[30px] ${
              highContrast
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Contrast className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Kontras</span>
          </button>
          {preprocessedUrl && (
            <button
              type="button"
              onClick={() => setUsePreprocessed((prev) => !prev)}
              aria-pressed={usePreprocessed}
              title="Beralih antara citra asli dan hasil grayscale CLAHE"
              className={`inline-flex min-h-[36px] items-center rounded border px-2 text-xs font-medium lg:min-h-[30px] ${
                usePreprocessed
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {usePreprocessed ? "Citra OCR" : "Asli"}
            </button>
          )}
          <button
            type="button"
            onClick={handleReset}
            aria-label="Reset tampilan dokumen"
            className="inline-flex min-h-[36px] items-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50 lg:min-h-[30px]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <div
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative flex h-[380px] select-none items-center justify-center overflow-hidden bg-slate-100 lg:h-[560px] ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {activeSrc ? (
          <img
            src={activeSrc}
            alt="Scan dokumen Kartu Keluarga"
            draggable={false}
            width={1200}
            height={850}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              filter: highContrast
                ? "contrast(1.65) brightness(1.06) grayscale(0.2)"
                : "none",
            }}
            className="max-h-full max-w-full object-contain transition-transform duration-75"
          />
        ) : (
          <div className="px-4 text-center text-xs text-slate-600">
            Tidak ada gambar dokumen untuk pratinjau.
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600">
        Scroll atau tombol +/- untuk zoom, seret gambar untuk menggeser, gunakan Kontras saat teks buram.
      </div>
    </div>
  );
}
