/**
 * Firebase Configuration
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to Firebase Console: https://console.firebase.google.com/
 * 2. Create a new project or select existing project
 * 3. Go to Project Settings > General > Your apps
 * 4. Click "Add app" and select Web (</>)
 * 5. Register your app and copy the configuration object
 * 6. Replace the firebaseConfig object below with your config
 * 7. Enable Firestore Database in Firebase Console
 * 8. Set up Firestore security rules (see below)
 *
 * SECURITY RULES for Firestore:
 * Go to Firestore Database > Rules and use:
 *
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     // Allow anyone to write to feedback collection (anonymous submissions)
 *     match /feedback/{feedbackId} {
 *       allow create: if true;
 *       allow read, update, delete: if false; // Only you can read via Firebase Console
 *     }
 *   }
 * }
 */

// Your Firebase configuration object
const firebaseConfig = {
  apiKey: "AIzaSyA7lVAzJRJPFeguUpPnMlOQRU-Ty8umx7k",
  authDomain: "kk26-feedback.firebaseapp.com",
  projectId: "kk26-feedback",
  storageBucket: "kk26-feedback.firebasestorage.app",
  messagingSenderId: "188267150626",
  appId: "1:188267150626:web:4804b9c6f55c21cbd8797b"
};

// Initialize Firebase (using compat SDK)
try {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        console.log('Firebase initialized successfully');

        // Initialize Firestore
        const db = firebase.firestore();

        // Optional: Enable offline persistence for better UX
        db.enablePersistence()
            .catch((err) => {
                if (err.code === 'failed-precondition') {
                    console.warn('Persistence failed: Multiple tabs open');
                } else if (err.code === 'unimplemented') {
                    console.warn('Persistence not available in this browser');
                }
            });
    } else {
        console.error('Firebase SDK not loaded. Please include Firebase scripts in HTML.');
    }
} catch (error) {
    console.error('Error initializing Firebase:', error);
}
