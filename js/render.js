/**
 * DOM rendering and screen management for VAGUE.
 *
 * All direct DOM reads/writes go through this module.
 * No game logic here — only presentation.
 */

import { escapeHtml, formatTime } from './utils.js';

/* ── Screen map (populated once on init) ───────────────────── */

const screens = {};  // key -> HTMLElement

/** Initialise screen map from DOM.  Call once after DOMContentLoaded. */
export function initScreens() {
    const ids = [
        'menu', 'setup', 'reveal', 'discussion', 'results',
        'multiplayer', 'host-lobby', 'join-lobby', 'settings',
        'online-reveal',
    ];
    ids.forEach(key => {
        const el = document.getElementById(`${key}-screen`);
        if (el) screens[key] = el;
    });
}

/**
 * Show a single screen; hide all others.
 * @param {string} key  e.g. 'menu', 'setup', 'reveal'
 */
export function showScreen(key) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    const target = screens[key];
    if (target) {
        target.classList.add('active');
        // Move focus to the first heading or focusable element
        const heading = target.querySelector('h1, h2');
        if (heading) heading.focus?.();
    }
}

/* ── Cached DOM references (set once on init) ──────────────── */

let el = {};  // filled by initElements()

export function initElements() {
    el = {
        // Setup
        playerInput:       document.getElementById('player-input'),
        playerList:        document.getElementById('player-list'),
        addPlayerBtn:      document.getElementById('add-player-btn'),
        categorySelect:    document.getElementById('category-select'),
        beginGameBtn:      document.getElementById('begin-game-btn'),

        // Reveal
        roundDisplay:      document.getElementById('round-display'),
        currentPlayerName: document.getElementById('current-player-name'),
        revealBox:         document.getElementById('reveal-box'),
        tapInstruction:    document.getElementById('tap-instruction'),
        roleInfo:          document.getElementById('role-info'),
        roleType:          document.getElementById('role-type'),
        secretWord:        document.getElementById('secret-word'),
        imposterHint:      document.getElementById('imposter-hint'),
        nextPlayerBtn:     document.getElementById('next-player-btn'),

        // Discussion
        phaseTitle:        document.getElementById('phase-title'),
        discussionInstr:   document.getElementById('discussion-instruction'),
        phaseSubtitle:     document.getElementById('phase-subtitle'),
        timerDisplay:      document.getElementById('timer-display'),
        timerToggleBtn:    document.getElementById('timer-toggle-btn'),
        timerResetBtn:     document.getElementById('timer-reset-btn'),
        clueNextBtn:       document.getElementById('clue-next-btn'),
        postDiscussionOpts:document.getElementById('post-discussion-options'),
        nextRoundBtn:      document.getElementById('next-round-btn'),
        finishMissionBtn:  document.getElementById('finish-mission-btn'),

        // Results
        finalResultsText:  document.getElementById('final-results-text'),
        restartGameBtn:    document.getElementById('restart-game-btn'),

        // Multiplayer
        hostNameInput:     document.getElementById('host-name-input'),
        hostCategorySelect:document.getElementById('host-category-select'),
        offerCodeArea:     document.getElementById('offer-code-area'),
        copyOfferBtn:      document.getElementById('copy-offer-btn'),
        answerPasteArea:   document.getElementById('answer-paste-area'),
        acceptAnswerBtn:   document.getElementById('accept-answer-btn'),
        generateOfferBtn:  document.getElementById('generate-offer-btn'),
        hostPlayerList:    document.getElementById('host-player-list'),
        hostStartBtn:      document.getElementById('host-start-btn'),
        hostStatus:        document.getElementById('host-status'),

        joinNameInput:     document.getElementById('join-name-input'),
        offerPasteArea:    document.getElementById('offer-paste-area'),
        generateAnswerBtn: document.getElementById('generate-answer-btn'),
        answerCodeArea:    document.getElementById('answer-code-area'),
        copyAnswerBtn:     document.getElementById('copy-answer-btn'),
        joinStatus:        document.getElementById('join-status'),
        joinPlayerList:    document.getElementById('join-player-list'),

        // Online reveal
        onlinePlayerName:  document.getElementById('online-player-name'),
        onlineRevealBox:   document.getElementById('online-reveal-box'),
        onlineTapInstr:    document.getElementById('online-tap-instruction'),
        onlineRoleInfo:    document.getElementById('online-role-info'),
        onlineRoleType:    document.getElementById('online-role-type'),
        onlineSecretWord:  document.getElementById('online-secret-word'),
        onlineImposterHint:document.getElementById('online-imposter-hint'),
        onlineReadyBtn:    document.getElementById('online-ready-btn'),

        // Toast
        toastContainer:    document.getElementById('toast-container'),
    };
}

