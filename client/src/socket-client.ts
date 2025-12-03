import { io, Socket } from 'socket.io-client';
import {
  SocketEvents,
  type Player,
  type PaintCellRequest,
  type PaintEvent,
  type GameProgress,
  type GameState,
  type PlayerMove,
  type GridCell,
  type PaintSupplyUpdate,
  type GoldUpdate,
  type Position,
  type PurchaseUpgradeRequest,
  type PurchaseUpgradeResponse,
} from '../../shared/types.js';
import { GAME_CONFIG } from '../../shared/config.js';

type SocketEventMap = {
  playerList: (players: Player[]) => void;
  playerJoined: (player: Player) => void;
  playerLeft: (data: { playerId: string }) => void;
  paintCell: (paint: PaintEvent) => void;
  gameProgress: (progress: GameProgress) => void;
  gameComplete: (data: { message: string; progress: GameProgress }) => void;
  gameState: (state: GameState) => void;
  gridUpdate: (grid: GridCell[][]) => void;
  playerMove: (move: PlayerMove) => void;
  paintSupplyUpdate: (update: PaintSupplyUpdate) => void;
  goldUpdate: (update: GoldUpdate) => void;
  upgradePurchased: (response: PurchaseUpgradeResponse) => void;
  connect: () => void;
  disconnect: () => void;
  reconnectAttempt: (attemptNumber: number) => void;
  reconnectFailed: () => void;
};

export class SocketClient {
  private socket: Socket;
  private eventHandlers: Map<string, Set<Function>> = new Map();
  
  // Cached credentials for reconnection
  private cachedUsername: string = '';
  private positionProvider: (() => Position | undefined) | null = null;

  constructor() {
    // Use relative URL - socket.io will connect to the same host/protocol as the page
    this.socket = io({
      reconnection: true,
      reconnectionAttempts: GAME_CONFIG.RECONNECTION_ATTEMPTS,
      reconnectionDelay: GAME_CONFIG.RECONNECTION_DELAY,
      reconnectionDelayMax: GAME_CONFIG.RECONNECTION_DELAY_MAX,
    });
    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    this.socket.on('connect', () => {
      this.emit('connect');
    });

    this.socket.on('disconnect', () => {
      this.emit('disconnect');
    });
    
    // Reconnection events from Socket.IO manager
    this.socket.io.on('reconnect_attempt', (attempt: number) => {
      this.emit('reconnectAttempt', attempt);
    });
    
    this.socket.io.on('reconnect_failed', () => {
      this.emit('reconnectFailed');
    });

    this.socket.on(SocketEvents.PLAYER_LIST, (players: Player[]) => {
      this.emit('playerList', players);
    });

    this.socket.on(SocketEvents.PLAYER_JOINED, (player: Player) => {
      this.emit('playerJoined', player);
    });

    this.socket.on(SocketEvents.PLAYER_LEFT, (data: { playerId: string }) => {
      this.emit('playerLeft', data);
    });

    this.socket.on(SocketEvents.PAINT_CELL, (paint: PaintEvent) => {
      this.emit('paintCell', paint);
    });

    this.socket.on(SocketEvents.GAME_PROGRESS, (progress: GameProgress) => {
      this.emit('gameProgress', progress);
    });

    this.socket.on(SocketEvents.GAME_COMPLETE, (data: { message: string; progress: GameProgress }) => {
      this.emit('gameComplete', data);
    });

    this.socket.on(SocketEvents.GAME_STATE, (state: GameState) => {
      this.emit('gameState', state);
    });

    this.socket.on(SocketEvents.GRID_UPDATE, (grid: GridCell[][]) => {
      this.emit('gridUpdate', grid);
    });

    this.socket.on(SocketEvents.MOVE, (move: PlayerMove) => {
      this.emit('playerMove', move);
    });

    this.socket.on(SocketEvents.PAINT_SUPPLY_UPDATE, (update: PaintSupplyUpdate) => {
      this.emit('paintSupplyUpdate', update);
    });

    this.socket.on(SocketEvents.GOLD_UPDATE, (update: GoldUpdate) => {
      this.emit('goldUpdate', update);
    });

    this.socket.on(SocketEvents.UPGRADE_PURCHASED, (response: PurchaseUpgradeResponse) => {
      this.emit('upgradePurchased', response);
    });
  }

  private emit<K extends keyof SocketEventMap>(event: K, ...args: Parameters<SocketEventMap[K]>): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(...args));
    }
  }

  on<K extends keyof SocketEventMap>(event: K, handler: SocketEventMap[K]): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    
    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  off<K extends keyof SocketEventMap>(event: K, handler: SocketEventMap[K]): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  join(username: string, startPosition?: Position): void {
    // Cache username for reconnection
    this.cachedUsername = username;
    this.socket.emit(SocketEvents.JOIN, { username, startPosition });
  }
  
  rejoin(): void {
    if (!this.cachedUsername) return;
    
    // Get current position from provider, or undefined to let server assign
    const currentPosition = this.positionProvider?.();
    this.socket.emit(SocketEvents.JOIN, { 
      username: this.cachedUsername, 
      startPosition: currentPosition 
    });
  }
  
  setPositionProvider(provider: () => Position | undefined): void {
    this.positionProvider = provider;
  }
  
  manualReconnect(): void {
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  requestPaintCell(request: PaintCellRequest): void {
    this.socket.emit(SocketEvents.PAINT_CELL_REQUEST, request);
  }

  movePlayer(move: PlayerMove): void {
    this.socket.emit(SocketEvents.MOVE, move);
  }

  getSocketId(): string {
    return this.socket.id || '';
  }

  purchaseUpgrade(request: PurchaseUpgradeRequest): void {
    this.socket.emit(SocketEvents.PURCHASE_UPGRADE, request);
  }

  isConnected(): boolean {
    return this.socket.connected;
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}

