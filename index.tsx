import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

// --- Types & Interfaces ---

type GameState = "MENU" | "LOBBY" | "JOINING" | "COUNTDOWN" | "PLAYING" | "GAMEOVER";
type Role = "HOST" | "CLIENT" | "SINGLE";

interface PipeData {
  x: number;
  y: number; // Y position of the bottom of the top pipe
  passed: boolean;
  id: number;
}

// --- Constants ---

const LOGICAL_WIDTH = 480;
const LOGICAL_HEIGHT = 800;

// Authentic Physics Constants
const GRAVITY = 0.42;
const JUMP = -8.0;
const PIPE_SPEED = 3.5;
const PIPE_SPAWN_RATE = 1400; // ms
const PIPE_WIDTH = 64;
const PIPE_GAP = 160; 

// Dimensions
const BIRD_WIDTH = 42;
const BIRD_HEIGHT = 30;
// Hitbox is smaller than visual for "fair" feel
const HITBOX_WIDTH = 30;
const HITBOX_HEIGHT = 24;
const GROUND_HEIGHT = 120;

const MAX_ROTATION = 90 * (Math.PI / 180);
const MIN_ROTATION = -25 * (Math.PI / 180);
const ROTATION_SPEED = 6 * (Math.PI / 180);

// --- Assets (Programmatic drawing helpers) ---

const drawBird = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rotation: number,
  isOpponent: boolean
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  // Body
  ctx.fillStyle = isOpponent ? "rgba(255, 80, 80, 0.6)" : "#FFD700"; 
  if (isOpponent) ctx.strokeStyle = "rgba(0,0,0,0.5)";
  else ctx.strokeStyle = "#000";

  ctx.lineWidth = 3;
  
  ctx.beginPath();
  // Draw centered
  ctx.rect(-BIRD_WIDTH / 2, -BIRD_HEIGHT / 2, BIRD_WIDTH, BIRD_HEIGHT);
  ctx.fill();
  ctx.stroke();

  // Eye (Larger)
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.arc(BIRD_WIDTH/4, -BIRD_HEIGHT/4, 8, 0, Math.PI*2);
  ctx.fill();
  ctx.stroke();
  
  // Pupil
  ctx.fillStyle = "#000"; 
  ctx.beginPath();
  ctx.arc(BIRD_WIDTH/4 + 4, -BIRD_HEIGHT/4, 2, 0, Math.PI*2);
  ctx.fill();

  // Beak
  ctx.fillStyle = "#F44336";
  ctx.fillRect(BIRD_WIDTH / 6, 4, 18, 12);
  ctx.strokeRect(BIRD_WIDTH / 6, 4, 18, 12);
  
  // Wing (Retro style)
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.ellipse(-6, 4, 10, 6, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
};

const drawPipe = (ctx: CanvasRenderingContext2D, x: number, y: number, height: number, isTop: boolean) => {
  ctx.fillStyle = "#73BF2E";
  ctx.strokeStyle = "#553000";
  ctx.lineWidth = 3;

  // Main pipe body
  ctx.fillRect(x, isTop ? 0 : y, PIPE_WIDTH, height);
  ctx.strokeRect(x, isTop ? 0 : y, PIPE_WIDTH, height);

  // Cap
  const capHeight = 30;
  const capY = isTop ? height - capHeight : y;
  const capOverhang = 4;
  
  ctx.fillStyle = "#73BF2E";
  ctx.fillRect(x - capOverhang, capY, PIPE_WIDTH + (capOverhang*2), capHeight);
  ctx.strokeRect(x - capOverhang, capY, PIPE_WIDTH + (capOverhang*2), capHeight);
  
  // Highlights (Pixel art style)
  ctx.fillStyle = "#9CE659"; 
  // Long highlight
  ctx.fillRect(x + 6, isTop ? 0 : y + (isTop ? 0 : capHeight), 4, height - (isTop ? capHeight : 0));
  ctx.fillRect(x + 14, isTop ? 0 : y + (isTop ? 0 : capHeight), 2, height - (isTop ? capHeight : 0));
  
  // Cap Highlight
  ctx.fillRect(x - capOverhang + 6, capY + 4, 4, capHeight - 8);
};

