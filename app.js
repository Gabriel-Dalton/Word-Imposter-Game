/**
 * VAGUE — Word Imposter Game
 * Entry point.  Imports all modules, wires events, runs the game loop.
 */

import {
    getState, GameMode, Phase,
    addPlayer, removePlayer, setCategory, setMode,
    setLocalPlayerName, setIsHost,
    addOnlinePeer, removeOnlinePeer, setOnlinePeerReady,
    resetOnlinePeerReady, getOnlinePlayerNames,
    startGame, revealCurrentRole, nextRevealPlayer,
    startCluePhase, getCurrentCluePlayer, nextClueTurn,
    startDebatePhase, nextRoundSameWord, endGame,
    toggleTimer, resetTimer, tickTimerSecond,
    fullReset,
    serialiseForSync, applyHostState, applyRoleAssignment,
} from './js/game.js';

import {
    initScreens, initElements, getEl, showScreen,
    renderPlayerList, updateRevealScreen, showRole,
    updateOnlineRevealScreen, showOnlineRole,
    updateCluePhaseUI, updateDebatePhaseUI,
    updateTimerDisplay, setTimerButtonLabel,
    renderLobbyPlayerList, setHostStatus, setJoinStatus,
    showToast, setDiscussionHostControls,
} from './js/render.js';

import { initInput } from './js/input.js';
import { NetworkManager, PROTOCOL_VERSION } from './js/net.js';
import { copyToClipboard } from './js/utils.js';

/* ── Globals ───────────────────────────────────────────────── */

let net = null;   // NetworkManager instance (created on demand)

/* ── Bootstrap ─────────────────────────────────────────────── */

// Module scripts are deferred by default, so DOM is ready here.
initScreens();
initElements();
wireEvents();
initInput({ onConfirm: handleConfirm, onBack: handleBack, onNavigate: handleNav });
startGameLoop();

/* ── Game loop (requestAnimationFrame + fixed-step timer) ──── */

let _lastTs = 0;
let _timerAccum = 0;
const TIMER_TICK = 1000; // 1 second

function startGameLoop() {
    _lastTs = performance.now();
    requestAnimationFrame(loop);
}

function loop(ts) {
    const dt = ts - _lastTs;
    _lastTs = ts;

    const state = getState();

    // Fixed-step timer update
    if (state.timerRunning) {
        _timerAccum += dt;
        while (_timerAccum >= TIMER_TICK) {
            tickTimerSecond();
            _timerAccum -= TIMER_TICK;
        }
        updateTimerDisplay(state.timerSeconds);
    }

    requestAnimationFrame(loop);
}

/* ── Event wiring ──────────────────────────────────────────── */

