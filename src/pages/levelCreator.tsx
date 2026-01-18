import React, { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import { ASSETS, SPRITE_SIZES } from "../gameAssets";
import { cn } from "@/lib/utils";

const PLATFORM_THICKNESS = 10;

type PlatformMeta = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness: number;
};

type PlatformType = "temporary" | "permanent" | "ground";

type PlatformData = {
  body: Matter.Body;
  type: PlatformType;
  meta: PlatformMeta;
};

type SpawnPoint = {
  x: number;
  y: number;
};

type ToolMode =
  | "select"
  | "temporaryPlatform"
  | "permanentPlatform"
  | "ground"
  | "player1Spawn"
  | "player2Spawn"
  | "player1Flag"
  | "player2Flag"
  | "delete";

type SavedPlatform = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness: number;
  type: "permanent" | "ground";
};

type SavedFlag = {
  playerType: 1 | 2;
  flag: { x: number; y: number };
  raised: boolean;
};

export type SavedLevel = {
  platforms: SavedPlatform[];
  flags: SavedFlag[];
  player1Spawn?: SpawnPoint;
  player2Spawn?: SpawnPoint;
};

interface FlagData {
  flag: Matter.Body;
  raised: boolean;
  playerType: 1 | 2;
}

interface LevelCreatorProps {
  onTestLevel?: (level: SavedLevel) => void;
  showCustomTools?: boolean;
  loadLevel?: SavedLevel;
}

const makePlatformFromEndpoints = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  thickness: number,
  type: PlatformType
) => {
  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  let renderOptions: any = {};

  if (type === "ground") {
    renderOptions = {
      sprite: {
        texture: ASSETS.GROUND,
        xScale: length / 500,
        yScale: thickness / 400,
      },
    };
  } else if (type === "permanent") {
    renderOptions = {
      sprite: {
        texture: ASSETS.FIXED_PLATFORM,
        xScale: length / 500,
        yScale: thickness / 64,
      }
    };
  } else {
    // temporary
    renderOptions = {
      sprite: {
        texture: ASSETS.POSE_PLATFORM,
        xScale: length / 500,
        yScale: thickness / 64,
      },
    };
  }

  const platform = Matter.Bodies.rectangle(
    centerX,
    centerY,
    length,
    thickness,
    {
      isStatic: true,
      angle,
      render: renderOptions,
      friction: 1,
      label: "platform",
    }
  );

  (platform as any).platformMeta = {
    start,
    end,
    thickness,
  } satisfies PlatformMeta;

  return platform;
};

const createSpawnMarker = (x: number, y: number, playerType: 1 | 2) => {
  const color = playerType === 1 ? "#00FF00" : "#FFA500";
  const marker = Matter.Bodies.circle(x, y, 15, {
    isStatic: true,
    render: {
      fillStyle: color,
      strokeStyle: "#000000",
      lineWidth: 3,
    },
    isSensor: true,
    label: `spawn${playerType}Marker`,
  });
  return marker;
};