const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  // Sky
  ctx.fillStyle = "#70C5CE";
  ctx.fillRect(0, 0, width, height);

  // Clouds
  ctx.fillStyle = "#FFFFFF";
  ctx.globalAlpha = 0.8;
  const time = Date.now() / 1000;
  for (let i = 0; i < 3; i++) {
     const cx = ((time * 20 + i * 200) % (width + 200)) - 100;
     const cy = height - GROUND_HEIGHT - 100 - (i * 50);
     ctx.beginPath();
     ctx.arc(cx, cy, 40, 0, Math.PI * 2);
     ctx.arc(cx + 30, cy - 10, 45, 0, Math.PI * 2);
     ctx.arc(cx + 60, cy, 40, 0, Math.PI * 2);
     ctx.fill();
  }
  ctx.globalAlpha = 1.0;

  // Cityscape
  ctx.fillStyle = "#A3E8A5";
  ctx.strokeStyle = "#75b076";
  ctx.lineWidth = 2;
  const numBuildings = 8;
  const bWidth = width / numBuildings;
  for(let i=0; i<numBuildings + 1; i++) {
     const h = 80 + Math.sin(i * 132) * 40;
     const x = i * bWidth;
     const y = height - GROUND_HEIGHT - h;
     ctx.fillRect(x, y, bWidth + 2, h);
     ctx.strokeRect(x, y, bWidth + 2, h);
     
     // Windows
     ctx.fillStyle = "#83c785";
     for(let wy=y+10; wy<height-GROUND_HEIGHT-10; wy+=20) {
        for(let wx=x+10; wx<x+bWidth-10; wx+=15) {
             ctx.fillRect(wx, wy, 8, 12);
        }
     }
     ctx.fillStyle = "#A3E8A5"; // Reset for next rect
  }
};

const drawGround = (ctx: CanvasRenderingContext2D, width: number, height: number, offset: number) => {
  ctx.fillStyle = "#DED895";
  ctx.fillRect(0, height - GROUND_HEIGHT, width, GROUND_HEIGHT);
  
  // Grass top
  ctx.fillStyle = "#73BF2E";
  ctx.fillRect(0, height - GROUND_HEIGHT, width, 16);
  ctx.strokeStyle = "#553000";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, height - GROUND_HEIGHT);
  ctx.lineTo(width, height - GROUND_HEIGHT);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(0, height - GROUND_HEIGHT + 16);
  ctx.lineTo(width, height - GROUND_HEIGHT + 16);
  ctx.stroke();

  // Scroller stripes
  const stripeWidth = 24;
  ctx.fillStyle = "#D0C874";
  for (let i = -1; i < width / stripeWidth + 2; i++) {
    const x = i * stripeWidth - (offset % stripeWidth);
    ctx.beginPath();
    ctx.moveTo(x + 12, height - GROUND_HEIGHT + 16);
    ctx.lineTo(x, height);
    ctx.lineTo(x + 8, height);
    ctx.lineTo(x + 20, height - GROUND_HEIGHT + 16);
    ctx.fill();
  }
};

// --- Main Component ---