export function getEl() { return el; }

/* ── Player list (setup screen) ────────────────────────────── */

/**
 * Render the player list inside #player-list.
 * @param {string[]} players
 * @param {(index:number)=>void} onRemove
 */
export function renderPlayerList(players, onRemove) {
    if (!el.playerList) return;
    el.playerList.innerHTML = '';
    players.forEach((name, idx) => {
        const div = document.createElement('div');
        div.className = 'player-item';
        div.setAttribute('role', 'listitem');

        const span = document.createElement('span');
        span.textContent = name;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-player';
        removeBtn.textContent = '\u00d7';
        removeBtn.setAttribute('aria-label', `Remove ${name}`);
        removeBtn.addEventListener('click', () => onRemove(idx));

        div.appendChild(span);
        div.appendChild(removeBtn);
        el.playerList.appendChild(div);
    });
}

/* ── Reveal screen (local pass-and-play) ───────────────────── */

export function updateRevealScreen(playerName) {
    if (el.roundDisplay)      el.roundDisplay.textContent = 'IDENTITY CHECK';
    if (el.currentPlayerName) el.currentPlayerName.textContent = playerName.toUpperCase();

    // Reset reveal box
    if (el.tapInstruction) el.tapInstruction.style.display = 'block';
    if (el.roleInfo)       el.roleInfo.style.display       = 'none';
    if (el.nextPlayerBtn)  el.nextPlayerBtn.style.display   = 'none';
}

export function showRole(isImposter, word, hint) {
    if (el.tapInstruction) el.tapInstruction.style.display = 'none';
    if (el.roleInfo)       el.roleInfo.style.display       = 'block';

    if (isImposter) {
        if (el.roleType) {
            el.roleType.textContent = 'YOU ARE THE IMPOSTER';
            el.roleType.className   = 'reveal-text imposter-text';
        }
        if (el.secretWord)    el.secretWord.textContent    = '???';
        if (el.imposterHint) {
            el.imposterHint.textContent = `HINT: ${escapeHtml(hint)}`;
            el.imposterHint.style.display = 'block';
        }
    } else {
        if (el.roleType) {
            el.roleType.textContent = 'YOU ARE A CIVILIAN';
            el.roleType.className   = 'reveal-text';
        }
        if (el.secretWord)    el.secretWord.textContent    = word.toUpperCase();
        if (el.imposterHint)  el.imposterHint.style.display = 'none';
    }

    if (el.nextPlayerBtn) el.nextPlayerBtn.style.display = 'block';
}

/* ── Online reveal screen ──────────────────────────────────── */

export function updateOnlineRevealScreen(playerName) {
    if (el.onlinePlayerName) el.onlinePlayerName.textContent = playerName.toUpperCase();
    if (el.onlineTapInstr)   el.onlineTapInstr.style.display = 'block';
    if (el.onlineRoleInfo)   el.onlineRoleInfo.style.display  = 'none';
    if (el.onlineReadyBtn)   el.onlineReadyBtn.style.display  = 'none';
}

