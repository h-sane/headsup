// -------------------------------------------------
// Firebase SDK Imports
// -------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence 
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
// DEBUG LOGGER (VISUAL)
// -------------------------------------------------
function createDebugBox() {
    const box = document.createElement('div');
    box.id = 'debug-console';
    box.style.position = 'fixed';
    box.style.bottom = '0';
    box.style.left = '0';
    box.style.width = '100%';
    box.style.height = '150px';
    box.style.backgroundColor = 'rgba(0,0,0,0.85)';
    box.style.color = '#00ff00';
    box.style.fontFamily = 'monospace';
    box.style.fontSize = '12px';
    box.style.overflowY = 'scroll';
    box.style.zIndex = '9999';
    box.style.padding = '10px';
    box.style.pointerEvents = 'none'; 
    document.body.appendChild(box);
    return box;
}

const debugBox = createDebugBox();

function logToScreen(msg) {
    console.log(msg); 
    const line = document.createElement('div');
    line.textContent = `> ${msg}`;
    line.style.borderBottom = '1px solid #333';
    debugBox.appendChild(line);
    debugBox.scrollTop = debugBox.scrollHeight;
}

function errorToScreen(msg) {
    console.error(msg);
    const line = document.createElement('div');
    line.textContent = `ERROR: ${msg}`;
    line.style.color = '#ff4444';
    line.style.fontWeight = 'bold';
    debugBox.appendChild(line);
    debugBox.scrollTop = debugBox.scrollHeight;
}

// -------------------------------------------------
// DOM Elements
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
const $finalScore = document.getElementById('final-score');
const $correctCount = document.getElementById('correct-count');
const $skippedCount = document.getElementById('skipped-count');
const $viewCorrectBtn = document.getElementById('view-correct-btn');
const $viewSkippedBtn = document.getElementById('view-skipped-btn');
const $wordModal = document.getElementById('word-modal');
const $modalBackdrop = document.getElementById('modal-backdrop');
const $modalContent = document.getElementById('modal-content');
const $modalTitle = document.getElementById('modal-title');
const $modalList = document.getElementById('modal-list');
const $modalCloseBtn = document.getElementById('modal-close-btn');

// -------------------------------------------------
// Config
// -------------------------------------------------
const appId = "heads-up-v1"; 

const firebaseConfig = {
    apiKey: "AIzaSyDDseQLasErIFRwzkulqIF4TRe7Ox_IXmY",
    authDomain: "headsup-cab4e.firebaseapp.com",
    projectId: "headsup-cab4e",
    storageBucket: "headsup-cab4e.firebasestorage.app",
    messagingSenderId: "409660603005",
    appId: "1:409660603005:web:d4915654188dfbd9ee8f14",
    measurementId: "G-VZWVWER21S"
};

let app, auth, db, googleProvider, analytics;

try {
    logToScreen("Initializing Firebase...");
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider(); 
    analytics = getAnalytics(app); 
    setLogLevel('Debug'); 
    logToScreen("Firebase Init Done.");
} catch (e) {
    errorToScreen(`Firebase Init Failed: ${e.message}`);
    $loadingStatus.textContent = "Error: Config Failed.";
}

// -------------------------------------------------
// Sound & State
// -------------------------------------------------
let audioReady = false;
let synth, beepSynth, tickSynth;
let userId = null; 
let currentWordDeck = [];   
let correctWords = [];      
let skippedWords = [];      
let gameActive = false;
let timeRemaining = 60;
let gameTimerInterval = null;
let countdownTimerInterval = null;
let currentWordIndex = 0;
let wordDeck = [];
let skipLocked = false;
let correctLocked = false;
let totalScore = 0; 
let currentSettings = { category: 'Movies', difficulty: 'Easy', time: 60 };
const REFRESH_BATCH_COUNT = 20; 

// -------------------------------------------------
// Auth Logic (POPUP ONLY)
// -------------------------------------------------

