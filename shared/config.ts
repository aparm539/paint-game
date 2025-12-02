// Shared configuration constants

export const GAME_CONFIG = {
  // Grid settings
  INITIAL_GRID_SIZE: 2,  // Grid starts at 2x2
  GRID_SIZE: 20,         // Default/fallback grid size
  CELL_PIXEL_SIZE: 50,
  NUM_COLORS: 6,
  
  // Paint colors available in the game
  PAINT_COLORS: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'],
  
  // Avatar colors for players
  AVATAR_COLORS: ['#FF1493', '#00CED1', '#FFD700', '#9370DB', '#FF4500', '#32CD32'],
  
  // Paint supply
  MAX_PAINT_SUPPLY: 100,
  PAINT_COST_PER_CELL: 5,
  RECHARGE_RATE: 2,
  
  // Gold rewards
  GOLD_REWARD_BASE: 5, // Gold per grid cell on completion (reward = gridSize * gridSize * base)
  
  // Recharge zone
  RECHARGE_ZONE_RADIUS: 120,
  RECHARGE_ZONE_OFFSET_X: 200, // Offset from grid edge
  
  // Movement
  MOVEMENT_SPEED: 3,
  MOVE_EMIT_THROTTLE: 50, // ms
  
  // Interpolation
  CAMERA_SMOOTHING: 0.15,
  PLAYER_INTERPOLATION_SMOOTHING: 0.3,
  SNAP_DISTANCE_SQUARED: 0.25,
  
  // Reconnection
  RECONNECTION_ATTEMPTS: 5,
  RECONNECTION_DELAY: 1000, // ms
  RECONNECTION_DELAY_MAX: 5000, // ms
  
  // Shop upgrades
  UPGRADES: {
    movementSpeed: {
      id: 'movementSpeed' as const,
      name: 'Swift Feet',
      description: 'Increase movement speed',
      maxLevel: 5,
      baseCost: 10,
      costMultiplier: 2, // Cost doubles each level: 10, 20, 40, 80, 160
      effectPerLevel: 0.5, // +0.5 speed per level
    },
  },
} as const;

// Computed values
export const GRID_PIXEL_SIZE = GAME_CONFIG.GRID_SIZE * GAME_CONFIG.CELL_PIXEL_SIZE;
export const GRID_HALF_SIZE = GRID_PIXEL_SIZE / 2;
export const RECHARGE_ZONE_CENTER_X = GRID_HALF_SIZE + GAME_CONFIG.RECHARGE_ZONE_OFFSET_X;
export const RECHARGE_ZONE_CENTER_Y = 0;
