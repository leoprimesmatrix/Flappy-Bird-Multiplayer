import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

// --- Types & Interfaces ---

type GameState = "MENU" | "LOBBY" | "JOINING" | "COUNTDOWN" | "PLAYING" | "GAMEOVER";
type Role = "HOST" | "CLIENT" | "SINGLE";

interface PlayerState {
  y: number;
  velocity: number;
  rotation: number;
  dead: boolean;
  score: number;
  id: string;
}

interface PipeData {
  x: number;
  y: number; // Y position of the bottom of the top pipe
  passed: boolean;
}

// --- Constants ---

const GRAVITY = 0.25;
const JUMP = -4.6;
const PIPE_SPEED = 2.5; // Slightly slower for better multiplayer sync feel
const PIPE_SPAWN_RATE = 1500; // ms
const PIPE_WIDTH = 52;
const PIPE_GAP = 120; // 100 is hardcore, 120 is fair
const BIRD_WIDTH = 34;
const BIRD_HEIGHT = 24;
const GROUND_HEIGHT = 112;

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
  ctx.fillStyle = isOpponent ? "rgba(255, 100, 100, 0.7)" : "#FFD700"; // Red for opponent, Gold for self
  ctx.fillRect(-BIRD_WIDTH / 2, -BIRD_HEIGHT / 2, BIRD_WIDTH, BIRD_HEIGHT);
  
  // Border
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.strokeRect(-BIRD_WIDTH / 2, -BIRD_HEIGHT / 2, BIRD_WIDTH, BIRD_HEIGHT);

  // Eye
  ctx.fillStyle = "#FFF";
  ctx.fillRect(BIRD_WIDTH / 6, -BIRD_HEIGHT / 2 + 2, 10, 10);
  ctx.fillStyle = "#000"; // Pupil
  ctx.fillRect(BIRD_WIDTH / 6 + 6, -BIRD_HEIGHT / 2 + 4, 2, 2);

  // Beak
  ctx.fillStyle = "#F44336";
  ctx.fillRect(BIRD_WIDTH / 6, 2, 12, 8);
  
  // Wing
  ctx.fillStyle = "#FFF";
  ctx.fillRect(-10, 0, 12, 8);

  ctx.restore();
};

const drawPipe = (ctx: CanvasRenderingContext2D, x: number, y: number, height: number, isTop: boolean) => {
  ctx.fillStyle = "#73BF2E";
  ctx.strokeStyle = "#553000";
  ctx.lineWidth = 2;

  // Main pipe body
  ctx.fillRect(x, isTop ? 0 : y, PIPE_WIDTH, height);
  ctx.strokeRect(x, isTop ? 0 : y, PIPE_WIDTH, height);

  // Cap
  const capHeight = 24;
  const capY = isTop ? height - capHeight : y;
  ctx.fillStyle = "#73BF2E";
  ctx.fillRect(x - 2, capY, PIPE_WIDTH + 4, capHeight);
  ctx.strokeRect(x - 2, capY, PIPE_WIDTH + 4, capHeight);
  
  // Highlights
  ctx.fillStyle = "#9CE659"; // Light highlight
  ctx.fillRect(x + 2, isTop ? 0 : y + (isTop ? 0 : capHeight), 4, height - (isTop ? capHeight : 0));
};

const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  // Sky
  ctx.fillStyle = "#70C5CE";
  ctx.fillRect(0, 0, width, height);

  // Clouds (simple)
  ctx.fillStyle = "#EEF";
  ctx.globalAlpha = 0.8;
  for (let i = 0; i < 5; i++) {
     const cx = (Date.now() / 50 + i * 200) % (width + 200) - 100;
     const cy = height - GROUND_HEIGHT - 50 - (i % 2) * 40;
     ctx.beginPath();
     ctx.arc(cx, cy, 30, 0, Math.PI * 2);
     ctx.arc(cx + 25, cy - 10, 35, 0, Math.PI * 2);
     ctx.arc(cx + 50, cy, 30, 0, Math.PI * 2);
     ctx.fill();
  }
  ctx.globalAlpha = 1.0;

  // Cityscape (Silhouette)
  ctx.fillStyle = "#A3E8A5";
  const numBuildings = 10;
  const bWidth = width / numBuildings;
  for(let i=0; i<numBuildings + 1; i++) {
     const h = 50 + Math.sin(i * 132) * 30;
     ctx.fillRect(i * bWidth, height - GROUND_HEIGHT - h, bWidth + 2, h);
  }
};

