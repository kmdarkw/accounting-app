import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCNOz8_OKvhoep9ehHQ1mskNISC4eYiGvY",
  authDomain: "accounting-app-dar.firebaseapp.com",
  projectId: "accounting-app-dar",
  storageBucket: "accounting-app-dar.firebasestorage.app",
  messagingSenderId: "1033355477654",
  appId: "1:1033355477654:web:9f9d989aaae886ebb538b7",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };