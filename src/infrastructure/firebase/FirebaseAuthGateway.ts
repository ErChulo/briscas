import {
  GoogleAuthProvider,
  signInAnonymously as firebaseSignInAnonymously,
  signInWithPopup,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import type { AuthGateway, AuthenticatedPlayer } from '../../application/ports/AuthGateway';
import { getFirebaseAuth } from './firebaseApp';

const AUTH_RETRY_AFTER_MS = 10_000;
let pendingAnonymousSignIn: { readonly startedAt: number; readonly promise: Promise<User> } | null = null;

export class FirebaseAuthGateway implements AuthGateway {
  public async signInAnonymously(displayName = 'Jugador'): Promise<AuthenticatedPlayer> {
    const auth = getFirebaseAuth();
    const user = auth.currentUser ?? await signInOnce(auth);
    if (displayName && user.displayName !== displayName) {
      await updateProfile(user, { displayName });
    }

    return { uid: user.uid, displayName, isAnonymous: user.isAnonymous };
  }

  public async signInWithGoogle(): Promise<AuthenticatedPlayer> {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    return this.fromUser(credential.user);
  }

  public getCurrentPlayer(): AuthenticatedPlayer | null {
    const user = getFirebaseAuth().currentUser;
    return user ? this.fromUser(user) : null;
  }

  private fromUser(user: User, fallbackName = 'Jugador'): AuthenticatedPlayer {
    return {
      uid: user.uid,
      displayName: user.displayName || fallbackName,
      isAnonymous: user.isAnonymous,
    };
  }
}

function signInOnce(auth: Auth): Promise<User> {
  const now = Date.now();
  if (pendingAnonymousSignIn && now - pendingAnonymousSignIn.startedAt <= AUTH_RETRY_AFTER_MS) {
    return pendingAnonymousSignIn.promise;
  }

  const promise = firebaseSignInAnonymously(auth)
    .then((credential) => credential.user)
    .finally(() => {
      if (pendingAnonymousSignIn?.promise === promise) {
        pendingAnonymousSignIn = null;
      }
    });

  pendingAnonymousSignIn = { startedAt: now, promise };
  return promise;
}