async function main() {
    if (!auth) {
        errorToScreen("Auth service missing!");
        return;
    }

    // 1. Set Persistence
    try {
        await setPersistence(auth, browserLocalPersistence);
        logToScreen("Persistence set to LOCAL");
    } catch(e) {
        errorToScreen("Persistence failed: " + e.message);
    }

    // 2. Listener
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            logToScreen(`Auth State: LOGGED IN (${user.email})`);
            $startButton.disabled = false;
            $startButton.textContent = "START GAME";
        } else {
            userId = null;
            logToScreen("Auth State: SIGNED OUT");
            $startButton.disabled = false;
            $startButton.textContent = "SIGN IN WITH GOOGLE";
        }
    });
}

async function signInWithGoogle() {
    logToScreen("Starting Sign In (Popup Mode)...");
    try {
        $startButton.disabled = true;
        $startButton.textContent = "POPUP OPENING...";
        
        // Always use Popup - it bypasses the storage partitioning issues on mobile
        await signInWithPopup(auth, googleProvider);
        
        logToScreen("Popup Success!");
        // onAuthStateChanged will handle the rest
    } catch (error) {
        // Handle popup closed by user specifically
        if (error.code === 'auth/popup-closed-by-user') {
            logToScreen("User closed the popup.");
        } else {
            errorToScreen(`Sign In Failed: ${error.code} - ${error.message}`);
            alert(`Login Error: ${error.message}`);
        }
        $startButton.disabled = false;
        $startButton.textContent = "SIGN IN WITH GOOGLE";
    }
}

// -------------------------------------------------
// Helpers & Game Logic (Standard)
// -------------------------------------------------

function initAudio() {
    if (audioReady || !window.Tone) return;
    try {
        synth = new Tone.Synth().toDestination();
        beepSynth = new Tone.MembraneSynth().toDestination();
        tickSynth = new Tone.Synth({
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.005, decay: 0.1, sustain: 0.01, release: 0.1 }
        }).toDestination();
        audioReady = true;
    } catch (e) {
        errorToScreen("Audio Init Failed: " + e);
    }
}

function playSound(sound) {
    if (!audioReady) return; 
    const now = Tone.now();
    try {
        switch(sound) {
            case 'countdownBeep': beepSynth.triggerAttackRelease("C2", "8n", now); break;
            case 'countdownGo': beepSynth.triggerAttackRelease("G2", "4n", now); break;
            case 'correct': synth.triggerAttackRelease("E5", "16n", now); break;
            case 'skip': tickSynth.triggerAttackRelease("C3", "16n", now); break;
            case 'timerTick': tickSynth.triggerAttackRelease("C6", "16n", now); break;
            case 'endGame': 
                synth.triggerAttackRelease("C4", "8n", now);
                synth.triggerAttackRelease("G4", "8n", now + 0.2);
                synth.triggerAttackRelease("C5", "4n", now + 0.4);
                break;
        }
    } catch (e) { console.error(e); }
}

function switchScreen(screenId) {
    $setupScreen.classList.add('hidden');
    $countdownScreen.classList.add('hidden');
    $gameScreen.classList.add('hidden');
    $resultsScreen.classList.add('hidden');
    const targetScreen = document.getElementById(`${screenId}-screen`);
    if (targetScreen) targetScreen.classList.remove('hidden');
}

