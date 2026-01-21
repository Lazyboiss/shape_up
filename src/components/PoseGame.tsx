import React, { useEffect, useRef, useState, useCallback } from "react";
import Matter from "matter-js";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { ASSETS, SPRITE_SIZES } from "../gameAssets";
import { drawKeypoints, drawSkeleton } from "@/lib/pose_utils";
import { usePoseDetector } from "@/contexts/PoseDetectorContext";
import { supabase } from "@/lib/supabase";
import { QRCodeCanvas } from "qrcode.react";

// ============ TYPES ============

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] ?? "image/png";
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

const PLATFORM_THICKNESS = 10;

type PlatformMeta = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness: number;
};

type PlatformType = "temporary" | "permanent" | "ground";

type PlatformData = {
  body: Matter.Body;
  type: PlatformType;
  meta: PlatformMeta;
};

type SpawnPoint = {
  x: number;
  y: number;
};

type SavedPlatform = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness: number;
  type: "permanent" | "ground";
};

type SavedFlag = {
  playerType: 1 | 2;
  flag: { x: number; y: number };
  raised: boolean;
};

export type SavedLevel = {
  platforms: SavedPlatform[];
  flags: SavedFlag[];
  player1Spawn?: SpawnPoint;
  player2Spawn?: SpawnPoint;
};

interface FlagData {
  flag: Matter.Body;
  raised: boolean;
  playerType: 1 | 2;
}

type LineSegment = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

type Phase = "ready" | "pose" | "game";

// Preloaded images cache
type LoadedImages = {
  player1Idle: HTMLImageElement | null;
  player2Idle: HTMLImageElement | null;
  player1FlagLowered: HTMLImageElement | null;
  player2FlagLowered: HTMLImageElement | null;
  ground: HTMLImageElement | null;
};

interface PoseGameProps {
  loadLevel: SavedLevel;
  width?: number;
  height?: number;
  poseTime?: number;
  gameTime?: number;
  onWin?: () => void;
  onRestart?: () => void;
  onJumpSfx?: () => void;
  onWinSfx?: () => void;
  onLoseSfx?: () => void;
  onFlagSfx?: () => void;
  onCountdownBeep?: () => void;
  onCountdownGo?: () => void;
}

// ============ POSE DETECTION HELPERS ============

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

