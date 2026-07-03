export interface Clock {
  now(): number;
}

export class SystemClock implements Clock {
  public now(): number {
    return Date.now();
  }
}
