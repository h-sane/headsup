// -------------------------------------------------
// Firebase SDK Imports
// -------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    // We are not using anonymous or custom tokens for deployment
    // signInAnonymously, 
    // signInWithCustomToken, 
    setPersistence,
    inMemoryPersistence, // Use this for preview if needed, but not for prod
    browserLocalPersistence // Use this for production
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    setLogLevel,
    updateDoc,
    arrayUnion,
    runTransaction
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// -------------------------------------------------
// DOM Element References
// -------------------------------------------------
const $setupScreen = document.getElementById('setup-screen');
const $countdownScreen = document.getElementById('countdown-screen');
const $gameScreen = document.getElementById('game-screen');
const $resultsScreen = document.getElementById('results-screen');

const $startButton = document.getElementById('start-button');
const $playAgainButton = document.getElementById('play-again-button');
const $changeSettingsButton = document.getElementById('change-settings-button');

const $categorySelect = document.getElementById('category');
const $difficultySelect = document.getElementById('difficulty');
const $timeSelect = document.getElementById('time');

const $loadingIndicator = document.getElementById('loading-indicator');
const $loadingStatus = document.getElementById('loading-status');

const $countdownTimer = document.getElementById('countdown-timer');
const $gameTimerValue = document.getElementById('game-timer-value');
const $wordDisplay = document.getElementById('word-display');
const $wordContainer = document.getElementById('word-container');

const $skipArea = document.getElementById('skip-area');
const $correctArea = document.getElementById('correct-area');
const $feedbackOverlay = document.getElementById('feedback-overlay');

// --- UPGRADED Results Screen Elements ---
const $finalScore = document.getElementById('final-score');
const $correctCount = document.getElementById('correct-count');
const $skippedCount = document.getElementById('skipped-count');
const $viewCorrectBtn = document.getElementById('view-correct-btn');
const $viewSkippedBtn = document.getElementById('view-skipped-btn');

// --- NEW Modal Elements ---
const $wordModal = document.getElementById('word-modal');
const $modalBackdrop = document.getElementById('modal-backdrop');
const $modalContent = document.getElementById('modal-content');
const $modalTitle = document.getElementById('modal-title');
const $modalList = document.getElementById('modal-list');
const $modalCloseBtn = document.getElementById('modal-close-btn');

// -------------------------------------------------
// Firebase & App Config
// -------------------------------------------------

// --- DEPLOYMENT CONFIG ---
// 1. CHOOSE A PERMANENT APP ID (cannot be changed later)
const appId = "heads-up-v1"; // This is our app's internal ID

// 2. PASTE YOUR FIREBASE CONFIG OBJECT HERE
const firebaseConfig = {
    apiKey: "AIzaSyDDseQLasErIFRwzkulqIF4TRe7Ox_IXmY",
    authDomain: "headsup-cab4e.firebaseapp.com",
    projectId: "headsup-cab4e",
    storageBucket: "headsup-cab4e.firebasestorage.app",
    messagingSenderId: "409660603005",
    appId: "1:409660603005:web:d4915654188dfbd9ee8f14",
    measurementId: "G-VZWVWER21S"
};
// --- END DEPLOYMENT CONFIG ---

// Initialize Firebase
let app, auth, db, googleProvider, analytics;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider(); // For Google Sign-In
    analytics = getAnalytics(app); // Initialize Firebase Analytics
    setLogLevel('Debug'); // Enable detailed Firestore logs
    console.log("Firebase Initialized Successfully.");
} catch (e) {
    console.error("Firebase initialization failed:", e);
    $loadingStatus.textContent = "Error: Config Failed.";
}

// -------------------------------------------------
// Sound Effect State
// -------------------------------------------------
let audioReady = false;
let synth, beepSynth, tickSynth;

// -------------------------------------------------
// Game State Variables
// -------------------------------------------------
let userId = null; // Our persistent user ID

let currentWordDeck = [];   // The array of words for the current round
let correctWords = []; 	    // Words guessed correctly this round
let skippedWords = []; 	    // Words skipped this round

let gameActive = false;
let timeRemaining = 60;
let gameTimerInterval = null;
let countdownTimerInterval = null;
let currentWordIndex = 0;
let wordDeck = [];
let skipLocked = false;
let correctLocked = false;
let totalScore = 0; // --- UPGRADED: Renamed from 'score'

let currentSettings = {
    category: 'Movies',
    difficulty: 'Easy',
    time: 60
};

