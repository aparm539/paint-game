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
import {
  GAME_CONFIG,
  RECHARGE_ZONE_CENTER_X,
  RECHARGE_ZONE_CENTER_Y,
} from '../../shared/config.js';
import { worldToGrid, isInCircularZone, clamp } from '../../shared/utils.js';

// Use env vars with fallback to config defaults
const GRID_SIZE = parseInt(process.env.GRID_SIZE || String(GAME_CONFIG.GRID_SIZE));
const CELL_PIXEL_SIZE = parseInt(process.env.CELL_PIXEL_SIZE || String(GAME_CONFIG.CELL_PIXEL_SIZE));
const NUM_COLORS = parseInt(process.env.NUM_COLORS || String(GAME_CONFIG.NUM_COLORS));

export class GameRoom {
  private players: Map<string, Player> = new Map();
  private io: Server;
  private grid: GridCell[][] = [];
  private colors: string[] = [];
  private colorNumberMap: Record<number, string> = {};
  private paintedCellsCount: number = 0; // Running counter for performance
  private currentGridSize: number; // Dynamic grid size that grows on completion

  constructor(io: Server) {
    this.io = io;
    this.currentGridSize = GAME_CONFIG.INITIAL_GRID_SIZE; // Start at 2x2
    this.initializeGrid();
  }

