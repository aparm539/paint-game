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
} from '../../shared/types.js';

export class SocketClient {
  private socket: Socket;
  private onPlayerListCallback?: (players: Player[]) => void;
  private onPlayerJoinedCallback?: (player: Player) => void;
  private onPlayerLeftCallback?: (data: { playerId: string }) => void;
  private onPaintCellCallback?: (paint: PaintEvent) => void;
  private onGameProgressCallback?: (progress: GameProgress) => void;
  private onGameCompleteCallback?: (data: { message: string; progress: GameProgress }) => void;
  private onGameStateCallback?: (state: GameState) => void;
  private onGridUpdateCallback?: (grid: GridCell[][]) => void;
  private onPlayerMoveCallback?: (move: PlayerMove) => void;
  private onPaintSupplyUpdateCallback?: (update: PaintSupplyUpdate) => void;

  constructor(serverUrl: string = 'http://localhost:3000') {
    this.socket = io(serverUrl);

    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    this.socket.on(SocketEvents.PLAYER_LIST, (players: Player[]) => {
      this.onPlayerListCallback?.(players);
    });

    this.socket.on(SocketEvents.PLAYER_JOINED, (player: Player) => {
      this.onPlayerJoinedCallback?.(player);
    });

    this.socket.on(SocketEvents.PLAYER_LEFT, (data: { playerId: string }) => {
      this.onPlayerLeftCallback?.(data);
    });

    this.socket.on(SocketEvents.PAINT_CELL, (paint: PaintEvent) => {
      this.onPaintCellCallback?.(paint);
    });

    this.socket.on(SocketEvents.GAME_PROGRESS, (progress: GameProgress) => {
      this.onGameProgressCallback?.(progress);
    });

    this.socket.on(SocketEvents.GAME_COMPLETE, (data: { message: string; progress: GameProgress }) => {
      this.onGameCompleteCallback?.(data);
    });

    this.socket.on(SocketEvents.GAME_STATE, (state: GameState) => {
      this.onGameStateCallback?.(state);
    });

    this.socket.on(SocketEvents.GRID_UPDATE, (grid: GridCell[][]) => {
      this.onGridUpdateCallback?.(grid);
    });

    this.socket.on(SocketEvents.MOVE, (move: PlayerMove) => {
      this.onPlayerMoveCallback?.(move);
    });

    this.socket.on(SocketEvents.PAINT_SUPPLY_UPDATE, (update: PaintSupplyUpdate) => {
      this.onPaintSupplyUpdateCallback?.(update);
    });
  }

  join(username: string, startPosition?: { x: number; y: number }): void {
    this.socket.emit(SocketEvents.JOIN, { username, startPosition });
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

  isConnected(): boolean {
    return this.socket.connected;
  }

  // Event callbacks
  onPlayerList(callback: (players: Player[]) => void): void {
    this.onPlayerListCallback = callback;
  }

  onPlayerJoined(callback: (player: Player) => void): void {
    this.onPlayerJoinedCallback = callback;
  }

  onPlayerLeft(callback: (data: { playerId: string }) => void): void {
    this.onPlayerLeftCallback = callback;
  }

  onPaintCell(callback: (paint: PaintEvent) => void): void {
    this.onPaintCellCallback = callback;
  }

  onGameProgress(callback: (progress: GameProgress) => void): void {
    this.onGameProgressCallback = callback;
  }

  onGameComplete(callback: (data: { message: string; progress: GameProgress }) => void): void {
    this.onGameCompleteCallback = callback;
  }

  onGameState(callback: (state: GameState) => void): void {
    this.onGameStateCallback = callback;
  }

  onGridUpdate(callback: (grid: GridCell[][]) => void): void {
    this.onGridUpdateCallback = callback;
  }

  onPlayerMove(callback: (move: PlayerMove) => void): void {
    this.onPlayerMoveCallback = callback;
  }

  onPaintSupplyUpdate(callback: (update: PaintSupplyUpdate) => void): void {
    this.onPaintSupplyUpdateCallback = callback;
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}

