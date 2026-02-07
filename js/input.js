/**
 * Input handling for VAGUE — keyboard shortcuts and gamepad basics.
 *
 * Local multiplayer mapping:
 *   P1  — WASD / Space / Q
 *   P2  — Arrow keys / Enter / Backspace
 *
 * Universal:
 *   Escape — go back / cancel
 *   Space / Enter — confirm / reveal role
 */

/* ── State ─────────────────────────────────────────────────── */

const held = new Set();  // currently held key codes

/** Callbacks — set by app.js */
let _onConfirm  = null;  // Space / Enter
let _onBack     = null;  // Escape
let _onNavigate = null;  // (direction: 'up'|'down'|'left'|'right') => void

/* ── Public API ────────────────────────────────────────────── */

/**
 * Initialise keyboard and (optional) gamepad listeners.
 * @param {{ onConfirm:()=>void, onBack:()=>void, onNavigate:(dir:string)=>void }} callbacks
 */
export function initInput(callbacks) {
    _onConfirm  = callbacks.onConfirm  ?? null;
    _onBack     = callbacks.onBack     ?? null;
    _onNavigate = callbacks.onNavigate ?? null;

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup',   handleKeyUp);

    // Gamepad polling (if supported)
    if ('getGamepads' in navigator) {
        requestAnimationFrame(pollGamepad);
    }
}

/** Clean up listeners. */
export function destroyInput() {
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('keyup',   handleKeyUp);
    held.clear();
}

/* ── Keyboard ──────────────────────────────────────────────── */

function handleKeyDown(e) {
    // Don't intercept when typing in an input or textarea
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const code = e.code;
    if (held.has(code)) return;   // key-repeat guard
    held.add(code);

    switch (code) {
        /* ── Confirm (both players) ── */
        case 'Space':
        case 'Enter':
        case 'NumpadEnter':
            e.preventDefault();
            _onConfirm?.();
            break;

        /* ── Back ── */
        case 'Escape':
        case 'KeyQ':
        case 'Backspace':
            e.preventDefault();
            _onBack?.();
            break;

        /* ── Navigation — P1 (WASD) ── */
        case 'KeyW': _onNavigate?.('up');    break;
        case 'KeyS': _onNavigate?.('down');  break;
        case 'KeyA': _onNavigate?.('left');  break;
        case 'KeyD': _onNavigate?.('right'); break;

        /* ── Navigation — P2 (arrows) ── */
        case 'ArrowUp':    e.preventDefault(); _onNavigate?.('up');    break;
        case 'ArrowDown':  e.preventDefault(); _onNavigate?.('down');  break;
        case 'ArrowLeft':  e.preventDefault(); _onNavigate?.('left');  break;
        case 'ArrowRight': e.preventDefault(); _onNavigate?.('right'); break;
    }
}

function handleKeyUp(e) {
    held.delete(e.code);
}

/* ── Gamepad polling ───────────────────────────────────────── */

let _gpPrev = [false, false, false, false];  // up, down, A, B previous frame

function pollGamepad() {
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
        if (!gp) continue;

        // D-pad or left stick
        const up   = gp.buttons[12]?.pressed || gp.axes[1] < -0.5;
        const down = gp.buttons[13]?.pressed || gp.axes[1] >  0.5;
        const btnA = gp.buttons[0]?.pressed;
        const btnB = gp.buttons[1]?.pressed;

        if (up   && !_gpPrev[0]) _onNavigate?.('up');
        if (down && !_gpPrev[1]) _onNavigate?.('down');
        if (btnA && !_gpPrev[2]) _onConfirm?.();
        if (btnB && !_gpPrev[3]) _onBack?.();

        _gpPrev = [up, down, btnA, btnB];
        break; // only use first connected gamepad
    }
    requestAnimationFrame(pollGamepad);
}