function wireEvents() {
    const el = getEl();

    // ── Menu ──
    document.getElementById('start-new-game').addEventListener('click', () => {
        setMode(GameMode.LOCAL);
        showScreen('setup');
    });
    document.getElementById('multiplayer-btn').addEventListener('click', () => showScreen('multiplayer'));
    document.getElementById('settings-btn').addEventListener('click', () => showScreen('settings'));

    // Back buttons — all elements with .back-to-menu
    document.querySelectorAll('.back-to-menu').forEach(btn => {
        btn.addEventListener('click', () => {
            resetTimer();
            cleanupNet();
            showScreen('menu');
        });
    });

    // ── Setup ──
    el.addPlayerBtn.addEventListener('click', doAddPlayer);
    el.playerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doAddPlayer(); }
    });
    el.beginGameBtn.addEventListener('click', doStartGame);

    // ── Reveal (local) ──
    el.revealBox.addEventListener('click', doRevealRole);
    el.revealBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doRevealRole(); }
    });
    el.nextPlayerBtn.addEventListener('click', doNextPlayer);

    // ── Discussion ──
    el.timerToggleBtn.addEventListener('click', doToggleTimer);
    el.timerResetBtn.addEventListener('click', doResetTimer);
    el.clueNextBtn.addEventListener('click', doNextClueTurn);
    el.nextRoundBtn.addEventListener('click', doNextRound);
    el.finishMissionBtn.addEventListener('click', doFinishMission);

    // ── Results ──
    el.restartGameBtn.addEventListener('click', () => {
        // Go back to setup so players can adjust, instead of instantly restarting
        showScreen('setup');
    });

    // ── Multiplayer menu ──
    document.getElementById('local-mp-btn').addEventListener('click', () => {
        setMode(GameMode.LOCAL);
        showScreen('setup');
    });
    document.getElementById('host-game-btn').addEventListener('click', () => {
        setMode(GameMode.ONLINE_HOST);
        setIsHost(true);
        showScreen('host-lobby');
        setHostStatus('Enter your name and generate an invite code.');
    });
    document.getElementById('join-game-btn').addEventListener('click', () => {
        setMode(GameMode.ONLINE_PEER);
        setIsHost(false);
        showScreen('join-lobby');
        setJoinStatus('Enter your name and paste the host\'s invite code.');
    });

    // ── Host lobby ──
    document.getElementById('generate-offer-btn').addEventListener('click', doGenerateOffer);
    document.getElementById('copy-offer-btn').addEventListener('click', () => {
        const area = document.getElementById('offer-code-area');
        copyToClipboard(area.value).then(ok => {
            showToast(ok ? 'Copied!' : 'Copy failed — select and copy manually.', ok ? 'success' : 'error');
        });
    });
    document.getElementById('accept-answer-btn').addEventListener('click', doAcceptAnswer);
    document.getElementById('host-start-btn').addEventListener('click', doHostStartGame);

    // ── Join lobby ──
    document.getElementById('generate-answer-btn').addEventListener('click', doGenerateAnswer);
    document.getElementById('copy-answer-btn').addEventListener('click', () => {
        const area = document.getElementById('answer-code-area');
        copyToClipboard(area.value).then(ok => {
            showToast(ok ? 'Copied!' : 'Copy failed — select and copy manually.', ok ? 'success' : 'error');
        });
    });

    // ── Online reveal ──
    const orBox = document.getElementById('online-reveal-box');
    if (orBox) {
        orBox.addEventListener('click', doOnlineReveal);
        orBox.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doOnlineReveal(); }
        });
    }
    const readyBtn = document.getElementById('online-ready-btn');
    if (readyBtn) readyBtn.addEventListener('click', doOnlineReady);
}

/* ── Action handlers — Setup ───────────────────────────────── */

function doAddPlayer() {
    const el = getEl();
    const err = addPlayer(el.playerInput.value);
    if (err) {
        showToast(err, 'error');
        return;
    }
    el.playerInput.value = '';
    el.playerInput.focus();
    refreshSetupPlayerList();
}

/** Re-render the setup screen player list with working remove callbacks. */
function refreshSetupPlayerList() {
    renderPlayerList(getState().players, (idx) => {
        removePlayer(idx);
        refreshSetupPlayerList();
    });
}

function doStartGame() {
    setCategory(getEl().categorySelect.value);
    const err = startGame();
    if (err) { showToast(err, 'error'); return; }
    updateRevealScreen(getState().players[0]);
    showScreen('reveal');
}

/* ── Action handlers — Reveal (local) ─────────────────────── */

function doRevealRole() {
    const info = revealCurrentRole();
    if (!info) return;
    showRole(info.isImposter, info.word, info.hint);
}

function doNextPlayer() {
    const more = nextRevealPlayer();
    if (more) {
        updateRevealScreen(getState().players[getState().currentPlayerIndex]);
    } else {
        doStartCluePhase();
    }
}

/* ── Action handlers — Discussion ──────────────────────────── */

function doStartCluePhase() {
    startCluePhase();
    _timerAccum = 0;
    updateCluePhaseUI(getCurrentCluePlayer());
    updateTimerDisplay(0);
    setTimerButtonLabel(false);

    const state = getState();
    // In online mode, only host controls; peers see the UI synced
    if (state.mode !== GameMode.LOCAL && !state.isHost) {
        setDiscussionHostControls(false);
    }

    showScreen('discussion');

    // Broadcast phase change if host
    if (state.mode === GameMode.ONLINE_HOST && net) {
        net.broadcast({ type: 'phase_change', phase: 'CLUES', state: serialiseForSync() });
    }
}

function doNextClueTurn() {
    const more = nextClueTurn();
    _timerAccum = 0;
    if (more) {
        updateCluePhaseUI(getCurrentCluePlayer());
        updateTimerDisplay(0);
        setTimerButtonLabel(false);
    } else {
        doStartDebate();
    }

    // Broadcast if host
    const state = getState();
    if (state.mode === GameMode.ONLINE_HOST && net) {
        net.broadcast({ type: 'phase_change', phase: state.currentPhase, state: serialiseForSync() });
    }
}