const drawGround = (ctx: CanvasRenderingContext2D, width: number, height: number, offset: number) => {
  ctx.fillStyle = "#DED895";
  ctx.fillRect(0, height - GROUND_HEIGHT, width, GROUND_HEIGHT);
  
  // Grass top
  ctx.fillStyle = "#73BF2E";
  ctx.fillRect(0, height - GROUND_HEIGHT, width, 12);
  ctx.strokeStyle = "#553000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, height - GROUND_HEIGHT);
  ctx.lineTo(width, height - GROUND_HEIGHT);
  ctx.stroke();

  // Scroller
  const stripeWidth = 20;
  ctx.fillStyle = "#D0C874";
  for (let i = -1; i < width / stripeWidth + 2; i++) {
    const x = i * stripeWidth - (offset % stripeWidth);
    ctx.beginPath();
    ctx.moveTo(x + 10, height - GROUND_HEIGHT + 12);
    ctx.lineTo(x, height);
    ctx.lineTo(x + 5, height);
    ctx.lineTo(x + 15, height - GROUND_HEIGHT + 12);
    ctx.fill();
  }
};

// --- Helper for Dynamic Script Loading ---
const loadScript = (src: string) => {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.appendChild(script);
  });
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
  
  // Mutable Game State (for loop performance)
  const gameRef = useRef({
    bird: { y: 200, velocity: 0, rotation: 0, dead: false, score: 0 },
    opponent: { y: 200, velocity: 0, rotation: 0, dead: false, score: 0, connected: false },
    pipes: [] as PipeData[],
    groundOffset: 0,
    frames: 0,
    lastPipeTime: 0,
    started: false,
    width: 0,
    height: 0
  });

  // --- Initialization ---

  useEffect(() => {
    // Inject Font
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    // Load PeerJS
    loadScript("https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js")
      .then(() => {
        console.log("PeerJS loaded");
      })
      .catch(() => setStatusMessage("Failed to load networking library."));

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
      setStatusMessage("Network library not loaded. Refresh.");
      return null;
    }
    const id = Math.random().toString(36).substr(2, 4).toUpperCase();
    const peer = new Peer(id);
    
    peer.on('open', (id: string) => {
      setMyId(id);
      setStatusMessage("Waiting for player to join...");
    });

    peer.on('connection', (conn: any) => {
      connRef.current = conn;
      setupConnection(conn);
      setStatusMessage("Player connected! Starting...");
      setGameState("COUNTDOWN");
      setTimeout(startGame, 3000);
      
      // Send start signal after delay
      setTimeout(() => {
        conn.send({ type: 'START', seed: Date.now() });
      }, 3000);
    });

    peer.on('error', (err: any) => {
      console.error(err);
      setStatusMessage("Connection Error: " + err.type);
    });

    peerRef.current = peer;
    return peer;
  };

  const joinGame = () => {
    // @ts-ignore
    const Peer = window.Peer;
    if (!Peer || !hostId) return;

    setStatusMessage("Connecting...");
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', () => {
      const conn = peer.connect(hostId.toUpperCase());
      connRef.current = conn;
      setupConnection(conn);
    });

    peer.on('error', (err: any) => {
       setStatusMessage("Could not connect to " + hostId);
    });
  };

  const setupConnection = (conn: any) => {
    conn.on('open', () => {
      console.log("Connected");
      gameRef.current.opponent.connected = true;
      setStatusMessage("Connected! Get Ready...");
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
    } else if (data.type === 'START') {
      setGameState("PLAYING");
      resetGame();
      gameRef.current.started = true;
    } else if (data.type === 'PIPE') {
      // Receive pipe spawn from host
      gameRef.current.pipes.push({ x: data.x, y: data.y, passed: false });
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    gameRef.current = {
      ...gameRef.current,
      bird: { y: canvas.height / 2, velocity: 0, rotation: 0, dead: false, score: 0 },
      opponent: { ...gameRef.current.opponent, y: canvas.height / 2, rotation: 0, dead: false, score: 0 },
      pipes: [],
      frames: 0,
      lastPipeTime: 0,
    };
  };

  const jump = () => {
    if (gameRef.current.bird.dead) return;
    gameRef.current.bird.velocity = JUMP;
  };

  // Main Loop
  const loop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    gameRef.current.width = width;
    gameRef.current.height = height;

    const game = gameRef.current;

    // --- UPDATE ---
    
    if (gameState === "PLAYING" || gameState === "GAMEOVER") {
      game.groundOffset += PIPE_SPEED;

      // Local Bird Physics
      if (!game.bird.dead && game.started) {
        game.bird.velocity += GRAVITY;
        game.bird.y += game.bird.velocity;
        
        // Rotation
        if (game.bird.velocity < 0) {
           game.bird.rotation = -0.3;
        } else {
           game.bird.rotation += 0.03;
           if(game.bird.rotation > 1.5) game.bird.rotation = 1.5;
        }

        // Floor Collision
        if (game.bird.y + BIRD_HEIGHT/2 >= height - GROUND_HEIGHT) {
           game.bird.y = height - GROUND_HEIGHT - BIRD_HEIGHT/2;
           die();
        }
      }

      // Pipe Management (Host only spawns, Client receives)
      if (role === "HOST" || role === "SINGLE") {
        if (game.started && !game.bird.dead && Date.now() - game.lastPipeTime > PIPE_SPAWN_RATE) {
           const pipeY = Math.floor(Math.random() * (height - GROUND_HEIGHT - PIPE_GAP - 100)) + 50;
           // The Y stored is the bottom of the top pipe
           const newPipe = { x: width, y: pipeY, passed: false };
           game.pipes.push(newPipe);
           game.lastPipeTime = Date.now();

           if (role === "HOST" && connRef.current?.open) {
             connRef.current.send({ type: 'PIPE', x: width, y: pipeY });
           }
        }
      }

      // Update Pipes
      game.pipes.forEach(pipe => {
        if (!game.bird.dead) pipe.x -= PIPE_SPEED;

        // Collision Check (AABB)
        const bx = width / 2 - BIRD_WIDTH / 2; // Bird is centered horizontally usually? No, Flappy bird is slightly left.
        // Let's position bird at 30% width
        const birdX = width * 0.3;
        const birdY = game.bird.y;

        // Visual bird is centered at birdX, birdY. Hitbox is roughly the same.
        // Pipe logic
        if (
            birdX + BIRD_WIDTH/2 > pipe.x && 
            birdX - BIRD_WIDTH/2 < pipe.x + PIPE_WIDTH
        ) {
           // Inside pipe horizontal area
           if (
               birdY - BIRD_HEIGHT/2 < pipe.y || // Hit top pipe
               birdY + BIRD_HEIGHT/2 > pipe.y + PIPE_GAP // Hit bottom pipe
           ) {
              die();
           }
        }

        // Score
        if (!pipe.passed && pipe.x + PIPE_WIDTH < birdX) {
           pipe.passed = true;
           game.bird.score += 1;
        }
      });

      // Cleanup pipes
      if (game.pipes.length > 0 && game.pipes[0].x < -100) {
        game.pipes.shift();
      }

      // Networking Update
      if (role !== "SINGLE" && game.frames % 3 === 0) { // Send every 3rd frame to save bandwidth
         sendUpdate();
      }
    }

    // --- DRAW ---

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background
    drawBackground(ctx, width, height);

    // Pipes
    game.pipes.forEach(pipe => {
       drawPipe(ctx, pipe.x, pipe.y, pipe.y, true); // Top
       drawPipe(ctx, pipe.x, pipe.y + PIPE_GAP, height - GROUND_HEIGHT - (pipe.y + PIPE_GAP), false); // Bottom
    });

    // Ground
    drawGround(ctx, width, height, game.groundOffset);

    // Opponent (Draw first so it's behind)
    if (role !== "SINGLE" && game.opponent.connected) {
       // Interpolate opponent position logic could go here, but raw updates for 60fps might be jittery without it.
       // For this simple version, we just draw the last known state.
       // We assume opponent is also at x = width * 0.3 for their view, so we draw them there.
       const opX = width * 0.3; 
       if (!game.opponent.dead || gameState === "GAMEOVER") {
         drawBird(ctx, opX, game.opponent.y, game.opponent.rotation, true);
       }
    }

    // Player Bird
    if (gameState !== "MENU" && gameState !== "LOBBY") {
       const bX = width * 0.3;
       drawBird(ctx, bX, game.bird.y, game.bird.rotation, false);
    }

    // UI Overlay (Score)
    if (gameState === "PLAYING" || gameState === "GAMEOVER") {
       ctx.fillStyle = "#FFF";
       ctx.strokeStyle = "#000";
       ctx.lineWidth = 3;
       ctx.font = "40px 'Press Start 2P'";
       ctx.textAlign = "center";
       ctx.strokeText(game.bird.score.toString(), width / 2, 80);
       ctx.fillText(game.bird.score.toString(), width / 2, 80);

       if (role !== "SINGLE") {
          // Smaller opponent score
          ctx.font = "20px 'Press Start 2P'";
          ctx.fillStyle = "#FFaaaa";
          ctx.fillText(`Opp: ${game.opponent.score}`, width / 2, 110);
       }
    }

    game.frames++;
    requestRef.current = requestAnimationFrame(loop);
  };

  const die = () => {
    if (gameRef.current.bird.dead) return;
    gameRef.current.bird.dead = true;
    
    // Check game over condition
    // Single player: Immediate game over
    // Multiplayer: Wait for both? Or simple "You Died".
    // Let's do simple: If you die, you lose control. If opponent is dead too, show results.
    
    // For polish: Small screen shake?
    // Trigger React state for UI
    if (role === "SINGLE") {
       setFinalScore(gameRef.current.bird.score);
       setTimeout(() => setGameState("GAMEOVER"), 500);
    } else {
      sendUpdate(); // Send final death state
      checkMultiplayerGameOver();
    }
  };

  const checkMultiplayerGameOver = () => {
      // Check immediately if we should show game over
      const g = gameRef.current;
      // We die, we wait for opponent.
      // If opponent is already dead, Game Over.
      if (g.opponent.dead) {
          finishMultiplayerGame();
      } else {
          // Wait for opponent to die. 
          // We can show "Spectating..." text in canvas via state or just let it run.
      }
  };

  // Check every update if opponent died while we are dead
  useEffect(() => {
      if (gameState === "PLAYING" && gameRef.current.bird.dead && gameRef.current.opponent.dead) {
          finishMultiplayerGame();
      }
  }, [gameRef.current.opponent.dead]);

  const finishMultiplayerGame = () => {
      setFinalScore(gameRef.current.bird.score);
      setOpponentScore(gameRef.current.opponent.score);
      
      if (gameRef.current.bird.score > gameRef.current.opponent.score) setWinner("YOU");
      else if (gameRef.current.bird.score < gameRef.current.opponent.score) setWinner("OPPONENT");
      else setWinner("DRAW");

      setGameState("GAMEOVER");
  };


  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
       if (e.code === "Space" || e.code === "ArrowUp") {
          if (gameState === "PLAYING") jump();
       }
    };
    const handleTouch = () => {
       if (gameState === "PLAYING") jump();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleTouch);
    window.addEventListener("touchstart", handleTouch);
    
    // Start Loop
    requestRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleTouch);
      window.removeEventListener("touchstart", handleTouch);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState]);

  // Resize handling
  useEffect(() => {
     const resize = () => {
        if(canvasRef.current) {
           canvasRef.current.width = window.innerWidth;
           canvasRef.current.height = window.innerHeight;
           // Reset bird y if needed or just let it be
           if (gameState === "MENU") {
             gameRef.current.bird.y = window.innerHeight / 2;
           }
        }
     };
     window.addEventListener("resize", resize);
     resize();
     return () => window.removeEventListener("resize", resize);
  }, []);

  // --- Render Helpers ---

  const renderMenu = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white z-10 backdrop-blur-sm">
      <h1 className="text-4xl md:text-6xl text-[#FFD700] mb-8 font-outline text-center" style={{ fontFamily: '"Press Start 2P"' }}>
        FLAPPY<br/>MULTI
      </h1>
      
      <div className="flex flex-col gap-4 w-64">
        <button 
          onClick={() => { setRole("HOST"); setGameState("LOBBY"); initPeer(); }}
          className="bg-[#73BF2E] border-4 border-white p-4 font-bold hover:scale-105 transition active:scale-95"
          style={{ fontFamily: '"Press Start 2P"' }}
        >
          CREATE ROOM
        </button>
        <button 
          onClick={() => { setRole("CLIENT"); setGameState("JOINING"); }}
          className="bg-[#E0A843] border-4 border-white p-4 font-bold hover:scale-105 transition active:scale-95"
          style={{ fontFamily: '"Press Start 2P"' }}
        >
          JOIN ROOM
        </button>
        <button 
          onClick={() => { setRole("SINGLE"); setGameState("PLAYING"); resetGame(); gameRef.current.started = true; }}
          className="bg-[#70C5CE] border-4 border-white p-4 font-bold hover:scale-105 transition active:scale-95"
          style={{ fontFamily: '"Press Start 2P"' }}
        >
          PRACTICE
        </button>
      </div>
    </div>
  );

  const renderLobby = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white z-10 backdrop-blur-sm">
      <div className="bg-white text-black p-8 border-4 border-black rounded max-w-md w-full text-center">
        <h2 className="text-xl mb-4" style={{ fontFamily: '"Press Start 2P"' }}>ROOM ID</h2>
        <div className="text-4xl font-bold tracking-widest text-[#73BF2E] mb-4 select-all">
           {myId || "LOADING..."}
        </div>
        <p className="text-sm text-gray-500 mb-8" style={{ fontFamily: 'sans-serif' }}>
           Share this ID with your friend.
        </p>
        <div className="animate-pulse" style={{ fontFamily: '"Press Start 2P"' }}>
           {statusMessage}
        </div>
        <button 
          onClick={() => { setGameState("MENU"); peerRef.current?.destroy(); }}
          className="mt-8 text-red-500 underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const renderJoining = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white z-10 backdrop-blur-sm">
       <div className="bg-white text-black p-8 border-4 border-black rounded max-w-md w-full text-center">
        <h2 className="text-xl mb-4" style={{ fontFamily: '"Press Start 2P"' }}>ENTER ID</h2>
        <input 
          type="text" 
          maxLength={4}
          className="w-full text-3xl p-2 text-center border-2 border-gray-300 mb-4 uppercase"
          value={hostId}
          onChange={(e) => setHostId(e.target.value.toUpperCase())}
          placeholder="XXXX"
          style={{ fontFamily: '"Press Start 2P"' }}
        />
        <button 
          onClick={joinGame}
          className="bg-[#73BF2E] text-white border-2 border-black p-4 w-full font-bold hover:opacity-90 disabled:opacity-50"
          style={{ fontFamily: '"Press Start 2P"' }}
          disabled={hostId.length < 4}
        >
          CONNECT
        </button>
         <div className="mt-4 text-xs" style={{ fontFamily: '"Press Start 2P"' }}>
           {statusMessage}
        </div>
        <button 
          onClick={() => setGameState("MENU")}
          className="mt-6 text-red-500 underline"
        >
          Back
        </button>
      </div>
    </div>
  );

  const renderGameOver = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white z-10">
       <div className="bg-[#DED895] border-4 border-[#553000] p-8 text-center relative w-80">
          <h2 className="text-[#E0A843] text-2xl mb-6 font-outline" style={{ fontFamily: '"Press Start 2P"', WebkitTextStroke: "1px #000" }}>
             GAME OVER
          </h2>
          
          <div className="flex justify-between mb-4">
             <div className="flex flex-col">
                <span className="text-[#F44336] text-xs mb-2" style={{ fontFamily: '"Press Start 2P"' }}>SCORE</span>
                <span className="text-white text-2xl font-outline" style={{ fontFamily: '"Press Start 2P"', WebkitTextStroke: "1px #000" }}>{finalScore}</span>
             </div>
             {role !== "SINGLE" && (
               <div className="flex flex-col">
                  <span className="text-[#73BF2E] text-xs mb-2" style={{ fontFamily: '"Press Start 2P"' }}>OPPONENT</span>
                  <span className="text-white text-2xl font-outline" style={{ fontFamily: '"Press Start 2P"', WebkitTextStroke: "1px #000" }}>{opponentScore}</span>
               </div>
             )}
          </div>

          {role !== "SINGLE" && winner && (
             <div className="mb-6 bg-white/20 p-2 rounded">
                <span className="text-white text-lg blink" style={{ fontFamily: '"Press Start 2P"' }}>
                   {winner === "YOU" ? "YOU WON!" : winner === "OPPONENT" ? "YOU LOST" : "DRAW"}
                </span>
             </div>
          )}

          <div className="flex gap-2 justify-center">
             <button 
               onClick={() => { 
                   // Ideally send rematch signal, for now just menu
                   setGameState("MENU"); 
                   setMyId("");
                   setHostId("");
                   peerRef.current?.destroy();
               }}
               className="bg-[#70C5CE] p-3 border-2 border-white rounded shadow text-xs hover:scale-105"
               style={{ fontFamily: '"Press Start 2P"' }}
             >
               MAIN MENU
             </button>
             <button 
               onClick={() => {
                   if (role === "SINGLE") {
                       setGameState("PLAYING");
                       resetGame();
                       gameRef.current.started = true;
                   } else {
                       // Simple replay logic for P2P is complex, let's just reset local and wait for sync
                       resetGame();
                       setGameState("PLAYING");
                       gameRef.current.started = true;
                       connRef.current.send({ type: 'START' });
                   }
               }}
               className="bg-[#73BF2E] p-3 border-2 border-white rounded shadow text-xs hover:scale-105"
               style={{ fontFamily: '"Press Start 2P"' }}
             >
               PLAY AGAIN
             </button>
          </div>
       </div>
    </div>
  );

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#333]">
      <style>{`
        .font-outline {
           text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
        }
        .blink {
           animation: blinker 1s linear infinite;
        }
        @keyframes blinker {
           50% { opacity: 0; }
        }
      `}</style>

      <canvas 
        ref={canvasRef}
        className="block w-full h-full cursor-pointer"
        style={{ touchAction: 'none' }}
      />
      
      {gameState === "MENU" && renderMenu()}
      {gameState === "LOBBY" && renderLobby()}
      {gameState === "JOINING" && renderJoining()}
      {gameState === "GAMEOVER" && renderGameOver()}
      {gameState === "COUNTDOWN" && (
         <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <h1 className="text-6xl text-white font-outline animate-ping" style={{ fontFamily: '"Press Start 2P"' }}>
               READY
            </h1>
         </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<FlappyBird />);
