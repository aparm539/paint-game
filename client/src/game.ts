import type { Player, BalloonThrow, BalloonLand, PaintEvent, GameProgress, Position, GridCell } from '../../shared/types.js';
import { PhysicsEngine, type TrajectoryPoint } from './physics.js';
import { SocketClient } from './socket-client.js';

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private socketClient: SocketClient;
  private physics: PhysicsEngine;
  private players: Map<string, Player> = new Map();
  private currentPlayerId: string = '';
  private isThrowing: boolean = false;
  private throwStartPos: Position | null = null;
  private throwStartTime: number = 0;
  private trajectoryPreview: TrajectoryPoint[] = [];
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
  
  // Color selection
  private selectedColorNumber: number = 1;
  
  // Movement
  private keysPressed: Set<string> = new Set();
  private movementSpeed: number = 3;
  private lastMoveEmit: number = 0;
  private moveEmitThrottle: number = 50; // ms
  
  // Paint effects
  private paintSplatters: Array<{ position: Position; color: string; timestamp: number; success: boolean }> = [];
  
  // Flying balloons
  private flyingBalloons: Array<{
    position: Position;
    color: string;
    trajectory: TrajectoryPoint[];
    startTime: number;
    duration: number;
    maxArcHeight: number;
  }> = [];

  constructor(canvas: HTMLCanvasElement, socketClient: SocketClient) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get canvas context');
    }
    this.ctx = context;
    this.socketClient = socketClient;
    this.physics = new PhysicsEngine();

    // Set canvas size to match its display size
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.setupEventHandlers();
    this.setupSocketHandlers();
    this.startGameLoop();
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
    const smoothing = 0.15; // Lower = smoother but slower, Higher = snappier
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
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    
    // Keyboard movement
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      e.preventDefault();
      this.keysPressed.add(key);
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
  }

  private updatePlayerMovement(): void {
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

      // Emit to server (throttled)
      const now = Date.now();
      if (now - this.lastMoveEmit > this.moveEmitThrottle) {
        this.socketClient.movePlayer({
          playerId: this.currentPlayerId,
          position: currentPlayer.position,
        });
        this.lastMoveEmit = now;
      }
    }
  }

  private setupSocketHandlers(): void {
    this.socketClient.onPlayerList((players) => {
      this.updatePlayers(players);
      this.updatePlayerListUI();
    });

    this.socketClient.onPlayerJoined((player) => {
      this.players.set(player.id, player);
      this.createAvatarElement(player);
      this.updatePlayerListUI();
    });

    this.socketClient.onPlayerLeft((data) => {
      // Cancel any active animation for this player
      const animation = this.activeAnimations.get(data.playerId);
      if (animation) {
        animation.cancel();
      }
      
      this.players.delete(data.playerId);
      this.removeAvatarElement(data.playerId);
      this.updatePlayerListUI();
    });

    this.socketClient.onPlayerMove((move) => {
      // Update other players' positions
      const player = this.players.get(move.playerId);
      if (player && move.playerId !== this.currentPlayerId) {
        player.position = move.position;
      }
    });

    this.socketClient.onBalloonLand((balloon) => {
      this.handleBalloonLand(balloon);
    });

    this.socketClient.onPaintCell((paint) => {
      this.handlePaintCell(paint);
    });

    this.socketClient.onGameProgress((progress) => {
      this.progress = progress;
      this.updateProgressUI();
    });

    this.socketClient.onGameComplete((data) => {
      const statusEl = document.getElementById('game-status');
      if (statusEl) {
        statusEl.textContent = data.message;
        statusEl.className = 'game-status complete';
      }
    });

    this.socketClient.onGridUpdate((grid) => {
      this.grid = grid;
    });

    this.socketClient.onGameState((state) => {
      console.log('Received game state:', state);
      
      // Update all game state data
      this.grid = state.grid;
      this.gridSize = state.gridSize;
      this.cellPixelSize = state.cellPixelSize;
      this.colors = state.colors;
      this.colorNumberMap = state.colorNumberMap;
      this.progress = state.progress;
      
      // Update players - this must happen before creating avatars
      this.updatePlayers(state.players);
      
      // Create avatar elements for all players (including existing ones)
      state.players.forEach((player) => {
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
      this.createColorPaletteUI();
      
      console.log(`Game state loaded: ${state.players.length} players, grid ${this.gridSize}x${this.gridSize}, ${this.progress.paintedCells} cells painted`);
    });
  }

  private handleMouseDown(e: MouseEvent): void {
    if (this.isThrowing) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = this.screenToWorld({ x: screenX, y: screenY });

    const currentPlayer = this.players.get(this.currentPlayerId);
    if (!currentPlayer) return;

    // Check if clicking near own dice position (in world coordinates)
    const distance = this.physics.distance(worldPos, currentPlayer.position);

    // Only allow throwing if clicking near own dice
    if (distance < 50) {
      this.isThrowing = true;
      this.throwStartPos = worldPos;
      this.throwStartTime = Date.now();
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isThrowing || !this.throwStartPos) return;

    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = this.screenToWorld({ x: screenX, y: screenY });

    // Get current player position
    const currentPlayer = this.players.get(this.currentPlayerId);
    if (!currentPlayer) return;

    // Reverse the drag direction (slingshot mechanic: pull back to throw forward)
    // Use current player position for consistent velocity calculation
    const velocity = this.physics.calculateVelocityFromDrag(
      worldPos,
      currentPlayer.position,
      0.3
    );

    // Calculate trajectory preview starting from avatar position
    const fieldSize = 10000; // Large enough for any reasonable throw
    this.trajectoryPreview = this.physics.calculateTrajectory(
      currentPlayer.position,
      velocity,
      fieldSize,
      fieldSize
    );
  }

  private handleMouseUp(e: MouseEvent): void {
    if (!this.isThrowing || !this.throwStartPos) return;

    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = this.screenToWorld({ x: screenX, y: screenY });

    const currentPlayer = this.players.get(this.currentPlayerId);
    if (!currentPlayer) {
      this.isThrowing = false;
      this.throwStartPos = null;
      this.trajectoryPreview = [];
      return;
    }

    // Reverse the drag direction (slingshot mechanic: pull back to throw forward)
    const velocity = this.physics.calculateVelocityFromDrag(
      worldPos,
      currentPlayer.position,
      0.3
    );

    const selectedColor = this.colorNumberMap[this.selectedColorNumber] || this.colors[0];

    const throwEvent: BalloonThrow = {
      playerId: this.currentPlayerId,
      startPos: currentPlayer.position,
      velocity,
      angle: Math.atan2(velocity.y, velocity.x),
      color: selectedColor,
      colorNumber: this.selectedColorNumber,
    };

    console.log('Throwing balloon:', throwEvent);
    this.socketClient.throwBalloon(throwEvent);

    this.isThrowing = false;
    this.throwStartPos = null;
    this.trajectoryPreview = [];
  }

  private handleMouseLeave(): void {
    if (this.isThrowing) {
      this.isThrowing = false;
      this.throwStartPos = null;
      this.trajectoryPreview = [];
    }
  }

  private handleBalloonLand(balloon: BalloonLand): void {
    console.log('Balloon landed:', balloon);
    
    // Calculate trajectory
    const trajectory = this.physics.calculateTrajectory(
      balloon.startPos,
      balloon.velocity,
      10000,
      10000,
      100
    );

    if (trajectory.length === 0) return;

    // Calculate duration based on trajectory length
    const msPerStep = 15;
    const duration = Math.max(trajectory.length * msPerStep, 300);
    
    // Calculate distance for arc height
    const distance = Math.sqrt(
      Math.pow(balloon.position.x - balloon.startPos.x, 2) +
      Math.pow(balloon.position.y - balloon.startPos.y, 2)
    );
    const maxArcHeight = Math.min(Math.max(distance * 0.3, 50), 200);

    // Add flying balloon to render list
    const flyingBalloon = {
      position: { ...balloon.startPos },
      color: balloon.color,
      trajectory,
      startTime: Date.now(),
      duration,
      maxArcHeight,
    };
    
    this.flyingBalloons.push(flyingBalloon);

    // Schedule balloon landing
    setTimeout(() => {
      // Remove from flying balloons
      const index = this.flyingBalloons.indexOf(flyingBalloon);
      if (index > -1) {
        this.flyingBalloons.splice(index, 1);
      }
      
      // Create splatter effect
      const timestamp = Date.now();
      this.paintSplatters.push({
        position: balloon.position,
        color: balloon.color,
        timestamp,
        success: false, // Will be updated by paint event
      });
      
      // Remove splatter after 1 second
      setTimeout(() => {
        this.paintSplatters = this.paintSplatters.filter(s => s.timestamp !== timestamp);
      }, 1000);
    }, duration);
  }

  private handlePaintCell(paint: PaintEvent): void {
    console.log('Paint cell:', paint);
    
    // Update grid cell if we have it
    if (this.grid[paint.cellY] && this.grid[paint.cellY][paint.cellX]) {
      const cell = this.grid[paint.cellY][paint.cellX];
      if (paint.success) {
        cell.painted = true;
        cell.currentColor = paint.color;
      }
    }
    
    // Update splatter to show success/failure
    const recentSplatter = this.paintSplatters.find(s => {
      const age = Date.now() - s.timestamp;
      return age < 200; // Within 200ms
    });
    
    if (recentSplatter) {
      recentSplatter.success = paint.success;
    }
  }

  private updatePlayers(players: Player[]): void {
    players.forEach((player) => {
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
      this.updateAvatarPosition(player);
    });
  }

  private draw(): void {
    // Clear canvas with white background
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw painting grid
    this.drawPaintingGrid();

    // Draw trajectory preview
    if (this.trajectoryPreview.length > 0) {
      this.drawTrajectory();
    }

    // Draw flying balloons
    this.drawFlyingBalloons();

    // Draw paint splatters
    this.drawPaintSplatters();
    
    // Draw position debug info
    this.drawDebugInfo();
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

  private drawTrajectory(): void {
    if (this.trajectoryPreview.length < 2) return;

    this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();

    const firstPoint = this.trajectoryPreview[0];
    const screenFirst = this.worldToScreen(firstPoint);
    this.ctx.moveTo(screenFirst.x, screenFirst.y);

    for (let i = 1; i < this.trajectoryPreview.length; i++) {
      const point = this.trajectoryPreview[i];
      const screenPoint = this.worldToScreen(point);
      this.ctx.lineTo(screenPoint.x, screenPoint.y);
    }

    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Draw landing marker
    if (this.trajectoryPreview.length > 0) {
      const lastPoint = this.trajectoryPreview[this.trajectoryPreview.length - 1];
      const screenLast = this.worldToScreen(lastPoint);
      this.ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
      this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(screenLast.x, screenLast.y, 10, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    }
  }

  private drawFlyingBalloons(): void {
    const now = Date.now();
    
    this.flyingBalloons.forEach((balloon) => {
      const elapsed = now - balloon.startTime;
      const progress = Math.min(elapsed / balloon.duration, 1);
      
      // Use easing function for smooth animation
      const easedProgress = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      
      // Interpolate along trajectory
      const index = Math.floor(easedProgress * (balloon.trajectory.length - 1));
      const point = balloon.trajectory[Math.min(index, balloon.trajectory.length - 1)];
      
      // Calculate parabolic arc height (peaks at 0.5 progress)
      const arcHeight = balloon.maxArcHeight * 4 * progress * (1 - progress);
      
      // Update balloon position
      balloon.position = { x: point.x, y: point.y };
      
      // Convert to screen coordinates
      const screenPos = this.worldToScreen(balloon.position);
      
      // Parse the color
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        } : { r: 255, g: 0, b: 0 };
      };
      
      const rgb = hexToRgb(balloon.color);
      
      // Draw balloon shadow (on ground)
      const shadowOpacity = 0.2 * (1 - progress * 0.5);
      this.ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
      this.ctx.beginPath();
      this.ctx.ellipse(screenPos.x, screenPos.y, 15, 8, 0, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Draw balloon (elevated by arc height)
      const balloonY = screenPos.y - arcHeight;
      
      // Scale balloon based on height for depth
      const scale = 1 + (arcHeight / 200) * 0.3;
      const balloonRadius = 12 * scale;
      
      // Draw balloon body
      this.ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`;
      this.ctx.beginPath();
      this.ctx.arc(screenPos.x, balloonY, balloonRadius, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Draw balloon highlight
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      this.ctx.beginPath();
      this.ctx.arc(screenPos.x - balloonRadius * 0.3, balloonY - balloonRadius * 0.3, balloonRadius * 0.4, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Draw balloon outline
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(screenPos.x, balloonY, balloonRadius, 0, Math.PI * 2);
      this.ctx.stroke();
      
      // Draw balloon string
      this.ctx.strokeStyle = 'rgba(100, 100, 100, 0.6)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(screenPos.x, balloonY + balloonRadius);
      this.ctx.quadraticCurveTo(
        screenPos.x + 3, 
        balloonY + balloonRadius + 10,
        screenPos.x, 
        balloonY + balloonRadius + 15
      );
      this.ctx.stroke();
    });
  }

  private drawPaintSplatters(): void {
    const now = Date.now();
    this.paintSplatters.forEach((splatter) => {
      const age = now - splatter.timestamp;
      const opacity = Math.max(0, 1 - age / 1000);
      
      const screenPos = this.worldToScreen(splatter.position);
      
      // Parse the color and add opacity
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        } : { r: 255, g: 0, b: 0 };
      };
      
      const rgb = hexToRgb(splatter.color);
      this.ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity * 0.6})`;
      
      // Draw splatter effect
      this.ctx.beginPath();
      this.ctx.arc(screenPos.x, screenPos.y, 25, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Draw success/failure indicator
      if (splatter.success) {
        this.ctx.strokeStyle = `rgba(0, 255, 0, ${opacity})`;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(screenPos.x, screenPos.y, 30, 0, Math.PI * 2);
        this.ctx.stroke();
      } else if (age > 200) {
        // Show X for failure after animation settles
        this.ctx.strokeStyle = `rgba(255, 0, 0, ${opacity})`;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(screenPos.x - 15, screenPos.y - 15);
        this.ctx.lineTo(screenPos.x + 15, screenPos.y + 15);
        this.ctx.moveTo(screenPos.x + 15, screenPos.y - 15);
        this.ctx.lineTo(screenPos.x - 15, screenPos.y + 15);
        this.ctx.stroke();
      }
    });
  }

  private drawDebugInfo(): void {
    const currentPlayer = this.players.get(this.currentPlayerId);
    if (!currentPlayer) return;

    // Draw world coordinates in corner (optional debug info)
    // Uncomment to show position coordinates:
    // this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    // this.ctx.font = '14px monospace';
    // const posText = `World: (${Math.round(currentPlayer.position.x)}, ${Math.round(currentPlayer.position.y)})`;
    // this.ctx.fillText(posText, 10, 20);
  }

  setCurrentPlayer(playerId: string): void {
    this.currentPlayerId = playerId;
    const currentPlayerEl = document.getElementById('current-player');
    const player = this.players.get(playerId);
    if (currentPlayerEl && player) {
      currentPlayerEl.textContent = `You: ${player.username}`;
    }
  }
}

