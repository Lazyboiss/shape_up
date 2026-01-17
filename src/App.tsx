import { Route, Routes } from "react-router-dom";
import { App as Main } from "./pages/main.tsx";
import Game from "./pages/game.tsx";
import PlatformerGame from "@/pages/rezky.tsx";
import { ThemeProvider } from "@/components/theme-provider";
import { type SavedLevel } from "@/pages/rezky.tsx";

export default function App() {
  const level: SavedLevel = {
    platforms: [
      { start: { x: 200, y: 300 }, end: { x: 420, y: 260 }, thickness: 10 },
    ],
    flags: [
      {
        playerType: 1,
        pole: { x: 427.33, y: 194 },
        flag: { x: 452.33, y: 154 },
        raised: false,
      },
      {
        playerType: 2,
        pole: { x: 146.33, y: 318 },
        flag: { x: 171.33, y: 278 },
        raised: false,
      },
    ],
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <Routes>
        <Route path="/" element={<Main />}></Route>
        <Route path="/game" element={<Game />}></Route>
        <Route
          path="/rezky"
          element={
            <PlatformerGame
              lines={[
                { start: { x: 300, y: 300 }, end: { x: 500, y: 250 } },
                { start: { x: 100, y: 400 }, end: { x: 200, y: 350 } },
              ]}
              initialLevel={level}
            />
          }
        ></Route>
      </Routes>
    </ThemeProvider>
  );
}
