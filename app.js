import wordDatabase from './data/words.js';

// Game State
const state = {
    players: [],
    category: 'household',
    currentWord: null,
    imposterIndex: -1,
    currentPlayerIndex: 0,
    isRoleRevealed: false,

    // Discussion State
    currentPhase: 'REVEAL', // REVEAL, CLUES, DEBATE
    cluePlayerIndex: 0,
    startingPlayerIndex: -1,
    timerSeconds: 0,
    timerInterval: null
};

// DOM Elements
const screens = {
    menu: document.getElementById('menu-screen'),
    setup: document.getElementById('setup-screen'),
    reveal: document.getElementById('reveal-screen'),
    discussion: document.getElementById('discussion-screen'),
    results: document.getElementById('results-screen')
};

const elements = {
    playerInput: document.getElementById('player-input'),
    playerList: document.getElementById('player-list'),
    addPlayerBtn: document.getElementById('add-player-btn'),
    categorySelect: document.getElementById('category-select'),
    beginGameBtn: document.getElementById('begin-game-btn'),

    roundDisplay: document.getElementById('round-display'),
    currentPlayerName: document.getElementById('current-player-name'),
    revealBox: document.getElementById('reveal-box'),
    tapInstruction: document.getElementById('tap-instruction'),
    roleInfo: document.getElementById('role-info'),
    roleType: document.getElementById('role-type'),
    secretWord: document.getElementById('secret-word'),
    imposterHint: document.getElementById('imposter-hint'),
    nextPlayerBtn: document.getElementById('next-player-btn'),

    // Discussion Elements
    phaseTitle: document.getElementById('phase-title'),
    discussionInstruction: document.getElementById('discussion-instruction'),
    phaseSubtitle: document.getElementById('phase-subtitle'),
    timerDisplay: document.getElementById('timer-display'),
    timerToggleBtn: document.getElementById('timer-toggle-btn'),
    timerResetBtn: document.getElementById('timer-reset-btn'),
    clueNextBtn: document.getElementById('clue-next-btn'),
    postDiscussionOptions: document.getElementById('post-discussion-options'),
    nextRoundBtn: document.getElementById('next-round-btn'),
    finishMissionBtn: document.getElementById('finish-mission-btn'),

    restartGameBtn: document.getElementById('restart-game-btn')
};

// --- Initialization ---

function init() {
    // Nav Buttons
    document.getElementById('start-new-game').addEventListener('click', () => showScreen('setup'));
    document.querySelectorAll('.back-to-menu').forEach(btn => {
        btn.addEventListener('click', () => {
            stopTimer();
            showScreen('menu');
        });
    });

    // Setup Screen
    elements.addPlayerBtn.addEventListener('click', addPlayer);
    elements.playerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addPlayer();
    });
    elements.beginGameBtn.addEventListener('click', startGame);

    // Reveal Screen
    elements.revealBox.addEventListener('click', revealRole);
    elements.nextPlayerBtn.addEventListener('click', nextPlayer);

    // Discussion/Timer Controls
    elements.timerToggleBtn.addEventListener('click', toggleTimer);
    elements.timerResetBtn.addEventListener('click', resetTimer);
    elements.clueNextBtn.addEventListener('click', nextClueTurn);
    elements.nextRoundBtn.addEventListener('click', startDiscussionPhase);
    elements.finishMissionBtn.addEventListener('click', showResults);

    // Results Screen
    elements.restartGameBtn.addEventListener('click', () => {
        startGame();
    });
}

// --- Navigation ---

function showScreen(screenKey) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenKey].classList.add('active');
}

// --- Setup Logic ---

function addPlayer() {
    const name = elements.playerInput.value.trim();
    if (name && !state.players.includes(name)) {
        state.players.push(name);
        elements.playerInput.value = '';
        renderPlayerList();
    }
}

function removePlayer(index) {
    state.players.splice(index, 1);
    renderPlayerList();
}

function renderPlayerList() {
    elements.playerList.innerHTML = '';
    state.players.forEach((player, index) => {
        const div = document.createElement('div');
        div.className = 'player-item';
        div.innerHTML = `
            <span>${player}</span>
            <span class="remove-player" onclick="window.removePlayer(${index})">&times;</span>
        `;
        elements.playerList.appendChild(div);
    });
}

// Global exposure for onclick
window.removePlayer = removePlayer;

// --- Game Logic ---

function startGame() {
    if (state.players.length < 3) {
        alert("Need at least 3 players to start!");
        return;
    }

    state.category = elements.categorySelect.value;
    startRound();
}

