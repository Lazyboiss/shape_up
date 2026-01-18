import "@/App.css";
import { useMemo, useState, useCallback } from "react";
import Hero from "@/components/Hero";
import level1JSON from "@/levels/level1.json";
import level2JSON from "@/levels/Easy.json";
import level3JSON from "@/levels/Medium.json";
import level4JSON from "@/levels/Hard.json";
import PoseGame, { type SavedLevel } from "@/components/PoseGame";
import { PoseDetectorProvider } from "@/contexts/PoseDetectorContext";

function GameContent() {
  const [level, setLevel] = useState<number>(0);
  const [gameKey, setGameKey] = useState(0); // Used to reset PoseGame component

  const differentLevels = useMemo(
    () => [
      level1JSON as unknown as SavedLevel,
      level2JSON as unknown as SavedLevel,
      level3JSON as unknown as SavedLevel,
      level4JSON as unknown as SavedLevel,
    ],
    []
  );

  const selectedLevel = level > 0 ? differentLevels[level - 1] : null;

  const handleRestart = useCallback(() => {
    // Increment key to force PoseGame to remount and restart
    setGameKey((k) => k + 1);
  }, []);

  const handleBackToMenu = useCallback(() => {
    setLevel(0);
    setGameKey((k) => k + 1);
  }, []);

  const handleWin = useCallback(() => {
    console.log("Level completed!");
  }, []);

  return (
    <div className="fullHeight bg-sky-300 w-full text-white flex flex-col justify-center items-center gap-6">
      {level === 0 ? <Hero setLevel={setLevel} /> : null}

      {level !== 0 && selectedLevel ? (
        <div className="relative">
          <PoseGame
            key={gameKey} // This forces a fresh component on restart
            loadLevel={selectedLevel}
            width={1200}
            height={900}
            onWin={handleWin}
            onRestart={handleRestart}
            gameTime={level == differentLevels.length - 1 ? 1000 : 60}
          />

          {/* Back to Menu button */}
          <button
            onClick={handleBackToMenu}
            className="absolute top-4 right-4 z-50 px-4 py-2 text-sm font-bold bg-gray-800/80 hover:bg-gray-700 text-white rounded-lg shadow-lg transition-colors"
          >
            ← Menu
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function Home() {
  return (
    // The provider wraps everything so the model stays loaded
    <PoseDetectorProvider>
      <GameContent />
    </PoseDetectorProvider>
  );
}
