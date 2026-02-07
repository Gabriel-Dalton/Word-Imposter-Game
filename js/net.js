/**
 * WebRTC peer-to-peer networking for VAGUE online multiplayer.
 *
 * Topology: star — one host, N peers.  Host is authoritative.
 * Signalling: manual copy-paste of base64-encoded SDP offer/answer.
 * Data channel: ordered, reliable JSON messages.
 *
 * Message protocol version 1 — every message is a JSON object with a
 * `type` field.  See PROTOCOL.md (or README) for the full list.
 */

import { generateId, encodeSDP, decodeSDP, checksum } from './utils.js';

/* ── Constants ─────────────────────────────────────────────── */

export const PROTOCOL_VERSION = 1;

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

const PING_INTERVAL_MS  = 5000;
const SYNC_INTERVAL_MS  = 3000;  // host sends state snapshot every N ms
const CHANNEL_LABEL     = 'vague-game';

/* ── NetworkManager ────────────────────────────────────────── */

export class NetworkManager {
    constructor() {
        /** @type {Map<string, {pc:RTCPeerConnection, ch:RTCDataChannel|null, name:string|null}>} */
        this.peers = new Map();

        /** ID of the peer currently being connected (host only). */
        this.pendingPeerId = null;

        /** Peer-side: connection to host. */
        this.hostPc      = null;
        this.hostChannel  = null;

        this.isHost       = false;
        this.localName    = '';
        this._closed      = false;

        /* Callbacks — set by app.js ------------------------------------ */
        /** @type {(peerId:string, msg:object)=>void} */
        this.onMessage           = null;
        /** @type {(peerId:string, name:string)=>void} */
        this.onPeerConnected     = null;
        /** @type {(peerId:string)=>void} */
        this.onPeerDisconnected  = null;
        /** @type {()=>void} */
        this.onConnectedToHost   = null;
        /** @type {(err:string)=>void} */
        this.onError             = null;

        /* Internal timers */
        this._pingTimer = null;
        this._syncTimer = null;
        this._latency   = new Map();  // peerId -> ms
    }

    /* ── Host: generate offer for a new peer ───────────────── */

    /**
     * Create a new RTCPeerConnection + offer.
     * @returns {Promise<{peerId:string, offerCode:string}>}
     */
    async createOffer() {
        const peerId = generateId();
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        // Create data channel (host-initiated)
        const ch = pc.createDataChannel(CHANNEL_LABEL, { ordered: true });
        this._setupHostChannel(ch, peerId);

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                this._handlePeerDisconnect(peerId);
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Wait until ICE gathering is complete so the SDP contains all candidates
        await this._waitIceGathering(pc);

        this.peers.set(peerId, { pc, ch, name: null });
        this.pendingPeerId = peerId;

        return { peerId, offerCode: encodeSDP(pc.localDescription) };
    }

    /**
     * Host accepts the base64-encoded answer from a peer.
     * @param {string} answerCode
     * @returns {Promise<void>}
     */
    async acceptAnswer(answerCode) {
        const id = this.pendingPeerId;
        const peer = this.peers.get(id);
        if (!peer) throw new Error('No pending peer connection.');

        const desc = decodeSDP(answerCode);
        await peer.pc.setRemoteDescription(desc);
        // Channel open is handled by the datachannel event / onopen
    }

    /* ── Peer: join a host ─────────────────────────────────── */

    /**
     * Peer creates an answer from the host's offer code.
     * @param {string} offerCode
     * @returns {Promise<string>} answerCode
     */
    async createAnswer(offerCode) {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        this.hostPc = pc;

        // Wait for the host-created data channel
        pc.ondatachannel = (e) => {
            this.hostChannel = e.channel;
            this._setupPeerChannel(e.channel);
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                if (this.onPeerDisconnected) this.onPeerDisconnected('host');
            }
        };

        const desc = decodeSDP(offerCode);
        await pc.setRemoteDescription(desc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await this._waitIceGathering(pc);

        return encodeSDP(pc.localDescription);
    }

    /* ── Messaging ─────────────────────────────────────────── */

    /**
     * Send a message object to a specific peer (host only).
     */
    sendToPeer(peerId, msg) {
        const peer = this.peers.get(peerId);
        if (peer?.ch?.readyState === 'open') {
            peer.ch.send(JSON.stringify(msg));
        }
    }

    /**
     * Broadcast a message to ALL connected peers (host only).
     */
    broadcast(msg) {
        const data = JSON.stringify(msg);
        for (const [, peer] of this.peers) {
            if (peer.ch?.readyState === 'open') {
                peer.ch.send(data);
            }
        }
    }

    /**
     * Send a message to the host (peer only).
     */
    sendToHost(msg) {
        if (this.hostChannel?.readyState === 'open') {
            this.hostChannel.send(JSON.stringify(msg));
        }
    }

    /* ── Queries ───────────────────────────────────────────── */

    isConnected() {
        if (this.isHost) {
            for (const [, p] of this.peers) {
                if (p.ch?.readyState === 'open') return true;
            }
            return false;
        }
        return this.hostChannel?.readyState === 'open';
    }

    getConnectedPeerCount() {
        let n = 0;
        for (const [, p] of this.peers) {
            if (p.ch?.readyState === 'open') n++;
        }
        return n;
    }

