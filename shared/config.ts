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
  GOLD_REWARD_BASE: 25, // Gold per grid cell on completion (reward = gridSize * gridSize * base)
  
  // Recharge zone
  RECHARGE_ZONE_RADIUS: 120,
  RECHARGE_ZONE_OFFSET_X: 200, // Offset from grid edge
  PICKUP_SPOT_RADIUS: 40, // Radius of the paint pickup spot
  PICKUP_SPOT_OFFSET_X: 0, // Offset from recharge zone center (same x position)
  PICKUP_SPOT_OFFSET_Y: 180, // Offset from recharge zone center (places it below, outside the zone)
  
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
      name: 'Boots',
      description: 'Zoom',
      maxLevel: 5,
      baseCost: 5,
      costMultiplier: 2, 
      effectPerLevel: 0.75,
    },
    maxPaintSupply: {
      id: 'maxPaintSupply' as const,
      name: 'Paint Tank',
      description: 'Increase max paint capacity',
      maxLevel: 5,
      baseCost: 5,
      costMultiplier: 2, 
      effectPerLevel: 30, 
    },
    directPickup: {
      id: 'directPickup' as const,
      name: 'Direct Pickup',
      description: 'Get paint directly from pickup spot without recharge zone',
      maxLevel: 1,
      baseCost: 100,
      costMultiplier: 2,
      effectPerLevel: 1, // Each level enables direct pickup (level 1+ = enabled)
    },
    autoPaint: {
      id: 'autoPaint' as const,
      name: 'Auto Paint',
      description: 'Automatically paint cells without pressing space',
      maxLevel: 1,
      baseCost: 150,
      costMultiplier: 1,
      effectPerLevel: 1, // Each level enables auto paint (level 1+ = enabled)
    },
    autoPaintOne: {
      id: 'autoPaintOne' as const,
      name: 'Auto Paint One',
      description: 'Automatically paint cells with number 1 without selecting color',
      maxLevel: 1,
      baseCost: 75,
      costMultiplier: 1,
      effectPerLevel: 1, // Each level enables auto paint (level 1+ = enabled)
    },
    autoPaintTwo: {
      id: 'autoPaintTwo' as const,
      name: 'Auto Paint Two',
      description: 'Automatically paint cells with number 2 without selecting color',
      maxLevel: 1,
      baseCost: 75,
      costMultiplier: 1,
      effectPerLevel: 1, // Each level enables auto paint (level 1+ = enabled)
    },
    autoPaintThree: {
      id: 'autoPaintThree' as const,
      name: 'Auto Paint Three',
      description: 'Automatically paint cells with number 3 without selecting color',
      maxLevel: 1,
      baseCost: 75,
      costMultiplier: 1,
      effectPerLevel: 1, // Each level enables auto paint (level 1+ = enabled)
    },
    autoPaintFour: {
      id: 'autoPaintFour' as const,
      name: 'Auto Paint Four',
      description: 'Automatically paint cells with number 4 without selecting color',
      maxLevel: 1,
      baseCost: 75,
      costMultiplier: 1,
      effectPerLevel: 1, // Each level enables auto paint (level 1+ = enabled)
    },
    autoPaintFive: {
      id: 'autoPaintFive' as const,
      name: 'Auto Paint Five',
      description: 'Automatically paint cells with number 5 without selecting color',
      maxLevel: 1,
      baseCost: 75,
      costMultiplier: 1,
      effectPerLevel: 1, // Each level enables auto paint (level 1+ = enabled)
    },
    autoPaintSix: {
      id: 'autoPaintSix' as const,
      name: 'Auto Paint Six',
      description: 'Automatically paint cells with number 6 without selecting color',
      maxLevel: 1,
      baseCost: 75,
      costMultiplier: 1,
      effectPerLevel: 1, // Each level enables auto paint (level 1+ = enabled)
    },
    rescueHat: {
      id: 'rescueHat' as const,
      name: 'Rescue Hat',
      description: 'Change leader crown to ⛑️',
      maxLevel: 1,
      baseCost: 50,
      costMultiplier: 1,
      effectPerLevel: 1,
    },
    womanHat: {
      id: 'womanHat' as const,
      name: 'Hat with Bow',
      description: 'Change leader crown to 👒',
      maxLevel: 1,
      baseCost: 50,
      costMultiplier: 1,
      effectPerLevel: 1,
    },
    topHat: {
      id: 'topHat' as const,
      name: 'Top Hat',
      description: 'Change leader crown to 🎩',
      maxLevel: 1,
      baseCost: 50,
      costMultiplier: 1,
      effectPerLevel: 1,
    },
    capHat: {
      id: 'capHat' as const,
      name: 'Cap',
      description: 'Change leader crown to 🧢',
      maxLevel: 1,
      baseCost: 50,
      costMultiplier: 1,
      effectPerLevel: 1,
    },
    graduationHat: {
      id: 'graduationHat' as const,
      name: 'Graduation Cap',
      description: 'Change leader crown to 🎓',
      maxLevel: 1,
      baseCost: 50,
      costMultiplier: 1,
      effectPerLevel: 1,
    },
  },
} as const;

// Computed values
export const GRID_PIXEL_SIZE = GAME_CONFIG.GRID_SIZE * GAME_CONFIG.CELL_PIXEL_SIZE;
export const GRID_HALF_SIZE = GRID_PIXEL_SIZE / 2;
export const RECHARGE_ZONE_CENTER_X = GRID_HALF_SIZE + GAME_CONFIG.RECHARGE_ZONE_OFFSET_X;
export const RECHARGE_ZONE_CENTER_Y = 0;
