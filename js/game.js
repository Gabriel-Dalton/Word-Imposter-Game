/**
 * Core game state and logic for VAGUE.
 * Single source of truth — other modules read state via getState()
 * and mutate it only through exported functions.
 */

import wordDatabase from '../data/words.js';
import { checksum } from './utils.js';

/* ── Constants ─────────────────────────────────────────────── */

export const GameMode = Object.freeze({
    LOCAL:       'local',
    ONLINE_HOST: 'online_host',
    ONLINE_PEER: 'online_peer',
});

export const Phase = Object.freeze({
    MENU:    'MENU',
    SETUP:   'SETUP',
    REVEAL:  'REVEAL',
    CLUES:   'CLUES',
    DEBATE:  'DEBATE',
    RESULTS: 'RESULTS',
});

/* ── State ─────────────────────────────────────────────────── */

const state = {
    /* mode */
    mode: GameMode.LOCAL,

    /* players */
    players: [],           // string[]

    /* word / round */
    category:          'household',
    currentWord:       null,   // { word, hint }
    imposterIndex:     -1,
    currentPlayerIndex: 0,
    isRoleRevealed:    false,
    currentPhase:      Phase.MENU,
    round:             1,
    usedWords:         [],     // track used words to avoid repeats

    /* clue / discussion */
    cluePlayerIndex:     0,
    startingPlayerIndex: -1,

    /* timer (stopwatch, counts up) */
    timerSeconds: 0,
    timerRunning: false,

    /* online multiplayer */
    localPlayerName: '',
    isHost:          false,
    onlinePeers:     [],   // { id, name, ready }

    /* per-peer role info (set by host for each peer individually) */
    _localIsImposter: false,
    _localWord:       null,
    _localHint:       null,
    _hostReady:       false,   // host's own "ready" flag in online mode
};

/* ── Getters ───────────────────────────────────────────────── */

/** Return the live state object (read-only by convention). */
export function getState() { return state; }

/** Return available categories from word database. */
export function getCategories() { return Object.keys(wordDatabase); }

/* ── Reset helpers ─────────────────────────────────────────── */

/** Reset round-level state (keeps players, mode, settings). */
export function resetRoundState() {
    state.currentWord       = null;
    state.imposterIndex     = -1;
    state.currentPlayerIndex = 0;
    state.isRoleRevealed    = false;
    state.currentPhase      = Phase.MENU;
    state.cluePlayerIndex   = 0;
    state.startingPlayerIndex = -1;
    state.round             = 1;
    state.usedWords         = [];
    state.timerSeconds      = 0;
    state.timerRunning      = false;
}

/** Full reset including players and mode. */
export function fullReset() {
    resetRoundState();
    state.players         = [];
    state.mode            = GameMode.LOCAL;
    state.localPlayerName = '';
    state.isHost          = false;
    state.onlinePeers     = [];
    state._localIsImposter = false;
    state._localWord       = null;
    state._localHint       = null;
    state._hostReady       = false;
}

/* ── Player management ─────────────────────────────────────── */

/**
 * Add a player by name.
 * @returns {string|null} error message, or null on success
 */
export function addPlayer(name) {
    const n = name.trim();
    if (!n) return 'Name cannot be empty.';
    if (state.players.some(p => p.toLowerCase() === n.toLowerCase())) {
        return 'That name is already taken.';
    }
    state.players.push(n);
    return null;
}

/** Remove player at index. */
export function removePlayer(idx) {
    if (idx >= 0 && idx < state.players.length) {
        state.players.splice(idx, 1);
    }
}

/* ── Category ──────────────────────────────────────────────── */

export function setCategory(cat) {
    if (wordDatabase[cat]) state.category = cat;
}

/* ── Mode ──────────────────────────────────────────────────── */

export function setMode(mode) { state.mode = mode; }
export function setLocalPlayerName(n) { state.localPlayerName = n.trim(); }
export function setIsHost(v) { state.isHost = !!v; }

/* ── Online peer tracking ──────────────────────────────────── */

export function addOnlinePeer(id, name) {
    if (!state.onlinePeers.find(p => p.id === id)) {
        state.onlinePeers.push({ id, name, ready: false });
    }
}

export function removeOnlinePeer(id) {
    state.onlinePeers = state.onlinePeers.filter(p => p.id !== id);
}

export function setOnlinePeerReady(id) {
    const p = state.onlinePeers.find(x => x.id === id);
    if (p) p.ready = true;
}

export function resetOnlinePeerReady() {
    state.onlinePeers.forEach(p => { p.ready = false; });
}

export function getOnlinePlayerNames() {
    // Host name first, then peers in join order
    const names = [];
    if (state.localPlayerName) names.push(state.localPlayerName);
    state.onlinePeers.forEach(p => names.push(p.name));
    return names;
}

/* ── Game flow ─────────────────────────────────────────────── */

/**
 * Validate and begin the game.
 * @returns {string|null} error or null
 */
export function startGame() {
    const min = 3;
    if (state.players.length < min) return `Need at least ${min} players!`;
    state.round    = 1;
    state.usedWords = [];
    return startRound();
}