// --- UPGRADED: Caching Config ---
const REFRESH_BATCH_COUNT = 20; // How many API calls to make (20 * 100 = 2000 words)

// -------------------------------------------------
// Core Game Logic
// -------------------------------------------------

/**
 * --- NEW: Initialize Tone.js audio components ---
 */
function initAudio() {
    if (audioReady || !window.Tone) return;
    try {
        // Define synths
        synth = new Tone.Synth().toDestination();
        beepSynth = new Tone.MembraneSynth().toDestination();
        tickSynth = new Tone.Synth({
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.005, decay: 0.1, sustain: 0.01, release: 0.1 }
        }).toDestination();
        
        audioReady = true;
        console.log("Audio context started.");
    } catch (e) {
        console.error("Failed to initialize Tone.js:", e);
    }
}

/**
 * --- NEW: Play a sound effect ---
 */
function playSound(sound) {
    if (!audioReady) return; // Don't play if audio isn't on

    const now = Tone.now();
    try {
        switch(sound) {
            case 'countdownBeep':
                beepSynth.triggerAttackRelease("C2", "8n", now);
                break;
            case 'countdownGo':
                beepSynth.triggerAttackRelease("G2", "4n", now);
                break;
            case 'correct':
                synth.triggerAttackRelease("E5", "16n", now);
                break;
            case 'skip':
                tickSynth.triggerAttackRelease("C3", "16n", now);
                break;
            case 'timerTick':
                tickSynth.triggerAttackRelease("C6", "16n", now);
                break;
            case 'endGame':
                synth.triggerAttackRelease("C4", "8n", now);
                synth.triggerAttackRelease("G4", "8n", now + 0.2);
                synth.triggerAttackRelease("C5", "4n", now + 0.4);
                break;
        }
    } catch (e) {
        console.error("Tone.js playSound error:", e);
    }
}

/**
 * Main entry point. Authenticates the user and sets up listeners.
 */
async function main() {
    if (!auth) {
        console.error("Authentication service is not available.");
        $loadingStatus.textContent = "Error: Auth Failed.";
        $loadingIndicator.classList.remove('hidden');
        return;
    }

    // Set persistence to local so they stay logged in
    await setPersistence(auth, browserLocalPersistence);

    // ✅ Handle result of mobile redirect login
    try {
        const redirectResult = await getRedirectResult(auth);
        if (redirectResult && redirectResult.user) {
            console.log("Mobile redirect login success:", redirectResult.user.uid);
        }
    } catch (err) {
        console.error("Redirect login failed:", err);
    }

    // Listen for auth state changes
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            console.log("User is authenticated. UID:", userId);
            // User is signed in, show the start button
            $startButton.disabled = false;
            $startButton.textContent = "START GAME";
        } else {
            userId = null;
            console.log("User is not authenticated. Showing sign-in button.");
            // User is not signed in, show the sign-in button
            $startButton.disabled = false;
            $startButton.textContent = "SIGN IN WITH GOOGLE";
        }
    });
}

/**
 * --- NEW: Google Sign-In Logic ---
 */
async function signInWithGoogle() {
    try {
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        if (isMobile) {
            // ✅ Stable mobile flow using redirect
            console.log("Using signInWithRedirect for mobile login");
            await signInWithRedirect(auth, googleProvider);
        } else {
            // ✅ Popup flow for desktop
            console.log("Using signInWithPopup for desktop login");
            await signInWithPopup(auth, googleProvider);
        }
    } catch (error) {
        console.error("Google Sign-In failed:", error);
        alert("Sign-in failed. Please try again.");
    }
}

/**
 * Switches the visible screen
 * @param {string} screenId ('setup', 'countdown', 'game', 'results')
 */
function switchScreen(screenId) {
    // Hide all screens
    $setupScreen.classList.add('hidden');
    $countdownScreen.classList.add('hidden');
    $gameScreen.classList.add('hidden');
    $resultsScreen.classList.add('hidden');
    
    // Show the target screen
    const targetScreen = document.getElementById(`${screenId}-screen`);
    if (targetScreen) {
        targetScreen.classList.remove('hidden');
    } else {
        console.error(`Screen ID "${screenId}" not found.`);
    }
}

/**
 * Fetches word deck, then starts the pre-game countdown
 */
async function handleStartGame() {
    // --- NEW: Check if user is signed in ---
    if (!userId) {
        await signInWithGoogle();
        return; // Wait for user to sign in
    }
    
    // 1. --- NEW: Initialize Audio on user gesture ---
    if (!audioReady && window.Tone) {
        await Tone.start();
        initAudio();
    }

    // 2. Show loading indicator
    $loadingIndicator.classList.remove('hidden');
    $loadingStatus.textContent = "Building your deck... 📚";
    
    // 3. Store current settings
    currentSettings.category = $categorySelect.value;
    currentSettings.difficulty = $difficultySelect.value;
    currentSettings.time = parseInt($timeSelect.value, 10);
    timeRemaining = currentSettings.time;
    
    try {
        // Log game start event
        if (analytics) {
            logEvent(analytics, 'game_start', {
                category: currentSettings.category,
                difficulty: currentSettings.difficulty,
                time: currentSettings.time
            });
        }

        // Reset game state
        gameActive = false;
        timeRemaining = currentSettings.time;
        currentWordIndex = 0;
        correctWords = [];
        skippedWords = [];
        totalScore = 0;

        // Show loading state
        $loadingIndicator.classList.remove('hidden');
        $loadingStatus.textContent = `Preparing your '${currentSettings.category}' game...`;
        $startButton.disabled = true;
        
        // 4. --- UPGRADED: Fetch and prepare the word deck ---
        const deckId = `${currentSettings.category}_${currentSettings.difficulty}`.toLowerCase();
        const wordDeck = await getWordDeck(deckId);
        
        if (!wordDeck || wordDeck.length === 0) {
             throw new Error("Deck is empty, and AI failed to populate it.");
        }
        
        // 5. Reset game state
        currentWordDeck = [...wordDeck].sort(() => 0.5 - Math.random()); // Shuffle the deck
        correctWords = [];
        skippedWords = [];
        totalScore = 0;

        console.log(`Game starting with ${currentWordDeck.length} words.`);
        
        // 6. Hide loading and start countdown
        $loadingIndicator.classList.add('hidden');
        startCountdown();
        
    } catch (error) {
        console.error("Error starting game:", error);
        $loadingIndicator.classList.add('hidden');
        alert(`Error: ${error.message}. Please try again.`);
    }
}

/**
 * Shows the 3...2...1... countdown, then starts the game
 */
function startCountdown() {
    switchScreen('countdown');
    let count = 3;
    $countdownTimer.textContent = count;
    playSound('countdownBeep'); // <-- Play sound
    
    countdownTimerInterval = setInterval(() => {
        count--;
        if (count > 0) {
            $countdownTimer.textContent = count;
            playSound('countdownBeep'); // <-- Play sound
        } else {
            clearInterval(countdownTimerInterval);
            playSound('countdownGo'); // <-- Play sound
            startGame();
        }
    }, 1000);
}

/**
 * Starts the main game loop
 */
function startGame() {
    switchScreen('game');
    updateGameTimerDisplay();
    nextWord(); // Show the first word
    
    // Start the main game timer
    gameTimerInterval = setInterval(() => {
        timeRemaining--;
        updateGameTimerDisplay();
        
        if (timeRemaining <= 0) {
            endGame();
        }
    }, 1000);
}

/**
 * --- UPGRADED: Ends the game and shows the results screen ---
 */
function endGame() {
    clearInterval(gameTimerInterval);
    switchScreen('results');
    playSound('endGame'); // <-- Play sound
    
    // Calculate score
    const correctScore = correctWords.length * 2;
    const skippedPenalty = skippedWords.length * 1;
    totalScore = correctScore - skippedPenalty;
    
    // Log game end event
    if (analytics) {
        logEvent(analytics, 'game_end', {
            score: totalScore,
            correct: correctWords.length,
            skipped: skippedWords.length
        });
    }
    
    // Display score and counts
    $finalScore.textContent = totalScore;
    $correctCount.textContent = correctWords.length;
    $skippedCount.textContent = skippedWords.length;
}

/**
 * --- UPGRADED: Fetches the next word and adjusts font size ---
 */
function nextWord() {
    if (currentWordDeck.length > 0) {
        const word = currentWordDeck.pop(); // Get next word from shuffled deck
        $wordDisplay.textContent = word;
        adjustWordFontSize(); // Dynamically adjust font size
    } else {
        // No more words in the deck, even if time is left
        $wordDisplay.textContent = "DECK EMPTY!";
        adjustWordFontSize();
        endGame(); // End the game early
    }
}

/**
 * --- NEW: Dynamically adjust font size to fit container ---
 */
function adjustWordFontSize() {
    const container = $wordContainer;
    const wordEl = $wordDisplay;
    
    // Reset to a large font size
    wordEl.style.fontSize = '8vw'; // Start a bit smaller than 10vw
    
    let currentFontSize = 8;
    
    // Check for overflow. Container height - header height (approx 80px)
    const availableHeight = container.clientHeight - 80;
    const availableWidth = container.clientWidth - 40; // 2.5rem padding (p-10)
    
    while ((wordEl.scrollHeight > availableHeight || wordEl.scrollWidth > availableWidth) && currentFontSize > 1) {
        currentFontSize -= 0.5;
        wordEl.style.fontSize = `${currentFontSize}vw`;
    }
}

/**
 * --- UPGRADED: Handles the "Correct" action ---
 */
function handleCorrect() {
    if (timeRemaining <= 0 || correctLocked) return;
    
    const word = $wordDisplay.textContent;
    if (word && word !== "DECK EMPTY!") {
        // Log correct word event
        if (analytics) {
            logEvent(analytics, 'word_correct', { word: word });
        }
        
        correctLocked = true;
        $correctArea.style.opacity = '0.5';
        $correctArea.style.pointerEvents = 'none';
        
        // Reset lock after 2 seconds
        setTimeout(() => {
            correctLocked = false;
            $correctArea.style.opacity = '';
            $correctArea.style.pointerEvents = '';
        }, 2000);
        
        correctWords.push(word);
        updateSeenWords(word); // Save progress
        flashFeedback('green');
        playSound('correct');
        nextWord();
    }
}

/**
 * --- UPGRADED: Handles the "Skip" action ---
 */
function handleSkip() {
    if (timeRemaining <= 0 || skipLocked) return;
    
    const word = $wordDisplay.textContent;
    if (word && word !== "DECK EMPTY!") {
        // Log skipped word event
        if (analytics) {
            logEvent(analytics, 'word_skipped', { word: word });
        }
        
        skipLocked = true;
        $skipArea.style.opacity = '0.5';
        $skipArea.style.pointerEvents = 'none';
        
        // Reset lock after 1 second
        setTimeout(() => {
            skipLocked = false;
            $skipArea.style.opacity = '';
            $skipArea.style.pointerEvents = '';
        }, 1000);
        
        skippedWords.push(word);
        flashFeedback('red');
        playSound('skip');
        nextWord();
    }
}

/**
 * Flashes the screen green or red for feedback
 * @param {'green' | 'red'} color
 */
function flashFeedback(color) {
    const colorClass = color === 'green' ? 'bg-green-500/70' : 'bg-red-500/70';
    $feedbackOverlay.classList.add(colorClass, 'opacity-100');
    
    setTimeout(() => {
        $feedbackOverlay.classList.remove(colorClass, 'opacity-100');
    }, 150); // Flash duration
}

/**
 * Formats time in seconds to MM:SS
 */
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Updates the game timer display
 */
function updateGameTimerDisplay() {
    $gameTimerValue.textContent = formatTime(timeRemaining);
    // --- NEW: Play tick sound on last 5 seconds ---
    if (timeRemaining > 0 && timeRemaining <= 5) {
        playSound('timerTick');
    }
}

/**
 * Utility to shuffle an array (Fisher-Yates)
 */
function shuffleArray(array) {
    let newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

// -------------------------------------------------
// Data & API Logic (ALL UPGRADED)
// -------------------------------------------------

/**
 * --- FIXED: Calls our Firebase Cloud Function instead of Gemini directly ---
 */
async function callGeminiAPI(category, difficulty, count, existingWords = []) {
    // Using Cloud Run endpoint for better reliability
    const functionUrl = "https://getaiwords-2vgpkucjlq-uc.a.run.app";

    const payload = {
        category,
        difficulty,
        count,
        existingWords
    };

    try {
        const response = await fetch(functionUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error("Cloud Function call failed:", response.status, await response.text());
            throw new Error("Failed to fetch words from the server.");
        }

        return await response.json(); // Should return { words: [...] }
    } catch (error) {
        console.error("Error calling Firebase Function:", error);
        throw new Error("Network or server error while fetching words.");
    }
}

/**
 * --- NEW: Add a correctly guessed word to the user's private "seenWords" list ---
 */
async function updateSeenWords(word) {
    const deckId = `${currentSettings.category}_${currentSettings.difficulty}`.toLowerCase();
    const userDeckRef = doc(db, `artifacts/${appId}/users/${userId}/userDecks`, deckId);
    
    try {
        await updateDoc(userDeckRef, {
            seenWords: arrayUnion(word)
        });
    } catch (error) {
        console.error("Failed to update seenWords:", error);
        // Non-critical, just means they might see the word again
    }
}

/**
 * --- REPLACED: Get the word deck for the user (Private Deck Logic) ---
 */
async function getWordDeck(deckId) {
    console.log(`Getting deck: ${deckId} for user: ${userId}`);
    
    const userDeckRef = doc(db, `artifacts/${appId}/users/${userId}/userDecks`, deckId);
    const userDeckSnap = await getDoc(userDeckRef);

    let userDeckData;

    if (!userDeckSnap.exists()) {
        console.log("No private deck. Seeding from master bank...");
        $loadingStatus.textContent = "Creating your personal deck... 📇";
        userDeckData = await seedUserDeck(deckId, userDeckRef);
        if (!userDeckData) {
            throw new Error("Failed to seed new user deck.");
        }
    } else {
        userDeckData = userDeckSnap.data();
    }

    const { allWords = [], seenWords = [] } = userDeckData;
    const seenSet = new Set(seenWords);
    let availableWords = allWords.filter(word => !seenSet.has(word));

    console.log(`Deck status: ${allWords.length} total, ${seenWords.length} seen, ${availableWords.length} available.`);

    // --- FIX: Use dynamic 1:10 ratio for threshold ---
    const dynamicLowWordThreshold = Math.floor(allWords.length / 10);

    // Handle deck exhaustion and low-word states
    if (availableWords.length === 0) {
        console.warn("User has seen all words. Refreshing deck...");
        $loadingStatus.textContent = "Deck complete! Fetching new words... ♻️";
        
        const updatedDeckData = await refreshWordCache(deckId, userDeckRef);
        
        // Recalculate available words from the newly refreshed deck
        const { allWords: newAll, seenWords: newSeen } = updatedDeckData;
        const newSeenSet = new Set(newSeen);
        availableWords = newAll.filter(word => !newSeenSet.has(word));
        
        if (availableWords.length === 0) {
            throw new Error("Deck is empty and AI refresh failed.");
        }
    }
    // Proactive *background* refresh (no await)
    else if (availableWords.length > 0 && availableWords.length < dynamicLowWordThreshold) {
        console.log(`Word deck is low (${availableWords.length} available, threshold is ${dynamicLowWordThreshold}). Triggering background refresh...`);
        // We don't await this. Let the game start, refresh in background.
        refreshWordCache(deckId, userDeckRef).catch(err => {
            console.error("Background refresh failed:", err);
            // Non-critical, the game is already running.
        });
    }
    
    return availableWords;
}

/**
 * --- NEW: First-time play: Copy master bank to a new private user deck. ---
 */
async function seedUserDeck(deckId, userDeckRef) {
    const masterDeckRef = doc(db, `artifacts/${appId}/public/data/decks`, deckId);
    let masterDeckSnap = await getDoc(masterDeckRef);
    let masterDeckData = masterDeckSnap.data();

    // If master bank doesn't exist (first user ever), create it
    if (!masterDeckSnap.exists() || !masterDeckData || !masterDeckData.allWords || masterDeckData.allWords.length === 0) {
        console.log("Master bank is empty. Seeding from AI...");
        $loadingStatus.textContent = `Creating first deck for ${currentSettings.category}...`;
        // This is a blocking call. User must wait.
        masterDeckData = await refreshWordCache(deckId, userDeckRef, masterDeckRef);
    }

    // Create the new private user deck
    const newPrivateDeck = {
        allWords: masterDeckData.allWords,
        seenWords: []
    };
    
    await setDoc(userDeckRef, newPrivateDeck);
    console.log("Private deck seeded.");
    return newPrivateDeck;
}


/**
 * --- REPLACED: Refreshes cache by fetching 2000 words ---
 */
async function refreshWordCache(deckId, userDeckRef, masterDeckRef) {
    if (!masterDeckRef) {
        masterDeckRef = doc(db, `artifacts/${appId}/public/data/decks`, deckId);
    }

    console.log(`Refreshing cache for ${deckId}...`);
    // This function is now blocking, so show the loading screen
    $loadingStatus.textContent = `Topping up your '${currentSettings.category}' deck...`;
    $loadingIndicator.classList.remove('hidden');

    try {
        // Fetch existing decks in parallel
        const [userDeckSnap, masterDeckSnap] = await Promise.all([
            getDoc(userDeckRef),
            getDoc(masterDeckRef)
        ]);
        
        const userDeckData = userDeckSnap.data() || { allWords: [], seenWords: [] };
        const masterDeckData = masterDeckSnap.data() || { allWords: [] };
        
        let existingWords = new Set([...masterDeckData.allWords, ...userDeckData.allWords]);
        let allNewWords = [];

        // Make sequential API calls to avoid rate limiting
        for (let i = 0; i < 5; i++) {
            try {
                const result = await callGeminiAPI(
                    currentSettings.category, 
                    currentSettings.difficulty, 
                    100, 
                    Array.from(existingWords)
                );
                
                if (result && result.words) {
                    for (const word of result.words) {
                        const trimmed = word.trim();
                        if (trimmed.length > 0 && !existingWords.has(trimmed)) {
                            allNewWords.push(trimmed);
                            existingWords.add(trimmed);
                        }
                    }
                    console.log(`Batch ${i + 1} added ${result.words.length} words`);
                }
            } catch (error) {
                console.error(`Error in batch ${i + 1}:`, error);
                // Continue with next batch even if one fails
            }
        }

        if (allNewWords.length === 0) {
            console.warn("AI returned no new words.");
            // If the deck is still empty, this is a critical failure
            if (userDeckData.allWords.length === 0) {
                throw new Error("AI failed and no words are in the cache.");
            }
            // Otherwise, we just failed to top-up, which is ok.
            return userDeckData; 
        }
        
        console.log(`Fetched ${allNewWords.length} new unique words.`);

        // Use a transaction to update both decks
        const newDeckData = await runTransaction(db, async (transaction) => {
            // 1. Update Master Deck
            transaction.set(masterDeckRef, {
                allWords: arrayUnion(...allNewWords)
            }, { merge: true });

            // 2. Update User Deck
            // We add the new words and RESET their seen list
            const updatedUserDeck = {
                allWords: [...userDeckData.allWords, ...allNewWords],
                seenWords: [] // Reset progress
            };
            transaction.set(userDeckRef, updatedUserDeck); // Overwrite, not merge
            
            return updatedUserDeck;
        });
        
        console.log("Cache refresh complete. User's seen list was reset.");
        return newDeckData;

    } catch (error) {
        console.error("CRITICAL: Failed to refresh word cache:", error);
        throw new Error(`Could not load word deck: ${error.message}`);
    } finally {
        // Ensure we always hide the loading indicator
        $loadingIndicator.classList.add('hidden');
    }
}

// --- NEW: Modal Show/Hide Logic (FIXED) ---
function showWordModal(title, words) {
    $modalTitle.textContent = `${title} (${words.length})`;
    
    if (words.length === 0) {
        $modalList.innerHTML = `<p class="text-gray-400 p-4">No words to show.</p>`;
    } else {
        $modalList.innerHTML = words
            .map(word => `<div class="results-list-item">${word}</div>`)
            .join('');
    }
    
    $wordModal.classList.add('is-open');
}

function hideWordModal() {
    $wordModal.classList.remove('is-open');
}

// -------------------------------------------------
// Event Listeners
// -------------------------------------------------

// --- Setup Screen ---
$startButton.addEventListener('click', handleStartGame);

// --- Results Screen ---
$playAgainButton.addEventListener('click', handleStartGame); // Re-uses last settings
$changeSettingsButton.addEventListener('click', () => switchScreen('setup'));

// --- NEW: Modal Listeners ---
$viewCorrectBtn.addEventListener('click', () => showWordModal('Correct', correctWords));
$viewSkippedBtn.addEventListener('click', () => showWordModal('Skipped', skippedWords));
$modalBackdrop.addEventListener('click', hideWordModal);
$modalCloseBtn.addEventListener('click', hideWordModal);

// --- Game Screen (Mouse/Touch) ---
// Using mousedown for faster response than click
$skipArea.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handleSkip();
});

$correctArea.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handleCorrect();
});

// --- Global Keyboard Controls ---
window.addEventListener('keydown', (e) => {
    // Only listen for keys if the game screen is active
    if ($gameScreen.classList.contains('hidden')) {
        return;
    }
    
    if (e.key === 'ArrowLeft') {
        handleSkip();
    } else if (e.key === 'ArrowRight') {
        handleCorrect();
    }
});

// -------------------------------------------------
// Initialize the App
// -------------------------------------------------
main();