async function handleStartGame() {
    if (!userId) {
        logToScreen("Start clicked but no user. Triggering Login.");
        await signInWithGoogle();
        return; 
    }
    
    if (!audioReady && window.Tone) {
        await Tone.start();
        initAudio();
    }

    $loadingIndicator.classList.remove('hidden');
    $loadingStatus.textContent = "Building your deck... 📚";
    
    currentSettings.category = $categorySelect.value;
    currentSettings.difficulty = $difficultySelect.value;
    currentSettings.time = parseInt($timeSelect.value, 10);
    timeRemaining = currentSettings.time;
    
    try {
        if (analytics) {
            logEvent(analytics, 'game_start', {
                category: currentSettings.category,
                difficulty: currentSettings.difficulty,
                time: currentSettings.time
            });
        }

        gameActive = false;
        timeRemaining = currentSettings.time;
        currentWordIndex = 0;
        correctWords = [];
        skippedWords = [];
        totalScore = 0;

        $loadingIndicator.classList.remove('hidden');
        $loadingStatus.textContent = `Preparing your '${currentSettings.category}' game...`;
        $startButton.disabled = true;
        
        logToScreen("Fetching deck...");
        const deckId = `${currentSettings.category}_${currentSettings.difficulty}`.toLowerCase();
        const wordDeck = await getWordDeck(deckId);
        
        if (!wordDeck || wordDeck.length === 0) {
             throw new Error("Deck is empty, and AI failed to populate it.");
        }
        
        currentWordDeck = [...wordDeck].sort(() => 0.5 - Math.random()); 
        correctWords = [];
        skippedWords = [];
        totalScore = 0;

        logToScreen(`Deck ready: ${currentWordDeck.length} words.`);
        
        $loadingIndicator.classList.add('hidden');
        startCountdown();
        
    } catch (error) {
        errorToScreen("Game Start Error: " + error.message);
        $loadingIndicator.classList.add('hidden');
        alert(`Error: ${error.message}. Please try again.`);
    }
}

function startCountdown() {
    switchScreen('countdown');
    let count = 3;
    $countdownTimer.textContent = count;
    playSound('countdownBeep'); 
    
    countdownTimerInterval = setInterval(() => {
        count--;
        if (count > 0) {
            $countdownTimer.textContent = count;
            playSound('countdownBeep'); 
        } else {
            clearInterval(countdownTimerInterval);
            playSound('countdownGo'); 
            startGame();
        }
    }, 1000);
}

function startGame() {
    switchScreen('game');
    updateGameTimerDisplay();
    nextWord(); 
    
    gameTimerInterval = setInterval(() => {
        timeRemaining--;
        updateGameTimerDisplay();
        
        if (timeRemaining <= 0) {
            endGame();
        }
    }, 1000);
}

function endGame() {
    clearInterval(gameTimerInterval);
    switchScreen('results');
    playSound('endGame'); 
    
    const correctScore = correctWords.length * 2;
    const skippedPenalty = skippedWords.length * 1;
    totalScore = correctScore - skippedPenalty;
    
    if (analytics) {
        logEvent(analytics, 'game_end', {
            score: totalScore,
            correct: correctWords.length,
            skipped: skippedWords.length
        });
    }
    
    $finalScore.textContent = totalScore;
    $correctCount.textContent = correctWords.length;
    $skippedCount.textContent = skippedWords.length;
}

function nextWord() {
    if (currentWordDeck.length > 0) {
        const word = currentWordDeck.pop(); 
        $wordDisplay.textContent = word;
        adjustWordFontSize(); 
    } else {
        $wordDisplay.textContent = "DECK EMPTY!";
        adjustWordFontSize();
        endGame(); 
    }
}

function adjustWordFontSize() {
    const container = $wordContainer;
    const wordEl = $wordDisplay;
    wordEl.style.fontSize = '8vw'; 
    let currentFontSize = 8;
    const availableHeight = container.clientHeight - 80;
    const availableWidth = container.clientWidth - 40; 
    while ((wordEl.scrollHeight > availableHeight || wordEl.scrollWidth > availableWidth) && currentFontSize > 1) {
        currentFontSize -= 0.5;
        wordEl.style.fontSize = `${currentFontSize}vw`;
    }
}

function handleCorrect() {
    if (timeRemaining <= 0 || correctLocked) return;
    const word = $wordDisplay.textContent;
    if (word && word !== "DECK EMPTY!") {
        if (analytics) logEvent(analytics, 'word_correct', { word: word });
        correctLocked = true;
        $correctArea.style.opacity = '0.5';
        $correctArea.style.pointerEvents = 'none';
        setTimeout(() => {
            correctLocked = false;
            $correctArea.style.opacity = '';
            $correctArea.style.pointerEvents = '';
        }, 2000);
        correctWords.push(word);
        updateSeenWords(word); 
        flashFeedback('green');
        playSound('correct');
        nextWord();
    }
}

