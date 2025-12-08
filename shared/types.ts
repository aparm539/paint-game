// Shared types between client and server

export interface Position {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  username: string;
  position: Position;
  color: string; // Avatar color for display
  paintSupply: number; // Current paint supply (0-100)
  gold: number; // Currency earned from completing grids
  upgrades: PlayerUpgrades; // Player's purchased upgrades
  targetPosition?: Position; // For smooth interpolation (client-side only)
}

export interface GridCell {
  x: number; // Grid x coordinate
  y: number; // Grid y coordinate
  number: number; // The number shown on this cell (1-N)
  currentColor: string | null; // Current painted color (null if unpainted)
  painted: boolean; // Whether this cell is correctly painted
}

export interface PaintCellRequest {
  playerId: string;
  position: Position;
  colorNumber: number;
}

export interface PaintEvent {
  playerId: string;
  username: string;
  cellX: number;
  cellY: number;
  color: string;
  colorNumber: number;
  success: boolean; // Whether the paint matched the target
}

export interface GameProgress {
  totalCells: number;
  paintedCells: number;
  percentageComplete: number;
}

export interface GameState {
  players: Player[];
  grid: GridCell[][];
  gridSize: number;
  cellPixelSize: number;
  colors: string[];
  colorNumberMap: Record<number, string>; // Serializable version of Map
  progress: GameProgress;
}

export interface PlayerMove {
  playerId: string;
  position: Position;
}

// Socket event names
export const SocketEvents = {
  JOIN: 'join',
  MOVE: 'move',
  PAINT_CELL_REQUEST: 'paintCellRequest',
  PAINT_CELL: 'paintCell',
  PLAYER_JOINED: 'playerJoined',
  PLAYER_LEFT: 'playerLeft',
  GAME_PROGRESS: 'gameProgress',
  GAME_COMPLETE: 'gameComplete',
  PLAYER_LIST: 'playerList',
  GAME_STATE: 'gameState',
  GRID_UPDATE: 'gridUpdate',
  PAINT_SUPPLY_UPDATE: 'paintSupplyUpdate',
  GOLD_UPDATE: 'goldUpdate',
  PURCHASE_UPGRADE: 'purchaseUpgrade',
  UPGRADE_PURCHASED: 'upgradePurchased',
} as const;

export interface PaintSupplyUpdate {
  playerId: string;
  paintSupply: number;
}

export interface GoldUpdate {
  playerId: string;
  gold: number;
}

// Shop and Upgrades
export interface PlayerUpgrades {
  movementSpeed: number; // Level 0-5, each level increases speed
  maxPaintSupply: number; // Level 0-5, each level increases max paint supply
}

export interface UpgradeInfo {
  id: keyof PlayerUpgrades;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costMultiplier: number; // Cost increases by this factor per level
  effectPerLevel: number; // How much the stat increases per level
}

export interface PurchaseUpgradeRequest {
  playerId: string;
  upgradeId: keyof PlayerUpgrades;
}

export interface PurchaseUpgradeResponse {
  success: boolean;
  upgradeId: keyof PlayerUpgrades;
  newLevel: number;
  newGold: number;
  message: string;
}

