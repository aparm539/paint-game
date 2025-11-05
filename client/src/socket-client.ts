import { io, Socket } from 'socket.io-client';
import {
  SocketEvents,
  type Player,
  type BalloonThrow,
  type BalloonLand,
  type PaintEvent,
  type GameProgress,
  type GameState,
  type PlayerMove,
  type GridCell,
} from '../../shared/types.js';

export class SocketClient {
  private socket: Socket;
  private onPlayerListCallback?: (players: Player[]) => void;
  private onPlayerJoinedCallback?: (player: Player) => void;
  private onPlayerLeftCallback?: (data: { playerId: string }) => void;
  private onBalloonLandCallback?: (balloon: BalloonLand) => void;
  private onPaintCellCallback?: (paint: PaintEvent) => void;
  private onGameProgressCallback?: (progress: GameProgress) => void;
  private onGameCompleteCallback?: (data: { message: string; progress: GameProgress }) => void;
  private onGameStateCallback?: (state: GameState) => void;
  private onGridUpdateCallback?: (grid: GridCell[][]) => void;
  private onPlayerMoveCallback?: (move: PlayerMove) => void;

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

    this.socket.on(SocketEvents.BALLOON_LAND, (balloon: BalloonLand) => {
      this.onBalloonLandCallback?.(balloon);
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
  }

  join(username: string, startPosition?: { x: number; y: number }): void {
    this.socket.emit(SocketEvents.JOIN, { username, startPosition });
  }

  throwBalloon(throwEvent: BalloonThrow): void {
    this.socket.emit(SocketEvents.THROW_BALLOON, throwEvent);
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

  onBalloonLand(callback: (balloon: BalloonLand) => void): void {
    this.onBalloonLandCallback = callback;
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

  disconnect(): void {
    this.socket.disconnect();
  }
}

