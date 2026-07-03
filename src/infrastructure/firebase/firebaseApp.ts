import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFirebaseConfig } from '../config/firebaseConfig';

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;
let auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  const config = getFirebaseConfig();
  if (!config) {
    throw new Error('Firebase is not configured. Copy .env.example to .env and fill the public web config.');
  }

  app ??= initializeApp(config);
  return app;
}

export function getFirebaseFirestore(): Firestore {
  firestore ??= getFirestore(getFirebaseApp());
  return firestore;
}

export function getFirebaseAuth(): Auth {
  auth ??= getAuth(getFirebaseApp());
  return auth;
}