function doStartDebate() {
    startDebatePhase();
    _timerAccum = 0;
    updateDebatePhaseUI();
    updateTimerDisplay(0);
    setTimerButtonLabel(false);

    const state = getState();
    if (state.mode === GameMode.ONLINE_HOST && net) {
        net.broadcast({ type: 'phase_change', phase: 'DEBATE', state: serialiseForSync() });
    }
}

function doNextRound() {
    nextRoundSameWord();
    _timerAccum = 0;
    updateCluePhaseUI(getCurrentCluePlayer());
    updateTimerDisplay(0);
    setTimerButtonLabel(false);

    const state = getState();
    if (state.mode === GameMode.ONLINE_HOST && net) {
        net.broadcast({ type: 'phase_change', phase: 'CLUES', state: serialiseForSync() });
    }
}

function doFinishMission() {
    endGame();
    showScreen('results');

    const state = getState();
    if (state.mode === GameMode.ONLINE_HOST && net) {
        net.broadcast({ type: 'phase_change', phase: 'RESULTS', state: serialiseForSync() });
    }
}

function doToggleTimer() {
    const running = toggleTimer();
    _timerAccum = 0;
    setTimerButtonLabel(running);
}

function doResetTimer() {
    resetTimer();
    _timerAccum = 0;
    updateTimerDisplay(0);
    setTimerButtonLabel(false);
}

/* ── Action handlers — Host lobby ──────────────────────────── */

async function doGenerateOffer() {
    const el = getEl();
    const name = el.hostNameInput?.value?.trim();
    if (!name) { showToast('Please enter your name first.', 'error'); return; }

    setLocalPlayerName(name);

    // Create network manager if needed
    if (!net) {
        net = new NetworkManager();
        net.isHost    = true;
        net.localName = name;
        net.onPeerConnected    = onHostPeerConnected;
        net.onPeerDisconnected = onHostPeerDisconnected;
        net.onMessage          = onHostMessage;
        net.onError            = (err) => showToast(err, 'error');
    }

    setHostStatus('Generating invite code...');
    try {
        const { offerCode } = await net.createOffer();
        const offerArea = document.getElementById('offer-code-area');
        if (offerArea) offerArea.value = offerCode;

        document.getElementById('offer-section').style.display = 'block';
        document.getElementById('answer-section').style.display = 'block';
        setHostStatus('Share the invite code with a player, then paste their response code below.');
    } catch (e) {
        setHostStatus('Error generating invite: ' + e.message);
        showToast('Failed to generate invite code.', 'error');
    }
}

async function doAcceptAnswer() {
    const area = document.getElementById('answer-paste-area');
    const code = area?.value?.trim();
    if (!code) { showToast('Paste the response code first.', 'error'); return; }

    setHostStatus('Connecting...');
    try {
        await net.acceptAnswer(code);
        area.value = '';
        setHostStatus('Player connected! Generate another invite for more players, or start the game.');
        showToast('Player connected!', 'success');
    } catch (e) {
        setHostStatus('Connection failed: ' + e.message);
        showToast('Failed to connect. Check the code and try again.', 'error');
    }
}

function onHostPeerConnected(peerId, peerName) {
    addOnlinePeer(peerId, peerName);
    refreshHostLobby();
    showToast(`${peerName} joined!`, 'success');

    // Send lobby update to all peers
    broadcastLobbyUpdate();
}

function onHostPeerDisconnected(peerId) {
    const state = getState();
    const peer = state.onlinePeers.find(p => p.id === peerId);
    const name = peer?.name ?? 'A player';
    removeOnlinePeer(peerId);
    refreshHostLobby();
    showToast(`${name} disconnected.`, 'error');
    broadcastLobbyUpdate();
}

function refreshHostLobby() {
    const state = getState();
    const names = getOnlinePlayerNames();
    renderLobbyPlayerList(document.getElementById('host-player-list'), names, state.localPlayerName);

    const btn = document.getElementById('host-start-btn');
    if (btn) {
        const enough = names.length >= 3;
        btn.disabled = !enough;
        btn.textContent = enough ? 'Start Game' : `Start Game (need ${3 - names.length} more)`;
    }
}