function computeCoverCrop(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
) {
  const srcAR = srcW / srcH;
  const dstAR = dstW / dstH;

  let sx = 0,
    sy = 0,
    sw = srcW,
    sh = srcH;

  if (srcAR > dstAR) {
    sw = srcH * dstAR;
    sx = (srcW - sw) / 2;
  } else {
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

// ============ MATTER.JS HELPERS ============

const makePlatformFromEndpoints = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  thickness: number,
  type: PlatformType
) => {
  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  let renderOptions: any = {};

  if (type === "ground") {
    renderOptions = {
      sprite: {
        texture: ASSETS.GROUND,
        xScale: length / 500,
        yScale: thickness / 400,
      },
    };
  } else if (type === "permanent") {
    renderOptions = { fillStyle: "#3498DB" };
  } else {
    renderOptions = { fillStyle: "#9B59B6" };
  }

  const platform = Matter.Bodies.rectangle(
    centerX,
    centerY,
    length,
    thickness,
    {
      isStatic: true,
      angle,
      render: renderOptions,
      friction: 1,
      label: "platform",
    }
  );

  (platform as any).platformMeta = {
    start,
    end,
    thickness,
  } satisfies PlatformMeta;

  return platform;
};

// ============ MAIN COMPONENT ============

export const PoseGame: React.FC<PoseGameProps> = ({
  loadLevel,
  width = 1200,
  height = 900,
  poseTime = 10,
  gameTime = 60,
  onWin,
  onRestart,
  onJumpSfx,
  onWinSfx,
  onLoseSfx,
  onFlagSfx,
  onCountdownGo,
  onCountdownBeep,
}) => {
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const uploadedOnceRef = useRef(false);

  // Use the persistent detector from context
  const {
    detector,
    isLoading: modelLoading,
    error: modelError,
  } = usePoseDetector();

  const [gameSecondsLeft, setGameSecondsLeft] = useState(gameTime);
  const [gameOver, setGameOver] = useState(false);

  // used to force re-mount / rebuild the Matter game without changing phase
  const [gameRunId, setGameRunId] = useState(0);

  const gameOverRef = useRef(false);

  // Phase management
  const [phase, setPhase] = useState<Phase>("ready");
  const [cameraReady, setCameraReady] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(poseTime);
  const [platformLines, setPlatformLines] = useState<LineSegment[]>([]);

  // Preloaded images for level preview
  const [loadedImages, setLoadedImages] = useState<LoadedImages>({
    player1Idle: null,
    player2Idle: null,
    player1FlagLowered: null,
    player2FlagLowered: null,
    ground: null,
  });
  const [imagesLoaded, setImagesLoaded] = useState(false);

  // Pose detection refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const camCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastPosesRef = useRef<poseDetection.Pose[]>([]);

  // Game refs
  const gameCanvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const player1Ref = useRef<Matter.Body | null>(null);
  const player2Ref = useRef<Matter.Body | null>(null);

  const player1GroundedRef = useRef(false);
  const player2GroundedRef = useRef(false);
  const player1LockedPositionRef = useRef<{ x: number; y: number } | null>(
    null
  );
  const player2LockedPositionRef = useRef<{ x: number; y: number } | null>(
    null
  );
  const player1GroundNormalRef = useRef<{ x: number; y: number } | null>(null);
  const player2GroundNormalRef = useRef<{ x: number; y: number } | null>(null);

  const player1AnimFrameRef = useRef(0);
  const player2AnimFrameRef = useRef(0);
  const animationTickRef = useRef(0);

  // Track which direction players are facing (1 = right, -1 = left)
  const player1FacingRef = useRef(1);
  const player2FacingRef = useRef(-1); // Player 2 starts facing left (toward center)

  const keysRef = useRef({
    a: false,
    d: false,
    w: false,
    left: false,
    right: false,
    up: false,
  });

  const [gameWon, setGameWon] = useState(false);
  const [flagStates, setFlagStates] = useState<{ [key: string]: boolean }>({});
  const flagsRef = useRef<FlagData[]>([]);
  const platformsRef = useRef<PlatformData[]>([]);
  const player1SpawnRef = useRef<SpawnPoint | null>(null);
  const player2SpawnRef = useRef<SpawnPoint | null>(null);

  // Captured pose photo
  const [capturedPoseImage, setCapturedPoseImage] = useState<string | null>(
    null
  );

  // Preload images on mount
  useEffect(() => {
    const imageSources: { key: keyof LoadedImages; src: string }[] = [
      { key: "player1Idle", src: ASSETS.PLAYER1_IDLE },
      { key: "player2Idle", src: ASSETS.PLAYER2_IDLE },
      { key: "player1FlagLowered", src: ASSETS.PLAYER1_FLAG_LOWERED },
      { key: "player2FlagLowered", src: ASSETS.PLAYER2_FLAG_LOWERED },
      { key: "ground", src: ASSETS.GROUND },
    ];

    let loadedCount = 0;
    const images: LoadedImages = {
      player1Idle: null,
      player2Idle: null,
      player1FlagLowered: null,
      player2FlagLowered: null,
      ground: null,
    };

    imageSources.forEach(({ key, src }) => {
      const img = new Image();
      img.onload = () => {
        images[key] = img;
        loadedCount++;
        if (loadedCount === imageSources.length) {
          setLoadedImages(images);
          setImagesLoaded(true);
        }
      };
      img.onerror = () => {
        console.warn(`Failed to load image: ${src}`);
        loadedCount++;
        if (loadedCount === imageSources.length) {
          setLoadedImages(images);
          setImagesLoaded(true);
        }
      };
      img.src = src;
    });
  }, []);

  // Spacebar listener for ready phase
  useEffect(() => {
    if (phase !== "ready") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setPhase("pose");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase]);

  // Function to draw level elements (flags, spawns, platforms) on overlay using actual sprites
  const drawLevelPreview = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      // Draw existing platforms from level
      ctx.save();
      ctx.globalAlpha = 1;

      loadLevel.platforms.forEach((p) => {
        const centerX = (p.start.x + p.end.x) / 2;
        const centerY = (p.start.y + p.end.y) / 2;
        const length = Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y);
        const angle = Math.atan2(p.end.y - p.start.y, p.end.x - p.start.x);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle);

        if (p.type === "ground") {
          // Draw ground texture
          if (loadedImages.ground) {
            ctx.drawImage(
              loadedImages.ground,
              -length / 2,
              -p.thickness / 2,
              length,
              p.thickness
            );
          } else {
            ctx.fillStyle = "#8B4513";
            ctx.fillRect(-length / 2, -p.thickness / 2, length, p.thickness);
          }
        } else {
          ctx.fillStyle = "#3498DB";
          ctx.fillRect(-length / 2, -p.thickness / 2, length, p.thickness);
        }

        ctx.restore();
      });
      ctx.restore();

      // Draw spawn points with player sprites
      const spawn1 = loadLevel.player1Spawn || { x: w * 0.125, y: h * 0.5 };
      const spawn2 = loadLevel.player2Spawn || { x: w * 0.875, y: h * 0.5 };

      // Player 1 spawn (with sprite or fallback)
      ctx.save();
      ctx.globalAlpha = 0.85;
      if (loadedImages.player1Idle) {
        const spriteScale = 0.1;
        const spriteW = loadedImages.player1Idle.width * spriteScale;
        const spriteH = loadedImages.player1Idle.height * spriteScale;
        ctx.drawImage(
          loadedImages.player1Idle,
          spawn1.x - spriteW / 2,
          spawn1.y - spriteH / 2,
          spriteW,
          spriteH
        );
      } else {
        ctx.fillStyle = "#00FF00";
        ctx.strokeStyle = "#004400";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(spawn1.x, spawn1.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#004400";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("P1", spawn1.x, spawn1.y);
      }
      ctx.restore();

      // Player 2 spawn (with sprite or fallback) - facing left toward center
      ctx.save();
      ctx.globalAlpha = 0.85;
      if (loadedImages.player2Idle) {
        const spriteScale = 0.1;
        const spriteW = loadedImages.player2Idle.width * spriteScale;
        const spriteH = loadedImages.player2Idle.height * spriteScale;
        // Flip horizontally to face left
        ctx.translate(spawn2.x, spawn2.y);
        ctx.scale(-1, 1);
        ctx.drawImage(
          loadedImages.player2Idle,
          -spriteW / 2,
          -spriteH / 2,
          spriteW,
          spriteH
        );
      } else {
        ctx.fillStyle = "#FFA500";
        ctx.strokeStyle = "#663300";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(spawn2.x, spawn2.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#663300";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("P2", spawn2.x, spawn2.y);
      }
      ctx.restore();

      // Draw flags with actual sprites
      loadLevel.flags.forEach((f) => {
        ctx.save();
        ctx.globalAlpha = 0.85;

        const flagImg =
          f.playerType === 1
            ? loadedImages.player1FlagLowered
            : loadedImages.player2FlagLowered;

        if (flagImg) {
          const spriteScale = 0.1;
          const spriteW = flagImg.width * spriteScale;
          const spriteH = flagImg.height * spriteScale;
          ctx.drawImage(
            flagImg,
            f.flag.x - spriteW / 2,
            f.flag.y - spriteH / 2,
            spriteW,
            spriteH
          );
        } else {
          // Fallback drawing
          ctx.fillStyle = "#pink";
          ctx.fillRect(f.flag.x - 3, f.flag.y - 40, 6, 80);

          ctx.fillStyle = f.playerType === 1 ? "#00FF00" : "#FFA500";
          ctx.beginPath();
          ctx.moveTo(f.flag.x + 3, f.flag.y - 35);
          ctx.lineTo(f.flag.x + 40, f.flag.y - 25);
          ctx.lineTo(f.flag.x + 3, f.flag.y - 15);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = "#000000";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(`P${f.playerType}`, f.flag.x + 20, f.flag.y - 25);
        }

        ctx.restore();
      });
    },
    [loadLevel, loadedImages]
  );

  // Function to capture the final pose as an image
  const capturePoseImage = useCallback(() => {
    const camCanvas = camCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!camCanvas || !overlayCanvas) return null;

    // Create a combined canvas
    const combinedCanvas = document.createElement("canvas");
    combinedCanvas.width = width;
    combinedCanvas.height = height;
    const ctx = combinedCanvas.getContext("2d");
    if (!ctx) return null;

    // Draw camera feed
    ctx.drawImage(camCanvas, 0, 0);
    // Draw overlay (platforms preview)
    ctx.drawImage(overlayCanvas, 0, 0);

    // Add timestamp
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(width - 200, height - 30, 195, 25);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(new Date().toLocaleString(), width - 10, height - 10);
    ctx.restore();

    return combinedCanvas.toDataURL("image/png");
  }, [width, height]);

  // Function to download the captured image
  const downloadPoseImage = useCallback(() => {
    if (!capturedPoseImage) return;

    const link = document.createElement("a");
    link.download = `pose-capture-${Date.now()}.png`;
    link.href = capturedPoseImage;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [capturedPoseImage]);

  // ============ POSE DETECTION PHASE ============

  useEffect(() => {
    // Run camera during both "ready" and "pose" phases
    if (phase !== "ready" && phase !== "pose") return;
    if (!detector) return; // Wait for detector to be ready

    let cancelled = false;

    const stopCamera = () => {
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

    const startCamera = async () => {
      const video = videoRef.current;
      if (!video) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
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

          camCanvas.width = width;
          camCanvas.height = height;
          overlay.width = width;
          overlay.height = height;

          const offscreenCanvas = document.createElement("canvas");
          offscreenCanvas.width = width;
          offscreenCanvas.height = height;
          const offscreenCtx = offscreenCanvas.getContext("2d");
          if (!offscreenCtx) return;

          setCameraReady(true);

          const loop = async () => {
            if (cancelled) return;
            if (!detector) return;

            offscreenCtx.clearRect(0, 0, width, height);
            drawVideoCoverMirrored(offscreenCtx, video, width, height);

            const newPoses = await detector.estimatePoses(offscreenCanvas, {
              scoreThreshold: 0.01,
              maxPoses: 10,
            });

            lastPosesRef.current = newPoses;

            ctx.clearRect(0, 0, width, height);
            drawVideoCoverMirrored(ctx, video, width, height);

            if (newPoses.length > 0) {
              for (const pose of newPoses) {
                drawKeypoints(pose.keypoints, 0.25, ctx, 1, "pink");
                drawSkeleton(pose.keypoints, 0.25, ctx, 1, "pink");
              }
            }

            // Draw level preview (flags, spawns, platforms)
            octx.clearRect(0, 0, width, height);
            drawLevelPreview(octx, width, height);

            // Only draw pose-detected platform lines during pose phase (not ready phase)
            if (phase === "pose") {
              const liveLines = posesToPlatformLines(newPoses, width, height);
              octx.save();
              octx.globalAlpha = 0.8;
              octx.strokeStyle = "#9B59B6"; // POSE PLATFORM COLOR
              octx.lineWidth = PLATFORM_THICKNESS;
              octx.lineCap = "round";
              for (const l of liveLines) {
                octx.beginPath();
                octx.moveTo(l.start.x, l.start.y);
                octx.lineTo(l.end.x, l.end.y);
                octx.stroke();
              }
              octx.restore();
            }

            rafRef.current = requestAnimationFrame(loop);
          };

          loop();
        };
      } catch (err) {
        console.error("Camera error:", err);
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [phase, detector, width, height, drawLevelPreview]);

  // Countdown timer - only starts when camera is ready
  useEffect(() => {
    if (phase !== "pose") return;
    if (!cameraReady) return;

    setSecondsLeft(poseTime);

    const id = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          onCountdownGo?.();
          return 0;
        } else {
          onCountdownBeep?.();
          return s - 1;
        }
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [phase, cameraReady, poseTime]);

  // Transition to game when timer ends
  useEffect(() => {
    if (phase !== "pose") return;
    if (secondsLeft !== 0) return;
    if (!cameraReady) return;

    const lines = posesToPlatformLines(lastPosesRef.current, width, height);
    setPlatformLines(lines);

    // Capture the final pose image BEFORE stopping the camera
    const imageData = capturePoseImage();
    if (imageData) {
      setCapturedPoseImage(imageData);
    }

    // Stop camera
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

    setPhase("game");
  }, [secondsLeft, phase, cameraReady, width, height, capturePoseImage]);

  // ============ GAME PHASE ============

  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);

  useEffect(() => {
    if (phase !== "game") return;
    if (!gameCanvasRef.current) return;

    const engine = Matter.Engine.create();
    engineRef.current = engine;
    const world = engine.world;
    engine.gravity.y = 1;

    const render = Matter.Render.create({
      element: gameCanvasRef.current,
      engine: engine,
      options: {
        width,
        height,
        wireframes: false,
        background: "transparent",
      },
    });
    renderRef.current = render;

    // Load level platforms
    loadLevel.platforms.forEach((p) => {
      const platform = makePlatformFromEndpoints(
        p.start,
        p.end,
        p.thickness,
        p.type
      );
      Matter.World.add(world, platform);
      platformsRef.current.push({
        body: platform,
        type: p.type,
        meta: { start: p.start, end: p.end, thickness: p.thickness },
      });
    });

    // Add pose-detected platforms as temporary
    platformLines.forEach((line) => {
      const platform = makePlatformFromEndpoints(
        line.start,
        line.end,
        PLATFORM_THICKNESS,
        "temporary"
      );
      Matter.World.add(world, platform);
      platformsRef.current.push({
        body: platform,
        type: "temporary",
        meta: {
          start: line.start,
          end: line.end,
          thickness: PLATFORM_THICKNESS,
        },
      });
    });

    // Load flags
    loadLevel.flags.forEach((f) => {
      const flagTexture =
        f.playerType === 1
          ? ASSETS.PLAYER1_FLAG_LOWERED
          : ASSETS.PLAYER2_FLAG_LOWERED;

      const flag = Matter.Bodies.rectangle(
        f.flag.x,
        f.flag.y,
        SPRITE_SIZES.FLAG_WIDTH,
        SPRITE_SIZES.FLAG_HEIGHT,
        {
          isStatic: true,
          isSensor: true,
          label: "flag",
          render: {
            sprite: { texture: flagTexture, xScale: 0.1, yScale: 0.1 },
          },
        }
      );

      Matter.World.add(world, flag);
      flagsRef.current.push({ flag, raised: false, playerType: f.playerType });
    });

    // Set spawn points
    player1SpawnRef.current = loadLevel.player1Spawn || {
      x: width * 0.125,
      y: height * 0.5,
    };
    player2SpawnRef.current = loadLevel.player2Spawn || {
      x: width * 0.875,
      y: height * 0.5,
    };

    // Spawn players
    const player1 = Matter.Bodies.rectangle(
      player1SpawnRef.current.x,
      player1SpawnRef.current.y,
      SPRITE_SIZES.PLAYER_WIDTH,
      SPRITE_SIZES.PLAYER_HEIGHT,
      {
        friction: 1,
        frictionAir: 0.01,
        frictionStatic: 10,
        restitution: 0,
        inertia: Infinity,
        render: {
          sprite: {
            texture: ASSETS.PLAYER1_IDLE,
            xScale: 0.1,
            yScale: 0.1,
          },
        },
        label: "player1",
      }
    );
    player1Ref.current = player1;
    Matter.World.add(world, player1);

    const player2 = Matter.Bodies.rectangle(
      player2SpawnRef.current.x,
      player2SpawnRef.current.y,
      SPRITE_SIZES.PLAYER_WIDTH,
      SPRITE_SIZES.PLAYER_HEIGHT,
      {
        friction: 1,
        frictionAir: 0.01,
        frictionStatic: 10,
        restitution: 0,
        inertia: Infinity,
        render: {
          sprite: {
            texture: ASSETS.PLAYER2_IDLE,
            xScale: -0.1, // Facing left initially (toward center)
            yScale: 0.1,
          },
        },
        label: "player2",
      }
    );
    player2Ref.current = player2;
    Matter.World.add(world, player2);

    // Collision detection
    Matter.Events.on(engine, "collisionStart", (event) => {
      event.pairs.forEach((pair) => {
        const isPlayer1 =
          pair.bodyA === player1Ref.current ||
          pair.bodyB === player1Ref.current;
        if (isPlayer1) {
          const otherBody =
            pair.bodyA === player1Ref.current ? pair.bodyB : pair.bodyA;

          flagsRef.current.forEach((flagData, index) => {
            if (
              flagData.playerType === 1 &&
              otherBody === flagData.flag &&
              !flagData.raised
            ) {
              onFlagSfx?.();
              flagData.raised = true;
              setFlagStates((prev) => ({ ...prev, [`flag_${index}`]: true }));
            }
          });

          if (!otherBody.isSensor) {
            const normal =
              pair.bodyA === player1Ref.current
                ? pair.collision.normal
                : { x: -pair.collision.normal.x, y: -pair.collision.normal.y };

            if (normal.y < -0.5) {
              player1GroundedRef.current = true;
            }
          }
        }

        const isPlayer2 =
          pair.bodyA === player2Ref.current ||
          pair.bodyB === player2Ref.current;
        if (isPlayer2) {
          const otherBody =
            pair.bodyA === player2Ref.current ? pair.bodyB : pair.bodyA;

          flagsRef.current.forEach((flagData, index) => {
            if (
              flagData.playerType === 2 &&
              otherBody === flagData.flag &&
              !flagData.raised
            ) {
              flagData.raised = true;
              setFlagStates((prev) => ({ ...prev, [`flag_${index}`]: true }));
            }
          });

          if (!otherBody.isSensor) {
            const normal =
              pair.bodyA === player2Ref.current
                ? pair.collision.normal
                : { x: -pair.collision.normal.x, y: -pair.collision.normal.y };

            if (normal.y < -0.5) {
              player2GroundedRef.current = true;
            }
          }
        }
      });
    });

    Matter.Events.on(engine, "collisionActive", (event) => {
      let bestNormal1: { x: number; y: number } | null = null;
      let bestNormal2: { x: number; y: number } | null = null;

      event.pairs.forEach((pair) => {
        const isPlayer1 =
          pair.bodyA === player1Ref.current ||
          pair.bodyB === player1Ref.current;
        if (isPlayer1) {
          const otherBody =
            pair.bodyA === player1Ref.current ? pair.bodyB : pair.bodyA;
          if (otherBody.isSensor) return;

          const normal =
            pair.bodyA === player1Ref.current
              ? pair.collision.normal
              : { x: -pair.collision.normal.x, y: -pair.collision.normal.y };

          if (normal.y < -0.5) {
            if (!bestNormal1 || normal.y < bestNormal1.y) bestNormal1 = normal;
          }
        }

        const isPlayer2 =
          pair.bodyA === player2Ref.current ||
          pair.bodyB === player2Ref.current;
        if (isPlayer2) {
          const otherBody =
            pair.bodyA === player2Ref.current ? pair.bodyB : pair.bodyA;
          if (otherBody.isSensor) return;

          const normal =
            pair.bodyA === player2Ref.current
              ? pair.collision.normal
              : { x: -pair.collision.normal.x, y: -pair.collision.normal.y };

          if (normal.y < -0.5) {
            if (!bestNormal2 || normal.y < bestNormal2.y) bestNormal2 = normal;
          }
        }
      });

      if (bestNormal1) {
        player1GroundedRef.current = true;
        player1GroundNormalRef.current = bestNormal1;
      } else {
        player1GroundedRef.current = false;
        player1GroundNormalRef.current = null;
        player1LockedPositionRef.current = null;
      }

      if (bestNormal2) {
        player2GroundedRef.current = true;
        player2GroundNormalRef.current = bestNormal2;
      } else {
        player2GroundedRef.current = false;
        player2GroundNormalRef.current = null;
        player2LockedPositionRef.current = null;
      }
    });

    Matter.Events.on(engine, "collisionEnd", (event) => {
      event.pairs.forEach((pair) => {
        if (
          pair.bodyA === player1Ref.current ||
          pair.bodyB === player1Ref.current
        ) {
          player1GroundedRef.current = false;
          player1GroundNormalRef.current = null;
          player1LockedPositionRef.current = null;
        }
        if (
          pair.bodyA === player2Ref.current ||
          pair.bodyB === player2Ref.current
        ) {
          player2GroundedRef.current = false;
          player2GroundNormalRef.current = null;
          player2LockedPositionRef.current = null;
        }
      });
    });

    const applySlopeStick = (
      body: Matter.Body,
      groundNormal: { x: number; y: number } | null,
      isGrounded: boolean,
      moving: boolean
    ) => {
      const n = groundNormal;
      if (!body || !n || !isGrounded) return;

      const tx = -n.y;
      const ty = n.x;

      const vx = body.velocity.x;
      const vy = body.velocity.y;

      const vAlong = vx * tx + vy * ty;

      const kill = moving ? 0.65 : 1.0;

      const newVx = vx - vAlong * tx * kill;
      const newVy = vy - vAlong * ty * kill;

      Matter.Body.setVelocity(body, { x: newVx, y: newVy });
    };

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "a" || e.key === "A") {
        keysRef.current.a = true;
        player1LockedPositionRef.current = null;
      }
      if (e.key === "d" || e.key === "D") {
        keysRef.current.d = true;
        player1LockedPositionRef.current = null;
      }
      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        keysRef.current.w = true;
        player1LockedPositionRef.current = null;
      }

      if (e.key === "ArrowLeft") {
        keysRef.current.left = true;
        player2LockedPositionRef.current = null;
      }
      if (e.key === "ArrowRight") {
        keysRef.current.right = true;
        player2LockedPositionRef.current = null;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        onJumpSfx?.();
        keysRef.current.up = true;
        player2LockedPositionRef.current = null;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "a" || e.key === "A") keysRef.current.a = false;
      if (e.key === "d" || e.key === "D") keysRef.current.d = false;
      if (e.key === "w" || e.key === "W") keysRef.current.w = false;

      if (e.key === "ArrowLeft") keysRef.current.left = false;
      if (e.key === "ArrowRight") keysRef.current.right = false;
      if (e.key === "ArrowUp") keysRef.current.up = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Game loop
    const gameLoop = () => {
      if (!player1Ref.current || !player2Ref.current) return;
      if (gameOverRef.current) return;

      const moveSpeed = 5;
      const jumpForce = -0.04;
      const maxFallSpeed = 15;

      // Player 1 movement
      const player1Moving = keysRef.current.a || keysRef.current.d;
      const player1NoKeys =
        !keysRef.current.a && !keysRef.current.d && !keysRef.current.w;

      applySlopeStick(
        player1Ref.current,
        player1GroundNormalRef.current,
        player1GroundedRef.current,
        player1Moving
      );

      if (keysRef.current.a) {
        Matter.Body.setVelocity(player1Ref.current, {
          x: -moveSpeed,
          y: player1Ref.current.velocity.y,
        });
      } else if (keysRef.current.d) {
        Matter.Body.setVelocity(player1Ref.current, {
          x: moveSpeed,
          y: player1Ref.current.velocity.y,
        });
      } else if (player1GroundedRef.current && player1NoKeys) {
        if (!player1LockedPositionRef.current) {
          player1LockedPositionRef.current = {
            x: player1Ref.current.position.x,
            y: player1Ref.current.position.y,
          };
        }
        Matter.Body.setPosition(
          player1Ref.current,
          player1LockedPositionRef.current
        );
        Matter.Body.setVelocity(player1Ref.current, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(player1Ref.current, 0);
      } else {
        Matter.Body.setVelocity(player1Ref.current, {
          x: player1Ref.current.velocity.x * 0.9,
          y: player1Ref.current.velocity.y,
        });
      }

      if (player1Ref.current.velocity.y > maxFallSpeed) {
        Matter.Body.setVelocity(player1Ref.current, {
          x: player1Ref.current.velocity.x,
          y: maxFallSpeed,
        });
      }

      if (keysRef.current.w && player1GroundedRef.current) {
        Matter.Body.applyForce(
          player1Ref.current,
          player1Ref.current.position,
          {
            x: 0,
            y: jumpForce,
          }
        );
        keysRef.current.w = false;
      }

      // Player 2 movement
      const player2Moving = keysRef.current.left || keysRef.current.right;
      const player2NoKeys =
        !keysRef.current.left && !keysRef.current.right && !keysRef.current.up;

      applySlopeStick(
        player2Ref.current,
        player2GroundNormalRef.current,
        player2GroundedRef.current,
        player2Moving
      );

      if (keysRef.current.left) {
        Matter.Body.setVelocity(player2Ref.current, {
          x: -moveSpeed,
          y: player2Ref.current.velocity.y,
        });
      } else if (keysRef.current.right) {
        Matter.Body.setVelocity(player2Ref.current, {
          x: moveSpeed,
          y: player2Ref.current.velocity.y,
        });
      } else if (player2GroundedRef.current && player2NoKeys) {
        if (!player2LockedPositionRef.current) {
          player2LockedPositionRef.current = {
            x: player2Ref.current.position.x,
            y: player2Ref.current.position.y,
          };
        }
        Matter.Body.setPosition(
          player2Ref.current,
          player2LockedPositionRef.current
        );
        Matter.Body.setVelocity(player2Ref.current, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(player2Ref.current, 0);
      } else {
        Matter.Body.setVelocity(player2Ref.current, {
          x: player2Ref.current.velocity.x * 0.9,
          y: player2Ref.current.velocity.y,
        });
      }

      if (player2Ref.current.velocity.y > maxFallSpeed) {
        Matter.Body.setVelocity(player2Ref.current, {
          x: player2Ref.current.velocity.x,
          y: maxFallSpeed,
        });
      }

      if (keysRef.current.up && player2GroundedRef.current) {
        Matter.Body.applyForce(
          player2Ref.current,
          player2Ref.current.position,
          {
            x: 0,
            y: jumpForce,
          }
        );
        keysRef.current.up = false;
      }

      // Player animation and facing direction
      animationTickRef.current++;

      // Update facing direction based on movement
      if (keysRef.current.a) {
        player1FacingRef.current = -1; // Facing left
      } else if (keysRef.current.d) {
        player1FacingRef.current = 1; // Facing right
      }

      if (keysRef.current.left) {
        player2FacingRef.current = -1; // Facing left
      } else if (keysRef.current.right) {
        player2FacingRef.current = 1; // Facing right
      }

      if (animationTickRef.current % 10 === 0) {
        if (player1Ref.current) {
          const isMoving = keysRef.current.a || keysRef.current.d;
          if (isMoving) {
            player1AnimFrameRef.current = 1 - player1AnimFrameRef.current;
            const texture =
              player1AnimFrameRef.current === 0
                ? ASSETS.PLAYER1_WALK_1
                : ASSETS.PLAYER1_WALK_2;
            (player1Ref.current.render as any).sprite.texture = texture;
          } else {
            (player1Ref.current.render as any).sprite.texture =
              ASSETS.PLAYER1_IDLE;
            player1AnimFrameRef.current = 0;
          }
          // Apply facing direction (flip sprite with negative xScale)
          (player1Ref.current.render as any).sprite.xScale =
            0.1 * player1FacingRef.current;
        }

        if (player2Ref.current) {
          const isMoving = keysRef.current.left || keysRef.current.right;
          if (isMoving) {
            player2AnimFrameRef.current = 1 - player2AnimFrameRef.current;
            const texture =
              player2AnimFrameRef.current === 0
                ? ASSETS.PLAYER2_WALK_1
                : ASSETS.PLAYER2_WALK_2;
            (player2Ref.current.render as any).sprite.texture = texture;
          } else {
            (player2Ref.current.render as any).sprite.texture =
              ASSETS.PLAYER2_IDLE;
            player2AnimFrameRef.current = 0;
          }
          // Apply facing direction (flip sprite with negative xScale)
          (player2Ref.current.render as any).sprite.xScale =
            0.1 * player2FacingRef.current;
        }
      }
    };

    Matter.Events.on(engine, "beforeUpdate", gameLoop);

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
    Matter.Render.run(render);

    return () => {
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
      Matter.Events.off(engine, "beforeUpdate", gameLoop);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      render.canvas.remove();

      platformsRef.current = [];
      flagsRef.current = [];
    };
  }, [phase, gameRunId, width, height, loadLevel, platformLines]);

  // Update flag sprites when raised
  useEffect(() => {
    flagsRef.current.forEach((flagData, index) => {
      const isRaised = flagStates[`flag_${index}`] && flagData.raised;

      const texture = isRaised
        ? flagData.playerType === 1
          ? ASSETS.PLAYER1_FLAG_RAISED
          : ASSETS.PLAYER2_FLAG_RAISED
        : flagData.playerType === 1
        ? ASSETS.PLAYER1_FLAG_LOWERED
        : ASSETS.PLAYER2_FLAG_LOWERED;

      (flagData.flag.render as any).sprite.texture = texture;
    });
  }, [flagStates]);

  // Check win condition
  useEffect(() => {
    if (phase === "game" && flagsRef.current.length > 0) {
      const allRaised = flagsRef.current.every((flag) => flag.raised);
      if (allRaised && !gameWon) {
        setGameWon(true);
        onWinSfx?.();
        onWin?.();
      }
    }
  }, [flagStates, gameWon, phase, onWin]);

  useEffect(() => {
    if (!gameWon) return;
    if (!capturedPoseImage) return;
    if (uploadedOnceRef.current) return;

    uploadedOnceRef.current = true;

    (async () => {
      setUploading(true);
      setUploadErr(null);

      try {
        const blob = dataUrlToBlob(capturedPoseImage);

        // Use a unique path
        const filePath = `wins/${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}.png`;

        const { error: uploadError } = await supabase.storage
          .from("pose-captures")
          .upload(filePath, blob, {
            contentType: "image/png",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // Public URL (bucket must be public)
        const { data } = supabase.storage
          .from("pose-captures")
          .getPublicUrl(filePath);

        const url = data.publicUrl;
        setUploadedUrl(url);
      } catch (e: any) {
        setUploadErr(e?.message ?? "Upload failed");
        // allow retry by resetting ref
        uploadedOnceRef.current = false;
      } finally {
        setUploading(false);
      }
    })();
  }, [gameWon, capturedPoseImage]);

  const handleRestart = () => {
    onRestart?.();
  };

  const handleRetry = useCallback(() => {
    // retry same exact level + same pose platforms
    setUploadedUrl(null);
    setUploadErr(null);
    setUploading(false);
    uploadedOnceRef.current = false;

    setGameWon(false);
    setGameOver(false);
    gameOverRef.current = false;
    setGameSecondsLeft(gameTime);
    keysRef.current = {
      a: false,
      d: false,
      w: false,
      left: false,
      right: false,
      up: false,
    };

    player1GroundedRef.current = false;
    player2GroundedRef.current = false;
    player1LockedPositionRef.current = null;
    player2LockedPositionRef.current = null;
    player1GroundNormalRef.current = null;
    player2GroundNormalRef.current = null;

    setFlagStates({});
    flagsRef.current = [];
    platformsRef.current = [];

    setGameSecondsLeft(gameTime);

    // forces the Matter "game phase" effect to cleanup and rebuild
    setGameRunId((x) => x + 1);
  }, []);

  const handleReset = useCallback(() => {
    setUploadedUrl(null);
    setUploadErr(null);
    setUploading(false);
    uploadedOnceRef.current = false;

    keysRef.current = {
      a: false,
      d: false,
      w: false,
      left: false,
      right: false,
      up: false,
    };

    player1GroundedRef.current = false;
    player2GroundedRef.current = false;
    player1LockedPositionRef.current = null;
    player2LockedPositionRef.current = null;
    player1GroundNormalRef.current = null;
    player2GroundNormalRef.current = null;

    // reset everything and require re-pose
    setGameWon(false);
    setGameOver(false);
    gameOverRef.current = false;

    setFlagStates({});
    flagsRef.current = [];
    platformsRef.current = [];

    setPlatformLines([]);
    setCapturedPoseImage(null);

    setCameraReady(false);
    setSecondsLeft(poseTime);

    // go back to ready so camera + preview comes back
    setPhase("ready");
  }, [poseTime]);

  useEffect(() => {
    if (phase !== "game") return;
    if (gameWon) return;
    if (gameOver) return;

    setGameSecondsLeft(gameTime);

    const id = window.setInterval(() => {
      setGameSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);

    return () => window.clearInterval(id);
  }, [phase, gameRunId]); // re-run on retry

  useEffect(() => {
    if (phase !== "game") return;
    if (gameWon) return;
    if (gameSecondsLeft !== 0) return;

    setGameOver(true);
    gameOverRef.current = true;
    onLoseSfx?.();
  }, [phase, gameSecondsLeft, gameWon]);

  // Show loading state while model is loading
  const isLoading =
    modelLoading || ((phase === "pose" || phase === "ready") && !cameraReady);

  return (
    <div className="relative" style={{ width, height }}>
      <video ref={videoRef} className="hidden" playsInline />

      {/* Model Error */}
      {modelError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-red-900/80">
          <div className="text-white text-center p-4">
            <div className="text-xl font-bold mb-2">
              Failed to load pose model
            </div>
            <div className="text-sm opacity-80">{modelError.message}</div>
          </div>
        </div>
      )}

      {/* Ready Phase - Press Space to Start */}
      {phase === "ready" && !modelError && (
        <>
          <canvas
            ref={camCanvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ width, height }}
          />
          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ width, height }}
          />

          {/* Loading overlay */}
          {(modelLoading || !cameraReady || !imagesLoaded) && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="flex flex-col items-center gap-3 rounded-xl bg-white/90 px-5 py-4 shadow">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent" />
                <div className="text-sm font-medium text-black">
                  {modelLoading
                    ? "Loading pose model…"
                    : !imagesLoaded
                    ? "Loading assets…"
                    : "Starting camera…"}
                </div>
              </div>
            </div>
          )}

          {/* Ready prompt */}
          {!modelLoading && cameraReady && imagesLoaded && (
            <>
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none">
                <div className="bg-black/70 rounded-2xl px-8 py-6 text-center animate-pulse">
                  <div className="text-white text-2xl font-bold mb-2">
                    Get Ready!
                  </div>
                  <div className="text-white/80 text-lg">
                    Press{" "}
                    <kbd className="px-3 py-1 bg-white/20 rounded-lg mx-1 font-mono">
                      SPACE
                    </kbd>{" "}
                    to start
                  </div>
                </div>
              </div>

              {/* Level info */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-xl bg-black/60 px-6 py-3 text-white text-center">
                <div className="text-sm font-medium mb-2">Level Preview</div>
                <div className="flex gap-4 justify-center text-xs">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-green-500"></span>{" "}
                    P1 Spawn/Flag
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-orange-500"></span>{" "}
                    P2 Spawn/Flag
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-blue-500"></span>{" "}
                    Platforms
                  </span>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Pose Phase */}
      {phase === "pose" && !modelError && (
        <>
          <canvas
            ref={camCanvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ width, height }}
          />
          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ width, height }}
          />

          {/* Countdown */}
          {!isLoading && (
            <div className="absolute top-4 left-4 z-40 rounded-xl bg-black/60 px-4 py-3 text-white">
              <div className="text-xs opacity-80">Strike a pose!</div>
              <div className="text-4xl font-bold tabular-nums">
                {secondsLeft}
              </div>
            </div>
          )}
          {secondsLeft <= 3 && (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center text-7xl bg-black/20 ">
              <span className="animate-ping font-bold">{secondsLeft}</span>
            </div>
          )}
          {/* Loading */}
          {isLoading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="flex flex-col items-center gap-3 rounded-xl bg-white/90 px-5 py-4 shadow">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent" />
                <div className="text-sm font-medium text-black">
                  {modelLoading ? "Loading pose model…" : "Starting camera…"}
                </div>
              </div>
            </div>
          )}

          {/* Instructions */}
          {!isLoading && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-xl bg-black/60 px-6 py-3 text-white text-center">
              <div className="text-sm">Your body becomes the platforms!</div>
              <div className="text-xs opacity-70 mt-1">
                Pose to create paths between spawn points and flags
              </div>
              <div className="flex gap-4 justify-center mt-2 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-green-500"></span> P1
                  Spawn/Flag
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-orange-500"></span>{" "}
                  P2 Spawn/Flag
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-purple-500"></span> Your
                  Platforms
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Game Phase */}
      {phase === "game" && (
        <>
          <div
            key={`game-${gameRunId}`} // ✅ force remount on retry
            ref={gameCanvasRef}
            className="absolute inset-0 border-black border-2"
            style={{ width, height }}
          />

          <div className="absolute top-16 right-4 z-30 rounded-xl bg-black/60 px-4 py-3 text-white">
            <div className="text-xs opacity-80">Time Left</div>
            <div className="text-3xl font-bold tabular-nums">
              {gameSecondsLeft}
            </div>
          </div>

          {/* Download pose photo button */}
          {capturedPoseImage && (
            <button
              onClick={downloadPoseImage}
              className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-lg transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Download Pose
            </button>
          )}
          <div className="absolute top-16 left-4 z-30 flex gap-2">
            <button
              onClick={handleRetry}
              className="px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow"
            >
              Retry
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow"
            >
              Reset
            </button>
          </div>

          {/* Controls hint */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 rounded-xl bg-black/60 px-4 py-2 text-white text-sm">
            <span className="text-green-400 font-bold">P1</span>: WASD |{" "}
            <span className="text-orange-400 font-bold">P2</span>: Arrow Keys
          </div>
        </>
      )}

      {gameOver && !gameWon && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/70 text-white">
          <h1 className="text-4xl font-bold mb-4">Time’s up</h1>
          <div className="flex gap-3">
            <button
              onClick={handleRetry}
              className="px-6 py-3 text-lg font-bold bg-blue-500 hover:bg-blue-600 rounded-lg shadow"
            >
              Retry
            </button>
            <button
              onClick={handleReset}
              className="px-6 py-3 text-lg font-bold bg-red-500 hover:bg-red-600 rounded-lg shadow"
            >
              Reset & Re-pose
            </button>
          </div>
        </div>
      )}

      {/* Win Overlay */}
      {gameWon && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/70 text-white">
          <h1 className="text-5xl font-bold mb-6 drop-shadow-lg">
            🎉 Level Complete! 🎉
          </h1>

          {/* Show captured pose */}
          {capturedPoseImage && (
            <div className="mb-6 flex items-center gap-5 justify-center">
              <div>
                <p className="text-sm opacity-80 mb-2">Your winning pose:</p>
                <img
                  src={capturedPoseImage}
                  alt="Your pose"
                  className="w-md h-84 object-cover rounded-lg border-4 border-white/30 shadow-lg"
                />
              </div>
              <div className="mt-4 flex flex-col items-center gap-3">
                {uploading && (
                  <div className="text-sm opacity-90">Uploading photo…</div>
                )}

                {uploadErr && (
                  <div className="text-sm text-red-300 text-center">
                    <div>Upload failed: {uploadErr}</div>
                    <button
                      onClick={() => {}}
                      className="mt-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 font-semibold"
                    >
                      Retry Upload
                    </button>
                  </div>
                )}

                {uploadedUrl && (
                  <div className="flex flex-col items-center gap-2 bg-white/10 px-4 py-3 rounded-xl">
                    <div className="text-sm opacity-90">
                      Scan to view/download:
                    </div>

                    <div className="bg-white p-3 rounded-lg">
                      <QRCodeCanvas value={uploadedUrl} size={180} />
                    </div>

                    <a
                      href={uploadedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline opacity-90"
                    >
                      Open link
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-4">
            {capturedPoseImage && (
              <button
                onClick={downloadPoseImage}
                className="px-6 py-3 text-lg font-bold bg-purple-500 hover:bg-purple-600 rounded-lg shadow-lg transition-colors flex items-center gap-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Save Photo
              </button>
            )}

            <button
              onClick={handleRestart}
              className="px-6 py-3 text-lg font-bold bg-green-500 hover:bg-green-600 rounded-lg shadow-lg transition-colors"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PoseGame;
