export interface IdGenerator {
  gameId(): string;
  moveId(): string;
  seed(): number;
}

export class BrowserIdGenerator implements IdGenerator {
  public gameId(): string {
    const bytes = new Uint8Array(4);
    globalThis.crypto?.getRandomValues(bytes);
    const random = Array.from(bytes)
      .map((value) => value.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 6);

    return random.toUpperCase();
  }

  public moveId(): string {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  public seed(): number {
    const bytes = new Uint32Array(1);
    globalThis.crypto?.getRandomValues(bytes);
    return bytes[0] || Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  }
}
