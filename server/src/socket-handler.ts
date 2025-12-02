import { Server, Socket } from 'socket.io';
import {
  SocketEvents,
  type Player,
  type PaintCellRequest,
  type PaintEvent,
  type Position,
  type GameState,
  type GridCell,
  type GameProgress,
  type PlayerMove,
  type PaintSupplyUpdate,
} from '../../shared/types.js';

const GRID_SIZE = parseInt(process.env.GRID_SIZE || '20'); // Grid size from env
const CELL_PIXEL_SIZE = parseInt(process.env.CELL_PIXEL_SIZE || '50'); // Cell size from env
const PAINT_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
const NUM_COLORS = parseInt(process.env.NUM_COLORS || '6'); // Number of colors from env
const GRID_PIXEL_SIZE = GRID_SIZE * CELL_PIXEL_SIZE; // Total grid size in pixels (e.g., 1000px)
const GRID_HALF_SIZE = GRID_PIXEL_SIZE / 2; // Half of grid (e.g., 500px)
// Recharge zone positioned to the right of the grid
const RECHARGE_ZONE_CENTER_X = GRID_HALF_SIZE + 200; // 200px to the right of grid edge
const RECHARGE_ZONE_CENTER_Y = 0; // Centered vertically with grid
const RECHARGE_ZONE_RADIUS = 120; // 120px radius circle
const MAX_PAINT_SUPPLY = 100;
const PAINT_COST_PER_CELL = 5; // Paint supply cost per cell painted
const RECHARGE_RATE = 2; // Paint supply recharged per movement update when in zone

export class GameRoom {
  private players: Map<string, Player> = new Map();
  private io: Server;
  private grid: GridCell[][] = [];
  private colors: string[] = [];
  private colorNumberMap: Map<number, string> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.initializeGrid();
  }

  private initializeGrid(): void {
    // Select colors for this game
    this.colors = PAINT_COLORS.slice(0, NUM_COLORS);
    
    // Create color number mapping (1-6 map to colors)
    for (let i = 0; i < NUM_COLORS; i++) {
      this.colorNumberMap.set(i + 1, this.colors[i]);
    }

    // Generate grid with random color assignments
    this.grid = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      const row: GridCell[] = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        // Randomly assign a color number (1 to NUM_COLORS)
        const colorNumber = Math.floor(Math.random() * NUM_COLORS) + 1;
        const targetColor = this.colorNumberMap.get(colorNumber)!;
        
        row.push({
          x,
          y,
          number: colorNumber,
          targetColor,
          currentColor: null,
          painted: false,
        });
      }
      this.grid.push(row);
    }

    console.log(`Grid initialized: ${GRID_SIZE}x${GRID_SIZE} with ${NUM_COLORS} colors`);
  }

  addPlayer(socketId: string, username: string, startPosition: Position): Player {
    // Assign a random avatar color (different from paint colors)
    const avatarColors = ['#FF1493', '#00CED1', '#FFD700', '#9370DB', '#FF4500', '#32CD32'];
    const avatarColor = avatarColors[this.players.size % avatarColors.length];
    
    const player: Player = {
      id: socketId,
      username,
      position: startPosition,
      color: avatarColor,
      paintSupply: MAX_PAINT_SUPPLY, // Start with full paint
    };
    this.players.set(socketId, player);
    return player;
  }

  removePlayer(socketId: string): void {
    this.players.delete(socketId);
  }

  getPlayer(socketId: string): Player | undefined {
    return this.players.get(socketId);
  }

  getAllPlayers(): Player[] {
    return Array.from(this.players.values());
  }

  updatePlayerPosition(playerId: string, position: Position): void {
    const player = this.players.get(playerId);
    if (player) {
      player.position = position;
      
      // Check if player is in recharge zone (circular area to the right of grid) and refill paint
      const dx = position.x - RECHARGE_ZONE_CENTER_X;
      const dy = position.y - RECHARGE_ZONE_CENTER_Y;
      const distanceFromRechargeCenter = Math.sqrt(dx * dx + dy * dy);
      const inRechargeZone = distanceFromRechargeCenter <= RECHARGE_ZONE_RADIUS;
      
      if (inRechargeZone && player.paintSupply < MAX_PAINT_SUPPLY) {
        player.paintSupply = Math.min(MAX_PAINT_SUPPLY, player.paintSupply + RECHARGE_RATE);
        
        // Broadcast paint supply update
        const update: PaintSupplyUpdate = {
          playerId: player.id,
          paintSupply: player.paintSupply,
        };
        this.io.emit(SocketEvents.PAINT_SUPPLY_UPDATE, update);
      }
    }
  }

  // Convert world position to grid coordinates
  private worldToGrid(position: Position): { x: number; y: number } | null {
    // Grid is centered at origin (0, 0)
    const gridPixelSize = GRID_SIZE * CELL_PIXEL_SIZE;
    const halfGrid = gridPixelSize / 2;
    
    // Convert world coordinates to grid coordinates
    const gridX = Math.floor((position.x + halfGrid) / CELL_PIXEL_SIZE);
    const gridY = Math.floor((position.y + halfGrid) / CELL_PIXEL_SIZE);
    
    // Check if within bounds
    if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
      return { x: gridX, y: gridY };
    }
    
    return null;
  }

  // Calculate game progress
  private calculateProgress(): GameProgress {
    let totalCells = GRID_SIZE * GRID_SIZE;
    let paintedCells = 0;
    
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (this.grid[y][x].painted) {
          paintedCells++;
        }
      }
    }
    
    return {
      totalCells,
      paintedCells,
      percentageComplete: Math.round((paintedCells / totalCells) * 100),
    };
  }

  // Process paint cell request from player trail
  processPaintCell(request: PaintCellRequest, socketId: string): void {
    const player = this.getPlayer(socketId);
    if (!player) return;

    // Check if player has enough paint supply
    if (player.paintSupply < PAINT_COST_PER_CELL) {
      console.log(`Player ${player.username} has insufficient paint supply (${player.paintSupply})`);
      return;
    }

    console.log(`Processing paint request from ${player.username} with color ${request.color}`);

    // Check if position is on grid
    const gridCoords = this.worldToGrid(request.position);
    
    if (gridCoords) {
      const cell = this.grid[gridCoords.y][gridCoords.x];
      
      // Check if the color matches and cell isn't already painted
      const success = !cell.painted && cell.number === request.colorNumber;
      
      if (success) {
        // Deduct paint supply
        player.paintSupply = Math.max(0, player.paintSupply - PAINT_COST_PER_CELL);
        
        // Broadcast paint supply update
        const supplyUpdate: PaintSupplyUpdate = {
          playerId: player.id,
          paintSupply: player.paintSupply,
        };
        this.io.emit(SocketEvents.PAINT_SUPPLY_UPDATE, supplyUpdate);
        
        // Paint the cell
        cell.currentColor = request.color;
        cell.painted = true;
        console.log(`Cell (${gridCoords.x}, ${gridCoords.y}) painted with color ${request.color}! Paint supply: ${player.paintSupply}`);
      } else {
        console.log(`Cell (${gridCoords.x}, ${gridCoords.y}) paint failed - already painted: ${cell.painted}, correct color: ${cell.number === request.colorNumber}`);
      }
      
      // Create paint event
      const paintEvent: PaintEvent = {
        playerId: socketId,
        username: player.username,
        cellX: gridCoords.x,
        cellY: gridCoords.y,
        color: request.color,
        colorNumber: request.colorNumber,
        success,
      };
      
      // Broadcast paint event
      this.io.emit(SocketEvents.PAINT_CELL, paintEvent);
      
      if (success) {
        // Broadcast grid update
        this.io.emit(SocketEvents.GRID_UPDATE, this.grid);
        
        // Calculate and broadcast progress
        const progress = this.calculateProgress();
        this.io.emit(SocketEvents.GAME_PROGRESS, progress);
        
        // Check if game is complete
        if (progress.percentageComplete === 100) {
          console.log('Painting complete!');
          this.io.emit(SocketEvents.GAME_COMPLETE, {
            message: 'Painting Complete!',
            progress,
          });
        }
      }
    } else {
      console.log('Paint request outside grid');
    }
  }

  broadcastPlayerList(): void {
    this.io.emit(SocketEvents.PLAYER_LIST, this.getAllPlayers());
  }

  getGameState(): GameState {
    // Convert Map to Record for serialization
    const colorNumberMap: Record<number, string> = {};
    this.colorNumberMap.forEach((color, number) => {
      colorNumberMap[number] = color;
    });

    return {
      players: this.getAllPlayers(),
      grid: this.grid,
      gridSize: GRID_SIZE,
      cellPixelSize: CELL_PIXEL_SIZE,
      colors: this.colors,
      colorNumberMap,
      progress: this.calculateProgress(),
    };
  }
}

