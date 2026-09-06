/*
 * WebDollar PWA - Módulo: event-bus.js
 * Créditos a Jose Roberto De La Vega Arvizu - CEO en Harbor Hemp (Alias: Rocket-Harbor)
 * Licencia MIT
 */
export class EventBus {
  #listeners = new Map();
  on(event, handler) { if (!this.#listeners.has(event)) this.#listeners.set(event, new Set()); this.#listeners.get(event).add(handler); return () => this.off(event, handler); }
  off(event, handler) { this.#listeners.get(event)?.delete(handler); }
  emit(event, payload) {
    const report = (error) => { if (event !== 'event:error') this.emit('event:error', { event, message: error?.message || 'Error de listener' }); };
    for (const handler of this.#listeners.get(event) || []) {
      try { const result=handler(payload); if(result && typeof result.then==='function') Promise.resolve(result).catch(report); }
      catch(error) { report(error); }
    }
  }
  clear() { this.#listeners.clear(); }
}
