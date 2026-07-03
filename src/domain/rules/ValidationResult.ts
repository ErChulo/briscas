export interface ValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

export const validResult: ValidationResult = { valid: true };

export function invalidResult(reason: string): ValidationResult {
  return { valid: false, reason };
}