export function setupSocketHandlers(io: Server): void {
  const gameRoom = new GameRoom(io);

  io.on('connection', (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Handle player join
    socket.on(SocketEvents.JOIN, (data: { username: string; startPosition?: Position }) => {
      // Random starting position (top-down view)
      const startPosition: Position = data.startPosition || {
        x: Math.random() * 400 - 200,
        y: Math.random() * 400 - 200,
      };
      
      console.log(`Player ${data.username} (${socket.id}) joining at position:`, startPosition);
      
      const player = gameRoom.addPlayer(socket.id, data.username, startPosition);
      
      // Get current game state
      const gameState = gameRoom.getGameState();
      console.log(`Sending game state to ${data.username}:`, {
        playerCount: gameState.players.length,
        players: gameState.players.map(p => ({ id: p.id, username: p.username })),
        paintedCells: gameState.progress.paintedCells,
      });
      
      // Send current game state to new player
      socket.emit(SocketEvents.GAME_STATE, gameState);
      
      // Broadcast to all OTHER players (not the one who just joined)
      gameRoom.broadcastPlayerList();
      socket.broadcast.emit(SocketEvents.PLAYER_JOINED, player);
      
      console.log(`Total players in game: ${gameState.players.length}`);
    });

    // Handle player movement
    socket.on(SocketEvents.MOVE, (data: PlayerMove) => {
      gameRoom.updatePlayerPosition(data.playerId, data.position);
      // Broadcast position update to other players
      socket.broadcast.emit(SocketEvents.MOVE, data);
    });

    // Handle paint cell request
    socket.on(SocketEvents.PAINT_CELL_REQUEST, (request: PaintCellRequest) => {
      gameRoom.processPaintCell(request, socket.id);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${socket.id}`);
      gameRoom.removePlayer(socket.id);
      gameRoom.broadcastPlayerList();
      io.emit(SocketEvents.PLAYER_LEFT, { playerId: socket.id });
    });
  });
}

