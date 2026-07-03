import {
  GoogleAuthProvider,
  signInAnonymously,
  signInWithPopup,
  updateProfile,
  type User,
} from 'firebase/auth';
import type { AuthGateway, AuthenticatedPlayer } from '../../application/ports/AuthGateway';
import { getFirebaseAuth } from './firebaseApp';

export class FirebaseAuthGateway implements AuthGateway {
  public async signInAnonymously(displayName = 'Jugador'): Promise<AuthenticatedPlayer> {
    const auth = getFirebaseAuth();
    const credential = await signInAnonymously(auth);
    if (displayName && credential.user.displayName !== displayName) {
      await updateProfile(credential.user, { displayName });
    }

    return this.fromUser(credential.user, displayName);
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