/**
 * Start a new round — picks word, assigns imposter.
 * @returns {string|null} error or null
 */
export function startRound() {
    const pool = wordDatabase[state.category];
    if (!pool || pool.length === 0) return 'No words for this category!';

    // Avoid repeats until exhausted
    let available = pool.filter(w => !state.usedWords.includes(w.word));
    if (available.length === 0) {
        state.usedWords = [];
        available = pool;
    }

    state.currentWord  = available[Math.floor(Math.random() * available.length)];
    state.usedWords.push(state.currentWord.word);
    state.imposterIndex = Math.floor(Math.random() * state.players.length);

    state.currentPlayerIndex = 0;
    state.isRoleRevealed     = false;
    state.currentPhase       = Phase.REVEAL;
    return null;
}

/**
 * Reveal the current player's role (local pass-and-play).
 * @returns {{ isImposter:boolean, word?:string, hint?:string }|null}
 */
export function revealCurrentRole() {
    if (state.isRoleRevealed) return null;
    state.isRoleRevealed = true;

    const imp = state.currentPlayerIndex === state.imposterIndex;
    return {
        isImposter:  imp,
        playerName:  state.players[state.currentPlayerIndex],
        word:        imp ? null : state.currentWord.word,
        hint:        imp ? state.currentWord.hint : null,
    };
}

/**
 * Move to the next player in the reveal sequence.
 * @returns {boolean} true if there are more players
 */
export function nextRevealPlayer() {
    state.currentPlayerIndex++;
    state.isRoleRevealed = false;
    return state.currentPlayerIndex < state.players.length;
}

/* ── Clue / Debate ─────────────────────────────────────────── */

export function startCluePhase() {
    state.currentPhase       = Phase.CLUES;
    state.startingPlayerIndex = Math.floor(Math.random() * state.players.length);
    state.cluePlayerIndex    = 0;
    state.timerSeconds       = 0;
    state.timerRunning       = false;
}

export function getCurrentCluePlayer() {
    const idx = (state.startingPlayerIndex + state.cluePlayerIndex) % state.players.length;
    return state.players[idx];
}

/**
 * Advance to next clue turn.
 * @returns {boolean} true if more players remain
 */
export function nextClueTurn() {
    state.cluePlayerIndex++;
    state.timerSeconds = 0;
    state.timerRunning = false;
    return state.cluePlayerIndex < state.players.length;
}

export function startDebatePhase() {
    state.currentPhase = Phase.DEBATE;
    state.timerSeconds = 0;
    state.timerRunning = false;
}

/**
 * Start another round of clues (same word, new random starting player).
 */
export function nextRoundSameWord() {
    state.round++;
    state.startingPlayerIndex = Math.floor(Math.random() * state.players.length);
    state.cluePlayerIndex    = 0;
    state.currentPhase       = Phase.CLUES;
    state.timerSeconds       = 0;
    state.timerRunning       = false;
}

export function endGame() {
    state.currentPhase = Phase.RESULTS;
    state.timerRunning = false;
}

/* ── Timer ─────────────────────────────────────────────────── */

export function toggleTimer() {
    state.timerRunning = !state.timerRunning;
    return state.timerRunning;
}

export function resetTimer() {
    state.timerSeconds = 0;
    state.timerRunning = false;
}

export function tickTimerSecond() {
    if (state.timerRunning) state.timerSeconds++;
}

/* ── Network sync helpers ──────────────────────────────────── */

/** Serialise the game state for sending to peers (excludes secret per-player data). */
export function serialiseForSync() {
    return {
        players:             state.players,
        category:            state.category,
        currentPhase:        state.currentPhase,
        round:               state.round,
        currentPlayerIndex:  state.currentPlayerIndex,
        cluePlayerIndex:     state.cluePlayerIndex,
        startingPlayerIndex: state.startingPlayerIndex,
        timerSeconds:        state.timerSeconds,
        timerRunning:        state.timerRunning,
    };
}

/** Apply host-broadcast state (peer side). */
export function applyHostState(s) {
    state.players             = s.players;
    state.category            = s.category;
    state.currentPhase        = s.currentPhase;
    state.round               = s.round;
    state.currentPlayerIndex  = s.currentPlayerIndex;
    state.cluePlayerIndex     = s.cluePlayerIndex;
    state.startingPlayerIndex = s.startingPlayerIndex;
    state.timerSeconds        = s.timerSeconds;
    state.timerRunning        = s.timerRunning;
}

/** Apply role assignment from host (peer side). */
export function applyRoleAssignment(data) {
    state._localIsImposter = data.isImposter;
    state._localWord       = data.word;
    state._localHint       = data.hint;
    state.isRoleRevealed   = false;
}

/** Checksum of core game state for desync detection. */
export function getStateChecksum() {
    return checksum(JSON.stringify({
        phase:   state.currentPhase,
        players: state.players,
        round:   state.round,
        imp:     state.imposterIndex,
        word:    state.currentWord?.word,
    }));
}
