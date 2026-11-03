#!/usr/bin/env node
// Copia TG_VERSION de content.js al "version" de manifest.json.
//
// Uso (desde la carpeta de la extensión, con Node instalado):
//   node sincronizar-version.js            -> actualiza manifest.json si hace falta
//   node sincronizar-version.js --check    -> solo comprueba (código de salida 1 si no coinciden)
//   node sincronizar-version.js ruta/content.js ruta/manifest.json   -> rutas distintas
//
// TG_VERSION se calcula con las MISMAS líneas de content.js (const TG_KERNEL, const TG_FIX y const TG_VERSION), ejecutadas
// en un entorno aislado; así funciona tanto si es un texto fijo ('1.0') como si se arma a partir de TG_KERNEL y TG_FIX.
// Chrome solo acepta de 1 a 4 números separados por puntos (cada uno de 0 a 65535): 0.4.1 es válido; "1.0-beta" no.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const soloComprobar = args.includes('--check');
const rutas = args.filter((a) => !a.startsWith('--'));
const rutaContent = path.resolve(rutas[0] || path.join(__dirname, 'content.js'));
const rutaManifest = path.resolve(rutas[1] || path.join(__dirname, 'manifest.json'));

function fallar(msg) { console.error('✗ ' + msg); process.exit(2); }

if (!fs.existsSync(rutaContent)) fallar('No encuentro ' + rutaContent);
if (!fs.existsSync(rutaManifest)) fallar('No encuentro ' + rutaManifest);

// 1) leer TG_VERSION de content.js
const codigo = fs.readFileSync(rutaContent, 'utf8');
const lineas = ['TG_KERNEL', 'TG_FIX', 'TG_VERSION'].map((nombre) => {
  const m = codigo.match(new RegExp('^[ \\t]*const[ \\t]+' + nombre + '[ \\t]*=.*;.*$', 'm'));
  return m ? m[0].trim() : null;
});
if (!lineas[2]) fallar('No encontré la línea "const TG_VERSION = ...;" en content.js (debe ir en una sola línea).');
const preludio = lineas.filter(Boolean).join('\n');
let version;
try {
  version = vm.runInNewContext(preludio + '\n;TG_VERSION;', {}, { timeout: 1000 });
} catch (e) {
  fallar('No pude calcular TG_VERSION: ' + e.message);
}
version = String(version);
if (!/^\d+(\.\d+){0,3}$/.test(version) || version.split('.').some((n) => Number(n) > 65535)) {
  fallar('TG_VERSION = "' + version + '" no es válida para Chrome (usa de 1 a 4 números separados por puntos, ej. 0.4.1).');
}

// 2) escribir en manifest.json (solo se cambia la línea "version"; el resto del archivo queda tal cual)
const manifest = fs.readFileSync(rutaManifest, 'utf8');
const re = /("version"\s*:\s*")([^"]*)(")/;
const m = manifest.match(re);
if (!m) fallar('manifest.json no tiene la clave "version".');
if (m[2] === version) { console.log('✓ manifest.json ya está en la versión ' + version); process.exit(0); }
if (soloComprobar) { console.error('✗ manifest.json dice ' + m[2] + ' pero content.js dice ' + version); process.exit(1); }
fs.writeFileSync(rutaManifest, manifest.replace(re, '$1' + version + '$3'));
console.log('✓ manifest.json actualizado: ' + m[2] + ' → ' + version);