    getLatency(peerId) {
        return this._latency.get(peerId) ?? null;
    }

    /* ── Ping / Pong ───────────────────────────────────────── */

    startPingLoop() {
        this.stopPingLoop();
        this._pingTimer = setInterval(() => {
            const msg = { type: 'ping', ts: Date.now() };
            if (this.isHost) {
                this.broadcast(msg);
            } else {
                this.sendToHost(msg);
            }
        }, PING_INTERVAL_MS);
    }

    stopPingLoop() {
        if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    }

    /* ── Periodic state sync (host only) ───────────────────── */

    /**
     * @param {()=>object} getStateFn — called each tick to get the serialisable state
     */
    startSyncLoop(getStateFn) {
        this.stopSyncLoop();
        this._syncTimer = setInterval(() => {
            const s = getStateFn();
            this.broadcast({ type: 'sync', version: PROTOCOL_VERSION, state: s, checksum: checksum(JSON.stringify(s)) });
        }, SYNC_INTERVAL_MS);
    }

    stopSyncLoop() {
        if (this._syncTimer) { clearInterval(this._syncTimer); this._syncTimer = null; }
    }

    /* ── Cleanup ───────────────────────────────────────────── */

    close() {
        this._closed = true;
        this.stopPingLoop();
        this.stopSyncLoop();

        // Close host-side peer connections
        for (const [, p] of this.peers) {
            try { p.ch?.close(); } catch { /* */ }
            try { p.pc?.close(); } catch { /* */ }
        }
        this.peers.clear();
        this.pendingPeerId = null;

        // Close peer-side connection
        try { this.hostChannel?.close(); } catch { /* */ }
        try { this.hostPc?.close(); } catch { /* */ }
        this.hostPc      = null;
        this.hostChannel  = null;
    }

    /* ── Internal helpers ──────────────────────────────────── */

    /** Wait for ICE gathering to finish so the SDP is complete. */
    _waitIceGathering(pc) {
        return new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') { resolve(); return; }
            const check = () => {
                if (pc.iceGatheringState === 'complete') {
                    pc.removeEventListener('icegatheringstatechange', check);
                    resolve();
                }
            };
            pc.addEventListener('icegatheringstatechange', check);
            // Safety timeout — resolve after 10s regardless
            setTimeout(resolve, 10000);
        });
    }

    /** Set up data channel handlers — host side. */
    _setupHostChannel(ch, peerId) {
        ch.onopen = () => {
            // Peer channel is now open; wait for their hello message
        };
        ch.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                this._handleHostMessage(peerId, msg);
            } catch { /* malformed */ }
        };
        ch.onclose = () => this._handlePeerDisconnect(peerId);
        ch.onerror = () => this._handlePeerDisconnect(peerId);
    }

    /** Set up data channel handlers — peer side. */
    _setupPeerChannel(ch) {
        ch.onopen = () => {
            // Send hello immediately
            this.sendToHost({
                type:    'hello',
                version: PROTOCOL_VERSION,
                name:    this.localName,
            });
        };
        ch.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                this._handlePeerMessage(msg);
            } catch { /* malformed */ }
        };
        ch.onclose = () => {
            if (this.onPeerDisconnected) this.onPeerDisconnected('host');
        };
        ch.onerror = () => {
            if (this.onError) this.onError('Connection error with host.');
        };
    }

    /** Host processes a message from a specific peer. */
    _handleHostMessage(peerId, msg) {
        // Built-in handling
        switch (msg.type) {
            case 'hello': {
                const peer = this.peers.get(peerId);
                if (peer) peer.name = msg.name;
                // Send welcome back
                this.sendToPeer(peerId, {
                    type:    'welcome',
                    version: PROTOCOL_VERSION,
                    peerId,
                });
                if (this.onPeerConnected) this.onPeerConnected(peerId, msg.name);
                return;
            }
            case 'pong': {
                const latency = Date.now() - (msg.ts ?? 0);
                this._latency.set(peerId, latency);
                return;
            }
            case 'ping': {
                this.sendToPeer(peerId, { type: 'pong', ts: msg.ts });
                return;
            }
        }
        // Forward to app-level handler
        if (this.onMessage) this.onMessage(peerId, msg);
    }

    /** Peer processes a message from the host. */
    _handlePeerMessage(msg) {
        switch (msg.type) {
            case 'welcome':
                if (this.onConnectedToHost) this.onConnectedToHost();
                return;
            case 'ping':
                this.sendToHost({ type: 'pong', ts: msg.ts });
                return;
            case 'pong': {
                const latency = Date.now() - (msg.ts ?? 0);
                this._latency.set('host', latency);
                return;
            }
        }
        // Forward to app-level handler
        if (this.onMessage) this.onMessage('host', msg);
    }

    /** Handle a peer disconnecting (host side). */
    _handlePeerDisconnect(peerId) {
        const peer = this.peers.get(peerId);
        if (!peer) return;
        try { peer.ch?.close(); } catch { /* */ }
        try { peer.pc?.close(); } catch { /* */ }
        this.peers.delete(peerId);
        if (this.onPeerDisconnected) this.onPeerDisconnected(peerId);
    }
}
