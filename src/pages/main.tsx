import "@/App.css";
import { useMemo, useState } from "react";
import Home from "@/components/Home";
import level1JSON from "@/levels/level1.json";
import LevelCreator, { type SavedLevel } from "./levelCreator";

export default function Main() {
  const [level, setLevel] = useState<number>(0);

  const differentLevel = useMemo(
    () => [level1JSON as unknown as SavedLevel],
    []
  );

  const selectedLevel = level > 0 ? differentLevel[level - 1] : null;

  return (
    <div className="fullHeight bg-sky-300 w-full text-white flex flex-col justify-center items-center gap-6">
      {level === 0 ? <Home setLevel={setLevel} /> : null}

      {level !== 0 && selectedLevel ? (
        <LevelCreator showCustomTools={false} loadLevel={selectedLevel} />
      ) : null}
    </div>
  );
}
