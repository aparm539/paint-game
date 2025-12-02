import type { Player, PaintEvent, GameProgress, Position, GridCell, PaintSupplyUpdate } from '../../shared/types.js';
import { GAME_CONFIG } from '../../shared/config.js';
import { worldToGrid } from '../../shared/utils.js';
import { SocketClient } from './socket-client.js';

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private socketClient: SocketClient;
  private players: Map<string, Player> = new Map();
  private currentPlayerId: string = '';
  private avatarElements: Map<string, HTMLDivElement> = new Map();
  private cameraOffset: Position = { x: 0, y: 0 };
  private activeAnimations: Map<string, { cancel: () => void }> = new Map();
  
  // Grid and painting
  private grid: GridCell[][] = [];
  private gridSize: number = 20;
  private cellPixelSize: number = 50;
  private colors: string[] = [];
  private colorNumberMap: Record<number, string> = {};
  private progress: GameProgress = { totalCells: 0, paintedCells: 0, percentageComplete: 0 };
  
  // Paint supply and recharge zone
  private rechargeZoneCenterX: number = 0;
  private rechargeZoneCenterY: number = 0;
  private rechargeZoneRadius: number = 120;
  
  // Color selection
  private selectedColorNumber: number = 1;
  
  // Movement
  private keysPressed: Set<string> = new Set();
  private movementSpeed: number = GAME_CONFIG.MOVEMENT_SPEED;
  private lastMoveEmit: number = 0;
  private moveEmitThrottle: number = GAME_CONFIG.MOVE_EMIT_THROTTLE;
  
  // Painting state
  private isPainting: boolean = false;
  private paintedCells: Set<string> = new Set();
  private pendingPaintCells: Set<string> = new Set(); // Cells waiting for server confirmation
  private lastPaintTime: number = 0;
  private paintThrottle: number = GAME_CONFIG.MOVE_EMIT_THROTTLE; // Reuse throttle timing
  
  // Connection state
  private isDisconnected: boolean = false;

  constructor(canvas: HTMLCanvasElement, socketClient: SocketClient) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get canvas context');
    }
    this.ctx = context;
    this.socketClient = socketClient;

    // Set canvas size to match its display size
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.setupEventHandlers();
    this.setupSocketHandlers();
    this.startGameLoop();
    
    // Provide position getter for reconnection
    this.socketClient.setPositionProvider(() => this.getCurrentPosition());
  }

  private resizeCanvas(): void {
    const rect = this.canvas.getBoundingClientRect();
    // Set internal resolution to match display size
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  private updateCamera(): void {
    const currentPlayer = this.players.get(this.currentPlayerId);
    if (!currentPlayer) return;

    // Center camera on current player
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    
    // Target camera offset
    const targetOffset = {
      x: centerX - currentPlayer.position.x,
      y: centerY - currentPlayer.position.y,
    };
    
    // Smooth camera follow with lerp (linear interpolation)
    const smoothing = GAME_CONFIG.CAMERA_SMOOTHING;
    this.cameraOffset = {
      x: this.cameraOffset.x + (targetOffset.x - this.cameraOffset.x) * smoothing,
      y: this.cameraOffset.y + (targetOffset.y - this.cameraOffset.y) * smoothing,
    };
  }

  private worldToScreen(pos: Position): Position {
    return {
      x: pos.x + this.cameraOffset.x,
      y: pos.y + this.cameraOffset.y,
    };
  }

  private screenToWorld(pos: Position): Position {
    return {
      x: pos.x - this.cameraOffset.x,
      y: pos.y - this.cameraOffset.y,
    };
  }

  private setupEventHandlers(): void {
    // Keyboard controls
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      e.preventDefault();
      this.keysPressed.add(key);
    }
    
    // Space bar to start painting (hold down)
    if (key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (!this.isPainting) {
        const currentPlayer = this.players.get(this.currentPlayerId);
        if (currentPlayer && currentPlayer.paintSupply > 0) {
          this.isPainting = true;
          this.updatePaintingStatusUI();
        }
      }
    }
    
    // Number keys for color selection
    const num = parseInt(key);
    if (num >= 1 && num <= this.colors.length) {
      this.selectedColorNumber = num;
      this.updateColorPaletteUI();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    this.keysPressed.delete(key);
    
    // Space bar to stop painting (release)
    if (key === ' ' || e.code === 'Space') {
      this.isPainting = false;
      this.updatePaintingStatusUI();
    }
  }

  private updatePlayerMovement(): void {
    // Don't process movement while disconnected
    if (this.isDisconnected) return;
    
    const currentPlayer = this.players.get(this.currentPlayerId);
    if (!currentPlayer) return;

    let dx = 0;
    let dy = 0;

    // Calculate movement direction
    if (this.keysPressed.has('w') || this.keysPressed.has('arrowup')) dy -= this.movementSpeed;
    if (this.keysPressed.has('s') || this.keysPressed.has('arrowdown')) dy += this.movementSpeed;
    if (this.keysPressed.has('a') || this.keysPressed.has('arrowleft')) dx -= this.movementSpeed;
    if (this.keysPressed.has('d') || this.keysPressed.has('arrowright')) dx += this.movementSpeed;

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      const magnitude = Math.sqrt(dx * dx + dy * dy);
      dx = (dx / magnitude) * this.movementSpeed;
      dy = (dy / magnitude) * this.movementSpeed;
    }

    if (dx !== 0 || dy !== 0) {
      // Update local position
      currentPlayer.position.x += dx;
      currentPlayer.position.y += dy;

      // Stop painting if paint runs out
      if (this.isPainting && currentPlayer.paintSupply <= 0) {
        this.isPainting = false;
        this.updatePaintingStatusUI();
      }

      // Paint cell immediately if painting
      const now = Date.now();
      if (this.isPainting && currentPlayer.paintSupply > 0 && now - this.lastPaintTime > this.paintThrottle) {
        this.tryPaintCurrentCell(currentPlayer.position);
        this.lastPaintTime = now;
      }

      // Emit to server (throttled)
      if (now - this.lastMoveEmit > this.moveEmitThrottle) {
        this.socketClient.movePlayer({
          playerId: this.currentPlayerId,
          position: currentPlayer.position,
        });
        this.lastMoveEmit = now;
      }
    }
  }

  private tryPaintCurrentCell(position: Position): void {
    const gridCoords = worldToGrid(position, this.gridSize, this.cellPixelSize);
    if (gridCoords) {
      const cellKey = `${gridCoords.x},${gridCoords.y}`;
      
      // Only paint if not already painted or pending
      if (!this.paintedCells.has(cellKey) && !this.pendingPaintCells.has(cellKey)) {
        this.pendingPaintCells.add(cellKey);
        
        // Request paint from server
        this.socketClient.requestPaintCell({
          playerId: this.currentPlayerId,
          position: position,
          colorNumber: this.selectedColorNumber,
        });
      }
    }
  }

  private setupSocketHandlers(): void {
    // Connection state handlers
    this.socketClient.on('disconnect', () => {
      this.handleDisconnect();
    });
    
    this.socketClient.on('connect', () => {
      this.handleReconnect();
    });
    
    this.socketClient.on('reconnectAttempt', (attemptNumber) => {
      this.updateConnectionOverlay(`Reconnecting... (attempt ${attemptNumber}/${GAME_CONFIG.RECONNECTION_ATTEMPTS})`);
    });
    
    this.socketClient.on('reconnectFailed', () => {
      this.showReconnectButton();
    });

    this.socketClient.on('playerList', (players) => {
      this.updatePlayers(players);
      this.updatePlayerListUI();
    });

    this.socketClient.on('playerJoined', (player) => {
      // Initialize target position for new players
      if (player.id !== this.currentPlayerId) {
        player.targetPosition = { ...player.position };
      }
      this.players.set(player.id, player);
      this.createAvatarElement(player);
      this.updatePlayerListUI();
    });

    this.socketClient.on('playerLeft', (data) => {
      // Cancel any active animation for this player
      const animation = this.activeAnimations.get(data.playerId);
      if (animation) {
        animation.cancel();
      }
      
      this.players.delete(data.playerId);
      this.removeAvatarElement(data.playerId);
      this.updatePlayerListUI();
    });

    this.socketClient.on('playerMove', (move) => {
      // Update other players' positions with interpolation
      const player = this.players.get(move.playerId);
      if (player && move.playerId !== this.currentPlayerId) {
        // Set target position for smooth interpolation
        player.targetPosition = { ...move.position };
      }
    });

    this.socketClient.on('paintCell', (paint) => {
      this.handlePaintCell(paint);
    });

    this.socketClient.on('gameProgress', (progress) => {
      this.progress = progress;
      this.updateProgressUI();
    });

    this.socketClient.on('gameComplete', (data) => {
      const statusEl = document.getElementById('game-status');
      if (statusEl) {
        statusEl.textContent = data.message;
        statusEl.className = 'game-status complete';
      }
    });

    this.socketClient.on('gridUpdate', (grid) => {
      this.grid = grid;
    });

    this.socketClient.on('gameState', (state) => {
      
      // Clear painted cells cache if grid size changed (new round)
      if (state.gridSize !== this.gridSize) {
        this.paintedCells.clear();
        this.pendingPaintCells.clear();
        this.isPainting = false; // Stop painting on new round
        this.updatePaintingStatusUI();
        console.log(`Grid size changed from ${this.gridSize} to ${state.gridSize} - cleared paint cache`);
      }
      
      // Update all game state data
      this.grid = state.grid;
      this.gridSize = state.gridSize;
      this.cellPixelSize = state.cellPixelSize;
      this.colors = state.colors;
      this.colorNumberMap = state.colorNumberMap;
      this.progress = state.progress;
      
      // Calculate recharge zone position (to the right of grid)
      const gridPixelSize = this.gridSize * this.cellPixelSize;
      const gridHalfSize = gridPixelSize / 2;
      this.rechargeZoneCenterX = gridHalfSize + 200; // 200px to the right of grid edge
      this.rechargeZoneCenterY = 0; // Centered vertically
      
      // Update players - this must happen before creating avatars
      this.updatePlayers(state.players);
      
      // Create avatar elements for all players (including existing ones)
      state.players.forEach((player) => {
        // Initialize target position for other players
        if (player.id !== this.currentPlayerId && !player.targetPosition) {
          player.targetPosition = { ...player.position };
        }
        
        if (!this.avatarElements.has(player.id)) {
          this.createAvatarElement(player);
          console.log('Created avatar for player:', player.username, player.id);
        }
      });
      
      // Initialize camera if current player is set
      if (this.currentPlayerId) {
        const currentPlayer = this.players.get(this.currentPlayerId);
        if (currentPlayer) {
          // Initialize camera to center on current player immediately
          const centerX = this.canvas.width / 2;
          const centerY = this.canvas.height / 2;
          this.cameraOffset = {
            x: centerX - currentPlayer.position.x,
            y: centerY - currentPlayer.position.y,
          };
        }
      }
      
      // Update UI
      this.updatePlayerListUI();
      this.updateProgressUI();
      this.updatePaintSupplyUI();
      this.createColorPaletteUI();
    });

    this.socketClient.on('paintSupplyUpdate', (update) => {
      const player = this.players.get(update.playerId);
      if (player) {
        player.paintSupply = update.paintSupply;
        if (update.playerId === this.currentPlayerId) {
          this.updatePaintSupplyUI();
        }
      }
    });
  }

  private handlePaintCell(paint: PaintEvent): void {
    const cellKey = `${paint.cellX},${paint.cellY}`;
    
    // Remove from pending set
    this.pendingPaintCells.delete(cellKey);
    
    // Update grid cell if we have it
    if (this.grid[paint.cellY] && this.grid[paint.cellY][paint.cellX]) {
      const cell = this.grid[paint.cellY][paint.cellX];
      if (paint.success) {
        cell.painted = true;
        cell.currentColor = paint.color;
        // Mark as successfully painted so we don't try again
        this.paintedCells.add(cellKey);
      }
      // If paint failed, pendingPaintCells is already cleared so player can retry
    }
  }

  private updatePlayers(players: Player[]): void {
    players.forEach((player) => {
      const existingPlayer = this.players.get(player.id);
      if (existingPlayer && player.id !== this.currentPlayerId) {
        // For other players, preserve current position and set target for interpolation
        player.targetPosition = { ...player.position };
        player.position = { ...existingPlayer.position };
      }
      this.players.set(player.id, player);
    });
  }

  private createAvatarElement(player: Player): void {
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.id = `avatar-${player.id}`;
    avatar.style.backgroundColor = player.color;
    
    // Add username label
    const nameLabel = document.createElement('div');
    nameLabel.className = 'avatar-name';
    nameLabel.textContent = player.username;
    avatar.appendChild(nameLabel);

    this.updateAvatarPosition(player);

    const container = document.getElementById('playing-field-container');
    if (container) {
      container.appendChild(avatar);
      this.avatarElements.set(player.id, avatar);
    }
  }

  private updateAvatarPosition(player: Player): void {
    const avatar = this.avatarElements.get(player.id);
    if (avatar) {
      // Convert world position to screen position
      const screenPos = this.worldToScreen(player.position);
      // Position avatar relative to canvas (which is inside the container)
      avatar.style.left = `${screenPos.x - 15}px`;
      avatar.style.top = `${screenPos.y - 15}px`;
    }
  }

  private removeAvatarElement(playerId: string): void {
    const avatar = this.avatarElements.get(playerId);
    if (avatar) {
      avatar.remove();
      this.avatarElements.delete(playerId);
    }
  }

  private updatePlayerListUI(): void {
    const playerListEl = document.getElementById('player-list');
    if (!playerListEl) return;

    playerListEl.innerHTML = '<h2>Players</h2>';
    
    this.players.forEach((player) => {
      const item = document.createElement('div');
      item.className = 'player-item';
      if (player.id === this.currentPlayerId) {
        item.classList.add('current');
      }

      const name = document.createElement('div');
      name.className = 'player-name';
      
      // Add color indicator
      const colorDot = document.createElement('span');
      colorDot.className = 'player-color-dot';
      colorDot.style.backgroundColor = player.color;
      
      name.appendChild(colorDot);
      name.appendChild(document.createTextNode(player.username));

      item.appendChild(name);
      playerListEl.appendChild(item);
    });
  }

  private createColorPaletteUI(): void {
    const paletteContainer = document.getElementById('color-palette');
    if (!paletteContainer) return;

    paletteContainer.innerHTML = '<h3>Paint Colors</h3>';
    
    this.colors.forEach((color, index) => {
      const colorNumber = index + 1;
      const button = document.createElement('button');
      button.className = 'color-button';
      button.style.backgroundColor = color;
      button.textContent = colorNumber.toString();
      button.onclick = () => {
        this.selectedColorNumber = colorNumber;
        this.updateColorPaletteUI();
      };
      
      if (colorNumber === this.selectedColorNumber) {
        button.classList.add('selected');
      }
      
      paletteContainer.appendChild(button);
    });
  }

  private updateColorPaletteUI(): void {
    const buttons = document.querySelectorAll('.color-button');
    buttons.forEach((button, index) => {
      const colorNumber = index + 1;
      if (colorNumber === this.selectedColorNumber) {
        button.classList.add('selected');
      } else {
        button.classList.remove('selected');
      }
    });
  }

  private updateProgressUI(): void {
    const progressEl = document.getElementById('paint-progress');
    if (progressEl) {
      progressEl.textContent = `Progress: ${this.progress.paintedCells}/${this.progress.totalCells} (${this.progress.percentageComplete}%)`;
    }
    
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
      progressBar.style.width = `${this.progress.percentageComplete}%`;
    }
  }

  private updatePaintingStatusUI(): void {
    const currentPlayer = this.players.get(this.currentPlayerId);
    if (!currentPlayer) return;
    
    const avatar = this.avatarElements.get(this.currentPlayerId);
    if (avatar) {
      if (this.isPainting) {
        avatar.classList.add('painting');
      } else {
        avatar.classList.remove('painting');
      }
    }
  }


  private startGameLoop(): void {
    const render = () => {
      this.updateCamera();
      this.updatePlayerMovement();
      this.updateAllAvatarPositions();
      this.draw();
      requestAnimationFrame(render);
    };
    render();
  }

  private updateAllAvatarPositions(): void {
    this.players.forEach((player) => {
      // Interpolate other players' positions for smooth movement
      if (player.id !== this.currentPlayerId && player.targetPosition) {
        // Smooth interpolation (lerp) towards target position
        const smoothing = GAME_CONFIG.PLAYER_INTERPOLATION_SMOOTHING;
        player.position.x += (player.targetPosition.x - player.position.x) * smoothing;
        player.position.y += (player.targetPosition.y - player.position.y) * smoothing;
        
        // Snap to target if very close
        const dx = player.targetPosition.x - player.position.x;
        const dy = player.targetPosition.y - player.position.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < GAME_CONFIG.SNAP_DISTANCE_SQUARED) {
          player.position = { ...player.targetPosition };
        }
      }
      
      this.updateAvatarPosition(player);
    });
  }

  private draw(): void {
    // Clear canvas with white background
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw recharge zone
    this.drawRechargeZone();

    // Draw painting grid
    this.drawPaintingGrid();
  }

  private drawPaintingGrid(): void {
    if (!this.grid || this.grid.length === 0) return;

    const gridPixelSize = this.gridSize * this.cellPixelSize;
    const halfGrid = gridPixelSize / 2;
    
    // Calculate grid bounds in world coordinates
    const gridWorldStartX = -halfGrid;
    const gridWorldStartY = -halfGrid;

    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        const cell = this.grid[y][x];
        
        // Calculate cell position in world coordinates
        const worldX = gridWorldStartX + (x * this.cellPixelSize);
        const worldY = gridWorldStartY + (y * this.cellPixelSize);
        
        // Convert to screen coordinates
        const screenPos = this.worldToScreen({ x: worldX, y: worldY });
        
        // Fill cell with color if painted
        if (cell.painted && cell.currentColor) {
          this.ctx.fillStyle = cell.currentColor;
        } else {
          this.ctx.fillStyle = '#F5F5F5'; // Light gray for unpainted cells
        }
        this.ctx.fillRect(screenPos.x, screenPos.y, this.cellPixelSize, this.cellPixelSize);
        
        // Draw cell border
        this.ctx.strokeStyle = '#CCCCCC';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(screenPos.x, screenPos.y, this.cellPixelSize, this.cellPixelSize);
        
        // Draw number if not painted
        if (!cell.painted) {
          this.ctx.fillStyle = '#666666';
          this.ctx.font = 'bold 14px Arial';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(
            cell.number.toString(),
            screenPos.x + this.cellPixelSize / 2,
            screenPos.y + this.cellPixelSize / 2
          );
        }
      }
    }
  }

  private drawRechargeZone(): void {
    if (this.rechargeZoneCenterX === 0) return;
    
    // Draw the recharge zone as a circular area to the right of the grid
    const zoneCenter = this.worldToScreen({ 
      x: this.rechargeZoneCenterX, 
      y: this.rechargeZoneCenterY 
    });
    
    // Draw filled circle
    this.ctx.fillStyle = 'rgba(100, 200, 100, 0.2)';
    this.ctx.beginPath();
    this.ctx.arc(zoneCenter.x, zoneCenter.y, this.rechargeZoneRadius, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Draw border (dashed)
    this.ctx.strokeStyle = 'rgba(50, 150, 50, 0.7)';
    this.ctx.lineWidth = 4;
    this.ctx.setLineDash([10, 5]);
    this.ctx.beginPath();
    this.ctx.arc(zoneCenter.x, zoneCenter.y, this.rechargeZoneRadius, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    // Draw label
    this.ctx.fillStyle = 'rgba(50, 150, 50, 0.9)';
    this.ctx.font = 'bold 20px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('RECHARGE', zoneCenter.x, zoneCenter.y - 10);
    this.ctx.font = 'bold 16px Arial';
    this.ctx.fillStyle = 'rgba(50, 150, 50, 0.7)';
    this.ctx.fillText('STATION', zoneCenter.x, zoneCenter.y + 15);
  }

  private updatePaintSupplyUI(): void {
    const currentPlayer = this.players.get(this.currentPlayerId);
    if (!currentPlayer) return;
    
    const paintSupplyEl = document.getElementById('paint-supply');
    const paintSupplyBar = document.getElementById('paint-supply-bar');
    
    if (paintSupplyEl) {
      paintSupplyEl.textContent = `Paint: ${Math.round(currentPlayer.paintSupply)}%`;
    }
    
    if (paintSupplyBar) {
      paintSupplyBar.style.width = `${currentPlayer.paintSupply}%`;
      
      // Change color based on supply level
      if (currentPlayer.paintSupply > 50) {
        paintSupplyBar.style.background = 'linear-gradient(90deg, #4caf50, #8bc34a)';
      } else if (currentPlayer.paintSupply > 20) {
        paintSupplyBar.style.background = 'linear-gradient(90deg, #ff9800, #ffb74d)';
      } else {
        paintSupplyBar.style.background = 'linear-gradient(90deg, #f44336, #e57373)';
      }
    }
  }

  setCurrentPlayer(playerId: string): void {
    this.currentPlayerId = playerId;
    const currentPlayerEl = document.getElementById('current-player');
    const player = this.players.get(playerId);
    if (currentPlayerEl && player) {
      currentPlayerEl.textContent = `You: ${player.username}`;
    }
  }
  
  getCurrentPosition(): Position | undefined {
    return this.players.get(this.currentPlayerId)?.position;
  }
  
  private handleDisconnect(): void {
    this.isDisconnected = true;
    
    // Stop painting and clear input state
    this.isPainting = false;
    this.keysPressed.clear();
    
    this.showConnectionOverlay('Connection lost - Reconnecting...');
  }
  
  private handleReconnect(): void {
    // Only process if we were previously disconnected (not initial connect)
    if (!this.isDisconnected) return;
    
    this.isDisconnected = false;
    
    // Get old and new player IDs
    const oldId = this.currentPlayerId;
    const newId = this.socketClient.getSocketId();
    
    // Migrate player data to new socket ID
    if (oldId && oldId !== newId) {
      this.migratePlayerToNewId(oldId, newId);
    }
    
    this.currentPlayerId = newId;
    
    // Clear painted cells tracking for fresh sync
    this.paintedCells.clear();
    this.pendingPaintCells.clear();
    
    // Rejoin to get fresh game state
    this.socketClient.rejoin();
    
    this.hideConnectionOverlay();
  }
  
  private migratePlayerToNewId(oldId: string, newId: string): void {
    // Migrate player data
    const player = this.players.get(oldId);
    if (player) {
      player.id = newId;
      this.players.delete(oldId);
      this.players.set(newId, player);
    }
    
    // Migrate avatar element
    const avatar = this.avatarElements.get(oldId);
    if (avatar) {
      avatar.id = `avatar-${newId}`;
      this.avatarElements.delete(oldId);
      this.avatarElements.set(newId, avatar);
    }
  }
  
  private showConnectionOverlay(message: string): void {
    let overlay = document.getElementById('connection-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'connection-overlay';
      overlay.innerHTML = `
        <div class="connection-overlay-content">
          <div class="spinner"></div>
          <p id="connection-message">${message}</p>
          <button id="reconnect-button" class="hidden">Reconnect</button>
        </div>
      `;
      document.getElementById('game-screen')?.appendChild(overlay);
      
      // Add click handler for reconnect button
      document.getElementById('reconnect-button')?.addEventListener('click', () => {
        this.updateConnectionOverlay('Connecting...');
        document.getElementById('reconnect-button')?.classList.add('hidden');
        this.socketClient.manualReconnect();
      });
    } else {
      overlay.classList.remove('hidden');
      this.updateConnectionOverlay(message);
    }
  }
  
  private updateConnectionOverlay(message: string): void {
    const messageEl = document.getElementById('connection-message');
    if (messageEl) {
      messageEl.textContent = message;
    }
  }
  
  private showReconnectButton(): void {
    this.updateConnectionOverlay('Connection failed');
    document.getElementById('reconnect-button')?.classList.remove('hidden');
  }
  
  private hideConnectionOverlay(): void {
    const overlay = document.getElementById('connection-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }
}

