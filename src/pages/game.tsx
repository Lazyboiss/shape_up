// App.tsx
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { drawKeypoints, drawSkeleton } from "@/lib/pose_utils";
import { getMoveNetDetector } from "@/lib/detector";
import PlatformerGame, { type SavedLevel } from "@/components/PlatformerGame";

type LineSegment = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

type Phase = "pose" | "game";

const FACE_KEYPOINT_NAMES = new Set([
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
]);

function isFaceKeypoint(kp: poseDetection.Keypoint) {
  return Boolean(kp.name && FACE_KEYPOINT_NAMES.has(kp.name));
}

function poseAvgScore(p: poseDetection.Pose) {
  const kps = p.keypoints ?? [];
  return (
    kps.reduce((s, kp) => s + (kp.score ?? 0), 0) / Math.max(1, kps.length)
  );
}

function pickTopPoses(poses: poseDetection.Pose[], n: number) {
  return [...poses]
    .map((p) => ({ p, s: poseAvgScore(p) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.p);
}
function quant(n: number, step = 6) {
  return Math.round(n / step) * step;
}

function segKey(a: { x: number; y: number }, b: { x: number; y: number }) {
  // order-invariant key
  const ax = quant(a.x),
    ay = quant(a.y);
  const bx = quant(b.x),
    by = quant(b.y);
  const k1 = `${ax},${ay}`,
    k2 = `${bx},${by}`;
  return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
}

function posesToPlatformLines(
  poses: poseDetection.Pose[],
  stageW: number,
  stageH: number,
  maxPeople = 3
): LineSegment[] {
  if (!poses.length) return [];

  const chosen = pickTopPoses(poses, maxPeople);

  const pairs = poseDetection.util.getAdjacentPairs(
    poseDetection.SupportedModels.MoveNet
  );

  const minKpScore = 0.35;
  const minLen = 18;

  const out: LineSegment[] = [];
  const seen = new Set<string>();

  for (const person of chosen) {
    const kps = person.keypoints.map((kp) => ({
      ...kp,
      score: kp.score ?? 0,
      x: kp.x,
      y: kp.y,
      isFace: isFaceKeypoint(kp),
    }));

    for (const [i, j] of pairs) {
      const a = kps[i];
      const b = kps[j];
      if (!a || !b) continue;

      if (a.isFace || b.isFace) continue;
      if (a.score < minKpScore || b.score < minKpScore) continue;

      const ax = a.x;
      const ay = a.y;
      const bx = b.x;
      const by = b.y;

      const len = Math.hypot(bx - ax, by - ay);
      if (len < minLen) continue;

      // stay within stage bounds (optional safety)
      if (
        ax < 0 ||
        ax > stageW ||
        bx < 0 ||
        bx > stageW ||
        ay < 0 ||
        ay > stageH ||
        by < 0 ||
        by > stageH
      ) {
        continue;
      }

      const key = segKey({ x: ax, y: ay }, { x: bx, y: by });
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({ start: { x: ax, y: ay }, end: { x: bx, y: by } });
    }
  }

  return out;
}

function useWindowSize() {
  const [size, setSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () =>
      setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return size;
}

/** Fit a 4:3 rectangle inside the viewport (letterboxed) */
function computeStageSize(viewW: number, viewH: number) {
  const targetAR = 4 / 3;
  const viewAR = viewW / viewH;

  let stageW = viewW;
  let stageH = viewH;

  if (viewAR > targetAR) {
    // viewport too wide -> limit by height
    stageH = viewH;
    stageW = stageH * targetAR;
  } else {
    // viewport too tall -> limit by width
    stageW = viewW;
    stageH = stageW / targetAR;
  }

  return { stageW: Math.round(stageW), stageH: Math.round(stageH) };
}

function computeCoverCrop(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
) {
  const srcAR = srcW / srcH;
  const dstAR = dstW / dstH;

  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;

  if (srcAR > dstAR) {
    // crop left/right
    sw = srcH * dstAR;
    sx = (srcW - sw) / 2;
  } else {
    // crop top/bottom
    sh = srcW / dstAR;
    sy = (srcH - sh) / 2;
  }

  return { sx, sy, sw, sh };
}

function drawVideoCoverMirrored(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  dstW: number,
  dstH: number
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  const { sx, sy, sw, sh } = computeCoverCrop(vw, vh, dstW, dstH);

  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-dstW, 0);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dstW, dstH);
  ctx.restore();
}

function drawLevelOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lines: LineSegment[],
  level: SavedLevel | null
) {
  ctx.clearRect(0, 0, w, h);

  // platforms preview
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = "#9B59B6";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  for (const l of lines) {
    ctx.beginPath();
    ctx.moveTo(l.start.x, l.start.y);
    ctx.lineTo(l.end.x, l.end.y);
    ctx.stroke();
  }
  ctx.restore();

  // player spawn previews (rough)
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "#00FF00";
  ctx.fillRect(w * 0.125 - 15, h * 0.6667 - 20, 30, 40);

  ctx.fillStyle = "#FFA500";
  ctx.fillRect(w * 0.875 - 15, h * 0.6667 - 20, 30, 40);
  ctx.restore();

  // flags preview
  if (level?.flags?.length) {
    for (const f of level.flags) {
      ctx.save();
      ctx.globalAlpha = 0.95;

      ctx.fillStyle = "#000000";
      ctx.fillRect(f.pole.x - 2.5, f.pole.y - 50, 5, 100);

      ctx.fillStyle = f.playerType === 1 ? "#00FF00" : "#FFA500";
      ctx.fillRect(f.flag.x - 15, f.flag.y - 10, 30, 20);

      ctx.restore();
    }
  }

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, w, h);
  ctx.restore();
}

