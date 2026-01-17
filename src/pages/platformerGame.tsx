import React, { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import { ASSETS, SPRITE_SIZES } from "../gameAssets";

type SavedPlatform = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness: number;
  type: "permanent" | "ground";
};

type SavedFlag = {
  playerType: 1 | 2;
  pole: { x: number; y: number };
  flag: { x: number; y: number };
  raised: boolean;
};

export type SavedLevel = {
  platforms: SavedPlatform[];
  flags: SavedFlag[];
  player1Spawn?: { x: number; y: number };
  player2Spawn?: { x: number; y: number };
};

interface FlagData {
  pole: Matter.Body;
  flag: Matter.Body;
  raised: boolean;
  playerType: 1 | 2;
}

interface PlatformerGameProps {
  level: SavedLevel;
  onWin?: () => void;
  onRestart?: () => void;
}

export const PlatformerGame: React.FC<PlatformerGameProps> = ({
  level,
  onWin,
  onRestart,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const player1Ref = useRef<Matter.Body | null>(null);
  const player2Ref = useRef<Matter.Body | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);

  const player1AnimFrameRef = useRef(0);
  const player2AnimFrameRef = useRef(0);
  const animationTickRef = useRef(0);

  const keysRef = useRef({
    a: false,
    d: false,
    w: false,
    left: false,
    right: false,
    up: false,
  });

  const player1GroundedRef = useRef(false);
  const player2GroundedRef = useRef(false);
  const player1LockedPositionRef = useRef<{ x: number; y: number } | null>(
    null
  );
  const player2LockedPositionRef = useRef<{ x: number; y: number } | null>(
    null
  );
  const player1GroundNormalRef = useRef<{ x: number; y: number } | null>(null);
  const player2GroundNormalRef = useRef<{ x: number; y: number } | null>(null);

  const [gameWon, setGameWon] = useState(false);

  const flagsRef = useRef<FlagData[]>([]);
  const [flagStates, setFlagStates] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = Matter.Engine.create();
    engineRef.current = engine;
    const world = engine.world;
    engine.gravity.y = 1;

    const render = Matter.Render.create({
      element: canvasRef.current,
      engine: engine,
      options: {
        width: 800,
        height: 600,
        wireframes: false,
        background: "#87CEEB",
      },
    });
    renderRef.current = render;

    // Load platforms
    level.platforms.forEach((p) => {
      const centerX = (p.start.x + p.end.x) / 2;
      const centerY = (p.start.y + p.end.y) / 2;
      const length = Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y);
      const angle = Math.atan2(p.end.y - p.start.y, p.end.x - p.start.x);

      let renderOptions: any = {};
      
      if (p.type === "ground") {
        renderOptions = {
          sprite: {
            texture: ASSETS.GROUND,
            xScale: length / 64,
            yScale: p.thickness / 64,
          },
        };
      } else {
        renderOptions = {
          fillStyle: "#3498DB",
        };
      }

      const platform = Matter.Bodies.rectangle(
        centerX,
        centerY,
        length,
        p.thickness,
        {
          isStatic: true,
          angle,
          render: renderOptions,
          friction: 1,
          label: "platform",
        }
      );

      Matter.World.add(world, platform);
    });

    // Load flags
    const nextFlagStates: Record<string, boolean> = {};
    level.flags.forEach((f, idx) => {
      const pole = Matter.Bodies.rectangle(f.pole.x, f.pole.y, 5, 100, {
        isStatic: true,
        render: { fillStyle: "#000000" },
        label: "flagPole",
        isSensor: true,
      });

      const flagTexture = f.playerType === 1 
        ? ASSETS.PLAYER1_FLAG_LOWERED 
        : ASSETS.PLAYER2_FLAG_LOWERED;

      // Position flag in lowered state
      const flagX = f.pole.x + 25;
      const flagY = f.pole.y + 50;

      const flag = Matter.Bodies.rectangle(
        flagX, 
        flagY, 
        SPRITE_SIZES.FLAG_WIDTH, 
        SPRITE_SIZES.FLAG_HEIGHT, 
        {
          isStatic: true,
          render: {
            sprite: {
              texture: flagTexture,
              xScale: 1,
              yScale: 1,
            },
          },
          label: "flag",
          isSensor: true,
        }
      );

      Matter.World.add(world, [pole, flag]);
      flagsRef.current.push({
        pole,
        flag,
        raised: false,
        playerType: f.playerType,
      });

      nextFlagStates[`flag_${idx}`] = false;
    });
    setFlagStates(nextFlagStates);

    // Create players at spawn points
    const player1SpawnX = level.player1Spawn?.x || 100;
    const player1SpawnY = level.player1Spawn?.y || 400;
    const player2SpawnX = level.player2Spawn?.x || 700;
    const player2SpawnY = level.player2Spawn?.y || 400;

    const player1 = Matter.Bodies.rectangle(
      player1SpawnX,
      player1SpawnY,
      SPRITE_SIZES.PLAYER_WIDTH,
      SPRITE_SIZES.PLAYER_HEIGHT,
      {
        friction: 1,
        frictionAir: 0.01,
        frictionStatic: 10,
        restitution: 0,
        inertia: Infinity,
        render: {
          sprite: {
            texture: ASSETS.PLAYER1_IDLE,
            xScale: 1,
            yScale: 1,
          },
        },
        label: "player1",
      }
    );
    player1Ref.current = player1;
    Matter.World.add(world, player1);

    const player2 = Matter.Bodies.rectangle(
      player2SpawnX,
      player2SpawnY,
      SPRITE_SIZES.PLAYER_WIDTH,
      SPRITE_SIZES.PLAYER_HEIGHT,
      {
        friction: 1,
        frictionAir: 0.01,
        frictionStatic: 10,
        restitution: 0,
        inertia: Infinity,
        render: {
          sprite: {
            texture: ASSETS.PLAYER2_IDLE,
            xScale: 1,
            yScale: 1,
          },
        },
        label: "player2",
      }
    );
    player2Ref.current = player2;
    Matter.World.add(world, player2);

    // Collision detection
    Matter.Events.on(engine, "collisionStart", (event) => {
      event.pairs.forEach((pair) => {
        const isPlayer1 =
          pair.bodyA === player1Ref.current ||
          pair.bodyB === player1Ref.current;
        if (isPlayer1) {
          const otherBody =
            pair.bodyA === player1Ref.current ? pair.bodyB : pair.bodyA;

          flagsRef.current.forEach((flagData, index) => {
            if (
              flagData.playerType === 1 &&
              otherBody === flagData.flag &&
              !flagData.raised
            ) {
              flagData.raised = true;
              setFlagStates((prev) => ({ ...prev, [`flag_${index}`]: true }));
            }
          });

          if (!otherBody.isSensor) {
            const normal =
              pair.bodyA === player1Ref.current
                ? pair.collision.normal
                : { x: -pair.collision.normal.x, y: -pair.collision.normal.y };

            if (normal.y < -0.5) {
              player1GroundedRef.current = true;
            }
          }
        }

        const isPlayer2 =
          pair.bodyA === player2Ref.current ||
          pair.bodyB === player2Ref.current;
        if (isPlayer2) {
          const otherBody =
            pair.bodyA === player2Ref.current ? pair.bodyB : pair.bodyA;

          flagsRef.current.forEach((flagData, index) => {
            if (
              flagData.playerType === 2 &&
              otherBody === flagData.flag &&
              !flagData.raised
            ) {
              flagData.raised = true;
              setFlagStates((prev) => ({ ...prev, [`flag_${index}`]: true }));
            }
          });

          if (!otherBody.isSensor) {
            const normal =
              pair.bodyA === player2Ref.current
                ? pair.collision.normal
                : { x: -pair.collision.normal.x, y: -pair.collision.normal.y };

            if (normal.y < -0.5) {
              player2GroundedRef.current = true;
            }
          }
        }
      });
    });

    Matter.Events.on(engine, "collisionActive", (event) => {
      let bestNormal1: { x: number; y: number } | null = null;
      let bestNormal2: { x: number; y: number } | null = null;

      event.pairs.forEach((pair) => {
        const isPlayer1 =
          pair.bodyA === player1Ref.current ||
          pair.bodyB === player1Ref.current;
        if (isPlayer1) {
          const otherBody =
            pair.bodyA === player1Ref.current ? pair.bodyB : pair.bodyA;
          if (otherBody.isSensor) return;

          const normal =
            pair.bodyA === player1Ref.current
              ? pair.collision.normal
              : { x: -pair.collision.normal.x, y: -pair.collision.normal.y };

          if (normal.y < -0.5) {
            if (!bestNormal1 || normal.y < bestNormal1.y) bestNormal1 = normal;
          }
        }

        const isPlayer2 =
          pair.bodyA === player2Ref.current ||
          pair.bodyB === player2Ref.current;
        if (isPlayer2) {
          const otherBody =
            pair.bodyA === player2Ref.current ? pair.bodyB : pair.bodyA;
          if (otherBody.isSensor) return;

          const normal =
            pair.bodyA === player2Ref.current
              ? pair.collision.normal
              : { x: -pair.collision.normal.x, y: -pair.collision.normal.y };

          if (normal.y < -0.5) {
            if (!bestNormal2 || normal.y < bestNormal2.y) bestNormal2 = normal;
          }
        }
      });

      if (bestNormal1) {
        player1GroundedRef.current = true;
        player1GroundNormalRef.current = bestNormal1;
      } else {
        player1GroundedRef.current = false;
        player1GroundNormalRef.current = null;
        player1LockedPositionRef.current = null;
      }

      if (bestNormal2) {
        player2GroundedRef.current = true;
        player2GroundNormalRef.current = bestNormal2;
      } else {
        player2GroundedRef.current = false;
        player2GroundNormalRef.current = null;
        player2LockedPositionRef.current = null;
      }
    });

    Matter.Events.on(engine, "collisionEnd", (event) => {
      event.pairs.forEach((pair) => {
        if (
          pair.bodyA === player1Ref.current ||
          pair.bodyB === player1Ref.current
        ) {
          player1GroundedRef.current = false;
          player1GroundNormalRef.current = null;
          player1LockedPositionRef.current = null;
        }
        if (
          pair.bodyA === player2Ref.current ||
          pair.bodyB === player2Ref.current
        ) {
          player2GroundedRef.current = false;
          player2GroundNormalRef.current = null;
          player2LockedPositionRef.current = null;
        }
      });
    });

    const applySlopeStick = (
      body: Matter.Body,
      groundNormal: { x: number; y: number } | null,
      isGrounded: boolean,
      moving: boolean
    ) => {
      const n = groundNormal;
      if (!body || !n || !isGrounded) return;

      const tx = -n.y;
      const ty = n.x;

      const vx = body.velocity.x;
      const vy = body.velocity.y;

      const vAlong = vx * tx + vy * ty;

      const kill = moving ? 0.65 : 1.0;

      const newVx = vx - vAlong * tx * kill;
      const newVy = vy - vAlong * ty * kill;

      Matter.Body.setVelocity(body, { x: newVx, y: newVy });
    };

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "a" || e.key === "A") {
        keysRef.current.a = true;
        player1LockedPositionRef.current = null;
      }
      if (e.key === "d" || e.key === "D") {
        keysRef.current.d = true;
        player1LockedPositionRef.current = null;
      }
      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        keysRef.current.w = true;
        player1LockedPositionRef.current = null;
      }

      if (e.key === "ArrowLeft") {
        keysRef.current.left = true;
        player2LockedPositionRef.current = null;
      }
      if (e.key === "ArrowRight") {
        keysRef.current.right = true;
        player2LockedPositionRef.current = null;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        keysRef.current.up = true;
        player2LockedPositionRef.current = null;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "a" || e.key === "A") keysRef.current.a = false;
      if (e.key === "d" || e.key === "D") keysRef.current.d = false;
      if (e.key === "w" || e.key === "W") keysRef.current.w = false;

      if (e.key === "ArrowLeft") keysRef.current.left = false;
      if (e.key === "ArrowRight") keysRef.current.right = false;
      if (e.key === "ArrowUp") keysRef.current.up = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Game loop
    const gameLoop = () => {
      if (!player1Ref.current || !player2Ref.current) return;

      const moveSpeed = 5;
      const jumpForce = -0.04;
      const maxFallSpeed = 15;

      // Player 1 movement
      const player1Moving = keysRef.current.a || keysRef.current.d;
      const player1NoKeys =
        !keysRef.current.a && !keysRef.current.d && !keysRef.current.w;

      applySlopeStick(
        player1Ref.current,
        player1GroundNormalRef.current,
        player1GroundedRef.current,
        player1Moving
      );

      if (keysRef.current.a) {
        Matter.Body.setVelocity(player1Ref.current, {
          x: -moveSpeed,
          y: player1Ref.current.velocity.y,
        });
      } else if (keysRef.current.d) {
        Matter.Body.setVelocity(player1Ref.current, {
          x: moveSpeed,
          y: player1Ref.current.velocity.y,
        });
      } else if (player1GroundedRef.current && player1NoKeys) {
        if (!player1LockedPositionRef.current) {
          player1LockedPositionRef.current = {
            x: player1Ref.current.position.x,
            y: player1Ref.current.position.y,
          };
        }
        Matter.Body.setPosition(
          player1Ref.current,
          player1LockedPositionRef.current
        );
        Matter.Body.setVelocity(player1Ref.current, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(player1Ref.current, 0);
      } else {
        Matter.Body.setVelocity(player1Ref.current, {
          x: player1Ref.current.velocity.x * 0.9,
          y: player1Ref.current.velocity.y,
        });
      }

      if (player1Ref.current.velocity.y > maxFallSpeed) {
        Matter.Body.setVelocity(player1Ref.current, {
          x: player1Ref.current.velocity.x,
          y: maxFallSpeed,
        });
      }

      if (keysRef.current.w && player1GroundedRef.current) {
        Matter.Body.applyForce(
          player1Ref.current,
          player1Ref.current.position,
          {
            x: 0,
            y: jumpForce,
          }
        );
        keysRef.current.w = false;
      }

      // Player 2 movement
      const player2Moving = keysRef.current.left || keysRef.current.right;
      const player2NoKeys =
        !keysRef.current.left && !keysRef.current.right && !keysRef.current.up;

      applySlopeStick(
        player2Ref.current,
        player2GroundNormalRef.current,
        player2GroundedRef.current,
        player2Moving
      );

      if (keysRef.current.left) {
        Matter.Body.setVelocity(player2Ref.current, {
          x: -moveSpeed,
          y: player2Ref.current.velocity.y,
        });
      } else if (keysRef.current.right) {
        Matter.Body.setVelocity(player2Ref.current, {
          x: moveSpeed,
          y: player2Ref.current.velocity.y,
        });
      } else if (player2GroundedRef.current && player2NoKeys) {
        if (!player2LockedPositionRef.current) {
          player2LockedPositionRef.current = {
            x: player2Ref.current.position.x,
            y: player2Ref.current.position.y,
          };
        }
        Matter.Body.setPosition(
          player2Ref.current,
          player2LockedPositionRef.current
        );
        Matter.Body.setVelocity(player2Ref.current, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(player2Ref.current, 0);
      } else {
        Matter.Body.setVelocity(player2Ref.current, {
          x: player2Ref.current.velocity.x * 0.9,
          y: player2Ref.current.velocity.y,
        });
      }

      if (player2Ref.current.velocity.y > maxFallSpeed) {
        Matter.Body.setVelocity(player2Ref.current, {
          x: player2Ref.current.velocity.x,
          y: maxFallSpeed,
        });
      }

      if (keysRef.current.up && player2GroundedRef.current) {
        Matter.Body.applyForce(
          player2Ref.current,
          player2Ref.current.position,
          {
            x: 0,
            y: jumpForce,
          }
        );
        keysRef.current.up = false;
      }

      // Player animation
      animationTickRef.current++;
      if (animationTickRef.current % 10 === 0) {
        if (player1Ref.current) {
          const isMoving = keysRef.current.a || keysRef.current.d;
          if (isMoving) {
            player1AnimFrameRef.current = 1 - player1AnimFrameRef.current;
            const texture = player1AnimFrameRef.current === 0 
              ? ASSETS.PLAYER1_WALK_1 
              : ASSETS.PLAYER1_WALK_2;
            (player1Ref.current.render as any).sprite.texture = texture;
          } else {
            (player1Ref.current.render as any).sprite.texture = ASSETS.PLAYER1_IDLE;
            player1AnimFrameRef.current = 0;
          }
        }

        if (player2Ref.current) {
          const isMoving = keysRef.current.left || keysRef.current.right;
          if (isMoving) {
            player2AnimFrameRef.current = 1 - player2AnimFrameRef.current;
            const texture = player2AnimFrameRef.current === 0 
              ? ASSETS.PLAYER2_WALK_1 
              : ASSETS.PLAYER2_WALK_2;
            (player2Ref.current.render as any).sprite.texture = texture;
          } else {
            (player2Ref.current.render as any).sprite.texture = ASSETS.PLAYER2_IDLE;
            player2AnimFrameRef.current = 0;
          }
        }
      }
    };

    Matter.Events.on(engine, "beforeUpdate", gameLoop);

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
    Matter.Render.run(render);

    return () => {
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
      Matter.Events.off(engine, "beforeUpdate", gameLoop);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      render.canvas.remove();
    };
  }, [level]);

  // Update flag sprites and positions when raised
  useEffect(() => {
    flagsRef.current.forEach((flagData, index) => {
      const isRaised = flagStates[`flag_${index}`] && flagData.raised;
      
      const texture = isRaised
        ? (flagData.playerType === 1 ? ASSETS.PLAYER1_FLAG_RAISED : ASSETS.PLAYER2_FLAG_RAISED)
        : (flagData.playerType === 1 ? ASSETS.PLAYER1_FLAG_LOWERED : ASSETS.PLAYER2_FLAG_LOWERED);
      
      (flagData.flag.render as any).sprite.texture = texture;
      
      if (isRaised) {
        const poleX = flagData.pole.position.x;
        const poleY = flagData.pole.position.y;
        const poleHeight = 100;

        Matter.Body.setPosition(flagData.flag, {
          x: poleX + 25,
          y: poleY - poleHeight / 2 + 10,
        });
      }
    });
  }, [flagStates]);

  // Check win condition
  useEffect(() => {
    if (flagsRef.current.length > 0) {
      const allRaised = flagsRef.current.every((flag) => flag.raised);
      if (allRaised && !gameWon) {
        setGameWon(true);
        if (onWin) onWin();
      }
    }
  }, [flagStates, gameWon, onWin]);

  const handleRestart = () => {
    if (onRestart) {
      onRestart();
    } else {
      window.location.reload();
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={canvasRef}
        style={{
          display: "flex",
          justifyContent: "center",
        }}
      />

      {gameWon && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            zIndex: 1000,
          }}
        >
          <h1
            style={{
              fontSize: "72px",
              margin: "20px",
              textShadow: "3px 3px 6px rgba(0,0,0,0.8)",
            }}
          >
            You Win!
          </h1>
          <button
            onClick={handleRestart}
            style={{
              padding: "15px 30px",
              fontSize: "20px",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "bold",
              boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = "#45a049")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = "#4CAF50")
            }
          >
            Restart
          </button>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: "10px", fontSize: "14px" }}>
        <div style={{ marginBottom: "5px" }}>
          <span style={{ color: "#00FF00", fontWeight: "bold" }}>
            Player 1 (Green)
          </span>
          : A = Left, D = Right, W = Jump
        </div>
        <div>
          <span style={{ color: "#FFA500", fontWeight: "bold" }}>
            Player 2 (Orange)
          </span>
          : ← = Left, → = Right, ↑ = Jump
        </div>
      </div>
    </div>
  );
};

export default PlatformerGame;