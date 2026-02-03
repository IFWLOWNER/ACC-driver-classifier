// firebase-init.js  (NON-module)

const firebaseConfig = {
  apiKey: "AIzaSyDw7lK1obLfMziXFr7gJr5R5huFGjfVcc8",
  authDomain: "ifwl-591d8.firebaseapp.com",
  projectId: "ifwl-591d8",
  storageBucket: "ifwl-591d8.firebasestorage.app",
  messagingSenderId: "703021152109",
  appId: "1:703021152109:web:18e2f6a73e0521e4850c64",
  measurementId: "G-974R4YE6L5"
};

// Prevent double-init errors if script loads twice
if (!firebase.apps || firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
}

// expose globals used by your page scripts
window.auth = firebase.auth();
window.db = firebase.firestore();
window.firebaseNS = firebase;