export default function App() {
  const { w: viewW, h: viewH } = useWindowSize();
  const { stageW, stageH } = useMemo(
    () => computeStageSize(viewW, viewH),
    [viewW, viewH]
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const camCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [phase, setPhase] = useState<Phase>("pose");
  const [isLoading, setIsLoading] = useState(true);

  const [poses, setPoses] = useState<poseDetection.Pose[]>([]);
  const lastPosesRef = useRef<poseDetection.Pose[]>([]);
  const [platformLines, setPlatformLines] = useState<LineSegment[]>([]);
  const frozenLines = useMemo(() => platformLines, [platformLines]);

  const [secondsLeft, setSecondsLeft] = useState(20);

  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);

  const initialLevel: SavedLevel | null = null;

  useEffect(() => {
    lastPosesRef.current = poses;
  }, [poses]);

  useEffect(() => {
    let cancelled = false;

    const stopEverything = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const video = videoRef.current;
      if (video) {
        video.pause();
        video.srcObject = null;
      }
    };

    const startPoseLoop = async () => {
      const detector = await getMoveNetDetector();
      detectorRef.current = detector;

      const video = videoRef.current;
      if (!video) return;

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (cancelled) return;
      streamRef.current = stream;

      video.srcObject = stream;

      video.onloadedmetadata = async () => {
        if (cancelled) return;

        try {
          await video.play();
        } catch {
          return;
        }

        const camCanvas = camCanvasRef.current;
        const overlay = overlayCanvasRef.current;
        if (!camCanvas || !overlay) return;

        const ctx = camCanvas.getContext("2d");
        const octx = overlay.getContext("2d");
        if (!ctx || !octx) return;

        // IMPORTANT: canvases are EXACTLY stageW x stageH (4:3)
        camCanvas.width = stageW;
        camCanvas.height = stageH;
        overlay.width = stageW;
        overlay.height = stageH;

        // offscreen for estimation at stage size
        const offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.width = stageW;
        offscreenCanvas.height = stageH;
        const offscreenCtx = offscreenCanvas.getContext("2d");
        if (!offscreenCtx) return;

        const loop = async () => {
          if (cancelled) return;
          if (!detectorRef.current) return;

          // 1) render a MIRRORED "cover" frame into offscreen
          // so pose keypoints are already in the SAME coordinate system as user sees.
          offscreenCtx.clearRect(0, 0, stageW, stageH);
          drawVideoCoverMirrored(offscreenCtx, video, stageW, stageH);

          // 2) estimate on that exact frame
          const newPoses = await detectorRef.current.estimatePoses(
            offscreenCanvas,
            { scoreThreshold: 0.01, maxPoses: 10 }
          );

          setPoses(newPoses);

          // 3) draw same mirrored cover frame to main camera canvas
          ctx.clearRect(0, 0, stageW, stageH);
          drawVideoCoverMirrored(ctx, video, stageW, stageH);

          // 4) draw skeleton WITHOUT mirroring keypoints (already mirrored)
          if (newPoses.length > 0) {
            for (const pose of newPoses) {
              drawKeypoints(pose.keypoints, 0.5, ctx, 1, "pink");
              drawSkeleton(pose.keypoints, 0.5, ctx, 1, "pink");
            }
          }

          setIsLoading(false);

          // 5) overlay preview during pose phase
          if (phase === "pose") {
            const liveLines = posesToPlatformLines(newPoses, stageW, stageH);
            drawLevelOverlay(octx, stageW, stageH, liveLines, initialLevel);
          }

          rafRef.current = requestAnimationFrame(loop);
        };

        loop();
      };
    };

    const boot = async () => {
      try {
        setIsLoading(true);
        await tf.ready();
        await tf.setBackend("webgl");
        await startPoseLoop();
      } catch {
        // keep loader
      }
    };

    boot();

    return () => {
      cancelled = true;
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageW, stageH, phase]);

  useEffect(() => {
    if (phase !== "pose") return;
    if (isLoading) return;

    setSecondsLeft(20);

    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);

    return () => window.clearInterval(id);
  }, [phase, isLoading]);

  useEffect(() => {
    if (phase !== "pose") return;
    if (secondsLeft !== 0) return;

    const lines = posesToPlatformLines(lastPosesRef.current, stageW, stageH);
    setPlatformLines(lines);

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    const overlay = overlayCanvasRef.current;
    const octx = overlay?.getContext("2d");
    if (overlay && octx) {
      overlay.width = stageW;
      overlay.height = stageH;
      drawLevelOverlay(octx, stageW, stageH, lines, initialLevel);
    }

    setPhase("game");
  }, [secondsLeft, phase, stageW, stageH, initialLevel]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <video ref={videoRef} className="hidden" playsInline />

      {/* centered 4:3 stage */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative" style={{ width: stageW, height: stageH }}>
          {/* camera canvas */}
          <canvas
            ref={camCanvasRef}
            className={cn("absolute inset-0 w-full h-full")}
            style={{ opacity: phase === "game" ? 0.5 : 1 }}
          />

          {/* overlay */}
          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          {/* countdown */}
          {phase === "pose" && !isLoading && (
            <div className="absolute top-3 left-3 z-40 rounded-xl bg-black/60 px-4 py-3 text-white">
              <div className="text-xs opacity-80">Pose time remaining</div>
              <div className="text-3xl font-bold tabular-nums">
                {secondsLeft}
              </div>
            </div>
          )}

          {phase === "pose" && isLoading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="flex flex-col items-center gap-3 rounded-xl bg-white/90 px-5 py-4 shadow">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent" />
                <div className="text-sm font-medium text-black">
                  Loading camera and model…
                </div>
              </div>
            </div>
          )}

          {/* game */}
          {phase === "game" && (
            <div className="absolute inset-0 z-10">
              {/* IMPORTANT:
                  Only pass width/height if your PlatformerGameProps supports them.
                  If TS complains, remove width/height entirely.
               */}
              <PlatformerGame
                lines={frozenLines}
                initialLevel={initialLevel ?? undefined}
                width={stageW}
                height={stageH}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
