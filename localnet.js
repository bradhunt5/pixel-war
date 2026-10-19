'use strict';

/*
 * Same-device stand-in for PeerJS, used when the page is opened with
 * ?localnet. Tabs in one browser talk over a BroadcastChannel instead of
 * WebRTC, which makes it possible to test multiplayer (or play hot-seat
 * across two windows) with no network at all. It implements only the parts
 * of the PeerJS API that game.js uses.
 */
(() => {
  if (!/[?&]localnet\b/.test(location.search) || !window.BroadcastChannel) return;

  class Emitter {
    constructor() {
      this.handlers = {};
    }

    on(ev, fn) {
      (this.handlers[ev] = this.handlers[ev] || []).push(fn);
    }

    emit(ev, ...args) {
      for (const fn of this.handlers[ev] || []) fn(...args);
    }
  }

  class LocalConn extends Emitter {
    constructor(owner, other) {
      super();
      this.owner = owner;
      this.peer = other;
      this.open = false;
    }

    send(data) {
      if (this.open && !this.owner.destroyed) {
        this.owner.post({ k: 'data', to: this.peer, d: data });
      }
    }

    close() {
      if (!this.open) return;
      this.open = false;
      this.owner.post({ k: 'close', to: this.peer });
      this.emit('close');
    }
  }

  class LocalPeer extends Emitter {
    constructor(id) {
      super();
      this.id = id || 'local-' + Math.random().toString(36).slice(2);
      this.open = false;
      this.destroyed = false;
      this.disconnected = false;
      this.conns = new Map();
      this.bc = new BroadcastChannel('pixelwar-localnet');
      this.bc.onmessage = (e) => this.receive(e.data);
      setTimeout(() => {
        this.open = true;
        this.emit('open', this.id);
      }, 30);
    }

    post(msg) {
      this.bc.postMessage(Object.assign({ from: this.id }, msg));
    }

    connect(to) {
      const conn = new LocalConn(this, to);
      this.conns.set(to, conn);
      this.post({ k: 'hello', to });
      // No answer means no such room, as with PeerJS.
      setTimeout(() => {
        if (!conn.open) this.emit('error', { type: 'peer-unavailable', message: 'No such peer' });
      }, 1500);
      return conn;
    }

    receive(m) {
      if (m.to !== this.id || this.destroyed) return;
      const conn = this.conns.get(m.from);
      if (m.k === 'hello') {
        const c = new LocalConn(this, m.from);
        this.conns.set(m.from, c);
        this.emit('connection', c);
        c.open = true;
        this.post({ k: 'ack', to: m.from });
        setTimeout(() => c.emit('open'), 0);
      } else if (m.k === 'ack' && conn) {
        conn.open = true;
        conn.emit('open');
      } else if (m.k === 'data' && conn) {
        conn.emit('data', m.d);
      } else if (m.k === 'close' && conn && conn.open) {
        conn.open = false;
        conn.emit('close');
      }
    }

    reconnect() {}

    destroy() {
      for (const c of this.conns.values()) c.close();
      this.destroyed = true;
      this.bc.close();
    }
  }

  window.Peer = LocalPeer;
})();
