export interface AuthenticatedPlayer {
  readonly uid: string;
  readonly displayName: string;
  readonly isAnonymous: boolean;
}

/** Authentication boundary used by presentation without depending on Firebase APIs. */
export interface AuthGateway {
  signInAnonymously(displayName?: string): Promise<AuthenticatedPlayer>;
  signInWithGoogle(): Promise<AuthenticatedPlayer>;
  getCurrentPlayer(): AuthenticatedPlayer | null;
}
