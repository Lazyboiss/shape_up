import React, { useEffect, useRef, useState } from "react";
import Matter from "matter-js";

interface LineSegment {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface PlatformerGameProps {
  lines?: LineSegment[];
}

export const PlatformerGame: React.FC<PlatformerGameProps> = ({
  lines = [],
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const playerRef = useRef<Matter.Body | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const keysRef = useRef({ left: false, right: false, space: false });
  const isGroundedRef = useRef(false);
  const lockedPositionRef = useRef<{ x: number; y: number } | null>(null);
  const [firstClickPoint, setFirstClickPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const groundNormalRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Create engine
    const engine = Matter.Engine.create();
    engineRef.current = engine;
    const world = engine.world;
    engine.gravity.y = 1;

    // Create renderer
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

    // Create player with better physics properties
    const player = Matter.Bodies.rectangle(100, 400, 30, 40, {
      friction: 1,
      frictionAir: 0.01,
      frictionStatic: 10,
      restitution: 0,
      inertia: Infinity, // Prevents rotation
      render: { fillStyle: "#FF6B6B" },
    });
    playerRef.current = player;
    Matter.World.add(world, player);

    // Create ground with varying slopes
    const groundSegments = [
      // Flat section
      Matter.Bodies.rectangle(150, 550, 300, 20, {
        isStatic: true,
        angle: 0,
        render: { fillStyle: "#8B4513" },
        friction: 1,
      }),
      // Incline
      Matter.Bodies.rectangle(400, 500, 200, 20, {
        isStatic: true,
        angle: -Math.PI / 6,
        render: { fillStyle: "#8B4513" },
        friction: 1,
      }),
      // Decline
      Matter.Bodies.rectangle(600, 500, 200, 20, {
        isStatic: true,
        angle: Math.PI / 6,
        render: { fillStyle: "#8B4513" },
        friction: 1,
      }),
      // Flat section
      Matter.Bodies.rectangle(750, 550, 100, 20, {
        isStatic: true,
        angle: 0,
        render: { fillStyle: "#8B4513" },
        friction: 1,
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
      });
    });
    Matter.World.add(world, lineSegments);

    // Improved collision detection - only grounded when standing ON a surface
    Matter.Events.on(engine, "collisionStart", (event) => {
      event.pairs.forEach((pair) => {
        const isPlayer =
          pair.bodyA === playerRef.current || pair.bodyB === playerRef.current;
        if (isPlayer) {
          // Get the collision normal relative to the player
          const normal =
            pair.bodyA === playerRef.current
              ? pair.collision.normal
              : {
                  x: -pair.collision.normal.x,
                  y: -pair.collision.normal.y,
                };

          // Only grounded if normal points upward (collision from below)
          if (normal.y < -0.5) {
            isGroundedRef.current = true;
          }
        }
      });
    });

    Matter.Events.on(engine, "collisionActive", (event) => {
      let bestNormal: { x: number; y: number } | null = null;

      event.pairs.forEach((pair) => {
        const isPlayer =
          pair.bodyA === playerRef.current || pair.bodyB === playerRef.current;
        if (!isPlayer) return;

        const normal =
          pair.bodyA === playerRef.current
            ? pair.collision.normal
            : { x: -pair.collision.normal.x, y: -pair.collision.normal.y };

        // upward-facing normal = ground contact
        if (normal.y < -0.5) {
          // pick the "most ground-like" (largest upward magnitude)
          if (!bestNormal || normal.y < bestNormal.y) bestNormal = normal;
        }
      });

      if (bestNormal) {
        isGroundedRef.current = true;
        groundNormalRef.current = bestNormal;
      } else {
        isGroundedRef.current = false;
        groundNormalRef.current = null;
        lockedPositionRef.current = null;
      }
    });

    Matter.Events.on(engine, "collisionEnd", (event) => {
      event.pairs.forEach((pair) => {
        if (
          pair.bodyA === playerRef.current ||
          pair.bodyB === playerRef.current
        ) {
          isGroundedRef.current = false;
          groundNormalRef.current = null;
          lockedPositionRef.current = null;
        }
      });
    });

    const applySlopeStick = (moving: boolean) => {
      const body = playerRef.current;
      const n = groundNormalRef.current;
      if (!body || !n || !isGroundedRef.current) return;

      // tangent vector along the slope surface
      // normal points "into" the player; tangent is perpendicular
      const tx = -n.y;
      const ty = n.x;

      // current velocity
      const vx = body.velocity.x;
      const vy = body.velocity.y;

      // velocity component along tangent (sliding up/down slope)
      const vAlong = vx * tx + vy * ty;

      // If not moving, kill almost all tangential motion (prevents sliding)
      // If moving, reduce a bit (helps feel grippy while running uphill)
      const kill = moving ? 0.65 : 1.0;

      const newVx = vx - vAlong * tx * kill;
      const newVy = vy - vAlong * ty * kill;

      Matter.Body.setVelocity(body, { x: newVx, y: newVy });
    };

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        keysRef.current.left = true;
        lockedPositionRef.current = null;
      }
      if (e.key === "ArrowRight") {
        keysRef.current.right = true;
        lockedPositionRef.current = null;
      }
      if (e.key === " ") {
        e.preventDefault();
        keysRef.current.space = true;
        lockedPositionRef.current = null;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") keysRef.current.left = false;
      if (e.key === "ArrowRight") keysRef.current.right = false;
      if (e.key === " ") keysRef.current.space = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Game loop
    const gameLoop = () => {
      if (!playerRef.current) return;

      const moveSpeed = 5;
      const jumpForce = -0.04;
      const maxFallSpeed = 15;

      const noKeysPressed =
        !keysRef.current.left &&
        !keysRef.current.right &&
        !keysRef.current.space;
      const moving = keysRef.current.left || keysRef.current.right;
      applySlopeStick(moving);
      // Horizontal movement
      if (keysRef.current.left) {
        Matter.Body.setVelocity(playerRef.current, {
          x: -moveSpeed,
          y: playerRef.current.velocity.y,
        });
      } else if (keysRef.current.right) {
        Matter.Body.setVelocity(playerRef.current, {
          x: moveSpeed,
          y: playerRef.current.velocity.y,
        });
      } else if (isGroundedRef.current && noKeysPressed) {
        // LOCK the player position completely
        if (!lockedPositionRef.current) {
          lockedPositionRef.current = {
            x: playerRef.current.position.x,
            y: playerRef.current.position.y,
          };
        }

        // Force position to locked position
        Matter.Body.setPosition(playerRef.current, lockedPositionRef.current);
        Matter.Body.setVelocity(playerRef.current, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(playerRef.current, 0);
      } else {
        // Apply damping when in air
        Matter.Body.setVelocity(playerRef.current, {
          x: playerRef.current.velocity.x * 0.9,
          y: playerRef.current.velocity.y,
        });
      }

      // Cap downward velocity to prevent excessive falling speed
      if (playerRef.current.velocity.y > maxFallSpeed) {
        Matter.Body.setVelocity(playerRef.current, {
          x: playerRef.current.velocity.x,
          y: maxFallSpeed,
        });
      }

      // Jump
      if (keysRef.current.space && isGroundedRef.current) {
        Matter.Body.applyForce(playerRef.current, playerRef.current.position, {
          x: 0,
          y: jumpForce,
        });
        keysRef.current.space = false; // Prevent continuous jumping
      }
    };

    Matter.Events.on(engine, "beforeUpdate", gameLoop);

    // Run the engine and renderer
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
    Matter.Render.run(render);

    // Cleanup
    return () => {
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
      Matter.Events.off(engine, "beforeUpdate", gameLoop);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      render.canvas.remove();
    };
  }, [lines]);

  // Handle canvas clicks to create platforms
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!renderRef.current || !engineRef.current) return;

    const canvas = renderRef.current.canvas;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!firstClickPoint) {
      // First click - store the point
      setFirstClickPoint({ x, y });
    } else {
      // Second click - create platform
      const start = firstClickPoint;
      const end = { x, y };

      const centerX = (start.x + end.x) / 2;
      const centerY = (start.y + end.y) / 2;
      const length = Math.sqrt(
        Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
      );
      const angle = Math.atan2(end.y - start.y, end.x - start.x);

      const platform = Matter.Bodies.rectangle(centerX, centerY, length, 10, {
        isStatic: true,
        angle: angle,
        render: { fillStyle: "#9B59B6" },
        friction: 1,
      });

      Matter.World.add(engineRef.current.world, platform);
      setFirstClickPoint(null);
    }
  };

  return (
    <div>
      <div
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{
          display: "flex",
          justifyContent: "center",
          cursor: firstClickPoint ? "crosshair" : "pointer",
        }}
      />
      {firstClickPoint && (
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
    </div>
  );
};

export default PlatformerGame;