const FlappyBird = () => {
  // Game State
  const [gameState, setGameState] = useState<GameState>("MENU");
  const [role, setRole] = useState<Role>("SINGLE");
  const [myId, setMyId] = useState<string>("");
  const [hostId, setHostId] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [finalScore, setFinalScore] = useState<number>(0);
  const [opponentScore, setOpponentScore] = useState<number>(0);
  const [winner, setWinner] = useState<"YOU" | "OPPONENT" | "DRAW" | null>(null);

  // Refs for Game Loop
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  
  // Mutable Game State
  const gameRef = useRef({
    bird: { y: LOGICAL_HEIGHT / 2, velocity: 0, rotation: 0, dead: false, score: 0 },
    opponent: { y: LOGICAL_HEIGHT / 2, velocity: 0, rotation: 0, dead: false, score: 0, connected: false },
    pipes: [] as PipeData[],
    groundOffset: 0,
    frames: 0,
    lastPipeTime: 0,
    started: false,
    pipeIdCounter: 0
  });

  // --- Initialization ---

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  // --- Networking Functions ---

  const initPeer = () => {
    // @ts-ignore
    const Peer = window.Peer;
    if (!Peer) {
      setStatusMessage("Network library loading...");
      // Simple retry if library is slow to load
      setTimeout(() => initPeer(), 500);
      return;
    }
    const id = Math.random().toString(36).substr(2, 4).toUpperCase();
    const peer = new Peer(id);
    
    peer.on('open', (id: string) => {
      setMyId(id);
      setStatusMessage("Waiting for player...");
    });

    peer.on('connection', (conn: any) => {
      connRef.current = conn;
      setupConnection(conn);
      setStatusMessage("Player joined!");
      
      // Host starts the countdown logic
      setTimeout(() => {
         conn.send({ type: 'PREPARE' });
         setGameState("COUNTDOWN");
         setTimeout(() => {
             conn.send({ type: 'START' });
             startGame();
         }, 3000);
      }, 1000);
    });

    peer.on('error', (err: any) => {
      console.error(err);
      setStatusMessage("Error: " + (err.type || "Network Error"));
    });

    peerRef.current = peer;
    return peer;
  };

  const joinGame = () => {
    // @ts-ignore
    const Peer = window.Peer;
    if (!Peer) {
        setStatusMessage("Network loading...");
        return;
    }
    if (!hostId) return;

    setStatusMessage("Connecting to " + hostId + "...");
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', () => {
      const conn = peer.connect(hostId.toUpperCase());
      connRef.current = conn;
      setupConnection(conn);
    });

    peer.on('error', (err: any) => {
       console.error(err);
       setStatusMessage("Connection failed. Check ID.");
    });
  };

  const setupConnection = (conn: any) => {
    conn.on('open', () => {
      console.log("Connected to peer");
      gameRef.current.opponent.connected = true;
      if (role === 'CLIENT') setStatusMessage("Connected! Waiting for host...");
    });

    conn.on('data', (data: any) => {
      handleData(data);
    });
    
    conn.on('close', () => {
      setStatusMessage("Opponent disconnected.");
      gameRef.current.opponent.connected = false;
    });
  };

  const handleData = (data: any) => {
    if (data.type === 'UPDATE') {
      gameRef.current.opponent = {
        ...gameRef.current.opponent,
        y: data.y,
        rotation: data.r,
        velocity: data.v,
        dead: data.dead,
        score: data.score
      };
    } else if (data.type === 'PREPARE') {
        setGameState("COUNTDOWN");
    } else if (data.type === 'START') {
      startGame();
    } else if (data.type === 'PIPE') {
      // Client receives pipe spawn parameters
      // Host sends x, y, and id.
      // To ensure sync, client should trust host's X, but mapped to logical time? 
      // Simplest: just spawn it at logical width.
      gameRef.current.pipes.push({ x: LOGICAL_WIDTH, y: data.y, passed: false, id: data.id });
    } else if (data.type === 'GAMEOVER_SYNC') {
       // Opponent finished game
       gameRef.current.opponent.score = data.score;
       gameRef.current.opponent.dead = true;
    }
  };

  const sendUpdate = () => {
    if (connRef.current && connRef.current.open) {
      connRef.current.send({
        type: 'UPDATE',
        y: gameRef.current.bird.y,
        v: gameRef.current.bird.velocity,
        r: gameRef.current.bird.rotation,
        dead: gameRef.current.bird.dead,
        score: gameRef.current.bird.score
      });
    }
  };

  // --- Game Logic ---

  const startGame = () => {
    setGameState("PLAYING");
    resetGame();
    gameRef.current.started = true;
  };

  const resetGame = () => {
    gameRef.current = {
      ...gameRef.current,
      bird: { y: LOGICAL_HEIGHT / 2, velocity: 0, rotation: 0, dead: false, score: 0 },
      opponent: { ...gameRef.current.opponent, y: LOGICAL_HEIGHT / 2, rotation: 0, dead: false, score: 0 },
      pipes: [],
      frames: 0,
      lastPipeTime: Date.now(),
      groundOffset: 0
    };
  };

  const jump = () => {
    if (gameRef.current.bird.dead) return;
    gameRef.current.bird.velocity = JUMP;
    gameRef.current.bird.rotation = MIN_ROTATION;
  };

  // Main Loop
  const loop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Enforce logical resolution
    if (canvas.width !== LOGICAL_WIDTH || canvas.height !== LOGICAL_HEIGHT) {
        canvas.width = LOGICAL_WIDTH;
        canvas.height = LOGICAL_HEIGHT;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const game = gameRef.current;

    // --- UPDATE ---

    // Always scroll ground if playing or in menu for visual effect
    if (!game.bird.dead) {
       game.groundOffset += PIPE_SPEED;
    }
    
    if (gameState === "PLAYING" || gameState === "GAMEOVER") {
      // Local Bird Physics
      if (game.started && (gameState === "PLAYING" || game.bird.dead)) {
        game.bird.velocity += GRAVITY;
        game.bird.y += game.bird.velocity;
        
        // Accurate Rotation Logic
        // If moving upwards or hovering, keep looking up
        if (game.bird.velocity < 5) {
             // Keeps snapping to look up while jumping/hovering
             if (game.bird.rotation > MIN_ROTATION) {
                 game.bird.rotation -= 10 * (Math.PI / 180);
                 if (game.bird.rotation < MIN_ROTATION) game.bird.rotation = MIN_ROTATION;
             }
        } else {
             // Nose dive when falling fast
             game.bird.rotation += ROTATION_SPEED;
             if(game.bird.rotation > MAX_ROTATION) game.bird.rotation = MAX_ROTATION;
        }

        // Floor Collision
        if (game.bird.y + HITBOX_HEIGHT/2 >= LOGICAL_HEIGHT - GROUND_HEIGHT) {
           game.bird.y = LOGICAL_HEIGHT - GROUND_HEIGHT - HITBOX_HEIGHT/2;
           die();
        }
        
        // Ceiling Collision - just clamps Y, does not kill (allows flying over pipes technically if pipe doesn't go to infinity)
        // But pipes in this game start from 0.
        if (game.bird.y - HITBOX_HEIGHT/2 <= 0) {
             game.bird.y = HITBOX_HEIGHT/2;
             game.bird.velocity = 0;
        }
      }

      // Pipe Management (Host only spawns, Client receives)
      if (role === "HOST" || role === "SINGLE") {
        if (game.started && !game.bird.dead && Date.now() - game.lastPipeTime > PIPE_SPAWN_RATE) {
           const minPipeY = 80;
           const maxPipeY = LOGICAL_HEIGHT - GROUND_HEIGHT - PIPE_GAP - 80;
           const pipeY = Math.floor(Math.random() * (maxPipeY - minPipeY)) + minPipeY;
           
           const newPipe = { x: LOGICAL_WIDTH, y: pipeY, passed: false, id: game.pipeIdCounter++ };
           game.pipes.push(newPipe);
           game.lastPipeTime = Date.now();

           if (role === "HOST" && connRef.current?.open) {
             connRef.current.send({ type: 'PIPE', y: pipeY, id: newPipe.id });
           }
        }
      }

      // Update Pipes
      game.pipes.forEach(pipe => {
        if (!game.bird.dead) pipe.x -= PIPE_SPEED;

        // Collision Check (AABB)
        // Fixed bird X position
        const birdX = LOGICAL_WIDTH * 0.3;
        
        // 1. Horizontal overlap using Hitbox
        if (birdX + HITBOX_WIDTH/2 > pipe.x && birdX - HITBOX_WIDTH/2 < pipe.x + PIPE_WIDTH) {
             // 2. Vertical overlap (Hit Top OR Hit Bottom)
             if (
                 game.bird.y - HITBOX_HEIGHT/2 < pipe.y || 
                 game.bird.y + HITBOX_HEIGHT/2 > pipe.y + PIPE_GAP
             ) {
                 die();
             }
        }

        // Score
        if (!pipe.passed && pipe.x + PIPE_WIDTH < birdX - HITBOX_WIDTH/2) {
           pipe.passed = true;
           game.bird.score += 1;
        }
      });

      // Cleanup pipes
      if (game.pipes.length > 0 && game.pipes[0].x < -100) {
        game.pipes.shift();
      }

      // Networking Update
      if (role !== "SINGLE" && game.frames % 2 === 0) { 
         sendUpdate();
      }
    }

    // --- DRAW ---

    // Clear
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Background
    drawBackground(ctx, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Pipes
    game.pipes.forEach(pipe => {
       drawPipe(ctx, pipe.x, pipe.y, pipe.y, true); // Top
       drawPipe(ctx, pipe.x, pipe.y + PIPE_GAP, LOGICAL_HEIGHT - GROUND_HEIGHT - (pipe.y + PIPE_GAP), false); // Bottom
    });

    // Ground
    drawGround(ctx, LOGICAL_WIDTH, LOGICAL_HEIGHT, game.groundOffset);

    // Menu "Bobbing" Bird
    if (gameState === "MENU" || gameState === "LOBBY" || gameState === "JOINING" || gameState === "COUNTDOWN") {
       const hoverY = (LOGICAL_HEIGHT / 2) - 50 + Math.sin(Date.now() / 300) * 10;
       drawBird(ctx, LOGICAL_WIDTH / 2, hoverY, 0, false);
    }

    // Opponent
    if (role !== "SINGLE" && game.opponent.connected) {
       const opX = LOGICAL_WIDTH * 0.3; // Opponent is also at fixed X on their screen
       if (gameState === "PLAYING" || gameState === "GAMEOVER") {
         drawBird(ctx, opX, game.opponent.y, game.opponent.rotation, true);
       }
    }

    // Player Bird (Game)
    if (gameState === "PLAYING" || gameState === "GAMEOVER") {
       const bX = LOGICAL_WIDTH * 0.3;
       drawBird(ctx, bX, game.bird.y, game.bird.rotation, false);
    }

    // UI Overlay (Score)
    if (gameState === "PLAYING" || gameState === "GAMEOVER") {
       ctx.fillStyle = "#FFF";
       ctx.strokeStyle = "#000";
       ctx.lineWidth = 4;
       ctx.font = "48px 'Press Start 2P'";
       ctx.textAlign = "center";
       ctx.strokeText(game.bird.score.toString(), LOGICAL_WIDTH / 2, 100);
       ctx.fillText(game.bird.score.toString(), LOGICAL_WIDTH / 2, 100);

       if (role !== "SINGLE") {
          ctx.font = "24px 'Press Start 2P'";
          ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
          ctx.fillText(`OPP: ${game.opponent.score}`, LOGICAL_WIDTH / 2, 140);
       }
    }

    game.frames++;
    requestRef.current = requestAnimationFrame(loop);
  };

  const die = () => {
    if (gameRef.current.bird.dead) return;
    gameRef.current.bird.dead = true;
    
    // Flash Screen
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.fillStyle = "white";
            ctx.fillRect(0,0,LOGICAL_WIDTH, LOGICAL_HEIGHT);
        }
    }

    if (role === "SINGLE") {
       setFinalScore(gameRef.current.bird.score);
       setTimeout(() => setGameState("GAMEOVER"), 800);
    } else {
      // Send final state
      sendUpdate(); 
      // Send explicit Game Over event to sync score accurately
      if (connRef.current?.open) {
          connRef.current.send({ type: 'GAMEOVER_SYNC', score: gameRef.current.bird.score });
      }
      checkMultiplayerGameOver();
    }
  };

  const checkMultiplayerGameOver = () => {
      const g = gameRef.current;
      // If we are dead, we wait for opponent.
      // We check if opponent is dead.
      if (g.opponent.dead) {
          // Both dead
          finishMultiplayerGame();
      } else {
          // Wait for opponent
          setStatusMessage("Waiting for opponent to finish...");
      }
  };

  // Poll for multiplayer finish
  useEffect(() => {
      if (gameState === "PLAYING" && role !== "SINGLE" && gameRef.current.bird.dead) {
          if (gameRef.current.opponent.dead) {
              finishMultiplayerGame();
          }
      }
  }, [gameState, gameRef.current.opponent.dead, gameRef.current.bird.dead]); // Note: refs in dep array is tricky, relying on re-renders from other state helps

  // Force re-check loop for game over
  useEffect(() => {
     if (gameState === "PLAYING" && role !== "SINGLE" && gameRef.current.bird.dead) {
        const i = setInterval(() => {
            if (gameRef.current.opponent.dead) {
                finishMultiplayerGame();
                clearInterval(i);
            }
        }, 500);
        return () => clearInterval(i);
     }
  }, [gameState, role]);

  const finishMultiplayerGame = () => {
      setFinalScore(gameRef.current.bird.score);
      setOpponentScore(gameRef.current.opponent.score);
      
      const myScore = gameRef.current.bird.score;
      const opScore = gameRef.current.opponent.score;

      if (myScore > opScore) setWinner("YOU");
      else if (myScore < opScore) setWinner("OPPONENT");
      else setWinner("DRAW");

      setGameState("GAMEOVER");
  };


  // Input Handling
  useEffect(() => {
    const handleInput = (e: any) => {
       // Prevent default scrolling behavior on touch devices
       if (e.type === 'touchstart') {
           // We only prevent default if we are playing to allow clicking buttons in menu?
           // Actually, we should prevent default always on canvas to avoid scroll bounce
           if (e.target === canvasRef.current) {
               // e.preventDefault(); 
           }
       }
       
       if (gameState === "PLAYING") {
           jump();
       }
    };
    
    // Keyboard
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Space" || e.code === "ArrowUp") {
            if (gameState === "PLAYING") jump();
        }
    };

    window.addEventListener("keydown", handleKeyDown);
    
    // Touch/Mouse on Canvas only to avoid button interference
    const canvas = canvasRef.current;
    if (canvas) {
        canvas.addEventListener("mousedown", handleInput);
        canvas.addEventListener("touchstart", handleInput, { passive: false });
    }
    
    // Start Loop
    requestRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (canvas) {
          canvas.removeEventListener("mousedown", handleInput);
          canvas.removeEventListener("touchstart", handleInput);
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState]);

  // --- Render Helpers ---

  // Common Button Style
  const btnStyle = "border-4 border-black p-4 font-bold text-sm md:text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-none transition-all font-game w-full mb-4 cursor-pointer";
  const boxStyle = "bg-[#DED895] border-4 border-[#553000] p-6 text-center relative max-w-sm w-[90%] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.5)]";

  const renderMenu = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-10">
      <h1 className="text-5xl md:text-7xl text-[#FFD700] mb-8 font-outline tracking-wider text-center leading-tight" style={{ fontFamily: '"Press Start 2P"' }}>
        FLAPPY<br/>LINK
      </h1>
      
      <div className="flex flex-col w-64">
        <button 
          onClick={() => { setRole("HOST"); setGameState("LOBBY"); initPeer(); }}
          className={`bg-[#73BF2E] text-white ${btnStyle}`}
          style={{ fontFamily: '"Press Start 2P"' }}
        >
          CREATE ROOM
        </button>
        <button 
          onClick={() => { setRole("CLIENT"); setGameState("JOINING"); }}
          className={`bg-[#E0A843] text-white ${btnStyle}`}
          style={{ fontFamily: '"Press Start 2P"' }}
        >
          JOIN ROOM
        </button>
        <button 
          onClick={() => { setRole("SINGLE"); setGameState("PLAYING"); resetGame(); gameRef.current.started = true; }}
          className={`bg-[#70C5CE] text-white ${btnStyle}`}
          style={{ fontFamily: '"Press Start 2P"' }}
        >
          PRACTICE
        </button>
      </div>
    </div>
  );

  const renderLobby = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-10">
      <div className={boxStyle}>
        <h2 className="text-xl mb-4 text-[#E0A843] font-outline" style={{ fontFamily: '"Press Start 2P"' }}>ROOM ID</h2>
        <div className="bg-white border-2 border-black p-4 mb-4 select-all">
            <span className="text-3xl font-bold tracking-widest text-black" style={{ fontFamily: '"Press Start 2P"' }}>
            {myId || "..."}
            </span>
        </div>
        <p className="text-xs text-[#553000] mb-6 font-bold" style={{ fontFamily: '"Press Start 2P"', lineHeight: '1.5' }}>
           SHARE THIS CODE<br/>WITH YOUR FRIEND
        </p>
        <div className="text-[#553000] animate-pulse mb-6 text-xs" style={{ fontFamily: '"Press Start 2P"' }}>
           {statusMessage}
        </div>
        <button 
          onClick={() => { setGameState("MENU"); peerRef.current?.destroy(); }}
          className="text-[#F44336] underline font-bold cursor-pointer"
          style={{ fontFamily: '"Press Start 2P"' }}
        >
          CANCEL
        </button>
      </div>
    </div>
  );

  const renderJoining = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-10">
       <div className={boxStyle}>
        <h2 className="text-xl mb-4 text-[#E0A843] font-outline" style={{ fontFamily: '"Press Start 2P"' }}>ENTER ID</h2>
        <input 
          type="text" 
          maxLength={4}
          className="w-full text-2xl p-3 text-center border-4 border-black mb-4 uppercase font-bold outline-none"
          value={hostId}
          onChange={(e) => setHostId(e.target.value.toUpperCase())}
          placeholder="XXXX"
          style={{ fontFamily: '"Press Start 2P"' }}
        />
        <button 
          onClick={joinGame}
          className={`bg-[#73BF2E] text-white ${btnStyle}`}
          style={{ fontFamily: '"Press Start 2P"' }}
          disabled={hostId.length < 4}
        >
          CONNECT
        </button>
         <div className="mt-2 text-xs text-[#553000]" style={{ fontFamily: '"Press Start 2P"' }}>
           {statusMessage}
        </div>
        <button 
          onClick={() => setGameState("MENU")}
          className="mt-6 text-[#F44336] underline font-bold cursor-pointer"
          style={{ fontFamily: '"Press Start 2P"' }}
        >
          BACK
        </button>
      </div>
    </div>
  );

  const renderGameOver = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20">
       <div className={boxStyle}>
          <h2 className="text-[#E0A843] text-2xl mb-8 font-outline" style={{ fontFamily: '"Press Start 2P"', WebkitTextStroke: "1px #000" }}>
             GAME OVER
          </h2>
          
          <div className="flex justify-around mb-8 items-end">
             <div className="flex flex-col items-center">
                <span className="text-[#F44336] text-[10px] mb-2" style={{ fontFamily: '"Press Start 2P"' }}>SCORE</span>
                <span className="text-white text-3xl font-outline" style={{ fontFamily: '"Press Start 2P"', WebkitTextStroke: "2px #000" }}>{finalScore}</span>
             </div>
             {role !== "SINGLE" && (
               <div className="flex flex-col items-center">
                  <span className="text-[#73BF2E] text-[10px] mb-2" style={{ fontFamily: '"Press Start 2P"' }}>OPPONENT</span>
                  <span className="text-white text-3xl font-outline" style={{ fontFamily: '"Press Start 2P"', WebkitTextStroke: "2px #000" }}>{opponentScore}</span>
               </div>
             )}
          </div>

          {role !== "SINGLE" && winner && (
             <div className="mb-8 bg-[#553000] p-4 border-2 border-[#E0A843]">
                <span className="text-[#FFD700] text-xl blink" style={{ fontFamily: '"Press Start 2P"' }}>
                   {winner === "YOU" ? "VICTORY!" : winner === "OPPONENT" ? "DEFEAT" : "DRAW"}
                </span>
             </div>
          )}
          
          <div className="flex flex-col gap-2">
             <button 
               onClick={() => {
                   if (role === "SINGLE") {
                       setGameState("PLAYING");
                       resetGame();
                       gameRef.current.started = true;
                   } else {
                        setGameState("MENU"); 
                        setMyId("");
                        setHostId("");
                        peerRef.current?.destroy();
                   }
               }}
               className={`bg-[#73BF2E] text-white ${btnStyle} mb-2`}
               style={{ fontFamily: '"Press Start 2P"' }}
             >
               {role === 'SINGLE' ? 'PLAY AGAIN' : 'MAIN MENU'}
             </button>
             {role === 'SINGLE' && (
                 <button 
                   onClick={() => setGameState("MENU")}
                   className="text-[#553000] underline text-xs font-bold cursor-pointer"
                   style={{ fontFamily: '"Press Start 2P"' }}
                 >
                   MENU
                 </button>
             )}
          </div>
       </div>
    </div>
  );

  return (
    <div className="relative w-full h-full">
      <style>{`
        .font-outline {
           text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
        }
        .blink {
           animation: blinker 1s linear infinite;
        }
        @keyframes blinker {
           50% { opacity: 0; }
        }
      `}</style>
      
      {/* Scanline overlay */}
      <div className="scanlines"></div>

      {/* Canvas container that maintains aspect ratio */}
      <div className="w-full h-full flex justify-center items-center">
          <canvas 
            ref={canvasRef}
            className="block max-w-full max-h-full aspect-[480/800] bg-[#70C5CE] shadow-2xl relative z-0"
          />
      </div>
      
      {gameState === "MENU" && renderMenu()}
      {gameState === "LOBBY" && renderLobby()}
      {gameState === "JOINING" && renderJoining()}
      {gameState === "GAMEOVER" && renderGameOver()}
      {gameState === "COUNTDOWN" && (
         <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <h1 className="text-6xl text-[#FFD700] font-outline animate-ping" style={{ fontFamily: '"Press Start 2P"' }}>
               READY
            </h1>
         </div>
      )}
      {/* Waiting overlay for opponent death */}
      {gameState === "PLAYING" && gameRef.current.bird.dead && role !== "SINGLE" && !gameRef.current.opponent.dead && (
          <div className="absolute top-20 left-0 w-full text-center z-20 pointer-events-none">
              <span className="bg-black/50 text-white p-2 rounded font-bold" style={{ fontFamily: '"Press Start 2P"' }}>
                  SPECTATING...
              </span>
          </div>
      )}
    </div>
  );
};

const rootElement = document.getElementById("root");
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<FlappyBird />);
}