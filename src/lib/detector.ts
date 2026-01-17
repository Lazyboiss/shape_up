import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";

let detectorPromise: Promise<poseDetection.PoseDetector> | null = null;

export function getMoveNetDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      await tf.ready();
      await tf.setBackend("webgl");

      return poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING }
      );
    })();
  }
  return detectorPromise;
}
