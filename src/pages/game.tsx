import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// Type definitions
type PageType = 'levelSelect' | 'game';
type LevelType = 'easy' | 'medium' | 'hard';
type GameStateType = 'playing' | 'won' | 'lost';

interface LevelSelectPageProps {
  onLevelSelect: (level: LevelType) => void;
  showInstructions: boolean;
  setShowInstructions: (show: boolean) => void;
}

interface LevelButtonProps {
  label: string;
  color: string;
  hoverColor: string;
  onClick: () => void;
  delay: string;
}

interface GamePageProps {
  level: LevelType;
  onReturnToLevelSelect: () => void;
}

// Kaboom types
interface KaboomCtx {
  loadSprite: (name: string, src: string) => void;
  scene: (name: string, def: () => void) => void;
  go: (name: string) => void;
  add: (components: any[]) => any;
  get: (tag: string) => any[];
  onKeyDown: (key: string, action: () => void) => void;
  onKeyPress: (key: string, action: () => void) => void;
  loop: (interval: number, action: () => void) => void;
  camPos: (x: number, y: number) => void;
  rect: (width: number, height: number) => any;
  pos: (x: number, y: number) => any;
  area: () => any;
  body: (options?: { isStatic?: boolean }) => any;
  color: (r: number, g: number, b: number) => any;
  outline: (width: number, color: any) => any;
  sprite: (name: string) => any;
  scale: (s: number) => any;
  text: (txt: string, options?: { size?: number; font?: string }) => any;
  anchor: (anchor: string) => any;
  layer: (layer: string) => any;
  rgb: (r: number, g: number, b: number) => any;
  destroy: () => void;
}

interface KaboomConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  background: number[];
}

declare global {
  interface Window {
    kaboom: (config: KaboomConfig) => KaboomCtx;
  }
}

// Main App Component
export default function PlatformerGame() {
  const [currentPage, setCurrentPage] = useState<PageType>('levelSelect');
  const [selectedLevel, setSelectedLevel] = useState<LevelType | null>(null);
  const [showInstructions, setShowInstructions] = useState<boolean>(false);

  const handleLevelSelect = (level: LevelType): void => {
    setSelectedLevel(level);
    setCurrentPage('game');
  };

  const handleReturnToLevelSelect = (): void => {
    setCurrentPage('levelSelect');
    setSelectedLevel(null);
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {currentPage === 'levelSelect' && (
        <LevelSelectPage
          onLevelSelect={handleLevelSelect}
          showInstructions={showInstructions}
          setShowInstructions={setShowInstructions}
        />
      )}
      {currentPage === 'game' && selectedLevel && (
        <GamePage
          level={selectedLevel}
          onReturnToLevelSelect={handleReturnToLevelSelect}
        />
      )}
    </div>
  );
}