export function showOnlineRole(isImposter, word, hint) {
    if (el.onlineTapInstr) el.onlineTapInstr.style.display = 'none';
    if (el.onlineRoleInfo) el.onlineRoleInfo.style.display  = 'block';

    if (isImposter) {
        if (el.onlineRoleType) {
            el.onlineRoleType.textContent = 'YOU ARE THE IMPOSTER';
            el.onlineRoleType.className   = 'reveal-text imposter-text';
        }
        if (el.onlineSecretWord)    el.onlineSecretWord.textContent    = '???';
        if (el.onlineImposterHint) {
            el.onlineImposterHint.textContent   = `HINT: ${escapeHtml(hint)}`;
            el.onlineImposterHint.style.display = 'block';
        }
    } else {
        if (el.onlineRoleType) {
            el.onlineRoleType.textContent = 'YOU ARE A CIVILIAN';
            el.onlineRoleType.className   = 'reveal-text';
        }
        if (el.onlineSecretWord)    el.onlineSecretWord.textContent    = word.toUpperCase();
        if (el.onlineImposterHint)  el.onlineImposterHint.style.display = 'none';
    }

    if (el.onlineReadyBtn) el.onlineReadyBtn.style.display = 'block';
}

/* ── Discussion / Phase UI ─────────────────────────────────── */

export function updateCluePhaseUI(playerName) {
    if (el.phaseTitle)       el.phaseTitle.textContent       = 'CLUE PHASE';
    if (el.discussionInstr)  el.discussionInstr.textContent  = playerName.toUpperCase();
    if (el.phaseSubtitle)    el.phaseSubtitle.textContent    = 'IS GIVING A CLUE...';
    if (el.clueNextBtn) {
        el.clueNextBtn.style.display = 'block';
        el.clueNextBtn.textContent   = 'Next Player';
    }
    if (el.postDiscussionOpts) el.postDiscussionOpts.style.display = 'none';
}

export function updateDebatePhaseUI() {
    if (el.phaseTitle)       el.phaseTitle.textContent       = 'DEBATE PHASE';
    if (el.discussionInstr)  el.discussionInstr.textContent  = 'GROUP DISCUSSION';
    if (el.phaseSubtitle)    el.phaseSubtitle.textContent    = 'REVEAL THE IMPOSTER!';
    if (el.clueNextBtn)      el.clueNextBtn.style.display    = 'none';
    if (el.postDiscussionOpts) el.postDiscussionOpts.style.display = 'flex';
}

/* ── Timer display ─────────────────────────────────────────── */

export function updateTimerDisplay(seconds) {
    if (el.timerDisplay) el.timerDisplay.textContent = formatTime(seconds);
}

export function setTimerButtonLabel(running) {
    if (el.timerToggleBtn) el.timerToggleBtn.textContent = running ? 'PAUSE' : 'START';
}

/* ── Multiplayer lobby ─────────────────────────────────────── */

export function renderLobbyPlayerList(container, players, hostName) {
    if (!container) return;
    container.innerHTML = '';
    players.forEach(name => {
        const div = document.createElement('div');
        div.className = 'player-item';
        const span = document.createElement('span');
        span.textContent = name + (name === hostName ? ' (Host)' : '');
        div.appendChild(span);
        container.appendChild(div);
    });
}

export function setHostStatus(text) {
    if (el.hostStatus) el.hostStatus.textContent = text;
}

export function setJoinStatus(text) {
    if (el.joinStatus) el.joinStatus.textContent = text;
}

/* ── Toast notifications ───────────────────────────────────── */

/**
 * Show a brief toast message.
 * @param {string} message
 * @param {'info'|'error'|'success'} [variant='info']
 * @param {number} [durationMs=2500]
 */
export function showToast(message, variant = 'info', durationMs = 2500) {
    const container = el.toastContainer || document.body;
    const toast = document.createElement('div');
    toast.className = `toast toast-${variant}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    container.appendChild(toast);

    // Trigger reflow then add visible class for animation
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        // Fallback removal
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 500);
    }, durationMs);
}

/* ── Discussion control visibility for online peers ────────── */

export function setDiscussionHostControls(isHost) {
    if (el.clueNextBtn)      el.clueNextBtn.style.display      = isHost ? 'block' : 'none';
    if (el.postDiscussionOpts) {
        // During debate phase, host sees options; peers don't
        // This is called separately for each phase
    }
}
