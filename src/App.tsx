import { Route, Routes } from "react-router-dom";
import Main from "./pages/main.tsx";
import Game from "./pages/game.tsx";

export default function App() {
  return <Routes>
    <Route path="/" element={<Main />}></Route>
    <Route path="/game" element={<Game />}></Route>
  </Routes>
}