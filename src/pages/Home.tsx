import "@/App.css";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import Hero from "@/components/Hero";
import level1JSON from "@/levels/level1.json";
import level2JSON from "@/levels/Easy.json";
import level3JSON from "@/levels/Medium.json";
import level4JSON from "@/levels/Hard.json";
import PoseGame, { type SavedLevel } from "@/components/PoseGame";
import { PoseDetectorProvider } from "@/contexts/PoseDetectorContext";
import { cn } from "@/lib/utils";
import { SfxManager } from "@/lib/sfx";

function GameContent() {
  const bgSoundRef = useRef<HTMLAudioElement | null>(null);

  const sfxRef = useRef<SfxManager | null>(null);
  if (!sfxRef.current) {
    sfxRef.current = new SfxManager(
      {
        jump: "/sfx/jump.mp3",
        win: "/sfx/win.mp3",
        lose: "/sfx/lose.mp3",
        flag: "/sfx/flag.mp3",
        countBeep: "/sfx/countdown-beep.mp3",
        countGo: "/sfx/countdown-go.mp3",
      },
      {
        jump: 1,
        win: 1,
        lose: 1,
        flag: 1,
        countBeep: 1,
        countGo: 1,
      }
    );
  }

  const startBgm = useCallback(async () => {
    // unlock SFX + BGM in the same user gesture
    await sfxRef.current?.unlock();

    let bg = bgSoundRef.current;
    if (!bg) {
      bg = new Audio("/bg.mp3");
      bg.preload = "auto";
      bg.loop = true;
      bg.volume = 0.2;
      bgSoundRef.current = bg;
    }

    try {
      await bg.play();
    } catch (err) {
      console.warn("Could not play bg sound:", err);
    }
  }, []);

  const [level, setLevel] = useState<number>(0);
  const [gameKey, setGameKey] = useState(0); // Used to reset PoseGame component

  useEffect(() => {
    return () => {
      const bg = bgSoundRef.current;
      if (bg) {
        bg.pause();
        bg.currentTime = 0;
        bgSoundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const bg = new Audio("/bg.mp3"); // put file in /public
    bg.preload = "auto";
    bg.loop = true;
    bg.volume = 0.1; // softer than SFX
    bgSoundRef.current = bg;
    bgSoundRef.current.play().catch((err) => {
      console.warn("Could not play bg sound:", err);
    });
  }, []);

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
    <div
      className={cn(
        "fullHeight w-full text-white flex flex-col justify-center items-center gap-6",
        level === 0 ? "bg-black" : "bg-sky-300"
      )}
    >
      {level === 0 ? (
        <Hero
          setLevel={(n: number) => {
            startBgm(); // user gesture path
            setLevel(n);
          }}
          startBgm={startBgm}
        />
      ) : null}

      {level !== 0 && selectedLevel ? (
        <div className="relative">
          <PoseGame
            key={gameKey} // This forces a fresh component on restart
            loadLevel={selectedLevel}
            width={1200}
            height={900}
            onWin={handleWin}
            onRestart={handleRestart}
            gameTime={level > 2 ? 1000 : 60}
            onJumpSfx={() => sfxRef.current?.play("jump")}
            onWinSfx={() => sfxRef.current?.play("win")}
            onLoseSfx={() => sfxRef.current?.play("lose")}
            onFlagSfx={() => sfxRef.current?.play("flag")}
            onCountdownBeep={() => sfxRef.current?.play("countBeep")}
            onCountdownGo={() => sfxRef.current?.play("countGo")}
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