// Level Select Page Component
function LevelSelectPage({ onLevelSelect, showInstructions, setShowInstructions }: LevelSelectPageProps) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-start p-8 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -top-48 -left-48 animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute w-96 h-96 bg-pink-500/10 rounded-full blur-3xl -bottom-48 -right-48 animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
      </div>

      {/* Logo */}
      <div className="mt-16 mb-8 relative z-10 animate-fade-in">
        <h1 className="text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-400 to-cyan-400 drop-shadow-2xl animate-gradient" style={{
          fontFamily: "'Bebas Neue', 'Arial Black', sans-serif",
          textShadow: '0 0 40px rgba(6, 182, 212, 0.5), 0 0 80px rgba(236, 72, 153, 0.3)',
          backgroundSize: '200% 100%',
          animation: 'gradient 3s ease infinite, fade-in 0.8s ease-out'
        }}>
          DUAL DASH
        </h1>
        <p className="text-center text-cyan-200 text-xl mt-2 tracking-wide" style={{ fontFamily: 'system-ui' }}>
          Two Players. Two Flags. One Goal.
        </p>
      </div>

      {/* How to Play Button */}
      <div className="mb-12 z-10 animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <Button
          onClick={() => setShowInstructions(true)}
          className="px-8 py-6 text-lg font-bold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 border-2 border-pink-400/30"
        >
          How to Play
        </Button>
      </div>

      {/* Level Buttons */}
      <div className="flex gap-8 z-10 max-w-4xl w-full justify-center animate-fade-in" style={{ animationDelay: '0.4s' }}>
        <LevelButton
          label="EASY"
          color="from-green-500 to-emerald-600"
          hoverColor="from-green-400 to-emerald-500"
          onClick={() => onLevelSelect('easy')}
          delay="0s"
        />
        <LevelButton
          label="MEDIUM"
          color="from-yellow-500 to-orange-600"
          hoverColor="from-yellow-400 to-orange-500"
          onClick={() => onLevelSelect('medium')}
          delay="0.1s"
        />
        <LevelButton
          label="HARD"
          color="from-red-500 to-rose-600"
          hoverColor="from-red-400 to-rose-500"
          onClick={() => onLevelSelect('hard')}
          delay="0.2s"
        />
      </div>

      {/* Instructions Dialog */}
      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="bg-slate-900 border-2 border-cyan-500/30 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-3xl font-bold text-cyan-400 mb-4">How to Play</DialogTitle>
            <DialogDescription className="text-slate-200 space-y-4 text-base">
              <div className="bg-slate-800/50 p-4 rounded-lg border border-cyan-500/20">
                <h3 className="text-cyan-300 font-bold mb-2 text-lg">🎮 Controls</h3>
                <div className="space-y-2">
                  <p><strong className="text-pink-400">Player 1 (Cyan):</strong></p>
                  <p className="ml-4">• A / D - Move Left/Right</p>
                  <p className="ml-4">• W - Jump</p>

                  <p className="mt-3"><strong className="text-pink-400">Player 2 (Pink):</strong></p>
                  <p className="ml-4">• Arrow Left / Right - Move Left/Right</p>
                  <p className="ml-4">• Arrow Up - Jump</p>
                </div>
              </div>

              <div className="bg-slate-800/50 p-4 rounded-lg border border-pink-500/20">
                <h3 className="text-pink-300 font-bold mb-2 text-lg">🎯 Objective</h3>
                <p>Guide both characters to their matching colored flags within 60 seconds!</p>
                <p className="mt-2">• Cyan player must reach the cyan flag</p>
                <p>• Pink player must reach the pink flag</p>
                <p className="mt-2 text-yellow-300">⚠️ Both players must reach their flags to win!</p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes gradient {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        .animate-fade-in {
          animation: fade-in 0.8s ease-out forwards;
          opacity: 0;
        }
        .animate-gradient {
          background-size: 200% 100%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  );
}

// Level Button Component
function LevelButton({ label, color, hoverColor, onClick, delay }: LevelButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`group relative px-12 py-8 text-2xl font-black bg-gradient-to-br ${color} hover:${hoverColor} text-white rounded-2xl shadow-2xl hover:shadow-cyan-500/50 transition-all duration-300 hover:scale-110 border-4 border-white/20 hover:border-white/40 flex-1 max-w-xs overflow-hidden animate-fade-in`}
      style={{
        animationDelay: delay,
        fontFamily: "'Bebas Neue', 'Arial Black', sans-serif",
        letterSpacing: '0.05em'
      }}
    >
      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-all duration-300" />
      <div className="relative z-10 drop-shadow-lg">{label}</div>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>
    </button>
  );
}

