// src/utils/uuid.ts
import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a random UUID
 */
export function generateUuid(): string {
  return uuidv4();
}

/**
 * Validates if a string is a valid UUID
 */
export function isValidUuid(id: string): boolean {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(id);
}

/**
 * Safe parsing of UUID from request parameters
 * Returns null if invalid
 */
export function parseUuid(id: string | string[] | undefined): string | null {
  if (!id || Array.isArray(id)) {
    return null;
  }
  
  return isValidUuid(id) ? id : null;
}