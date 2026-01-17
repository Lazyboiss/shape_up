import { Route, Routes } from "react-router-dom";
import Main from "./pages/main.tsx";
import Game from "./pages/game.tsx";
import PlatformerGame from "@/pages/rezky.tsx";
import { ThemeProvider } from "@/components/theme-provider";
import { type SavedLevel } from "@/pages/rezky.tsx";
import LevelCreator from "./pages/levelCreator.tsx";

export default function App() {
  const level: SavedLevel = {
    platforms: [],
    flags: [],
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <Routes>
        <Route path="/" element={<Main />}></Route>
        <Route path="/game" element={<Game />}></Route>
        <Route path="/createLevel" element={<LevelCreator />}></Route>
        <Route
          path="/rezky"
          element={<PlatformerGame initialLevel={level} />}
        ></Route>
      </Routes>
    </ThemeProvider>
  );
}