function broadcastLobbyUpdate() {
    if (!net) return;
    const names = getOnlinePlayerNames();
    net.broadcast({ type: 'lobby_update', players: names });
}

function doHostStartGame() {
    const state = getState();
    const names = getOnlinePlayerNames();
    if (names.length < 3) { showToast('Need at least 3 players.', 'error'); return; }

    // Set up game state with online player names
    fullReset();
    setMode(GameMode.ONLINE_HOST);
    setIsHost(true);
    setLocalPlayerName(getEl().hostNameInput.value.trim());
    setCategory(document.getElementById('host-category-select').value);

    // Re-add online peers to state
    for (const [id, p] of net.peers) {
        if (p.name) addOnlinePeer(id, p.name);
    }

    // Add all player names
    names.forEach(n => addPlayer(n));

    const err = startGame();
    if (err) { showToast(err, 'error'); return; }

    // Send each peer their role
    const gs = getState();
    for (const [peerId, p] of net.peers) {
        if (!p.name) continue;
        const playerIdx = gs.players.indexOf(p.name);
        if (playerIdx === -1) continue;
        const isImp = playerIdx === gs.imposterIndex;
        net.sendToPeer(peerId, {
            type: 'game_start',
            version: PROTOCOL_VERSION,
            players: gs.players,
            category: gs.category,
            role: {
                isImposter: isImp,
                word: isImp ? null : gs.currentWord.word,
                hint: isImp ? gs.currentWord.hint : null,
            },
        });
    }

    // Start sync loop
    net.startPingLoop();
    net.startSyncLoop(() => serialiseForSync());

    // Host sees their own role on the online reveal screen
    const hostIdx = gs.players.indexOf(gs.localPlayerName);
    const hostIsImp = hostIdx === gs.imposterIndex;
    applyRoleAssignment({
        isImposter: hostIsImp,
        word: hostIsImp ? null : gs.currentWord.word,
        hint: hostIsImp ? gs.currentWord.hint : null,
    });
    resetOnlinePeerReady();

    updateOnlineRevealScreen(gs.localPlayerName);
    showScreen('online-reveal');
}

/** Host handles messages from peers (after built-in ping/pong/hello). */
function onHostMessage(peerId, msg) {
    switch (msg.type) {
        case 'ready': {
            setOnlinePeerReady(peerId);
            showToast(`${msg.name || 'A player'} is ready.`, 'info');
            checkAllReady();
            break;
        }
        case 'input': {
            // Peer-initiated actions (future expansion)
            break;
        }
    }
}

function checkAllReady() {
    const state = getState();
    // Host must also be ready
    if (!state._hostReady) return;
    const allPeersReady = state.onlinePeers.every(p => p.ready);
    if (allPeersReady) {
        // All ready — move to clue phase
        doStartCluePhase();
    }
}

/* ── Action handlers — Join lobby ──────────────────────────── */

async function doGenerateAnswer() {
    const el = getEl();
    const name = el.joinNameInput?.value?.trim();
    if (!name) { showToast('Please enter your name first.', 'error'); return; }

    const offerCode = document.getElementById('offer-paste-area')?.value?.trim();
    if (!offerCode) { showToast('Paste the host\'s invite code first.', 'error'); return; }

    setLocalPlayerName(name);

    // Create network manager
    if (net) net.close();
    net = new NetworkManager();
    net.isHost    = false;
    net.localName = name;
    net.onConnectedToHost  = onPeerConnectedToHost;
    net.onPeerDisconnected = onPeerDisconnectedFromHost;
    net.onMessage          = onPeerMessage;
    net.onError            = (err) => showToast(err, 'error');

    setJoinStatus('Generating response code...');
    try {
        const answerCode = await net.createAnswer(offerCode);
        const area = document.getElementById('answer-code-area');
        if (area) area.value = answerCode;
        document.getElementById('answer-out-section').style.display = 'block';
        setJoinStatus('Share the response code with the host and wait for connection.');
    } catch (e) {
        setJoinStatus('Error: ' + e.message);
        showToast('Failed to process invite code. Is it valid?', 'error');
    }
}

function onPeerConnectedToHost() {
    setJoinStatus('Connected to host! Waiting for game to start...');
    showToast('Connected!', 'success');
    net.startPingLoop();
}