export const LevelCreator: React.FC<LevelCreatorProps> = ({
  showCustomTools = true,
  loadLevel,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const player1Ref = useRef<Matter.Body | null>(null);
  const player2Ref = useRef<Matter.Body | null>(null);
  const attemptStartedRef = useRef(false);

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

  const [firstClickPoint, setFirstClickPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [menuOpen, setMenuOpen] = useState(true);
  const [attemptStarted, setAttemptStarted] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [saveFilename, setSaveFilename] = useState("");

  const flagsRef = useRef<FlagData[]>([]);
  const [flagStates, setFlagStates] = useState<{ [key: string]: boolean }>({});
  const platformsRef = useRef<PlatformData[]>([]);

  const player1SpawnRef = useRef<SpawnPoint | null>(null);
  const player2SpawnRef = useRef<SpawnPoint | null>(null);
  const player1SpawnMarkerRef = useRef<Matter.Body | null>(null);
  const player2SpawnMarkerRef = useRef<Matter.Body | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const r2 = (n: number) => Math.round(n * 100) / 100;

  const logPlatform = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    type: PlatformType
  ) => {
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);

    console.log(`[PLACE PLATFORM - ${type.toUpperCase()}]`, {
      start: { x: r2(start.x), y: r2(start.y) },
      end: { x: r2(end.x), y: r2(end.y) },
      center: { x: r2(centerX), y: r2(centerY) },
      length: r2(length),
      angleRad: r2(angle),
      angleDeg: r2((angle * 180) / Math.PI),
    });
  };

  const logFlag = (playerType: 1 | 2, flagX: number, flagY: number) => {
    console.log(`[PLACE FLAG P${playerType}]`, {
      flag: { x: r2(flagX), y: r2(flagY) },
    });
  };

  const logSpawn = (playerType: 1 | 2, x: number, y: number) => {
    console.log(`[SET SPAWN P${playerType}]`, {
      x: r2(x),
      y: r2(y),
    });
  };

  const buildLevel = (): SavedLevel => {
    const platforms: SavedPlatform[] = platformsRef.current
      .filter((p) => p.type !== "temporary")
      .map((p) => ({
        start: { x: r2(p.meta.start.x), y: r2(p.meta.start.y) },
        end: { x: r2(p.meta.end.x), y: r2(p.meta.end.y) },
        thickness: p.meta.thickness,
        type: p.type as "permanent" | "ground",
      }));

    const flags: SavedFlag[] = flagsRef.current.map((f) => ({
      playerType: f.playerType,
      flag: { x: r2(f.flag.position.x), y: r2(f.flag.position.y) },
      raised: false,
    }));

    const level: SavedLevel = {
      platforms,
      flags,
      player1Spawn: player1SpawnRef.current
        ? { x: r2(player1SpawnRef.current.x), y: r2(player1SpawnRef.current.y) }
        : undefined,
      player2Spawn: player2SpawnRef.current
        ? { x: r2(player2SpawnRef.current.x), y: r2(player2SpawnRef.current.y) }
        : undefined,
    };

    return level;
  };

  const checkElementsBelowGround = (): boolean => {
    const groundPlatforms = platformsRef.current.filter(
      (p) => p.type === "ground"
    );

    if (groundPlatforms.length === 0) return true;

    const pointsToCheck: Array<{ x: number; y: number; name: string }> = [];

    if (player1SpawnRef.current) {
      pointsToCheck.push({
        ...player1SpawnRef.current,
        name: "Player 1 spawn",
      });
    }
    if (player2SpawnRef.current) {
      pointsToCheck.push({
        ...player2SpawnRef.current,
        name: "Player 2 spawn",
      });
    }

    flagsRef.current.forEach((flag, idx) => {
      pointsToCheck.push({
        x: flag.flag.position.x,
        y: flag.flag.position.y,
        name: `Player ${flag.playerType} flag ${idx + 1}`,
      });
    });

    for (const point of pointsToCheck) {
      for (const groundPlatform of groundPlatforms) {
        const body = groundPlatform.body;

        if (point.x >= body.bounds.min.x && point.x <= body.bounds.max.x) {
          if (point.y > body.bounds.max.y) {
            alert(
              `Error: ${point.name} is below ground! Please reposition it.`
            );
            return false;
          }
        }
      }
    }

    return true;
  };

  const handleAttemptClear = () => {
    if (!player1SpawnRef.current) {
      alert("Error: Player 1 spawn point is not set!");
      return;
    }
    if (!player2SpawnRef.current) {
      alert("Error: Player 2 spawn point is not set!");
      return;
    }

    const player1Flags = flagsRef.current.filter((f) => f.playerType === 1);
    const player2Flags = flagsRef.current.filter((f) => f.playerType === 2);

    if (player1Flags.length === 0) {
      alert("Error: At least one Player 1 flag is required!");
      return;
    }
    if (player2Flags.length === 0) {
      alert("Error: At least one Player 2 flag is required!");
      return;
    }

    if (!checkElementsBelowGround()) {
      return;
    }

    // Spawn players
    if (
      engineRef.current &&
      player1SpawnRef.current &&
      player2SpawnRef.current
    ) {
      const player1 = Matter.Bodies.rectangle(
        player1SpawnRef.current.x,
        player1SpawnRef.current.y,
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
              xScale: 0.1,
              yScale: 0.1,
            },
          },
          label: "player1",
        }
      );
      player1Ref.current = player1;
      Matter.World.add(engineRef.current.world, player1);

      const player2 = Matter.Bodies.rectangle(
        player2SpawnRef.current.x,
        player2SpawnRef.current.y,
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
              xScale: 0.1,
              yScale: 0.1,
            },
          },
          label: "player2",
        }
      );
      player2Ref.current = player2;
      Matter.World.add(engineRef.current.world, player2);

      setAttemptStarted(true);
      attemptStartedRef.current = true;
    }
  };

  const handleSaveLevel = () => {
    if (!gameWon) {
      alert("You must clear the level before saving!");
      return;
    }

    const level = buildLevel();
    const filename = saveFilename.trim() || "custom_level";
    const jsonString = JSON.stringify(level, null, 2);

    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert(
      `Level saved as ${filename}.json\n\nTo use in your app, move this file to public/custom_levels/`
    );
  };

  const handleLoadLevel = () => {
    fileInputRef.current?.click();
  };

  const loadLevelHandler = (levelData: SavedLevel) => {
    if (!engineRef.current) return false;

    const world = engineRef.current.world;

    // 1) Clear existing platforms
    platformsRef.current.forEach((p) => Matter.World.remove(world, p.body));
    platformsRef.current = [];

    // 2) Clear existing flags
    flagsRef.current.forEach((f) => Matter.World.remove(world, f.flag));
    flagsRef.current = [];
    setFlagStates({});

    // 3) Clear spawn markers
    if (player1SpawnMarkerRef.current) {
      Matter.World.remove(world, player1SpawnMarkerRef.current);
      player1SpawnMarkerRef.current = null;
    }
    if (player2SpawnMarkerRef.current) {
      Matter.World.remove(world, player2SpawnMarkerRef.current);
      player2SpawnMarkerRef.current = null;
    }

    // 4) Load platforms (IMPORTANT)
    levelData.platforms.forEach((p) => {
      const platform = makePlatformFromEndpoints(
        p.start,
        p.end,
        p.thickness,
        p.type
      );
      Matter.World.add(world, platform);

      platformsRef.current.push({
        body: platform,
        type: p.type, // "permanent" | "ground"
        meta: { start: p.start, end: p.end, thickness: p.thickness },
      });
    });

    // 5) Load flags (IMPORTANT)
    levelData.flags.forEach((f) => {
      const flagTexture =
        f.playerType === 1
          ? ASSETS.PLAYER1_FLAG_LOWERED
          : ASSETS.PLAYER2_FLAG_LOWERED;

      const flag = Matter.Bodies.rectangle(
        f.flag.x,
        f.flag.y,
        SPRITE_SIZES.FLAG_WIDTH,
        SPRITE_SIZES.FLAG_HEIGHT,
        {
          isStatic: true,
          isSensor: true,
          label: "flag",
          render: {
            sprite: { texture: flagTexture, xScale: 0.1, yScale: 0.1 },
          },
        }
      );

      Matter.World.add(world, flag);
      flagsRef.current.push({
        flag,
        raised: false,
        playerType: f.playerType,
      });
    });

    // 6) Load spawn refs + markers
    player1SpawnRef.current = levelData.player1Spawn
      ? { ...levelData.player1Spawn }
      : null;
    player2SpawnRef.current = levelData.player2Spawn
      ? { ...levelData.player2Spawn }
      : null;

    if (player1SpawnRef.current) {
      const marker = createSpawnMarker(
        player1SpawnRef.current.x,
        player1SpawnRef.current.y,
        1
      );
      Matter.World.add(world, marker);
      player1SpawnMarkerRef.current = marker;
    }

    if (player2SpawnRef.current) {
      const marker = createSpawnMarker(
        player2SpawnRef.current.x,
        player2SpawnRef.current.y,
        2
      );
      Matter.World.add(world, marker);
      player2SpawnMarkerRef.current = marker;
    }

    return true;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const levelData = JSON.parse(
          event.target?.result as string
        ) as SavedLevel;

        loadLevelHandler(levelData);

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } catch (error) {
        alert(
          "Error loading level file. Please ensure it's a valid JSON file."
        );
        console.error(error);
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = Matter.Engine.create();
    engineRef.current = engine;
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
      if (
        !attemptStartedRef.current ||
        !player1Ref.current ||
        !player2Ref.current
      )
        return;

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
            const texture =
              player1AnimFrameRef.current === 0
                ? ASSETS.PLAYER1_WALK_1
                : ASSETS.PLAYER1_WALK_2;
            (player1Ref.current.render as any).sprite.texture = texture;
          } else {
            (player1Ref.current.render as any).sprite.texture =
              ASSETS.PLAYER1_IDLE;
            player1AnimFrameRef.current = 0;
          }
        }

        if (player2Ref.current) {
          const isMoving = keysRef.current.left || keysRef.current.right;
          if (isMoving) {
            player2AnimFrameRef.current = 1 - player2AnimFrameRef.current;
            const texture =
              player2AnimFrameRef.current === 0
                ? ASSETS.PLAYER2_WALK_1
                : ASSETS.PLAYER2_WALK_2;
            (player2Ref.current.render as any).sprite.texture = texture;
          } else {
            (player2Ref.current.render as any).sprite.texture =
              ASSETS.PLAYER2_IDLE;
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
  }, []);

  // Update flag sprites when raised
  useEffect(() => {
    flagsRef.current.forEach((flagData, index) => {
      const isRaised = flagStates[`flag_${index}`] && flagData.raised;

      const texture = isRaised
        ? flagData.playerType === 1
          ? ASSETS.PLAYER1_FLAG_RAISED
          : ASSETS.PLAYER2_FLAG_RAISED
        : flagData.playerType === 1
        ? ASSETS.PLAYER1_FLAG_LOWERED
        : ASSETS.PLAYER2_FLAG_LOWERED;

      (flagData.flag.render as any).sprite.texture = texture;
    });
  }, [flagStates]);

  // Check win condition
  useEffect(() => {
    if (attemptStarted && flagsRef.current.length > 0) {
      const allRaised = flagsRef.current.every((flag) => flag.raised);
      if (allRaised && !gameWon) {
        setGameWon(true);
        console.log("[LEVEL CLEARED]", buildLevel());
      }
    }
  }, [flagStates, gameWon, attemptStarted]);

  useEffect(() => {
    if (!loadLevel) return;
    if (!engineRef.current) return; // engine not ready yet
    loadLevelHandler(loadLevel);
    handleAttemptClear();
  }, [loadLevel]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (gameWon || attemptStarted || !renderRef.current || !engineRef.current)
      return;

    const canvas = renderRef.current.canvas;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (
      toolMode === "temporaryPlatform" ||
      toolMode === "permanentPlatform" ||
      toolMode === "ground"
    ) {
      if (!firstClickPoint) {
        setFirstClickPoint({ x, y });
      } else {
        const start = firstClickPoint;
        const end = { x, y };

        const platformType: PlatformType =
          toolMode === "temporaryPlatform"
            ? "temporary"
            : toolMode === "permanentPlatform"
            ? "permanent"
            : "ground";

        logPlatform(start, end, platformType);

        const platform = makePlatformFromEndpoints(
          start,
          end,
          PLATFORM_THICKNESS,
          platformType
        );

        Matter.World.add(engineRef.current.world, platform);
        platformsRef.current.push({
          body: platform,
          type: platformType,
          meta: { start, end, thickness: PLATFORM_THICKNESS },
        });

        setFirstClickPoint(null);
      }
    } else if (toolMode === "player1Spawn") {
      player1SpawnRef.current = { x, y };
      logSpawn(1, x, y);

      if (player1SpawnMarkerRef.current && engineRef.current) {
        Matter.World.remove(
          engineRef.current.world,
          player1SpawnMarkerRef.current
        );
      }

      const marker = createSpawnMarker(x, y, 1);
      Matter.World.add(engineRef.current.world, marker);
      player1SpawnMarkerRef.current = marker;
    } else if (toolMode === "player2Spawn") {
      player2SpawnRef.current = { x, y };
      logSpawn(2, x, y);

      if (player2SpawnMarkerRef.current && engineRef.current) {
        Matter.World.remove(
          engineRef.current.world,
          player2SpawnMarkerRef.current
        );
      }

      const marker = createSpawnMarker(x, y, 2);
      Matter.World.add(engineRef.current.world, marker);
      player2SpawnMarkerRef.current = marker;
    } else if (toolMode === "player1Flag") {
      const flag = Matter.Bodies.rectangle(
        x,
        y,
        SPRITE_SIZES.FLAG_WIDTH,
        SPRITE_SIZES.FLAG_HEIGHT,
        {
          isStatic: true,
          render: {
            sprite: {
              texture: ASSETS.PLAYER1_FLAG_LOWERED,
              xScale: 0.1,
              yScale: 0.1,
            },
          },
          label: "flag",
          isSensor: true,
        }
      );

      logFlag(1, x, y);

      Matter.World.add(engineRef.current.world, flag);
      flagsRef.current.push({ flag, raised: false, playerType: 1 });
    } else if (toolMode === "player2Flag") {
      const flag = Matter.Bodies.rectangle(
        x,
        y,
        SPRITE_SIZES.FLAG_WIDTH,
        SPRITE_SIZES.FLAG_HEIGHT,
        {
          isStatic: true,
          render: {
            sprite: {
              texture: ASSETS.PLAYER2_FLAG_LOWERED,
              xScale: 0.1,
              yScale: 0.1,
            },
          },
          label: "flag",
          isSensor: true,
        }
      );

      logFlag(2, x, y);

      Matter.World.add(engineRef.current.world, flag);
      flagsRef.current.push({ flag, raised: false, playerType: 2 });
    } else if (toolMode === "delete") {
      const bodies = Matter.Query.point(engineRef.current.world.bodies, {
        x,
        y,
      });

      for (const body of bodies) {
        const platformIndex = platformsRef.current.findIndex(
          (p) => p.body === body
        );
        if (platformIndex !== -1) {
          const platform = platformsRef.current[platformIndex];
          console.log(`[DELETE PLATFORM - ${platform.type.toUpperCase()}]`, {
            center: { x: r2(body.position.x), y: r2(body.position.y) },
            angleDeg: r2((body.angle * 180) / Math.PI),
          });

          Matter.World.remove(engineRef.current.world, body);
          platformsRef.current.splice(platformIndex, 1);
          break;
        }

        const flagIndex = flagsRef.current.findIndex((f) => f.flag === body);
        if (flagIndex !== -1) {
          const flagData = flagsRef.current[flagIndex];

          console.log("[DELETE FLAG]", {
            playerType: flagData.playerType,
            flag: {
              x: r2(flagData.flag.position.x),
              y: r2(flagData.flag.position.y),
            },
          });

          Matter.World.remove(engineRef.current.world, flagData.flag);
          flagsRef.current.splice(flagIndex, 1);
          break;
        }

        if (body === player1SpawnMarkerRef.current) {
          console.log("[DELETE SPAWN P1]");
          Matter.World.remove(engineRef.current.world, body);
          player1SpawnMarkerRef.current = null;
          player1SpawnRef.current = null;
          break;
        }

        if (body === player2SpawnMarkerRef.current) {
          console.log("[DELETE SPAWN P2]");
          Matter.World.remove(engineRef.current.world, body);
          player2SpawnMarkerRef.current = null;
          player2SpawnRef.current = null;
          break;
        }
      }
    }
  };

  const getCursor = () => {
    if (gameWon || attemptStarted) return "default";
    if (
      (toolMode === "temporaryPlatform" ||
        toolMode === "permanentPlatform" ||
        toolMode === "ground") &&
      firstClickPoint
    )
      return "crosshair";
    if (
      toolMode === "temporaryPlatform" ||
      toolMode === "permanentPlatform" ||
      toolMode === "ground" ||
      toolMode === "player1Spawn" ||
      toolMode === "player2Spawn" ||
      toolMode === "player1Flag" ||
      toolMode === "player2Flag"
    )
      return "pointer";
    if (toolMode === "delete") return "not-allowed";
    return "default";
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      {/* Tool Menu */}
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
        className={cn(showCustomTools ? "" : "hidden")}
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
                setToolMode("temporaryPlatform");
                setFirstClickPoint(null);
              }}
              style={{
                padding: "8px",
                backgroundColor:
                  toolMode === "temporaryPlatform" ? "#9B59B6" : "#f0f0f0",
                color: toolMode === "temporaryPlatform" ? "white" : "black",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Temporary Platform
            </button>
            <button
              onClick={() => {
                setToolMode("permanentPlatform");
                setFirstClickPoint(null);
              }}
              style={{
                padding: "8px",
                backgroundColor:
                  toolMode === "permanentPlatform" ? "#3498DB" : "#f0f0f0",
                color: toolMode === "permanentPlatform" ? "white" : "black",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Permanent Platform
            </button>
            <button
              onClick={() => {
                setToolMode("ground");
                setFirstClickPoint(null);
              }}
              style={{
                padding: "8px",
                backgroundColor: toolMode === "ground" ? "#8B4513" : "#f0f0f0",
                color: toolMode === "ground" ? "white" : "black",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Ground
            </button>
            <button
              onClick={() => {
                setToolMode("player1Spawn");
                setFirstClickPoint(null);
              }}
              style={{
                padding: "8px",
                backgroundColor:
                  toolMode === "player1Spawn" ? "#00FF00" : "#f0f0f0",
                color: toolMode === "player1Spawn" ? "white" : "black",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Player 1 Spawn
            </button>
            <button
              onClick={() => {
                setToolMode("player2Spawn");
                setFirstClickPoint(null);
              }}
              style={{
                padding: "8px",
                backgroundColor:
                  toolMode === "player2Spawn" ? "#FFA500" : "#f0f0f0",
                color: toolMode === "player2Spawn" ? "white" : "black",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Player 2 Spawn
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

            <div
              style={{
                height: "1px",
                backgroundColor: "#ddd",
                margin: "5px 0",
              }}
            />

            <button
              onClick={handleAttemptClear}
              disabled={attemptStarted}
              style={{
                padding: "10px",
                backgroundColor: attemptStarted ? "#ccc" : "#FF5722",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: attemptStarted ? "not-allowed" : "pointer",
                fontWeight: "bold",
              }}
            >
              {attemptStarted ? "Attempt Started" : "Attempt Clear"}
            </button>

            <button
              onClick={handleLoadLevel}
              disabled={attemptStarted}
              style={{
                padding: "8px",
                backgroundColor: attemptStarted ? "#ccc" : "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: attemptStarted ? "not-allowed" : "pointer",
                fontWeight: "bold",
              }}
            >
              Load Level
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

      {firstClickPoint &&
        (toolMode === "temporaryPlatform" ||
          toolMode === "permanentPlatform" ||
          toolMode === "ground") &&
        !gameWon &&
        !attemptStarted && (
          <div
            style={{
              textAlign: "center",
              marginTop: "10px",
              color:
                toolMode === "temporaryPlatform"
                  ? "#9B59B6"
                  : toolMode === "permanentPlatform"
                  ? "#3498DB"
                  : "#8B4513",
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
            Level Cleared!
          </h1>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "15px",
              marginTop: "30px",
              alignItems: "center",
            }}
          >
            <button
              onClick={() => window.location.reload()}
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

            {/* Save Level Section */}
            <div
              style={{
                alignItems: "center",
              }}
              className={
                showCustomTools
                  ? "flex flex-col gap-2.5 items-center"
                  : "hidden"
              }
            >
              <input
                type="text"
                placeholder="Enter filename (without .json)"
                value={saveFilename}
                onChange={(e) => setSaveFilename(e.target.value)}
                style={{
                  padding: "10px",
                  fontSize: "16px",
                  borderRadius: "4px",
                  border: "2px solid #ccc",
                  width: "300px",
                  textAlign: "center",
                }}
              />
              <button
                onClick={handleSaveLevel}
                style={{
                  padding: "15px 30px",
                  fontSize: "20px",
                  backgroundColor: "#FF9800",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor = "#F57C00")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.backgroundColor = "#FF9800")
                }
              >
                Save Level
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{ textAlign: "center", marginTop: "10px", fontSize: "14px" }}>
        {!attemptStarted ? (
          <div
            style={{ color: "#FF5722", fontWeight: "bold" }}
            className={showCustomTools ? "" : "hidden"}
          >
            Design your level, then press "Attempt Clear" to start!
          </div>
        ) : (
          <>
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
          </>
        )}
        <div
          style={{ marginTop: "10px", fontSize: "12px", color: "#666" }}
          className={showCustomTools ? "" : "hidden"}
        >
          Purple = Temporary (not saved) | Blue = Permanent | Brown = Ground
        </div>
      </div>
    </div>
  );
};

export default LevelCreator;
