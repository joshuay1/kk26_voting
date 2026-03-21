# Firebase Setup Instructions for Feedback Page

This guide will help you set up Firebase to collect feedback submissions from the KK26 Feedback page.

## Prerequisites

- A Google account
- Web browser

## Step-by-Step Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or select an existing project
3. Enter a project name (e.g., `kk26-voting-feedback`)
4. (Optional) Enable Google Analytics if desired
5. Click **"Create project"** and wait for it to be ready

### 2. Register Your Web App

1. In the Firebase Console, click on the **Web icon** (`</>`) to add a web app
2. Enter an app nickname (e.g., `KK26 Feedback Form`)
3. **DO NOT** check "Also set up Firebase Hosting" (not needed)
4. Click **"Register app"**
5. You'll see a configuration object like this:

```


// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA7lVAzJRJPFeguUpPnMlOQRU-Ty8umx7k",
  authDomain: "kk26-feedback.firebaseapp.com",
  projectId: "kk26-feedback",
  storageBucket: "kk26-feedback.firebasestorage.app",
  messagingSenderId: "188267150626",
  appId: "1:188267150626:web:4804b9c6f55c21cbd8797b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);


```

6. **Copy this configuration object** - you'll need it in the next step

### 3. Update Firebase Configuration File

1. Open the file: `kk26_voting/receipts/js/firebase-config.js`
2. Replace the placeholder `firebaseConfig` object with your actual configuration from step 2
3. Save the file

**Before:**
```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    // ...
};
```

**After:**
```javascript
const firebaseConfig = {
    apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain: "kk26-voting-feedback.firebaseapp.com",
    projectId: "kk26-voting-feedback",
    storageBucket: "kk26-voting-feedback.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef123456"
};
```

### 4. Enable Firestore Database

1. In the Firebase Console, click **"Firestore Database"** in the left sidebar
2. Click **"Create database"**
3. Choose **"Start in production mode"** (we'll configure rules next)
4. Select a Cloud Firestore location (choose closest to your users)
5. Click **"Enable"**

### 5. Set Up Security Rules

1. In Firestore Database, go to the **"Rules"** 
2. Replace the default rules with the following:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow anyone to write to feedback collection (anonymous submissions)
    match /feedback/{feedbackId} {
      allow create: if true;
      allow update: if request.auth == null &&
                       resource.data.stage_completed == 1 &&
                       request.resource.data.stage_completed == 2;
      allow read, delete: if false;
    }
  }
}
```

3. Click **"Publish"**

**What these rules do:**
- ✅ Allow anyone to **create** new feedback documents (anonymous submissions)
- ✅ Allow anyone to **update** documents ONLY if they're updating from stage 1 to stage 2 (two-stage feedback flow)
- ❌ Prevent public **reading** or **deleting** of feedback
- ✅ Only you (as the project owner) can read feedback via the Firebase Console

### 6. Test the Feedback Form

1. Open `kk26_voting/receipts/feedback.html` in your web browser
2. Fill out the feedback form
3. Click **"Feedback absenden"**
4. You should see a success message: "Vielen Dank! Ihr Feedback wurde erfolgreich übermittelt."

### 7. View Submitted Feedback

1. Go to Firebase Console → **Firestore Database**
2. You'll see a collection named **`feedback`**
3. Click on it to view all submitted feedback entries
4. Each document contains:
   - Ratings for all formats (1-7 scale)
   - Open question response
   - Metadata (timestamp, browser info, theme preference)

## Data Structure

Each feedback submission is stored as a document with this structure:

```json
{
  "format_a": {
    "q1_understanding_funding": 5,
    "q2_vote_impact": 6,
    "q3_transparency": 7
  },
  "format_b": {
    "q1_understanding_funding": 4,
    "q2_vote_impact": 5,
    "q3_transparency": 6
  },
  "format_c": {
    "q1_understanding_funding": 6,
    "q2_vote_impact": 5,
    "q3_transparency": 7
  },
  "overall": {
    "trust_in_result": 6
  },
  "open_question": "Ich fand die Kombination sehr hilfreich...",
  "metadata": {
    "submitted_at": "2026-03-21T10:30:00.000Z",
    "user_agent": "Mozilla/5.0...",
    "screen_width": 1920,
    "screen_height": 1080,
    "theme": "dark"
  }
}
```

## Exporting Feedback Data

To export your feedback for analysis:

1. Go to Firebase Console → **Firestore Database**
2. Click on the **`feedback`** collection
3. Use the Firebase Admin SDK or Cloud Functions to export to CSV/JSON
4. Alternatively, use the [Firebase CLI](https://firebase.google.com/docs/cli) to export data

### Quick Export (Manual Method)

In the Firebase Console:
1. Open the browser's Developer Console (F12)
2. Run this script to copy all feedback as JSON:

```javascript
const db = firebase.firestore();
db.collection('feedback').get().then(snapshot => {
  const data = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
  console.log(JSON.stringify(data, null, 2));
});
```

3. Copy the output and save it to a `.json` file

## Troubleshooting

### "Firebase SDK not loaded" Error

**Solution:** Make sure you have internet connection. The Firebase SDK is loaded from CDN.

### "Permission denied" Error

**Solution:** Check your Firestore security rules. Make sure `allow create: if true;` is set for the feedback collection.

### Form submits but data doesn't appear in Firebase

**Solution:**
1. Check browser console for errors (F12 → Console tab)
2. Verify your `firebase-config.js` has the correct configuration
3. Ensure Firestore is enabled in your Firebase project

### Want to test without Firebase?

Uncomment the development mode code at the bottom of `js/feedback.js`:

```javascript
async function submitToFirebase(data) {
    console.log('=== FEEDBACK SUBMISSION (DEV MODE) ===');
    console.log(JSON.stringify(data, null, 2));
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { id: 'dev-' + Date.now() };
}
```

This will log submissions to the browser console without sending to Firebase.

## Cost & Limits

Firebase has a **free tier** (Spark Plan) that includes:
- ✅ 50,000 reads per day
- ✅ 20,000 writes per day (feedback submissions)
- ✅ 1 GiB storage
- ✅ 10 GiB/month bandwidth

This is more than enough for a feedback form. You'll likely never need to pay unless you get thousands of submissions daily.

## Security Notes

- ✅ **Anonymous submissions:** No authentication required
- ✅ **Write-only access:** Users can only submit, not read or modify data
- ✅ **No sensitive data:** The form doesn't collect personal information
- ⚠️ **Rate limiting:** Consider adding Firebase App Check or reCAPTCHA if you experience spam

## Next Steps

- **Add Firebase App Check** for spam protection (optional)
- **Set up email notifications** when new feedback arrives (using Cloud Functions)
- **Create a dashboard** to visualize feedback statistics
- **Export data regularly** for analysis in Excel, Google Sheets, or Python

## Support

For Firebase issues:
- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Support](https://firebase.google.com/support)

For form-specific issues:
- Check the browser console for JavaScript errors
- Review the code in `js/feedback.js`
