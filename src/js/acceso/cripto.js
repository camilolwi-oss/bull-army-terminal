// Acceso · criptografía compartida por el login y el panel de Admin (Web Crypto, sin dependencias).
// - Contraseñas: PBKDF2-SHA256 con sal propia por usuario. Nunca se guardan en texto.
// - Usuarios: se identifican por un hash del nombre; la lista con los nombres (roster) va cifrada
//   con AES-GCM usando una clave derivada de la contraseña del Admin.
(function (root) {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const ITER = 600000;
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const salt = (n = 16) => b64(crypto.getRandomValues(new Uint8Array(n)));

  // Identificador público de un usuario: no revela el nombre a simple vista.
  async function idOf(user) {
    const d = await crypto.subtle.digest('SHA-256', enc.encode('ba-terminal:' + String(user).trim().toLowerCase()));
    return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  async function hash(pass, saltB64, iter = ITER) {
    const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: iter }, key, 256);
    return b64(bits);
  }
  async function aesKey(pass, saltB64, iter = ITER) {
    const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: iter }, key, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(obj, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return { iv: b64(iv), data: b64(data) };
  }
  async function open(box, key) {
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
    return JSON.parse(dec.decode(data));
  }
  // Contraseña aleatoria sin caracteres ambiguos (0/O, 1/l/I).
  function genPassword(n = 20) {
    const A = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%*-_';
    const r = crypto.getRandomValues(new Uint32Array(n));
    return [...r].map((x) => A[x % A.length]).join('');
  }
  // Compara sin cortar en la primera diferencia.
  const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

  root.BACripto = { ITER, idOf, hash, aesKey, seal, open, salt, genPassword, same };
})(window);