// Game Page Component
function GamePage({ level, onReturnToLevelSelect }: GamePageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<KaboomCtx | null>(null);
  const [gameState, setGameState] = useState<GameStateType>('playing');
  const [timeLeft, setTimeLeft] = useState<number>(60);

useEffect( () => {}, [timeLeft])

  useEffect(() => {
    // Load Kaboom.js from CDN
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/kaboom@3000.0.1/dist/kaboom.js';
    script.async = true;
    script.onload = () => initGame();
    document.body.appendChild(script);

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy();
      }
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [level]);

  const initGame = (): void => {
    if (!window.kaboom || gameRef.current || !canvasRef.current) return;

    const k: KaboomCtx = window.kaboom({
      canvas: canvasRef.current,
      width: 1200,
      height: 600,
      background: [15, 23, 42], // slate-900
    });

    gameRef.current = k;

    // Game constants
    const MOVE_SPEED: number = 200;
    const JUMP_FORCE: number = 500;
    // const PLAYER_SIZE: number = 32;
    const FLAG_SIZE: number = 40;

    // Define level layouts
    const levels: Record<LevelType, string[]> = {
      easy: [
        '=                                     =',
        '=                                     =',
        '=                                     =',
        '=  1                              2   =',
        '===    ===                   ===    ===',
        '=                                     =',
        '=         ===             ===         =',
        '=                                     =',
        '=F1                              F2   =',
        '=======================================',
      ],
      medium: [
        '=                                     =',
        '=                                     =',
        '=  1                              2   =',
        '=====                          ========',
        '=                                     =',
        '=      ====           ====            =',
        '=                                     =',
        '=           ====   ====               =',
        '=F1                              F2   =',
        '=======================================',
      ],
      hard: [
        '=                                     =',
        '=  1                              2   =',
        '====                              =====',
        '=                                     =',
        '=    ===                    ===       =',
        '=                                     =',
        '=         ===          ===            =',
        '=                                     =',
        '=F1  ===     ===  ===       ===   F2  =',
        '=======================================',
      ],
    };

    // Load current level
    const levelMap: string[] = levels[level] || levels.easy;
    const tileWidth: number = 1200 / levelMap[0].length;
    const tileHeight: number = 600 / levelMap.length;

    // Track player states
    let player1ReachedFlag: boolean = false;
    let player2ReachedFlag: boolean = false;
    let gameEnded: boolean = false;
    let timer: number = 60;

    // Create level
    k.loadSprite('player1', 'data:image/svg+xml;base64,' + btoa(`
      <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="4" fill="#06b6d4"/>
        <circle cx="10" cy="12" r="3" fill="white"/>
        <circle cx="22" cy="12" r="3" fill="white"/>
        <path d="M 8 22 Q 16 26 24 22" stroke="white" stroke-width="2" fill="none"/>
      </svg>
    `));

    k.loadSprite('player2', 'data:image/svg+xml;base64,' + btoa(`
      <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="4" fill="#ec4899"/>
        <circle cx="10" cy="12" r="3" fill="white"/>
        <circle cx="22" cy="12" r="3" fill="white"/>
        <path d="M 8 22 Q 16 26 24 22" stroke="white" stroke-width="2" fill="none"/>
      </svg>
    `));

    // Create scene
    k.scene('game', () => {
      // Set static camera
      k.camPos(600, 300);

      // Add level
      for (let row = 0; row < levelMap.length; row++) {
        for (let col = 0; col < levelMap[row].length; col++) {
          const char: string = levelMap[row][col];
          const x: number = col * tileWidth + tileWidth / 2;
          const y: number = row * tileHeight + tileHeight / 2;

          if (char === '=') {
            // Wall
            k.add([
              k.rect(tileWidth, tileHeight),
              k.pos(x, y),
              k.area(),
              k.body({ isStatic: true }),
              k.color(71, 85, 105), // slate-600
              k.outline(2, k.rgb(148, 163, 184)), // slate-400
              'wall',
            ]);
          } else if (char === '1') {
            // Player 1 (Cyan)
            k.add([
              k.sprite('player1'),
              k.pos(x, y),
              k.area(),
              k.body(),
              k.scale(1),
              'player1',
            ]);
          } else if (char === '2') {
            // Player 2 (Pink)
            k.add([
              k.sprite('player2'),
              k.pos(x, y),
              k.area(),
              k.body(),
              k.scale(1),
              'player2',
            ]);
          } else if (char === 'F1') {
            // Flag 1 (Cyan)
            k.add([
              k.rect(FLAG_SIZE * 0.8, FLAG_SIZE * 1.2),
              k.pos(x, y - FLAG_SIZE / 2),
              k.area(),
              k.color(6, 182, 212), // cyan-500
              k.outline(3, k.rgb(34, 211, 238)), // cyan-400
              'flag1',
            ]);
            // Flag pole
            k.add([
              k.rect(4, FLAG_SIZE * 1.5),
              k.pos(x - FLAG_SIZE * 0.4, y - FLAG_SIZE / 2),
              k.color(148, 163, 184), // slate-400
            ]);
          } else if (char === 'F2') {
            // Flag 2 (Pink)
            k.add([
              k.rect(FLAG_SIZE * 0.8, FLAG_SIZE * 1.2),
              k.pos(x, y - FLAG_SIZE / 2),
              k.area(),
              k.color(236, 72, 153), // pink-500
              k.outline(3, k.rgb(244, 114, 182)), // pink-400
              'flag2',
            ]);
            // Flag pole
            k.add([
              k.rect(4, FLAG_SIZE * 1.5),
              k.pos(x - FLAG_SIZE * 0.4, y - FLAG_SIZE / 2),
              k.color(148, 163, 184), // slate-400
            ]);
          }
        }
      }

      // Timer display
      const timerText = k.add([
        k.text(`Time: ${timer}s`, { size: 32, font: 'sans-serif' }),
        k.pos(600, 30),
        k.anchor('center'),
        k.color(255, 255, 255),
        // k.layer('ui'),
      ]);

      // Timer logic
      k.loop(1, () => {
        if (gameEnded) return;
        timer -= 1;
        timerText.text = `Time: ${timer}s`;
        setTimeLeft(timer);

        if (timer <= 0) {
          gameEnded = true;
          setGameState('lost');
        }
      });

      // Player 1 controls (A, D, W)
      const player1 = k.get('player1')[0];
      if (player1) {
        k.onKeyDown('a', () => {
          if (!player1ReachedFlag && !gameEnded) {
            player1.move(-MOVE_SPEED, 0);
          }
        });
        k.onKeyDown('d', () => {
          if (!player1ReachedFlag && !gameEnded) {
            player1.move(MOVE_SPEED, 0);
          }
        });
        k.onKeyPress('w', () => {
          if (!player1ReachedFlag && !gameEnded && player1.isGrounded()) {
            player1.jump(JUMP_FORCE);
          }
        });
      }

      // Player 2 controls (Arrow keys)
      const player2 = k.get('player2')[0];
      if (player2) {
        k.onKeyDown('left', () => {
          if (!player2ReachedFlag && !gameEnded) {
            player2.move(-MOVE_SPEED, 0);
          }
        });
        k.onKeyDown('right', () => {
          if (!player2ReachedFlag && !gameEnded) {
            player2.move(MOVE_SPEED, 0);
          }
        });
        k.onKeyPress('up', () => {
          if (!player2ReachedFlag && !gameEnded && player2.isGrounded()) {
            player2.jump(JUMP_FORCE);
          }
        });
      }

      // Check collisions with flags
      if (player1) {
        player1.onCollide('flag1', () => {
          if (!player1ReachedFlag) {
            player1ReachedFlag = true;
            checkWinCondition();
          }
        });
      }

      if (player2) {
        player2.onCollide('flag2', () => {
          if (!player2ReachedFlag) {
            player2ReachedFlag = true;
            checkWinCondition();
          }
        });
      }

      function checkWinCondition(): void {
        if (player1ReachedFlag && player2ReachedFlag && !gameEnded) {
          gameEnded = true;
          setGameState('won');
        }
      }
    });

    k.go('game');
  };

  const handleTryAgain = (): void => {
    setGameState('playing');
    setTimeLeft(60);
    if (gameRef.current) {
      gameRef.current.go('game');
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center relative">
      <canvas ref={canvasRef} className="shadow-2xl rounded-lg border-4 border-cyan-500/30" />

      {/* Win State */}
      {gameState === 'won' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-12 rounded-3xl border-4 border-cyan-500 shadow-2xl text-center max-w-md transform scale-100 animate-bounce-in">
            <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-400 mb-6" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              YOU WIN!
            </h2>
            <p className="text-cyan-200 text-xl mb-8">Both players reached their flags!</p>
            <Button
              onClick={onReturnToLevelSelect}
              className="px-8 py-4 text-lg font-bold bg-gradient-to-r from-cyan-600 to-pink-600 hover:from-cyan-500 hover:to-pink-500 text-white rounded-xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
            >
              Return to Level Select
            </Button>
          </div>
        </div>
      )}

      {/* Lose State */}
      {gameState === 'lost' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-12 rounded-3xl border-4 border-pink-500 shadow-2xl text-center max-w-md transform scale-100 animate-bounce-in">
            <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-red-400 mb-6" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              NICE TRY!
            </h2>
            <p className="text-pink-200 text-xl mb-8">Time's up! Try again!</p>
            <div className="flex gap-4">
              <Button
                onClick={handleTryAgain}
                className="flex-1 px-6 py-4 text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
              >
                Try Again
              </Button>
              <Button
                onClick={onReturnToLevelSelect}
                className="flex-1 px-6 py-4 text-lg font-bold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
              >
                Level Select
              </Button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce-in {
          0% {
            transform: scale(0.3);
            opacity: 0;
          }
          50% {
            transform: scale(1.05);
          }
          70% {
            transform: scale(0.9);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-bounce-in {
          animation: bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
      `}</style>
    </div>
  );
}