  private initializeGrid(): void {
    // Select colors for this game
    this.colors = GAME_CONFIG.PAINT_COLORS.slice(0, NUM_COLORS);
    
    // Create color number mapping (1-6 map to colors)
    this.colorNumberMap = {};
    for (let i = 0; i < NUM_COLORS; i++) {
      this.colorNumberMap[i + 1] = this.colors[i];
    }
    
    this.paintedCellsCount = 0;

    // Generate grid with random color assignments using current dynamic size
    this.grid = [];
    for (let y = 0; y < this.currentGridSize; y++) {
      const row: GridCell[] = [];
      for (let x = 0; x < this.currentGridSize; x++) {
        // Randomly assign a color number (1 to NUM_COLORS)
        const colorNumber = Math.floor(Math.random() * NUM_COLORS) + 1;
        const targetColor = this.colorNumberMap[colorNumber] || this.colors[0];
        
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

    console.log(`Grid initialized: ${this.currentGridSize}x${this.currentGridSize} with ${NUM_COLORS} colors`);
  }

  addPlayer(socketId: string, username: string, startPosition: Position): Player {
    // Assign a random avatar color (different from paint colors)
    const avatarColor = GAME_CONFIG.AVATAR_COLORS[this.players.size % GAME_CONFIG.AVATAR_COLORS.length];
    
    const player: Player = {
      id: socketId,
      username,
      position: startPosition,
      color: avatarColor,
      paintSupply: GAME_CONFIG.MAX_PAINT_SUPPLY,
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
      
      // Check if player is in recharge zone and refill paint
      const inRechargeZone = isInCircularZone(
        position,
        RECHARGE_ZONE_CENTER_X,
        RECHARGE_ZONE_CENTER_Y,
        GAME_CONFIG.RECHARGE_ZONE_RADIUS
      );
      
      if (inRechargeZone && player.paintSupply < GAME_CONFIG.MAX_PAINT_SUPPLY) {
        player.paintSupply = clamp(
          player.paintSupply + GAME_CONFIG.RECHARGE_RATE,
          0,
          GAME_CONFIG.MAX_PAINT_SUPPLY
        );
        
        // Broadcast paint supply update
        const update: PaintSupplyUpdate = {
          playerId: player.id,
          paintSupply: player.paintSupply,
        };
        this.io.emit(SocketEvents.PAINT_SUPPLY_UPDATE, update);
      }
    }
  }

  // Calculate game progress using running counter
  private calculateProgress(): GameProgress {
    const totalCells = this.currentGridSize * this.currentGridSize;
    return {
      totalCells,
      paintedCells: this.paintedCellsCount,
      percentageComplete: Math.round((this.paintedCellsCount / totalCells) * 100),
    };
  }

  // Process paint cell request from player trail
  processPaintCell(request: PaintCellRequest, socketId: string): void {
    const player = this.getPlayer(socketId);
    if (!player) return;

    // Check if player has enough paint supply
    if (player.paintSupply < GAME_CONFIG.PAINT_COST_PER_CELL) {
      return;
    }

    // Check if position is on grid
    const gridCoords = worldToGrid(request.position, this.currentGridSize, CELL_PIXEL_SIZE);
    
    if (gridCoords) {
      const cell = this.grid[gridCoords.y][gridCoords.x];
      
      // Check if the color matches and cell isn't already painted
      const success = !cell.painted && cell.number === request.colorNumber;
      
      if (success) {
        // Deduct paint supply
        player.paintSupply = Math.max(0, player.paintSupply - GAME_CONFIG.PAINT_COST_PER_CELL);
        
        // Broadcast paint supply update
        const supplyUpdate: PaintSupplyUpdate = {
          playerId: player.id,
          paintSupply: player.paintSupply,
        };
        this.io.emit(SocketEvents.PAINT_SUPPLY_UPDATE, supplyUpdate);
        
        // Paint the cell and increment counter
        cell.currentColor = request.color;
        cell.painted = true;
        this.paintedCellsCount++;
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
          this.io.emit(SocketEvents.GAME_COMPLETE, {
            message: 'Painting Complete!',
            progress,
          });
          
          // Grow the grid and start a new round
          this.growGrid();
        }
      }
    }
  }

  broadcastPlayerList(): void {
    this.io.emit(SocketEvents.PLAYER_LIST, this.getAllPlayers());
  }

  getGameState(): GameState {
    return {
      players: this.getAllPlayers(),
      grid: this.grid,
      gridSize: this.currentGridSize,
      cellPixelSize: CELL_PIXEL_SIZE,
      colors: this.colors,
      colorNumberMap: this.colorNumberMap,
      progress: this.calculateProgress(),
    };
  }

  // Grow the grid after completion: +1 until size 10, then 5% growth
  private growGrid(): void {
    const oldSize = this.currentGridSize;
    
    if (this.currentGridSize < 10) {
      // Linear growth: +1 for small grids
      this.currentGridSize += 1;
    } else {
      // 5% growth for larger grids, rounded up to ensure at least +1
      this.currentGridSize = Math.ceil(this.currentGridSize * 1.05);
    }
    
    console.log(`Grid growing from ${oldSize}x${oldSize} to ${this.currentGridSize}x${this.currentGridSize}`);
    
    // Reinitialize the grid with the new size
    this.initializeGrid();
    
    // Broadcast the new game state to all players
    // Players stay where they are - no repositioning
    this.io.emit(SocketEvents.GAME_STATE, this.getGameState());
  }
}

export function setupSocketHandlers(io: Server): void {
  const gameRoom = new GameRoom(io);

  io.on('connection', (socket: Socket) => {
    // Handle player join with validation
    socket.on(SocketEvents.JOIN, (data: { username: string; startPosition?: Position }) => {
      // Validate username
      const username = data.username?.trim().slice(0, 20);
      if (!username) {
        socket.emit('error', { message: 'Invalid username' });
        return;
      }
      
      // Random starting position (top-down view)
      const startPosition: Position = data.startPosition || {
        x: Math.random() * 400 - 200,
        y: Math.random() * 400 - 200,
      };
      
      const player = gameRoom.addPlayer(socket.id, username, startPosition);
      
      // Send current game state to new player
      const gameState = gameRoom.getGameState();
      socket.emit(SocketEvents.GAME_STATE, gameState);
      
      // Broadcast to all OTHER players (not the one who just joined)
      gameRoom.broadcastPlayerList();
      socket.broadcast.emit(SocketEvents.PLAYER_JOINED, player);
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
      gameRoom.removePlayer(socket.id);
      gameRoom.broadcastPlayerList();
      io.emit(SocketEvents.PLAYER_LEFT, { playerId: socket.id });
    });
  });
}

