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
  type GoldUpdate,
  type PurchaseUpgradeRequest,
  type PurchaseUpgradeResponse,
  type PlayerUpgrades,
} from '../../shared/types.js';
import { GAME_CONFIG } from '../../shared/config.js';
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
        
        row.push({
          x,
          y,
          number: colorNumber,
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
      gold: 0,
      upgrades: {
        movementSpeed: 0,
      },
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
      
      // Calculate recharge zone position dynamically based on current grid size
      const gridPixelSize = this.currentGridSize * CELL_PIXEL_SIZE;
      const gridHalfSize = gridPixelSize / 2;
      const rechargeZoneCenterX = gridHalfSize + GAME_CONFIG.RECHARGE_ZONE_OFFSET_X;
      const rechargeZoneCenterY = 0;
      
      // Check if player is in recharge zone and refill paint
      const inRechargeZone = isInCircularZone(
        position,
        rechargeZoneCenterX,
        rechargeZoneCenterY,
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

  // Convert world position to grid coordinates using shared utility
  private getGridCoords(position: Position): { x: number; y: number } | null {
    return worldToGrid(position, this.currentGridSize, CELL_PIXEL_SIZE);
  }

  // Helper to send paint failure response when we can't determine grid coords
  private sendPaintFailure(socketId: string, username: string, request: PaintCellRequest, socket: Socket): void {
    // Try to get grid coords for the response, use -1,-1 if outside bounds
    const gridCoords = this.getGridCoords(request.position) || { x: -1, y: -1 };
    const failEvent: PaintEvent = {
      playerId: socketId,
      username: username,
      cellX: gridCoords.x,
      cellY: gridCoords.y,
      color: '',
      colorNumber: request.colorNumber,
      success: false,
    };
    socket.emit(SocketEvents.PAINT_CELL, failEvent);
  }

  // Process paint cell request from player trail
  processPaintCell(request: PaintCellRequest, socketId: string, socket: Socket): void {
    const player = this.getPlayer(socketId);
    if (!player) {
      // Unknown player - send failure response
      this.sendPaintFailure(socketId, 'Unknown', request, socket);
      return;
    }

    // Check if player has enough paint supply
    if (player.paintSupply < GAME_CONFIG.PAINT_COST_PER_CELL) {
      // Insufficient paint - send failure response
      this.sendPaintFailure(socketId, player.username, request, socket);
      return;
    }

    // Get grid coordinates from player position
    const gridCoords = this.getGridCoords(request.position);
    if (!gridCoords) {
      // Outside grid bounds - send failure response
      this.sendPaintFailure(socketId, player.username, request, socket);
      return;
    }

    const cell = this.grid[gridCoords.y]?.[gridCoords.x];
    if (!cell) {
      // Cell not found - send failure response with coords
      const failEvent: PaintEvent = {
        playerId: socketId,
        username: player.username,
        cellX: gridCoords.x,
        cellY: gridCoords.y,
        color: '',
        colorNumber: request.colorNumber,
        success: false,
      };
      socket.emit(SocketEvents.PAINT_CELL, failEvent);
      return;
    }

    // Check if cell can be painted with the selected color
    // Broadcast failure response so all clients can sync state
    if (cell.painted) {
      const failEvent: PaintEvent = {
        playerId: socketId,
        username: player.username,
        cellX: gridCoords.x,
        cellY: gridCoords.y,
        color: cell.currentColor || '',
        colorNumber: request.colorNumber,
        success: false,
      };
      // Use io.emit to broadcast to all clients including sender for consistency
      this.io.emit(SocketEvents.PAINT_CELL, failEvent);
      return;
    }
    if (cell.number !== request.colorNumber) {
      const failEvent: PaintEvent = {
        playerId: socketId,
        username: player.username,
        cellX: gridCoords.x,
        cellY: gridCoords.y,
        color: '',
        colorNumber: request.colorNumber,
        success: false,
      };
      // Use io.emit to broadcast to all clients including sender for consistency
      this.io.emit(SocketEvents.PAINT_CELL, failEvent);
      return;
    }

    console.log(`[PAINT] Cell ${gridCoords.x},${gridCoords.y} painted by ${player.username}`);

    // Success: deduct paint supply
    player.paintSupply = Math.max(0, player.paintSupply - GAME_CONFIG.PAINT_COST_PER_CELL);

    // Broadcast paint supply update
    const supplyUpdate: PaintSupplyUpdate = {
      playerId: player.id,
      paintSupply: player.paintSupply,
    };
    this.io.emit(SocketEvents.PAINT_SUPPLY_UPDATE, supplyUpdate);

    // Paint the cell and increment counter
    const paintColor = this.colorNumberMap[request.colorNumber] || this.colors[0];
    cell.currentColor = paintColor;
    cell.painted = true;
    this.paintedCellsCount++;

    // Create and broadcast paint event
    const paintEvent: PaintEvent = {
      playerId: socketId,
      username: player.username,
      cellX: gridCoords.x,
      cellY: gridCoords.y,
      color: paintColor,
      colorNumber: request.colorNumber,
      success: true,
    };
    this.io.emit(SocketEvents.PAINT_CELL, paintEvent);

    // Broadcast grid update
    this.io.emit(SocketEvents.GRID_UPDATE, this.grid);

    // Calculate and broadcast progress
    const progress = this.calculateProgress();
    this.io.emit(SocketEvents.GAME_PROGRESS, progress);

    // Check if game is complete
    if (progress.percentageComplete === 100) {
      // Award gold to all players before growing grid
      this.awardGoldToAllPlayers();
      
      this.io.emit(SocketEvents.GAME_COMPLETE, {
        message: 'Painting Complete!',
        progress,
      });

      // Grow the grid and start a new round
      this.growGrid();
    }
  }

  broadcastPlayerList(): void {
    this.io.emit(SocketEvents.PLAYER_LIST, this.getAllPlayers());
  }

  // Award gold to all players when grid is completed (scales with grid size)
  private awardGoldToAllPlayers(): void {
    const goldReward = this.currentGridSize * GAME_CONFIG.GOLD_REWARD_BASE;
    
    console.log(`[GOLD] Awarding ${goldReward} gold to all ${this.players.size} players (grid: ${this.currentGridSize}x${this.currentGridSize})`);
    
    this.players.forEach((player) => {
      player.gold += goldReward;
      
      const goldUpdate: GoldUpdate = {
        playerId: player.id,
        gold: player.gold,
      };
      this.io.emit(SocketEvents.GOLD_UPDATE, goldUpdate);
    });
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

  // Process upgrade purchase request
  processPurchaseUpgrade(request: PurchaseUpgradeRequest, socketId: string, socket: Socket): void {
    const player = this.getPlayer(socketId);
    if (!player) {
      const response: PurchaseUpgradeResponse = {
        success: false,
        upgradeId: request.upgradeId,
        newLevel: 0,
        newGold: 0,
        message: 'Player not found',
      };
      socket.emit(SocketEvents.UPGRADE_PURCHASED, response);
      return;
    }

    const upgradeConfig = GAME_CONFIG.UPGRADES[request.upgradeId];
    if (!upgradeConfig) {
      const response: PurchaseUpgradeResponse = {
        success: false,
        upgradeId: request.upgradeId,
        newLevel: player.upgrades[request.upgradeId] || 0,
        newGold: player.gold,
        message: 'Invalid upgrade',
      };
      socket.emit(SocketEvents.UPGRADE_PURCHASED, response);
      return;
    }

    const currentLevel = player.upgrades[request.upgradeId] || 0;
    
    // Check if already at max level
    if (currentLevel >= upgradeConfig.maxLevel) {
      const response: PurchaseUpgradeResponse = {
        success: false,
        upgradeId: request.upgradeId,
        newLevel: currentLevel,
        newGold: player.gold,
        message: 'Already at max level',
      };
      socket.emit(SocketEvents.UPGRADE_PURCHASED, response);
      return;
    }

    // Calculate cost for next level
    const cost = upgradeConfig.baseCost * Math.pow(upgradeConfig.costMultiplier, currentLevel);
    
    // Check if player has enough gold
    if (player.gold < cost) {
      const response: PurchaseUpgradeResponse = {
        success: false,
        upgradeId: request.upgradeId,
        newLevel: currentLevel,
        newGold: player.gold,
        message: `Not enough gold (need ${cost})`,
      };
      socket.emit(SocketEvents.UPGRADE_PURCHASED, response);
      return;
    }

    // Process purchase
    player.gold -= cost;
    player.upgrades[request.upgradeId] = currentLevel + 1;

    console.log(`[SHOP] ${player.username} purchased ${upgradeConfig.name} level ${currentLevel + 1} for ${cost} gold`);

    // Send success response to the purchasing player
    const response: PurchaseUpgradeResponse = {
      success: true,
      upgradeId: request.upgradeId,
      newLevel: currentLevel + 1,
      newGold: player.gold,
      message: `Upgraded ${upgradeConfig.name} to level ${currentLevel + 1}!`,
    };
    socket.emit(SocketEvents.UPGRADE_PURCHASED, response);

    // Broadcast gold update to all players
    const goldUpdate: GoldUpdate = {
      playerId: player.id,
      gold: player.gold,
    };
    this.io.emit(SocketEvents.GOLD_UPDATE, goldUpdate);
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
    
    console.log(`[GRID] Growing from ${oldSize}x${oldSize} to ${this.currentGridSize}x${this.currentGridSize}`);
    console.log(`[GRID] Old painted count was: ${this.paintedCellsCount}`);
    
    // Reinitialize the grid with the new size
    this.initializeGrid();
    
    console.log(`[GRID] New grid initialized. Painted count reset to: ${this.paintedCellsCount}`);
    
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
      gameRoom.processPaintCell(request, socket.id, socket);
    });

    // Handle upgrade purchase request
    socket.on(SocketEvents.PURCHASE_UPGRADE, (request: PurchaseUpgradeRequest) => {
      gameRoom.processPurchaseUpgrade(request, socket.id, socket);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      gameRoom.removePlayer(socket.id);
      gameRoom.broadcastPlayerList();
      io.emit(SocketEvents.PLAYER_LEFT, { playerId: socket.id });
    });
  });
}

