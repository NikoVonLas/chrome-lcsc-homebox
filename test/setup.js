if (typeof Blob === 'undefined') {
  globalThis.Blob = class Blob {
    constructor(parts = [], options = {}) {
      this.size = parts.reduce((s, p) => s + (typeof p === 'string' ? p.length : (p.byteLength ?? 0)), 0);
      this.type = options.type || '';
    }
  };
}

if (typeof FormData === 'undefined') {
  globalThis.FormData = class FormData {
    constructor() { this._entries = []; }
    append(name, value, filename) { this._entries.push([name, value, filename]); }
    get(name) { return this._entries.find(([n]) => n === name)?.[1]; }
  };
}