function onPeerDisconnectedFromHost() {
    setJoinStatus('Disconnected from host. Try rejoining.');
    showToast('Lost connection to host.', 'error');
}

/** Peer handles messages from host. */
function onPeerMessage(_fromId, msg) {
    switch (msg.type) {
        case 'lobby_update': {
            const list = document.getElementById('join-player-list');
            renderLobbyPlayerList(list, msg.players, null);
            break;
        }

        case 'game_start': {
            const myName = net.localName;
            // Set up local state
            fullReset();
            setMode(GameMode.ONLINE_PEER);
            setIsHost(false);
            setLocalPlayerName(myName);
            msg.players.forEach(n => addPlayer(n));
            setCategory(msg.category);

            // Apply role
            applyRoleAssignment(msg.role);

            // Show online reveal screen
            updateOnlineRevealScreen(myName);
            showScreen('online-reveal');
            break;
        }

        case 'phase_change': {
            applyHostState(msg.state);
            const state = getState();

            switch (msg.phase) {
                case 'CLUES':
                    updateCluePhaseUI(getCurrentCluePlayer());
                    updateTimerDisplay(state.timerSeconds);
                    setTimerButtonLabel(state.timerRunning);
                    setDiscussionHostControls(false);
                    showScreen('discussion');
                    break;
                case 'DEBATE':
                    updateDebatePhaseUI();
                    updateTimerDisplay(state.timerSeconds);
                    setTimerButtonLabel(state.timerRunning);
                    setDiscussionHostControls(false);
                    showScreen('discussion');
                    break;
                case 'RESULTS':
                    showScreen('results');
                    break;
            }
            break;
        }

        case 'sync': {
            // Periodic state sync — apply and check for desync
            applyHostState(msg.state);
            updateTimerDisplay(getState().timerSeconds);
            break;
        }

        case 'error': {
            showToast(msg.message || 'Host reported an error.', 'error');
            break;
        }

        case 'disconnect': {
            showToast('Host ended the session.', 'error');
            cleanupNet();
            showScreen('menu');
            break;
        }
    }
}

/* ── Online reveal handlers ────────────────────────────────── */

function doOnlineReveal() {
    const state = getState();
    if (state.isRoleRevealed) return;
    state.isRoleRevealed = true;

    showOnlineRole(state._localIsImposter, state._localWord, state._localHint);
}

function doOnlineReady() {
    const state = getState();
    if (state.mode === GameMode.ONLINE_HOST) {
        // Host marks self as ready
        state._hostReady = true;
        showToast('You are ready. Waiting for other players...', 'info');
        checkAllReady();
    } else if (net) {
        // Peer sends ready to host
        net.sendToHost({ type: 'ready', name: state.localPlayerName });
        showToast('Waiting for all players to be ready...', 'info');
    }
    document.getElementById('online-ready-btn').disabled = true;
}

/* ── Input handler callbacks ───────────────────────────────── */

function handleConfirm() {
    const state = getState();
    switch (state.currentPhase) {
        case Phase.REVEAL:
            if (!state.isRoleRevealed) doRevealRole();
            else doNextPlayer();
            break;
        case Phase.CLUES:
            doNextClueTurn();
            break;
    }
}

function handleBack() {
    resetTimer();
    showScreen('menu');
}

function handleNav(dir) {
    // Focus the next/prev focusable element in the active screen
    const active = document.querySelector('.screen.active');
    if (!active) return;
    const focusable = [...active.querySelectorAll('button:not([disabled]), input, select, textarea, [tabindex]')];
    const idx = focusable.indexOf(document.activeElement);

    if (dir === 'down' || dir === 'right') {
        const next = focusable[(idx + 1) % focusable.length];
        next?.focus();
    } else if (dir === 'up' || dir === 'left') {
        const prev = focusable[(idx - 1 + focusable.length) % focusable.length];
        prev?.focus();
    }
}

/* ── Cleanup helper ────────────────────────────────────────── */

function cleanupNet() {
    if (net) {
        // Notify peers
        if (net.isHost) {
            net.broadcast({ type: 'disconnect', reason: 'Host left.' });
        } else {
            net.sendToHost({ type: 'disconnect', reason: 'Peer left.' });
        }
        net.close();
        net = null;
    }
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    cleanupNet();
});
