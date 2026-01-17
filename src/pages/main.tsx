import "@/App.css";
import "@tensorflow/tfjs";
import { drawKeypoints, drawSkeleton } from "@/lib/pose_utils";
import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from "@tensorflow/tfjs-core";
import { Button } from "@/components/ui/button";
import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [allPoses, setAllPoses] = useState<poseDetection.Pose[]>([]);
  const poseColor = "pink";

  useEffect(() => {
    // console.log(allPoses);
  }, [allPoses]);

  useEffect(() => {
    const loadModelAndStart = async () => {
      const detectorConfig = {
        modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
      };
      // const detectorConfig = {
      //   modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
      // };

      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        detectorConfig
      );

      const video = videoRef.current;
      if (!video) return;

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;

      video.onloadedmetadata = () => {
        video.play();
        runPoseEstimation();
      };

      const runPoseEstimation = async () => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // const backgroundImage = new Image();
        // backgroundImage.src = "./GameBG.gif";
        // await new Promise((res) => (backgroundImage.onload = res));

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Offscreen canvas for flipping video input
        const offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;
        const offscreenCtx = offscreenCanvas.getContext("2d");

        const loop = async () => {
          if (!offscreenCtx) return;

          // 1. Draw flipped video onto offscreen canvas
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

          // 2. Run segmentation on flipped frame
          const poses = await detector.estimatePoses(offscreenCanvas, {
            scoreThreshold: 0.01,
            maxPoses: 10,
          });

          setAllPoses(poses);

          // 3. Flip main canvas context
          ctx.save(); // ⬅️ Save original state
          ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear before drawing

          ctx.scale(-1, 1);
          ctx.translate(-canvas.width, 0);

          // 4. Draw flipped background
          // if (!backgroundImageRef.current) return;
          // ctx.drawImage(
          //   backgroundImageRef.current,
          //   0,
          //   0,
          //   canvas.width,
          //   canvas.height
          // );
          // ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);

          // 5. Get flipped video frame
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          // const { data } = frame;

          // 6. Mask background using segmentation
          // segmentation.data.forEach((val, i) => {
          //   if (val === 0) {
          //     data[i * 4 + 3] = 0; // make transparent
          //   }
          // });

          // 7. Put back onto canvas
          ctx.putImageData(frame, 0, 0);

          // 8. Draw pose keypoints and skeleton (optional)
          if (poses.length > 0) {
            for (const pose of poses) {
              const mirroredKeypoints = pose.keypoints.map((kp) => ({
                ...kp,
                x: canvas.width - kp.x,
              }));
              drawKeypoints(mirroredKeypoints, 0.5, ctx, 1, poseColor);
              drawSkeleton(mirroredKeypoints, 0.5, ctx, 1, poseColor);
            }

            // const keypoints = poses[0].keypoints;
            // const mirroredKeypoints = keypoints.map((kp) => ({
            //   ...kp,
            //   x: canvas.width - kp.x,
            // }));
            // drawKeypoints(mirroredKeypoints, 0.5, ctx, 1, poseColor);
            // drawSkeleton(mirroredKeypoints, 0.5, ctx, 1, poseColor);
          }
          // const { isPraying, wrists } = detectPraying(poses[0]);

          if (true) {
            const canvas = canvasRef.current;
            if (canvas) {
            }
          }

          ctx.restore(); // Done with flipped drawing

          requestAnimationFrame(loop);
        };

        loop();
      };
    };

    const loadTF = async () => {
      await tf.ready();
      await tf.setBackend("webgl");
      await loadModelAndStart();
    };

    loadTF();
  }, []);

  return (
    <div className="relative w-full fullHeight overflow-hidden flex items-center justify-center mainBG">
      <video ref={videoRef} className="hidden" />
      <div className="absolute w-full h-full top-0 left-1/2 -translate-x-1/2">
        <canvas
          ref={canvasRef}
          className={cn(
            "h-full transition-opacity duration-500 mx-auto",
            true ? "border-2 border-black" : ""
            // gameStart ? "opacity-[0.85]" : "opacity-100"
          )}
        />
      </div>
      <Button>Hello</Button>
    </div>
  );
}
