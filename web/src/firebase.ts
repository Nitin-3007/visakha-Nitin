import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyC2H_QVGZZer4grAL4XfYbhJpvoWApkMiM",
    authDomain: "alchemist-visakha.firebaseapp.com",
    projectId: "alchemist-visakha",
    storageBucket: "alchemist-visakha.firebasestorage.app",
    messagingSenderId: "1046916553279",
    appId: "1:1046916553279:web:9df21f52ad306a8c0f768a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
