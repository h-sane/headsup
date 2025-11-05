# 📘 **Heads Up – AI Powered Guessing Game**

### A fast, fun, and endlessly replayable word-guessing game powered by **Firebase**, **Cloud Functions**, and **Gemini AI**.

<br>

## ⭐ Overview

**Heads Up** is a mobile-optimized web game inspired by the classic party game.
Players choose a category, place the phone on their forehead, and their friends give clues as they guess the word.

The game uses:

* ✅ **Firebase Auth** for secure Google Login
* ✅ **Firestore** for persistent word decks
* ✅ **Cloud Run Function (`getAiWords`)** to generate new words using Gemini
* ✅ **Personal private decks per user ("slave decks")**
* ✅ **One shared "master deck" per category**
* ✅ **Tone.js sound effects**
* ✅ Fully responsive UI with **Tailwind CSS**

This ensures:

* Unique gameplay for each player
* Words never repeat
* Decks automatically refill
* Minimal API usage (cost-optimized)

---

# 🎮 **Gameplay Features**

### ✅ Category selection (Movies, Celebrities, Animals, Science, etc.)

### ✅ Difficulty levels (Easy / Medium / Hard)

### ✅ Countdown screen (3-2-1)

### ✅ Real-time game with:

* Correct / Skip zones
* Dynamic word font resizing
* Animated feedback overlays
* Sound effects (ticks, beeps, success tones)

### ✅ End Game Summary

* Total score
* List of correct words
* List of skipped words
* Modal popup viewer

---

# 🔥 **AI Word Generation System (Master/Slave Deck Architecture)**

Your game uses a **two-level deck architecture**:

---

## 🧠 **1. Master Deck (Global)**

Stored at:

```
artifacts/heads-up-v1/public/data/decks/{deckId}
```

* Created ONLY once per category/difficulty.
* Contains *all* unique words ever generated.
* Shared by all players.
* Prevents re-calling Gemini again when another user plays the same category.

---

## 👤 **2. Slave Deck (Private User Deck)**

Stored at:

```
artifacts/heads-up-v1/users/{userId}/userDecks/{deckId}
```

* Cloned from the master deck on first play.
* Keeps track of:

  * `allWords[]`
  * `seenWords[]`
* Ensures unique words per user.
* When the deck gets low or empty → **automatically refills** using new AI words.

---

## 🔄 Refresh Cycle

The client detects low words → calls backend →
Backend fetches new words from Gemini →
Appends them to master deck →
Creates a fresh slave deck with `seenWords = []`.

---

# 🏗️ **Tech Stack**

### **Frontend**

* HTML
* TailwindCSS
* Tone.js
* Vanilla JS (ES modules)

### **Backend**

* Firebase Auth
* Firestore
* Cloud Run (via Firebase Functions V2)
* Node.js (serverless API)
* Gemini 2.5 Flash (AI word generation)

---

# 🚀 **Deployment Guide**

### **Frontend**

Hosted on **Vercel**
Just run:

```
vercel
```

Or push to your GitHub repo with Vercel integration.

### **Cloud Function**

The backend API lives at:

```
https://getaiwords-xxxxxxxxxx-uc.a.run.app
```

Deployed using:

```
firebase deploy --only functions
```

### **Firebase Auth**

Ensure these are in **Authorized Domains**:

```
localhost
your-vercel-domain.vercel.app
oauth-redirect.googleusercontent.com
```

---

# 🔐 **Authentication**

Uses Google Sign-in:

```js
const provider = new GoogleAuthProvider();
signInWithPopup(auth, provider);
```

On first login, user deck is created.

---

# 🧪 **Local Testing**

Run Firebase emulator for Firestore + Functions:

```
firebase emulators:start
```

Run local web server:

```
npm run dev
```

---
