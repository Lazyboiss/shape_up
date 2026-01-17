import React, { useEffect, useRef, useState } from "react";
import Matter from "matter-js";

interface LineSegment {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface PlatformerGameProps {
  lines?: LineSegment[];
  initialLevel?: SavedLevel; // ✅ add this
  onRestart?: () => void;
  onReturnToLevelSelect?: () => void;
}

const PLATFORM_THICKNESS = 10;

type PlatformMeta = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness: number;
};

const makePlatformFromEndpoints = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  thickness: number
) => {
  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  const platform = Matter.Bodies.rectangle(
    centerX,
    centerY,
    length,
    thickness,
    {
      isStatic: true,
      angle,
      render: { fillStyle: "#9B59B6" },
      friction: 1,
      label: "platform",
    }
  );

  // ✅ attach exact reload metadata
  (platform as any).platformMeta = {
    start,
    end,
    thickness,
  } satisfies PlatformMeta;

  return platform;
};

type ToolMode =
  | "select"
  | "platform"
  | "player1Flag"
  | "player2Flag"
  | "delete";

type SavedPlatform = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness: number;
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
};

interface FlagData {
  pole: Matter.Body;
  flag: Matter.Body;
  raised: boolean;
  playerType: 1 | 2;
}

export const PlatformerGame: React.FC<PlatformerGameProps> = ({
  lines = [],
  initialLevel,
  onRestart,
  onReturnToLevelSelect,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const player1Ref = useRef<Matter.Body | null>(null);
  const player2Ref = useRef<Matter.Body | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
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

  const [firstClickPoint, setFirstClickPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [menuOpen, setMenuOpen] = useState(true);
  const [gameWon, setGameWon] = useState(false);

  const flagsRef = useRef<FlagData[]>([]);
  const [flagStates, setFlagStates] = useState<{ [key: string]: boolean }>({});
  const platformsRef = useRef<Matter.Body[]>([]);

  const r2 = (n: number) => Math.round(n * 100) / 100;

  const logPlatform = (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => {
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);

    console.log("[PLACE PLATFORM]", {
      start: { x: r2(start.x), y: r2(start.y) },
      end: { x: r2(end.x), y: r2(end.y) },
      center: { x: r2(centerX), y: r2(centerY) },
      length: r2(length),
      angleRad: r2(angle),
      angleDeg: r2((angle * 180) / Math.PI),
    });
  };

  const logFlag = (
    playerType: 1 | 2,
    poleX: number,
    poleY: number,
    flagX: number,
    flagY: number
  ) => {
    console.log(`[PLACE FLAG P${playerType}]`, {
      pole: { x: r2(poleX), y: r2(poleY) },
      flag: { x: r2(flagX), y: r2(flagY) },
    });
  };

  const dumpAllPlaced = () => {
    const platforms: SavedPlatform[] = platformsRef.current.map((b) => {
      const meta = (b as any).platformMeta as PlatformMeta | undefined;

      // Fallback if older platforms exist without meta
      if (!meta) {
        return {
          start: { x: r2(b.position.x - 50), y: r2(b.position.y) },
          end: { x: r2(b.position.x + 50), y: r2(b.position.y) },
          thickness: PLATFORM_THICKNESS,
        };
      }

      return {
        start: { x: r2(meta.start.x), y: r2(meta.start.y) },
        end: { x: r2(meta.end.x), y: r2(meta.end.y) },
        thickness: meta.thickness,
      };
    });

    const flags: SavedFlag[] = flagsRef.current.map((f) => ({
      playerType: f.playerType,
      pole: { x: r2(f.pole.position.x), y: r2(f.pole.position.y) },
      flag: { x: r2(f.flag.position.x), y: r2(f.flag.position.y) },
      raised: f.raised,
    }));

    const level: SavedLevel = { platforms, flags };

    console.log("[LEVEL JSON]", level);
  };

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

    // Create Player 1 (Green)
    const player1 = Matter.Bodies.rectangle(100, 400, 30, 40, {
      friction: 1,
      frictionAir: 0.01,
      frictionStatic: 10,
      restitution: 0,
      inertia: Infinity,
      render: { fillStyle: "#00FF00" },
      label: "player1",
    });
    player1Ref.current = player1;
    Matter.World.add(world, player1);

    // Create Player 2 (Orange)
    const player2 = Matter.Bodies.rectangle(700, 400, 30, 40, {
      friction: 1,
      frictionAir: 0.01,
      frictionStatic: 10,
      restitution: 0,
      inertia: Infinity,
      render: { fillStyle: "#FFA500" },
      label: "player2",
    });
    player2Ref.current = player2;
    Matter.World.add(world, player2);

    // Create ground with varying slopes
    const groundSegments = [
      Matter.Bodies.rectangle(150, 550, 300, 20, {
        isStatic: true,
        angle: 0,
        render: { fillStyle: "#8B4513" },
        friction: 1,
        label: "ground",
      }),
      Matter.Bodies.rectangle(400, 500, 200, 20, {
        isStatic: true,
        angle: -Math.PI / 6,
        render: { fillStyle: "#8B4513" },
        friction: 1,
        label: "ground",
      }),
      Matter.Bodies.rectangle(600, 500, 200, 20, {
        isStatic: true,
        angle: Math.PI / 6,
        render: { fillStyle: "#8B4513" },
        friction: 1,
        label: "ground",
      }),
      Matter.Bodies.rectangle(750, 550, 100, 20, {
        isStatic: true,
        angle: 0,
        render: { fillStyle: "#8B4513" },
        friction: 1,
        label: "ground",
      }),
    ];
    Matter.World.add(world, groundSegments);

    // Create custom line segments
    const lineSegments = lines.map((line) => {
      const centerX = (line.start.x + line.end.x) / 2;
      const centerY = (line.start.y + line.end.y) / 2;
      const length = Math.sqrt(
        Math.pow(line.end.x - line.start.x, 2) +
          Math.pow(line.end.y - line.start.y, 2)
      );
      const angle = Math.atan2(
        line.end.y - line.start.y,
        line.end.x - line.start.x
      );

      return Matter.Bodies.rectangle(centerX, centerY, length, 10, {
        isStatic: true,
        angle: angle,
        render: { fillStyle: "#4ECDC4" },
        friction: 1,
        label: "ground",
      });
    });
    Matter.World.add(world, lineSegments);

    // ---- Load initialLevel (if provided) ----
    if (initialLevel) {
      // Platforms
      initialLevel.platforms.forEach((p) => {
        const platform = makePlatformFromEndpoints(p.start, p.end, p.thickness);
        Matter.World.add(world, platform);
        platformsRef.current.push(platform);
      });

      // Flags
      const nextFlagStates: Record<string, boolean> = {};

      initialLevel.flags.forEach((f, idx) => {
        const pole = Matter.Bodies.rectangle(f.pole.x, f.pole.y, 5, 100, {
          isStatic: true,
          render: { fillStyle: "#000000" },
          label: "flagPole",
          isSensor: true,
        });

        const flagColor = f.playerType === 1 ? "#00FF00" : "#FFA500";

        const flag = Matter.Bodies.rectangle(
          f.flag.x,
          f.flag.y + 50 + 30,
          30,
          20,
          {
            isStatic: true,
            render: { fillStyle: flagColor },
            label: "flag",
            isSensor: true,
          }
        );

        Matter.World.add(world, [pole, flag]);
        flagsRef.current.push({
          pole,
          flag,
          raised: f.raised,
          playerType: f.playerType,
        });

        nextFlagStates[`flag_${idx}`] = f.raised;
      });

      setFlagStates(nextFlagStates);
    }

    // Collision detection
    Matter.Events.on(engine, "collisionStart", (event) => {
      event.pairs.forEach((pair) => {
        // Check Player 1 collisions
        const isPlayer1 =
          pair.bodyA === player1Ref.current ||
          pair.bodyB === player1Ref.current;
        if (isPlayer1) {
          const otherBody =
            pair.bodyA === player1Ref.current ? pair.bodyB : pair.bodyA;

          // Check if Player 1 touched any Player 1 flag
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

          // Ground collision for Player 1
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

        // Check Player 2 collisions
        const isPlayer2 =
          pair.bodyA === player2Ref.current ||
          pair.bodyB === player2Ref.current;
        if (isPlayer2) {
          const otherBody =
            pair.bodyA === player2Ref.current ? pair.bodyB : pair.bodyA;

          // Check if Player 2 touched any Player 2 flag
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

          // Ground collision for Player 2
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
        // Player 1
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

        // Player 2
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
  }, [lines, initialLevel]);

  // Update flag positions when raised
  useEffect(() => {
    flagsRef.current.forEach((flagData, index) => {
      if (flagStates[`flag_${index}`] && flagData.raised) {
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

  // Check win condition - all flags must be raised
  useEffect(() => {
    if (flagsRef.current.length > 0) {
      const allRaised = flagsRef.current.every((flag) => flag.raised);
      if (allRaised && !gameWon) {
        setGameWon(true);
        dumpAllPlaced();
      }
    }
  }, [flagStates, gameWon]);

  // Handle canvas clicks
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (gameWon || !renderRef.current || !engineRef.current) return;

    const canvas = renderRef.current.canvas;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (toolMode === "platform") {
      if (!firstClickPoint) {
        setFirstClickPoint({ x, y });
      } else {
        const start = firstClickPoint;
        const end = { x, y };

        logPlatform(start, end);

        const platform = makePlatformFromEndpoints(
          start,
          end,
          PLATFORM_THICKNESS
        );

        Matter.World.add(engineRef.current.world, platform);
        platformsRef.current.push(platform);

        setFirstClickPoint(null);
      }
    } else if (toolMode === "player1Flag") {
      // Create Player 1 flag at clicked position
      const pole = Matter.Bodies.rectangle(x, y, 5, 100, {
        isStatic: true,
        render: { fillStyle: "#000000" },
        label: "flagPole",
        isSensor: true,
      });

      const flag = Matter.Bodies.rectangle(x + 25, y + 50, 30, 20, {
        isStatic: true,
        render: { fillStyle: "#00FF00" },
        label: "flag",
        isSensor: true,
      });

      logFlag(1, x, y, x + 25, y + 50);

      Matter.World.add(engineRef.current.world, [pole, flag]);
      flagsRef.current.push({ pole, flag, raised: false, playerType: 1 });
      setFlagStates((prev) => ({
        ...prev,
        [`flag_${flagsRef.current.length - 1}`]: false,
      }));
    } else if (toolMode === "player2Flag") {
      // Create Player 2 flag at clicked position
      const pole = Matter.Bodies.rectangle(x, y, 5, 100, {
        isStatic: true,
        render: { fillStyle: "#000000" },
        label: "flagPole",
        isSensor: true,
      });

      logFlag(2, x, y, x + 25, y + 50);

      const flag = Matter.Bodies.rectangle(x + 25, y + 50, 30, 20, {
        isStatic: true,
        render: { fillStyle: "#FFA500" },
        label: "flag",
        isSensor: true,
      });

      Matter.World.add(engineRef.current.world, [pole, flag]);
      flagsRef.current.push({ pole, flag, raised: false, playerType: 2 });
      setFlagStates((prev) => ({
        ...prev,
        [`flag_${flagsRef.current.length - 1}`]: false,
      }));
    } else if (toolMode === "delete") {
      // Find clicked body
      const bodies = Matter.Query.point(engineRef.current.world.bodies, {
        x,
        y,
      });

      for (const body of bodies) {
        // Check if it's a platform
        if (body.label === "platform") {
          console.log("[DELETE PLATFORM]", {
            center: { x: r2(body.position.x), y: r2(body.position.y) },
            angleDeg: r2((body.angle * 180) / Math.PI),
            bounds: {
              min: { x: r2(body.bounds.min.x), y: r2(body.bounds.min.y) },
              max: { x: r2(body.bounds.max.x), y: r2(body.bounds.max.y) },
            },
          });

          Matter.World.remove(engineRef.current.world, body);
          platformsRef.current = platformsRef.current.filter((p) => p !== body);
          break;
        }

        // Check if it's a flag or pole
        const flagIndex = flagsRef.current.findIndex(
          (f) => f.flag === body || f.pole === body
        );
        if (flagIndex !== -1) {
          const flagData = flagsRef.current[flagIndex];

          console.log("[DELETE FLAG]", {
            playerType: flagData.playerType,
            pole: {
              x: r2(flagData.pole.position.x),
              y: r2(flagData.pole.position.y),
            },
            flag: {
              x: r2(flagData.flag.position.x),
              y: r2(flagData.flag.position.y),
            },
          });

          Matter.World.remove(engineRef.current.world, [
            flagData.pole,
            flagData.flag,
          ]);
          flagsRef.current.splice(flagIndex, 1);

          // Update flag states
          const newFlagStates: { [key: string]: boolean } = {};
          flagsRef.current.forEach((_, idx) => {
            newFlagStates[`flag_${idx}`] = flagsRef.current[idx].raised;
          });
          setFlagStates(newFlagStates);
          break;
        }
      }
    }
  };

  const handleRestart = () => {
    setGameWon(false);
    if (onRestart) {
      onRestart();
    } else {
      window.location.reload();
    }
  };

  const handleReturnToLevelSelect = () => {
    if (onReturnToLevelSelect) {
      onReturnToLevelSelect();
    } else {
      alert("Returning to level select...");
    }
  };

  const getCursor = () => {
    if (gameWon) return "default";
    if (toolMode === "platform" && firstClickPoint) return "crosshair";
    if (
      toolMode === "platform" ||
      toolMode === "player1Flag" ||
      toolMode === "player2Flag"
    )
      return "pointer";
    if (toolMode === "delete") return "not-allowed";
    return "default";
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Collapsible Menu */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          zIndex: 100,
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          borderRadius: "8px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
          padding: "10px",
          minWidth: "150px",
        }}
      >
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            width: "100%",
            padding: "8px",
            backgroundColor: "#333",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
            marginBottom: menuOpen ? "10px" : "0",
          }}
        >
          {menuOpen ? "▼ Tools" : "► Tools"}
        </button>

        {menuOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <button
              onClick={() => {
                setToolMode("select");
                setFirstClickPoint(null);
              }}
              style={{
                padding: "8px",
                backgroundColor: toolMode === "select" ? "#4CAF50" : "#f0f0f0",
                color: toolMode === "select" ? "white" : "black",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Select
            </button>
            <button
              onClick={() => {
                setToolMode("platform");
                setFirstClickPoint(null);
              }}
              style={{
                padding: "8px",
                backgroundColor:
                  toolMode === "platform" ? "#9B59B6" : "#f0f0f0",
                color: toolMode === "platform" ? "white" : "black",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Platform
            </button>
            <button
              onClick={() => {
                setToolMode("player1Flag");
                setFirstClickPoint(null);
              }}
              style={{
                padding: "8px",
                backgroundColor:
                  toolMode === "player1Flag" ? "#00FF00" : "#f0f0f0",
                color: toolMode === "player1Flag" ? "white" : "black",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Player 1 Flag
            </button>
            <button
              onClick={() => {
                setToolMode("player2Flag");
                setFirstClickPoint(null);
              }}
              style={{
                padding: "8px",
                backgroundColor:
                  toolMode === "player2Flag" ? "#FFA500" : "#f0f0f0",
                color: toolMode === "player2Flag" ? "white" : "black",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Player 2 Flag
            </button>
            <button
              onClick={() => {
                setToolMode("delete");
                setFirstClickPoint(null);
              }}
              style={{
                padding: "8px",
                backgroundColor: toolMode === "delete" ? "#f44336" : "#f0f0f0",
                color: toolMode === "delete" ? "white" : "black",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <div
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{
          display: "flex",
          justifyContent: "center",
          cursor: getCursor(),
        }}
      />

      {firstClickPoint && toolMode === "platform" && !gameWon && (
        <div
          style={{
            textAlign: "center",
            marginTop: "10px",
            color: "#9B59B6",
            fontWeight: "bold",
          }}
        >
          First point set at ({Math.round(firstClickPoint.x)},{" "}
          {Math.round(firstClickPoint.y)}). Click again to create platform.
        </div>
      )}

      {/* Win overlay */}
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
          <div style={{ display: "flex", gap: "20px", marginTop: "30px" }}>
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
            <button
              onClick={handleReturnToLevelSelect}
              style={{
                padding: "15px 30px",
                fontSize: "20px",
                backgroundColor: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
                boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor = "#0b7dda")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "#2196F3")
              }
            >
              Return to Level Select
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
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