function handleSkip() {
    if (timeRemaining <= 0 || skipLocked) return;
    const word = $wordDisplay.textContent;
    if (word && word !== "DECK EMPTY!") {
        if (analytics) logEvent(analytics, 'word_skipped', { word: word });
        skipLocked = true;
        $skipArea.style.opacity = '0.5';
        $skipArea.style.pointerEvents = 'none';
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

function flashFeedback(color) {
    const colorClass = color === 'green' ? 'bg-green-500/70' : 'bg-red-500/70';
    $feedbackOverlay.classList.add(colorClass, 'opacity-100');
    setTimeout(() => {
        $feedbackOverlay.classList.remove(colorClass, 'opacity-100');
    }, 150);
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function updateGameTimerDisplay() {
    $gameTimerValue.textContent = formatTime(timeRemaining);
    if (timeRemaining > 0 && timeRemaining <= 5) playSound('timerTick');
}

// ... (Data & API Logic) ...

async function callGeminiAPI(category, difficulty, count, existingWords = []) {
    const functionUrl = "https://getaiwords-2vgpkucjlq-uc.a.run.app";
    logToScreen(`Calling AI... (${category})`);
    const payload = { category, difficulty, count, existingWords };
    try {
        const response = await fetch(functionUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errText = await response.text();
            errorToScreen(`AI Error: ${response.status} ${errText}`);
            throw new Error("Failed to fetch words from the server.");
        }
        return await response.json(); 
    } catch (error) {
        errorToScreen("AI Network Error: " + error.message);
        throw new Error("Network or server error while fetching words.");
    }
}

async function updateSeenWords(word) {
    const deckId = `${currentSettings.category}_${currentSettings.difficulty}`.toLowerCase();
    const userDeckRef = doc(db, `artifacts/${appId}/users/${userId}/userDecks`, deckId);
    try {
        await updateDoc(userDeckRef, { seenWords: arrayUnion(word) });
    } catch (error) { console.error("Failed to update seenWords:", error); }
}

async function getWordDeck(deckId) {
    logToScreen(`Getting deck: ${deckId}`);
    const userDeckRef = doc(db, `artifacts/${appId}/users/${userId}/userDecks`, deckId);
    const userDeckSnap = await getDoc(userDeckRef);
    let userDeckData;

    if (!userDeckSnap.exists()) {
        logToScreen("No private deck. Seeding...");
        $loadingStatus.textContent = "Creating your personal deck... 📇";
        userDeckData = await seedUserDeck(deckId, userDeckRef);
        if (!userDeckData) throw new Error("Failed to seed new user deck.");
    } else {
        userDeckData = userDeckSnap.data();
    }

    const { allWords = [], seenWords = [] } = userDeckData;
    const seenSet = new Set(seenWords);
    let availableWords = allWords.filter(word => !seenSet.has(word));

    logToScreen(`Stats: ${allWords.length} total, ${seenWords.length} seen.`);

    const dynamicLowWordThreshold = Math.floor(allWords.length / 10);

    if (availableWords.length === 0) {
        logToScreen("Deck empty. Refreshing...");
        $loadingStatus.textContent = "Deck complete! Fetching new words... ♻️";
        const updatedDeckData = await refreshWordCache(deckId, userDeckRef);
        const { allWords: newAll, seenWords: newSeen } = updatedDeckData;
        const newSeenSet = new Set(newSeen);
        availableWords = newAll.filter(word => !newSeenSet.has(word));
        if (availableWords.length === 0) throw new Error("Deck is empty and AI refresh failed.");
    }
    else if (availableWords.length > 0 && availableWords.length < dynamicLowWordThreshold) {
        logToScreen("Low words. Background refresh.");
        refreshWordCache(deckId, userDeckRef).catch(err => errorToScreen("BG Refresh Fail: " + err));
    }
    return availableWords;
}

async function seedUserDeck(deckId, userDeckRef) {
    const masterDeckRef = doc(db, `artifacts/${appId}/public/data/decks`, deckId);
    let masterDeckSnap = await getDoc(masterDeckRef);
    let masterDeckData = masterDeckSnap.data();

    if (!masterDeckSnap.exists() || !masterDeckData || !masterDeckData.allWords || masterDeckData.allWords.length === 0) {
        logToScreen("Master empty. Calling AI...");
        $loadingStatus.textContent = `Creating first deck for ${currentSettings.category}...`;
        masterDeckData = await refreshWordCache(deckId, userDeckRef, masterDeckRef);
    }

    const newPrivateDeck = { allWords: masterDeckData.allWords, seenWords: [] };
    await setDoc(userDeckRef, newPrivateDeck);
    return newPrivateDeck;
}

async function refreshWordCache(deckId, userDeckRef, masterDeckRef) {
    if (!masterDeckRef) masterDeckRef = doc(db, `artifacts/${appId}/public/data/decks`, deckId);
    logToScreen(`Refilling ${deckId}...`);
    $loadingStatus.textContent = `Topping up your '${currentSettings.category}' deck...`;
    $loadingIndicator.classList.remove('hidden');

    try {
        const [userDeckSnap, masterDeckSnap] = await Promise.all([getDoc(userDeckRef), getDoc(masterDeckRef)]);
        const userDeckData = userDeckSnap.data() || { allWords: [], seenWords: [] };
        const masterDeckData = masterDeckSnap.data() || { allWords: [] };
        let existingWords = new Set([...masterDeckData.allWords, ...userDeckData.allWords]);
        let allNewWords = [];

        for (let i = 0; i < 5; i++) {
            try {
                const result = await callGeminiAPI(currentSettings.category, currentSettings.difficulty, 100, Array.from(existingWords));
                if (result && result.words) {
                    for (const word of result.words) {
                        const trimmed = word.trim();
                        if (trimmed.length > 0 && !existingWords.has(trimmed)) {
                            allNewWords.push(trimmed);
                            existingWords.add(trimmed);
                        }
                    }
                    logToScreen(`Batch ${i + 1}: ${allNewWords.length} new words so far.`);
                }
            } catch (error) { errorToScreen(`Batch ${i+1} fail: ` + error.message); }
        }

        if (allNewWords.length === 0) {
            if (userDeckData.allWords.length === 0) throw new Error("AI failed and no words are in the cache.");
            return userDeckData; 
        }

        const newDeckData = await runTransaction(db, async (transaction) => {
            transaction.set(masterDeckRef, { allWords: arrayUnion(...allNewWords) }, { merge: true });
            const updatedUserDeck = { allWords: [...userDeckData.allWords, ...allNewWords], seenWords: [] };
            transaction.set(userDeckRef, updatedUserDeck); 
            return updatedUserDeck;
        });
        logToScreen("Refill Complete.");
        return newDeckData;

    } catch (error) {
        errorToScreen("Refill Error: " + error.message);
        throw new Error(`Could not load word deck: ${error.message}`);
    } finally {
        $loadingIndicator.classList.add('hidden');
    }
}

function showWordModal(title, words) {
    $modalTitle.textContent = `${title} (${words.length})`;
    if (words.length === 0) $modalList.innerHTML = `<p class="text-gray-400 p-4">No words to show.</p>`;
    else $modalList.innerHTML = words.map(word => `<div class="results-list-item">${word}</div>`).join('');
    $wordModal.classList.add('is-open');
}
function hideWordModal() { $wordModal.classList.remove('is-open'); }

$startButton.addEventListener('click', handleStartGame);
$playAgainButton.addEventListener('click', handleStartGame);
$changeSettingsButton.addEventListener('click', () => switchScreen('setup'));
$viewCorrectBtn.addEventListener('click', () => showWordModal('Correct', correctWords));
$viewSkippedBtn.addEventListener('click', () => showWordModal('Skipped', skippedWords));
$modalBackdrop.addEventListener('click', hideWordModal);
$modalCloseBtn.addEventListener('click', hideWordModal);
$skipArea.addEventListener('mousedown', (e) => { e.preventDefault(); handleSkip(); });
$correctArea.addEventListener('mousedown', (e) => { e.preventDefault(); handleCorrect(); });
window.addEventListener('keydown', (e) => {
    if ($gameScreen.classList.contains('hidden')) return;
    if (e.key === 'ArrowLeft') handleSkip();
    else if (e.key === 'ArrowRight') handleCorrect();
});

main();