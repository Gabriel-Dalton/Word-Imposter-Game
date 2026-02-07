/**
 * Utility functions for VAGUE
 */

/**
 * Generate a short random ID string.
 * @returns {string}
 */
export function generateId() {
    return Math.random().toString(36).substring(2, 9);
}

/**
 * Format total seconds into MM:SS display string.
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Fisher-Yates shuffle — returns a new shuffled array (does not mutate).
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
export function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Escape HTML entities to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
}

/**
 * Simple 32-bit string checksum for desync detection.
 * @param {string} str
 * @returns {string} hex string
 */
export function checksum(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(16);
}

/**
 * Copy text to clipboard with fallback for older browsers.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { /* ignore */ }
        document.body.removeChild(ta);
        return ok;
    }
}

/**
 * Compress an SDP string for shorter copy-paste codes.
 * Uses simple line filtering + base64.
 * @param {RTCSessionDescription} desc
 * @returns {string}
 */
export function encodeSDP(desc) {
    const obj = { type: desc.type, sdp: desc.sdp };
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}

/**
 * Decode a compressed SDP string back to an RTCSessionDescription init.
 * @param {string} encoded
 * @returns {{type: string, sdp: string}}
 */
export function decodeSDP(encoded) {
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
}
