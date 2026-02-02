// firebase-init.js
// Firebase compat SDK (keeps the code simple for static pages)
import "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js";
import "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js";
import "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js";

const firebaseConfig = {
  apiKey: "AIzaSyDw7lK1obLfMziXFr7gJr5R5huFGjfVcc8",
  authDomain: "ifwl-591d8.firebaseapp.com",
  projectId: "ifwl-591d8",
  storageBucket: "ifwl-591d8.firebasestorage.app",
  messagingSenderId: "703021152109",
  appId: "1:703021152109:web:18e2f6a73e0521e4850c64",
  measurementId: "G-974R4YE6L5"
};

firebase.initializeApp(firebaseConfig);

export const auth = firebase.auth();
export const db = firebase.firestore();
export const firebaseNS = firebase;
