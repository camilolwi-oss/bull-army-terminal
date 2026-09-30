// Acceso · criptografía compartida por el login y el panel de Admin (Web Crypto, sin dependencias).
// - Contraseñas: PBKDF2-SHA256 con sal propia. La "prueba" (PBKDF2 de la contraseña) queda en la sesión
//   del usuario; el archivo solo guarda su SHA-256, así la sesión no se puede fabricar sin la contraseña.
// - Usuarios: se identifican por un hash del nombre; la lista con los nombres va cifrada con AES-GCM
//   usando una clave derivada de la contraseña del Admin.
// - El archivo de accesos (app.dat) va codificado: no es un JSON legible a simple vista.
window.BACripto = (() => {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const ITER = 600000;
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const salt = (n = 16) => b64(crypto.getRandomValues(new Uint8Array(n)));
  const sha = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

  async function idOf(user) {
    return [...await sha(enc.encode('ba-terminal:' + String(user).trim().toLowerCase()))].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  async function proof(pass, saltB64, iter = ITER) {
    const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: iter }, key, 256));
  }
  const check = async (proofB64) => b64(await sha(unb64(proofB64)));
  async function aesKey(pass, saltB64, iter = ITER) {
    const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: iter }, key, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(obj, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return { iv: b64(iv), data: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)))) };
  }
  async function open(box, key) {
    return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data))));
  }
  function genPassword(n = 20) {
    const A = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%*-_';
    return [...crypto.getRandomValues(new Uint32Array(n))].map((x) => A[x % A.length]).join('');
  }
  const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

  // ── Formato del archivo: JSON compacto → XOR con una máscara → base64 ──
  // Es ocultamiento, no cifrado: evita que la lista se lea de un vistazo.
  const MASK = enc.encode('BA·terminal·7c1e9f·acceso');
  const xor = (bytes) => bytes.map((b, i) => b ^ MASK[i % MASK.length] ^ (i * 31 & 255));
  function encode(a) {
    const c = {
      v: 2, k: a.kdf.iter, t: a.updated,
      a: [a.admin.id, a.admin.salt, a.admin.check],
      u: a.users.map((x) => [x.id, x.salt, x.check, x.exp, x.revoked ? 1 : 0]),
      r: [a.roster.salt, a.roster.iv, a.roster.data]
    };
    return b64(xor(enc.encode(JSON.stringify(c)))).replace(/.{76}/g, '$&\n') + '\n';
  }
  function decode(text) {
    const c = JSON.parse(dec.decode(xor(unb64(text.replace(/\s+/g, '')))));
    return {
      version: c.v, kdf: { iter: c.k }, updated: c.t,
      admin: { id: c.a[0], salt: c.a[1], check: c.a[2] },
      users: c.u.map(([id, s, chk, exp, rev]) => ({ id, salt: s, check: chk, exp, revoked: !!rev })),
      roster: { salt: c.r[0], iv: c.r[1], data: c.r[2] }
    };
  }

  return { ITER, idOf, proof, check, aesKey, seal, open, salt, genPassword, same, encode, decode };
})();