function startRound() {
    // Select random word
    const categoryWords = wordDatabase[state.category];
    state.currentWord = categoryWords[Math.floor(Math.random() * categoryWords.length)];

    // Assign random imposter
    state.imposterIndex = Math.floor(Math.random() * state.players.length);

    // Reset player sequence
    state.currentPlayerIndex = 0;
    state.isRoleRevealed = false;

    updateRevealScreen();
    showScreen('reveal');
}

function updateRevealScreen() {
    elements.roundDisplay.innerText = "IDENTITY CHECK";
    elements.currentPlayerName.innerText = state.players[state.currentPlayerIndex].toUpperCase();

    // Reset reveal box
    elements.tapInstruction.style.display = 'block';
    elements.roleInfo.style.display = 'none';
    elements.nextPlayerBtn.style.display = 'none';
    state.isRoleRevealed = false;
}

function revealRole() {
    if (state.isRoleRevealed) return;

    state.isRoleRevealed = true;
    elements.tapInstruction.style.display = 'none';
    elements.roleInfo.style.display = 'block';

    const isImposter = state.currentPlayerIndex === state.imposterIndex;

    if (isImposter) {
        elements.roleType.innerText = 'YOU ARE THE IMPOSTER';
        elements.roleType.className = 'reveal-text imposter-text';
        elements.secretWord.innerText = '???';
        elements.imposterHint.innerText = `HINT: ${state.currentWord.hint}`;
        elements.imposterHint.style.display = 'block';
    } else {
        elements.roleType.innerText = 'YOU ARE A CIVILIAN';
        elements.roleType.className = 'reveal-text';
        elements.secretWord.innerText = state.currentWord.word.toUpperCase();
        elements.imposterHint.style.display = 'none';
    }

    elements.nextPlayerBtn.style.display = 'block';
}

function nextPlayer() {
    state.currentPlayerIndex++;

    if (state.currentPlayerIndex < state.players.length) {
        updateRevealScreen();
    } else {
        startDiscussionPhase();
    }
}

// --- Timer & Discussion Logic ---

function startDiscussionPhase() {
    state.currentPhase = 'CLUES';
    state.startingPlayerIndex = Math.floor(Math.random() * state.players.length);
    state.cluePlayerIndex = 0; // Relative to the sequence

    resetTimer();
    updatePhaseUI();
    showScreen('discussion');
}

function updatePhaseUI() {
    if (state.currentPhase === 'CLUES') {
        elements.phaseTitle.innerText = "CLUE PHASE";

        // Calculate whose turn it is
        const actualIndex = (state.startingPlayerIndex + state.cluePlayerIndex) % state.players.length;
        const player = state.players[actualIndex];

        elements.discussionInstruction.innerText = player.toUpperCase();
        elements.phaseSubtitle.innerText = "IS GIVING A CLUE...";

        elements.clueNextBtn.style.display = 'block';
        elements.clueNextBtn.innerText = "Next Player";
        elements.postDiscussionOptions.style.display = 'none';
    } else {
        elements.phaseTitle.innerText = "DEBATE PHASE";
        elements.discussionInstruction.innerText = "GROUP DISCUSSION";
        elements.phaseSubtitle.innerText = "REVEAL THE IMPOSTER!";

        elements.clueNextBtn.style.display = 'none';
        elements.postDiscussionOptions.style.display = 'flex';
    }
}

function nextClueTurn() {
    state.cluePlayerIndex++;

    if (state.cluePlayerIndex < state.players.length) {
        resetTimer(); // Reset timer for each player's clue
        updatePhaseUI();
    } else {
        startDebatePhase();
    }
}

function startDebatePhase() {
    state.currentPhase = 'DEBATE';
    resetTimer(); // Reset for group debate
    updatePhaseUI();
}

// --- Stopwatch Functions ---

function toggleTimer() {
    if (state.timerInterval) {
        stopTimer();
    } else {
        startTimer();
    }
}

function startTimer() {
    if (state.timerInterval) return;

    elements.timerToggleBtn.innerText = "PAUSE";
    state.timerInterval = setInterval(() => {
        state.timerSeconds++;
        updateTimerDisplay();
    }, 1000);
}

function stopTimer() {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
    elements.timerToggleBtn.innerText = "START";
}

function resetTimer() {
    stopTimer();
    state.timerSeconds = 0;
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const mins = Math.floor(state.timerSeconds / 60);
    const secs = state.timerSeconds % 60;
    elements.timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function showResults() {
    stopTimer();
    showScreen('results');
}

// Start the app
init();
