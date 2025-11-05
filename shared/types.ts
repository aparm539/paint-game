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
  targetPosition?: Position; // For smooth interpolation (client-side only)
}

export interface GridCell {
  x: number; // Grid x coordinate
  y: number; // Grid y coordinate
  number: number; // The number shown on this cell (1-N)
  targetColor: string; // The color this cell should be painted
  currentColor: string | null; // Current painted color (null if unpainted)
  painted: boolean; // Whether this cell is correctly painted
}

export interface PaintGrid {
  cells: GridCell[][];
  gridSize: number; // Number of cells per side
  cellPixelSize: number; // Size of each cell in pixels
  colors: string[]; // Available colors in the painting
  colorMap: Map<number, string>; // Maps number to target color
}

export interface BalloonThrow {
  playerId: string;
  startPos: Position;
  velocity: Position;
  angle: number;
  color: string; // Color of the balloon being thrown
  colorNumber: number; // The number associated with this color
}

export interface BalloonLand {
  playerId: string;
  username: string;
  position: Position;
  startPos: Position;
  velocity: Position;
  color: string;
  colorNumber: number;
  timestamp: number;
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
  THROW_BALLOON: 'throwBalloon',
  BALLOON_LAND: 'balloonLand',
  PAINT_CELL: 'paintCell',
  PLAYER_JOINED: 'playerJoined',
  PLAYER_LEFT: 'playerLeft',
  GAME_PROGRESS: 'gameProgress',
  GAME_COMPLETE: 'gameComplete',
  PLAYER_LIST: 'playerList',
  GAME_STATE: 'gameState',
  GRID_UPDATE: 'gridUpdate',
} as const;

