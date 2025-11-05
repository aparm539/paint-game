import type { Position, BalloonThrow } from '../../shared/types.js';

export interface TrajectoryPoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export class PhysicsEngine {
  private friction: number = 0.95; // Top-down friction (dice sliding on table)

  // Calculate trajectory preview points (top-down view)
  calculateTrajectory(
    startPos: Position,
    velocity: Position,
    fieldWidth: number,
    fieldHeight: number,
    maxPoints: number = 50
  ): TrajectoryPoint[] {
    const points: TrajectoryPoint[] = [];
    let x = startPos.x;
    let y = startPos.y;
    let vx = velocity.x;
    let vy = velocity.y;

    for (let i = 0; i < maxPoints; i++) {
      points.push({ x, y, vx, vy });

      // Update position (top-down: just friction, no gravity)
      x += vx;
      y += vy;
      vx *= this.friction;
      vy *= this.friction;

      // Stop if velocity is too low
      if (Math.abs(vx) < 0.1 && Math.abs(vy) < 0.1) {
        break;
      }
    }

    return points;
  }

  // Calculate final landing position (top-down view)
  calculateLandingPosition(
    throwEvent: BalloonThrow,
    fieldWidth: number,
    fieldHeight: number
  ): Position {
    const trajectory = this.calculateTrajectory(
      throwEvent.startPos,
      throwEvent.velocity,
      fieldWidth,
      fieldHeight,
      200
    );

    if (trajectory.length === 0) {
      return throwEvent.startPos;
    }

    const lastPoint = trajectory[trajectory.length - 1];
    return {
      x: lastPoint.x,
      y: lastPoint.y,
    };
  }

  // Calculate velocity from drag (mouse movement) - top-down view
  calculateVelocityFromDrag(
    startPos: Position,
    endPos: Position,
    dragTime: number = 0.3
  ): Position {
    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Scale velocity based on drag distance (stronger for top-down)
    const scale = Math.min(distance / 100, 3); // Max 3x scale, more responsive
    
    return {
      x: (dx / dragTime) * scale * 0.15,
      y: (dy / dragTime) * scale * 0.15,
    };
  }

  // Calculate distance between two points
  distance(pos1: Position, pos2: Position): number {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Check if point is within radius
  isWithinRadius(center: Position, point: Position, radius: number): boolean {
    return this.distance(center, point) <= radius;
  }
}

