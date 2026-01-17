import { Route, Routes } from "react-router-dom";
import { App as Main } from "./pages/main.tsx";
import Game from "./pages/game.tsx";
import PlatformerGame from "./pages/rezky.tsx";
import { ThemeProvider } from "@/components/theme-provider";

export default function App() {
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
            />
          }
        ></Route>
      </Routes>
    </ThemeProvider>
  );
}
