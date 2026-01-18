import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { getMoveNetDetector } from "@/lib/detector";

interface PoseDetectorContextType {
  detector: poseDetection.PoseDetector | null;
  isLoading: boolean;
  error: Error | null;
}

const PoseDetectorContext = createContext<PoseDetectorContextType>({
  detector: null,
  isLoading: true,
  error: null,
});

export const usePoseDetector = () => useContext(PoseDetectorContext);

interface PoseDetectorProviderProps {
  children: React.ReactNode;
}

export const PoseDetectorProvider: React.FC<PoseDetectorProviderProps> = ({
  children,
}) => {
  const [detector, setDetector] = useState<poseDetection.PoseDetector | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    // Prevent double initialization in strict mode
    if (initRef.current) return;
    initRef.current = true;

    const initDetector = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize TensorFlow.js
        await tf.ready();
        await tf.setBackend("webgl");

        console.log(
          "[PoseDetector] TensorFlow.js ready, loading MoveNet model..."
        );

        // Load the detector once
        const det = await getMoveNetDetector();

        console.log("[PoseDetector] Model loaded successfully!");
        setDetector(det);
      } catch (err) {
        console.error("[PoseDetector] Failed to load model:", err);
        setError(
          err instanceof Error ? err : new Error("Failed to load pose detector")
        );
      } finally {
        setIsLoading(false);
      }
    };

    initDetector();

    // Cleanup on unmount (optional - you might want to keep it loaded)
    return () => {
      // Uncomment if you want to dispose the detector when provider unmounts
      // if (detector) {
      //   detector.dispose();
      // }
    };
  }, []);

  return (
    <PoseDetectorContext.Provider value={{ detector, isLoading, error }}>
      {children}
    </PoseDetectorContext.Provider>
  );
};

export default PoseDetectorProvider;
