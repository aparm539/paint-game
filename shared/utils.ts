// Shared utility functions

import type { Position } from './types.js';

// Small epsilon to handle floating point precision issues at cell boundaries
// This prevents Math.floor from producing incorrect results when positions
// are exactly on cell boundaries (e.g., -25.0 becoming -25.000000001)
const GRID_EPSILON = 0.0001;

/**
 * Convert world coordinates to grid cell coordinates
 * Returns null if the position is outside the grid bounds
 */
export function worldToGrid(
  position: Position,
  gridSize: number,
  cellPixelSize: number
): { x: number; y: number } | null {
  // Grid is centered at origin (0, 0)
  const gridPixelSize = gridSize * cellPixelSize;
  const halfGrid = gridPixelSize / 2;
  
  // Convert world coordinates to grid coordinates
  // Add GRID_EPSILON to handle floating point precision at cell boundaries
  const gridX = Math.floor((position.x + halfGrid + GRID_EPSILON) / cellPixelSize);
  const gridY = Math.floor((position.y + halfGrid + GRID_EPSILON) / cellPixelSize);
  
  // Check if within bounds
  if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
    return { x: gridX, y: gridY };
  }
  
  return null;
}

/**
 * Convert hex color string to RGB components
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 255, g: 0, b: 0 }; // Default to red if parsing fails
}

/**
 * Check if a position is within a circular zone
 */
export function isInCircularZone(
  position: Position,
  centerX: number,
  centerY: number,
  radius: number
): boolean {
  const dx = position.x - centerX;
  const dy = position.y - centerY;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Linear interpolation between two values
 */
export function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
