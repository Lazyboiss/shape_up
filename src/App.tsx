import "./App.css";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import { drawKeypoints, drawSkeleton } from "@/lib/pose_utils";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { Button } from "@/components/ui/button";
import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getMoveNetDetector } from "@/lib/detector";

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [allPoses, setAllPoses] = useState<poseDetection.Pose[]>([]);
  const poseColor = "pink";

  const [isLoading, setIsLoading] = useState(true);
  const loadingClearedOnceRef = useRef(false);

  useEffect(() => {
    // console.log(allPoses);
  }, [allPoses]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let rafId: number | null = null;
    let cancelled = false;

    const stopEverything = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = null;

      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }

      const video = videoRef.current;
      if (video) {
        video.pause();
        video.srcObject = null;
      }
    };

    const loadModelAndStart = async () => {
      const detector = await getMoveNetDetector();

      const video = videoRef.current;
      if (!video) return;

      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (cancelled) return;

      video.srcObject = stream;

      video.onloadedmetadata = async () => {
        if (cancelled) return;

        try {
          await video.play();
        } catch {
          // autoplay can fail in some browsers; loader will remain
          return;
        }

        const runPoseEstimation = async () => {
          const canvas = canvasRef.current;
          const video = videoRef.current;
          if (!canvas || !video) return;

          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          // Ensure we have real dimensions
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;

          const offscreenCanvas = document.createElement("canvas");
          offscreenCanvas.width = canvas.width;
          offscreenCanvas.height = canvas.height;
          const offscreenCtx = offscreenCanvas.getContext("2d");

          const loop = async () => {
            if (cancelled) return;
            if (!offscreenCtx) return;

            // 1) Draw flipped video onto offscreen canvas
            offscreenCtx.save();
            offscreenCtx.scale(-1, 1);
            offscreenCtx.translate(-offscreenCanvas.width, 0);
            offscreenCtx.drawImage(
              video,
              0,
              0,
              offscreenCanvas.width,
              offscreenCanvas.height
            );
            offscreenCtx.restore();

            // 2) Estimate poses on flipped frame
            const poses = await detector.estimatePoses(offscreenCanvas, {
              scoreThreshold: 0.01,
              maxPoses: 10,
            });

            setAllPoses(poses);

            // 3) Draw mirrored video + keypoints onto main canvas
            ctx.save();
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.scale(-1, 1);
            ctx.translate(-canvas.width, 0);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            if (poses.length > 0) {
              for (const pose of poses) {
                const mirroredKeypoints = pose.keypoints.map((kp) => ({
                  ...kp,
                  x: canvas.width - kp.x,
                }));
                drawKeypoints(mirroredKeypoints, 0.5, ctx, 1, poseColor);
                drawSkeleton(mirroredKeypoints, 0.5, ctx, 1, poseColor);
              }
            }

            ctx.restore();

            // Clear loader once we have a successful first frame
            if (!loadingClearedOnceRef.current) {
              loadingClearedOnceRef.current = true;
              setIsLoading(false);
            }

            rafId = requestAnimationFrame(loop);
          };

          loop();
        };

        runPoseEstimation();
      };
    };

    const loadTF = async () => {
      try {
        setIsLoading(true);
        await tf.ready();
        await tf.setBackend("webgl");
        await loadModelAndStart();
      } catch {
        // If anything fails, keep loader (or you can add an error state)
      }
    };

    loadTF();

    return () => {
      cancelled = true;
      stopEverything();
    };
  }, []);

  return (
    <div className="relative w-full fullHeight overflow-hidden flex items-center justify-center mainBG">
      <video ref={videoRef} className="hidden" playsInline />

      <div className="absolute w-full h-full top-0 left-1/2 -translate-x-1/2">
        <canvas
          ref={canvasRef}
          className={cn(
            "h-full transition-opacity duration-500 mx-auto",
            true ? "border-2 border-black" : ""
          )}
        />
      </div>

      {/* Loader Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white/90 px-5 py-4 shadow">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent" />
            <div className="text-sm font-medium text-black">
              Loading camera and model…
            </div>
          </div>
        </div>
      )}

      <Button>Hello</Button>
    </div>
  );
}
