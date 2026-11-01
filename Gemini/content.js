(function () {
  window.__tgCargado = 'opt-2'; // marcador: Flutter lo lee para confirmar qué versión del script se inyectó
  // PANTALLA DE BLOQUEO (se muestra al cargar la página; ESPACIO la sube y el body entra con zoom;
  // ALT + L la vuelve a bajar para bloquear de nuevo)
  // Se activa/desactiva con el interruptor del panel Personalizar. Se guarda en chrome.storage (geminiBloqueoActivo) y se
  // copia en localStorage para poder leerlo al instante al cargar la página (chrome.storage es asíncrono y habría parpadeo).
  const BLOQUEO_CLAVE_LS = 'tg-bloqueo-activo';

  // ============================================================================================
  // ESTADO GLOBAL "BLOQUEADO" (ahorro de recursos)
  // Mientras la pantalla de bloqueo / PIN está encima, NADA de lo demás debe trabajar: planificador de tareas, observers,
  // intervalos, Lenis, auto-scroll, videos de fondo de Gemini y animaciones CSS quedan en pausa. Al desbloquear se dispara el
  // evento 'tg-bloqueo-cambio' y cada parte se pone al día (una sola vez, sin repetir lo que se perdió).
  // ============================================================================================
  let pantallaBloqueada = false;
  function fijarPantallaBloqueada(v) {
    v = !!v;
    if (pantallaBloqueada === v) return;
    pantallaBloqueada = v;
    try { document.dispatchEvent(new CustomEvent('tg-bloqueo-cambio', { detail: { bloqueado: v } })); } catch (e) { /* sin CustomEvent */ }
  }

  // ============================================================================================
  // PUENTE DE PREFERENCIAS (Flutter WebView <-> chrome.storage)
  // GUARDAR: cada cambio (burbuja, tema, PIN, fondos, interruptor del bloqueo...) se envía a Flutter con
  //     window.flutter_inappwebview.callHandler('guardarPreferencia', clave, valor)
  //   y, si además existe chrome.storage (extensión de Chrome), también se guarda ahí. Borrar una clave = valor null.
  //   Los valores van como JSON nativo: geminiBurbuja llega a Dart como Map {h, s, tono, alfa}; geminiBloqueoActivo como bool;
  //   las imágenes de fondo como String (data URL). Los videos NO viajan: van a IndexedDB y solo se envía la marca de tipo.
  //   Los envíos se juntan (250 ms, solo el último valor de cada clave) para no saturar el canal mientras se arrastra un slider,
  //   y si el puente de Flutter aún no está listo se reintentan (~30 s).
  // RECIBIR valores iniciales desde Dart (cualquiera de las dos formas):
  //   a) ANTES de este script (UserScript AT_DOCUMENT_START o initialUserScripts):
  //        window.TG_PREFS_INICIALES = { geminiBurbuja: {h:221,s:100,tono:50,alfa:70}, geminiBloqueoActivo: true,
  //                                      geminiPinBloqueo: '<hash>', geminiFondo: 'data:image/...', geminiTema: 'oscuro', ... };
  //   b) DESPUÉS (por ejemplo en onLoadStop):  window.tgAplicarPreferencias({ geminiBurbuja: {...}, ... })
  //   Claves que entiende: geminiFondo, geminiFondoTipo, geminiFondoBloqueo, geminiFondoBloqueoTipo, geminiTema, geminiPinBloqueo,
  //   geminiBurbuja, geminiBloqueoActivo y geminiFondoBloqueoDefecto (URL/data URL del fondo por defecto del bloqueo,
  //   porque fuera de una extensión no existe chrome.runtime.getURL).
  // ============================================================================================
  const PREFS_INICIALES = (function () {
    try { const p = window.TG_PREFS_INICIALES; return p && typeof p === 'object' ? p : {}; } catch (e) { return {}; }
  })();
  // ============================================================================================
  // INTERRUPTOR GENERAL "GEMINI VIBES" (Personalizar > arriba del todo)
  // Apagado = estética normal de Gemini: se desactivan todas las hojas de estilo propias (media="not all"), el bloqueo, las animaciones,
  // el scroll suave, el fade y los ajustes de posición del header. Se guarda en localStorage (lectura síncrona al cargar) y en las preferencias (geminiVibesActivo).
  // ============================================================================================
  const VIBES_CLAVE_LS = 'tg-vibes-activo';
  let vibesOn = true;
  (function () {
    try {
      const vi = PREFS_INICIALES.geminiVibesActivo;
      if (vi === true || vi === false || vi === 'true' || vi === 'false') localStorage.setItem(VIBES_CLAVE_LS, (vi === true || vi === 'true') ? '1' : '0');
      const vg = localStorage.getItem(VIBES_CLAVE_LS);
      if (vg === '0' || vg === '1') vibesOn = vg === '1';
    } catch (e) { /* sin localStorage: queda encendido */ }
  })();
  // el interruptor del bloqueo se lee de forma síncrona al cargar: el valor inyectado se copia antes a localStorage
  (function () {
    const v = PREFS_INICIALES.geminiBloqueoActivo;
    if (v === true || v === false || v === 'true' || v === 'false') {
      try { localStorage.setItem(BLOQUEO_CLAVE_LS, (v === true || v === 'true') ? '1' : '0'); } catch (e) { /* sin localStorage */ }
    }
  })();

  // ============================================================================================
  // PERFIL DE RENDIMIENTO (auto / máximo / ligero)
  // - "ligero" (clase html.tg-ligero) baja los radios de blur ~35 %, quita saturate(), usa 2 capas de fade y quita transiciones de layout.
  // - "auto": arranca ligero en equipos flojos (poca RAM / pocos núcleos) o si ya se midió lentitud antes; además mide los fotogramas
  //   REALES durante el vuelo de la burbuja (la animación más pesada) y, si va a tirones, pasa a ligero y lo recuerda.
  // - Se elige a mano en Personalizar > Rendimiento (se guarda con el puente de preferencias: clave geminiPerfil).
  // ============================================================================================
  const PERFIL_CLAVE_LS = 'tg-perfil';
  const PERFIL_AUTO_LS = 'tg-perfil-auto-ligero';
  let perfilModo = 'auto';
  try {
    const pg = localStorage.getItem(PERFIL_CLAVE_LS) || PREFS_INICIALES.geminiPerfil;
    if (pg === 'auto' || pg === 'maximo' || pg === 'ligero') perfilModo = pg;
  } catch (e) { /* sin localStorage */ }
  function equipoFlojo() {
    const m = navigator.deviceMemory, c = navigator.hardwareConcurrency;
    return !!((m && m <= 4) || (c && c <= 4));
  }
  let perfilAutoLigero = false;
  try { perfilAutoLigero = localStorage.getItem(PERFIL_AUTO_LS) === '1' || equipoFlojo(); } catch (e) { perfilAutoLigero = equipoFlojo(); }
  function perfilLigero() { return perfilModo === 'ligero' || (perfilModo === 'auto' && perfilAutoLigero); }
  function esTactil() { return !!(window.matchMedia && window.matchMedia('(hover: none)').matches); }
  function aplicarPerfil() { document.documentElement.classList.toggle('tg-ligero', perfilLigero()); }
  // LENIS (scroll suave): se puede apagar del todo desde Personalizar > Rendimiento (clave geminiLenis; por defecto encendido)
  const LENIS_CLAVE_LS = 'tg-lenis';
  let lenisUsuario = true;
  try {
    const lg = localStorage.getItem(LENIS_CLAVE_LS);
    const li = PREFS_INICIALES.geminiLenis;
    if (lg === '0' || lg === '1') lenisUsuario = lg === '1';
    else if (li === false || li === 'false') lenisUsuario = false;
  } catch (e) { /* sin localStorage */ }
  function cambiarLenis(v) {
    lenisUsuario = !!v;
    try { localStorage.setItem(LENIS_CLAVE_LS, lenisUsuario ? '1' : '0'); } catch (e) { /* sin localStorage */ }
    prefsGuardar({ geminiLenis: lenisUsuario });
    if (lenisUsuario) mantenerLenis(); else destruirLenis();
  }
  function cambiarPerfil(modo) {
    perfilModo = modo;
    try { localStorage.setItem(PERFIL_CLAVE_LS, modo); } catch (e) { /* sin localStorage */ }
    prefsGuardar({ geminiPerfil: modo });
    aplicarPerfil();
  }
  // muestreo de fotogramas durante el vuelo de la burbuja
  let fpsPrev = 0, fpsN = 0, fpsLentos = 0;
  function muestrearFps(t) {
    if (fpsPrev) { fpsN++; if (t - fpsPrev > 26) fpsLentos++; }
    fpsPrev = t;
  }
  function finMuestreoFps() {
    if (perfilModo === 'auto' && !perfilAutoLigero && fpsN >= 15 && fpsLentos / fpsN > 0.25) {
      perfilAutoLigero = true;
      try { localStorage.setItem(PERFIL_AUTO_LS, '1'); } catch (e) { /* sin localStorage */ }
      aplicarPerfil();
      console.log('[tg] perfil ligero activado automáticamente (' + fpsLentos + '/' + fpsN + ' fotogramas lentos)');
    }
    fpsPrev = 0; fpsN = 0; fpsLentos = 0;
  }
  (function () {
    const est = document.createElement('style');
    est.id = 'tg-ligero-style';
    est.textContent = `
      html.tg-ligero .user-query-bubble-with-background,
      html.tg-ligero .response-container,
      html.tg-ligero thinking-dots-animation:not(.response-container-header *),
      html.tg-ligero [data-tg-puntos][data-tg-burbuja],
      html.tg-ligero [data-tg-creando-burbuja],
      html.tg-ligero [data-tg-creando-caja]:not([data-tg-creando-unica]) {
        -webkit-backdrop-filter: blur(8px) !important; backdrop-filter: blur(8px) !important;
      }
      html.tg-ligero input-area-v2 .text-input-field,
      html.tg-ligero input-area-v2 .input-area-fieldset > .text-input-field,
      html.tg-ligero top-bar-actions button.mat-mdc-icon-button,
      html.tg-ligero .side-nav-menu-button button.mat-mdc-icon-button,
      html.tg-ligero chat-app-side-nav-menu-button button.mat-mdc-icon-button,
      html.tg-ligero top-bar-actions .left-section button.mat-mdc-button,
      html.tg-ligero top-bar-actions .center-section button.mat-mdc-button,
      html.tg-ligero bard-mode-switcher:not(:is(input-area-v2 *)) button,
      html.tg-ligero gem-icon-button[data-test-id="prompt-copy-button"],
      html.tg-ligero gem-icon-button[data-test-id="prompt-edit-button"] {
        -webkit-backdrop-filter: blur(10px) !important; backdrop-filter: blur(10px) !important;
      }
      html.tg-ligero .query-file-carousel user-query-file-preview .file-preview-container { transition: none !important; }
      html.tg-ligero #tg-pin .tg-pin-fondo { filter: blur(14px) brightness(0.5) saturate(1.1) !important; inset: -30px !important; }
      html.tg-ligero #tg-personalizar-panel { -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
      html.tg-ligero #tg-personalizar-backdrop { -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px); }
    `;
    (document.head || document.documentElement).appendChild(est);
  })();
  aplicarPerfil();
  // ============================================================================================
  // SIN DESENFOQUE (Personalizar > Rendimiento > "Desactivar desenfoque", clave geminiSinBlur; por defecto apagado)
  // Quita TODOS los backdrop-filter (cristal translúcido) y los blur() de la extensión: menús, burbujas, caja de escribir, fade,
  // bloqueo, PIN y la animación de la burbuja al enviar. Es independiente de Gemini Vibes y del perfil de rendimiento.
  // ============================================================================================
  const SINBLUR_CLAVE_LS = 'tg-sin-blur';
  let sinBlur = false;
  try {
    const sg = localStorage.getItem(SINBLUR_CLAVE_LS);
    const si = PREFS_INICIALES.geminiSinBlur;
    if (sg === '0' || sg === '1') sinBlur = sg === '1';
    else if (si === true || si === 'true') sinBlur = true;
  } catch (e) { /* sin localStorage */ }
  function aplicarSinBlur() { document.documentElement.classList.toggle('tg-sin-blur', sinBlur); }
  function cambiarSinBlur(v) {
    sinBlur = !!v;
    try { localStorage.setItem(SINBLUR_CLAVE_LS, sinBlur ? '1' : '0'); } catch (e) { /* sin localStorage */ }
    prefsGuardar({ geminiSinBlur: sinBlur });
    aplicarSinBlur();
    try { Tareas.marcar('layout'); } catch (e) { /* aún no está todo creado */ }
  }
  (function () {
    const est = document.createElement('style');
    est.id = 'tg-sin-blur-style'; // no está en VIBES_ESTILOS: funciona con Vibes encendido o apagado
    est.textContent = `
      /* la pantalla de bloqueo y la de PIN (y todo lo que llevan dentro) NO se tocan: conservan su desenfoque */
      html.tg-sin-blur :not(#tg-bloqueo):not(#tg-bloqueo *):not(#tg-pin):not(#tg-pin *):not(#tg-bloqueo-fondo),
      html.tg-sin-blur :not(#tg-bloqueo):not(#tg-bloqueo *):not(#tg-pin):not(#tg-pin *)::before,
      html.tg-sin-blur :not(#tg-bloqueo):not(#tg-bloqueo *):not(#tg-pin):not(#tg-pin *)::after {
        -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
      }
      html.tg-sin-blur body [data-tg-puntos-retraso="oculto"] { filter: none !important; }
      html.tg-sin-blur #tg-fade-chat { display: none !important; }
      /* el interruptor "Desactivar desenfoque" nunca lleva blur (ni con el ajuste apagado ni encendido): su aspecto no cambia al usarlo */
      html #tg-personalizar-panel .tg-p-toggle.tg-p-ctl-blur,
      html.tg-ligero #tg-personalizar-panel .tg-p-toggle.tg-p-ctl-blur {
        -webkit-backdrop-filter: none !important; backdrop-filter: none !important; filter: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(est);
  })();
  aplicarSinBlur();
  const puenteFlutter = (function () {
    const pendientes = new Map();
    let temporizador = null;
    let intentos = 0;
    const listo = () => !!(window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function');
    // ¿estamos (o estaremos) dentro de un WebView de Flutter? (Android WebView lleva "; wv)" en el user agent)
    const esperable = () => listo() || /;\s*wv\)/.test(navigator.userAgent || '');
    function vaciar() {
      temporizador = null;
      if (!pendientes.size) return;
      if (!listo()) {
        if (esperable() && ++intentos <= 60) temporizador = setTimeout(vaciar, 500); // el puente aún no existe: se reintenta
        else pendientes.clear();                                                      // sin Flutter (extensión de Chrome): se descarta
        return;
      }
      intentos = 0;
      const lote = Array.from(pendientes);
      pendientes.clear();
      lote.forEach(function (par) {
        try {
          const r = window.flutter_inappwebview.callHandler('guardarPreferencia', par[0], par[1]);
          if (r && typeof r.catch === 'function') r.catch((e) => console.warn('[tg] guardarPreferencia falló:', par[0], e));
        } catch (e) { console.warn('[tg] guardarPreferencia falló:', par[0], e); }
      });
    }
    function programar(ms) {
      if (temporizador) return;
      temporizador = setTimeout(vaciar, ms);
    }
    window.addEventListener('flutterInAppWebViewPlatformReady', () => { if (pendientes.size) { intentos = 0; if (temporizador) clearTimeout(temporizador); temporizador = null; programar(0); } });
    return {
      enviar(clave, valor) {
        if (!esperable()) return;
        pendientes.set(clave, valor === undefined ? null : valor);
        intentos = 0;
        programar(250);
      }
    };
  })();
  const hayChromeStorage = () => typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
  const errorAlmacen = () => (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) ? chrome.runtime.lastError : null;
  function prefsGuardar(obj, alTerminar) {
    Object.keys(obj).forEach((k) => puenteFlutter.enviar(k, obj[k]));
    if (hayChromeStorage()) chrome.storage.local.set(obj, alTerminar);
    else if (alTerminar) setTimeout(alTerminar, 0);
  }
  function prefsBorrar(claves) {
    [].concat(claves).forEach((k) => puenteFlutter.enviar(k, null));
    if (hayChromeStorage()) chrome.storage.local.remove(claves);
  }
  // lee las claves pedidas: lo inyectado por Dart manda sobre lo guardado en chrome.storage
  function prefsLeer(claves, alTerminar) {
    const inyectado = {};
    claves.forEach((k) => { if (PREFS_INICIALES[k] !== undefined && PREFS_INICIALES[k] !== null) inyectado[k] = PREFS_INICIALES[k]; });
    if (!hayChromeStorage()) { alTerminar(inyectado); return; }
    chrome.storage.local.get(claves, function (r) {
      if (errorAlmacen()) { console.error('No se pudo cargar la configuración guardada:', errorAlmacen().message); alTerminar(inyectado); return; }
      alTerminar(Object.assign({}, r, inyectado));
    });
  }
  const almacenPrefs = { set: prefsGuardar, remove: prefsBorrar };
  // fondo por defecto del bloqueo: archivo de la extensión, o el que inyecte Dart
  function urlFondoBloqueoDefecto() {
    try { if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) return chrome.runtime.getURL(BLOQUEO_FONDO_ARCHIVO); } catch (e) { /* no es una extensión */ }
    return typeof PREFS_INICIALES.geminiFondoBloqueoDefecto === 'string' ? PREFS_INICIALES.geminiFondoBloqueoDefecto : '';
  }
  function bloqueoActivoGuardado() { try { return localStorage.getItem(BLOQUEO_CLAVE_LS) === '1'; } catch (e) { return false; } }
  function guardarBloqueoActivo(v) {
    try { localStorage.setItem(BLOQUEO_CLAVE_LS, v ? '1' : '0'); } catch (e) { /* sin localStorage */ }
    prefsGuardar({ geminiBloqueoActivo: !!v });
  }
  const MOSTRAR_PANTALLA_BLOQUEO = bloqueoActivoGuardado() && vibesOn; // el cambio se nota la próxima vez que entres a la página
  const BLOQUEO_OPACIDAD_INICIAL = 0;   // opacidad del body al empezar la transición (termina en 1)
  const BLOQUEO_ESCALA_INICIAL = 1.3;   // escala del body al empezar la transición (termina en 1)
  const BLOQUEO_DURACION_MS = 300;     // duración de la subida de la pantalla y de la entrada del body
  const BLOQUEO_DURACION_BODY_MS = BLOQUEO_DURACION_MS * 2.5; // duración de la animación del body (zoom)
  const BLOQUEO_FONDO_ARCHIVO = "img/8e2b943a517014c877bc7f688c5bdad9.jpg"; // fondo detrás del body (archivo dentro de la extensión)
  let bloqueoFondoPersonalizado = '';   // imagen (data URL) o video (blob URL) del fondo del bloqueo
  let bloqueoFondoTipo = 'imagen';      // 'imagen' | 'video' (los videos se guardan en IndexedDB, ver bdGuardar)
  let bloqueoPinHash = PREFS_INICIALES.geminiPinBloqueo || null; // hash SHA-256 del PIN de 4 dígitos (se guarda en chrome.storage; null = aún no hay PIN)
  const BLOQUEO_PIN_LARGO = 4;          // dígitos del PIN

  // ============================================================================================
  // CONSTRUCTORES DE DOM (sin innerHTML)
  // El WebView de Android (Trusted Types) bloquea innerHTML, insertAdjacentHTML y DOMParser, así que todo el HTML propio
  // se arma con createElement / createElementNS / appendChild / createTextNode.
  //   h('div', { class: 'x', id: 'y', hidden: true }, 'texto', otroNodo, [lista de nodos])   -> elemento HTML
  //   hs('svg', { viewBox: '0 0 24 24' }, hs('path', { d: '...' }))                          -> elemento SVG
  // Los atributos con valor null/undefined/false se omiten; true pone el atributo vacío (hidden, disabled...).
  // Los hijos de tipo texto se insertan como nodos de texto (nunca se interpretan como HTML).
  // ============================================================================================
  const NS_SVG = 'http://www.w3.org/2000/svg';
  function poblarEl(e, attrs, hijos) {
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        e.setAttribute(k, v === true ? '' : String(v));
      });
    }
    hijos.forEach(function agregar(c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) { c.forEach(agregar); return; }
      e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    });
    return e;
  }
  function h(tag, attrs, ...hijos) { return poblarEl(document.createElement(tag), attrs, hijos); }
  function hs(tag, attrs, ...hijos) { return poblarEl(document.createElementNS(NS_SVG, tag), attrs, hijos); }

  // ============================================================================================
  // FONDOS CON VIDEO (Gemini y bloqueo)
  // - Los videos pesan demasiado para chrome.storage (≈10 MB): se guardan como Blob en IndexedDB (claves 'gemini' y 'bloqueo').
  //   En chrome.storage solo queda la marca del tipo (geminiFondoTipo / geminiFondoBloqueoTipo = 'video').
  // - Se muestran con un <video> mudo, en bucle y sin controles (object-fit: cover), no con background-image.
  // - IndexedDB pertenece al sitio (gemini.google.com): si borras "datos del sitio", el video se pierde y vuelve el fondo normal.
  // ============================================================================================
  const BD_NOMBRE = 'tg-fondos-extension';
  const BD_ALMACEN = 'videos';
  const VIDEO_MAX_MB = 500;
  function abrirBD() {
    return new Promise((ok, fallo) => {
      const r = indexedDB.open(BD_NOMBRE, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(BD_ALMACEN)) r.result.createObjectStore(BD_ALMACEN); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fallo(r.error);
    });
  }
  async function bdOperacion(modo, fn) {
    const bd = await abrirBD();
    try {
      return await new Promise((ok, fallo) => {
        const tx = bd.transaction(BD_ALMACEN, modo);
        const req = fn(tx.objectStore(BD_ALMACEN));
        tx.oncomplete = () => ok(req ? req.result : undefined);
        tx.onerror = () => fallo(tx.error);
        tx.onabort = () => fallo(tx.error || new Error('transacción cancelada'));
      });
    } finally { bd.close(); }
  }
  const bdGuardar = (clave, blob) => bdOperacion('readwrite', (a) => a.put(blob, clave));
  const bdLeer = (clave) => bdOperacion('readonly', (a) => a.get(clave));
  const bdBorrar = (clave) => bdOperacion('readwrite', (a) => a.delete(clave));

  const urlsVideo = {}; // clave -> blob URL vigente
  function nuevaUrlVideo(clave, blob) {
    const vieja = urlsVideo[clave];
    const nueva = URL.createObjectURL(blob);
    urlsVideo[clave] = nueva;
    if (vieja) setTimeout(() => URL.revokeObjectURL(vieja), 2000);
    return nueva;
  }
  function liberarUrlVideo(clave) {
    const vieja = urlsVideo[clave];
    delete urlsVideo[clave];
    if (vieja) setTimeout(() => URL.revokeObjectURL(vieja), 2000);
  }

  function avisarTg(texto) {
    try {
      let t = document.getElementById('tg-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'tg-toast';
        t.setAttribute('role', 'status');
        t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;max-width:min(90vw,520px);' +
          'padding:12px 18px;border-radius:14px;background:rgba(0,0,0,0.82);color:#fff;font:14px/1.35 "Google Sans","Segoe UI",system-ui,sans-serif;' +
          'text-align:center;pointer-events:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);';
        (document.body || document.documentElement).appendChild(t);
      }
      t.textContent = texto;
      clearTimeout(t._tgT);
      t._tgT = setTimeout(() => t.remove(), 5000);
    } catch (e) { /* nunca debe romper la página */ }
  }

  (function () {
    const est = document.createElement('style');
    est.id = 'tg-medio-style';
    est.textContent = `
      video.tg-medio-video {
        position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
        pointer-events: none; z-index: -1; background: transparent;
      }
      /* el video del fondo de Gemini va detrás de todo (z -2); el fondo del bloqueo (z -1) queda por encima */
      #tg-fondo-video { position: fixed; inset: 0; z-index: -2; pointer-events: none; background: #000; overflow: hidden; }
      .tg-p-fondo, .tg-p-vista { isolation: isolate; }
    `;
    (document.head || document.documentElement).appendChild(est);
  })();
  // pausa los videos de fondo cuando la pestaña no se ve (ahorra batería/CPU)
  // y mientras la pantalla está bloqueada (solo siguen los videos del propio bloqueo / PIN, que es lo único que se ve)
  const esVideoDelBloqueo = (v) => !!(v.closest && v.closest('#tg-bloqueo, #tg-bloqueo-fondo, #tg-pin'));
  function sincronizarVideos() {
    document.querySelectorAll('video.tg-medio-video').forEach((v) => {
      if (document.hidden || (pantallaBloqueada && !esVideoDelBloqueo(v))) v.pause();
      else if (v._tgQuiere) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); }
    });
  }
  document.addEventListener('visibilitychange', sincronizarVideos);
  document.addEventListener('tg-bloqueo-cambio', sincronizarVideos);

  // pone en un contenedor una imagen (background-image) o un video (<video> de relleno); sin url lo deja como estaba por CSS
  function ponerMedio(el, url, tipo) {
    if (!el) return;
    const marca = (tipo === 'video' ? 'video' : 'imagen') + '|' + (url || '');
    if (el._tgMedio === marca) return; // ya está puesto: no se reinicia el video
    el._tgMedio = marca;
    [...el.children].forEach((h) => {
      if (h.tagName === 'VIDEO' && h.classList.contains('tg-medio-video')) { h.pause(); h.removeAttribute('src'); h.load(); h.remove(); }
    });
    if (tipo === 'video' && url) {
      el.style.backgroundImage = 'none';
      const v = document.createElement('video');
      v.className = 'tg-medio-video';
      v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.disablePictureInPicture = true;
      v.setAttribute('aria-hidden', 'true');
      v.autoplay = !sinMovimiento(); // con "reducir movimiento" solo se ve el primer fotograma
      v._tgQuiere = v.autoplay;      // "debería reproducirse" (sincronizarVideos lo pausa/reanuda según foco y bloqueo)
      v.addEventListener('error', () => avisarTg('No se pudo reproducir el video de fondo (formato no compatible o bloqueado por la página).'));
      v.src = url;
      el.insertBefore(v, el.firstChild);
      if (v.autoplay) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); }
      queueMicrotask(sincronizarVideos); // si nace con la pantalla bloqueada (o la pestaña oculta) y no es del bloqueo, queda en pausa
    } else {
      el.style.backgroundImage = url ? 'url("' + url + '")' : '';
    }
  }

  // fondo del bloqueo (imagen o video propio; si no hay, la imagen por defecto de la extensión)
  function aplicarFondoBloqueo(f) {
    if (!f) return;
    try {
      if (bloqueoFondoPersonalizado) ponerMedio(f, bloqueoFondoPersonalizado, bloqueoFondoTipo);
      else { const porDefecto = urlFondoBloqueoDefecto(); if (porDefecto) ponerMedio(f, porDefecto, 'imagen'); }
    } catch (e) { /* sin imagen: queda el color liso */ }
  }

  // fondo de Gemini en video: capa fija detrás de todo + el html marcado para que body/contenedores dejen verla
  function gestionarVideoGemini(url, tipo) {
    const raiz = document.documentElement;
    let cont = document.getElementById('tg-fondo-video');
    if (tipo !== 'video' || !url) {
      raiz.classList.remove('tg-fondo-video');
      if (cont) { ponerMedio(cont, '', 'imagen'); cont.remove(); }
      return;
    }
    if (!cont) { cont = document.createElement('div'); cont.id = 'tg-fondo-video'; raiz.appendChild(cont); }
    ponerMedio(cont, url, 'video');
    raiz.classList.add('tg-fondo-video');
  }

  (function pantallaDeBloqueo() {
    if (!MOSTRAR_PANTALLA_BLOQUEO) return;

    const raiz = document.documentElement;
    let bloqueado = false;
    let animBody = null;
    let temporizadorFondo = null;

    const estilo = document.createElement('style');
    estilo.id = 'tg-bloqueo-style';
    estilo.textContent = `
      html.tg-bloqueado { overflow: hidden !important; }
      /* ahorro: con la página oculta tras el bloqueo no se pinta ni se anima nada del body */
      html.tg-bloqueo-pausa body { visibility: hidden !important; }
      html.tg-bloqueo-pausa body *, html.tg-bloqueo-pausa body *::before, html.tg-bloqueo-pausa body *::after { animation-play-state: paused !important; }
      #tg-bloqueo {
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 10px; text-align: center; color: #fff; overflow: hidden;
       
        font-family: 'Google Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
        -webkit-backdrop-filter: blur(var(--tg-bloqueo-blur, 0px));
        backdrop-filter: blur(var(--tg-bloqueo-blur, 0px));
        transition: transform ${BLOQUEO_DURACION_MS}ms cubic-bezier(0.7, 0, 0.2, 1), -webkit-backdrop-filter ${BLOQUEO_DURACION_MS}ms ease, backdrop-filter ${BLOQUEO_DURACION_MS}ms ease;
        user-select: none; cursor: grab; touch-action: none;
      }
      #tg-bloqueo.tg-subiendo { --tg-bloqueo-blur: 12px; transform: translateY(-100%); }
      #tg-bloqueo.tg-subiendo, #tg-bloqueo.tg-arrastrando { will-change: transform; }
      #tg-bloqueo.tg-arrastrando { transition: none; cursor: grabbing; }
      #tg-bloqueo-fondo {
        position: fixed; inset: 0; z-index: -1; pointer-events: none;
        background-color: #0b0b0f;
        background-size: cover; background-position: center; background-repeat: no-repeat;
      }
      #tg-bloqueo > * { position: relative; z-index: 1; }
      #tg-bloqueo .tg-b-hora { font-size: clamp(72px, 15vw, 180px); font-weight: 500; line-height: 1; letter-spacing: -0.03em; transform: translateY(-12vh); }
      #tg-bloqueo .tg-b-fecha { font-size: clamp(16px, 2.2vw, 24px); opacity: 0.85; transform: translateY(-12vh); }
      #tg-bloqueo .tg-b-pista {
        position: absolute; bottom: 7vh; left: 50%; transform: translateX(-50%);
        display: flex; flex-direction: column; align-items: center; gap: 12px;
        font-size: 15px; opacity: 0.9; animation: tgBloqueoFlota 2.2s ease-in-out infinite;
      }
      #tg-bloqueo .tg-b-tecla {
        min-width: 220px; padding: 10px 28px; border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.45); border-bottom-width: 4px;
        background: rgba(255, 255, 255, 0.12); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        font-size: 14px; letter-spacing: 0.14em; text-transform: uppercase;
      }
      /* PANTALLA DE PIN (aparece debajo al deslizar la pantalla de bloqueo hacia arriba) */
      #tg-pin {
        position: fixed; inset: 0; z-index: 2147483646; overflow: hidden; color: #fff;
        display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
        font-family: 'Google Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
        opacity: 0; transition: opacity 350ms ease; user-select: none;
      }
      #tg-pin.tg-pin-visible { opacity: 1; }
      #tg-pin .tg-pin-fondo {
        position: absolute; inset: -60px; z-index: 0; pointer-events: none;
        background-color: #ffffff00; background-size: cover; background-position: center; background-repeat: no-repeat;
        filter: blur(28px) brightness(0.5) saturate(1.1);
      }
      #tg-pin .tg-pin-contenido {
        position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 14px;
        padding: 0 20px; transform: scale(0.94); transition: transform 450ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      #tg-pin.tg-pin-visible .tg-pin-contenido { transform: scale(1); }
      #tg-pin { --tg-k: clamp(62px, min(19vw, 10.5vh), 84px); --tg-kgap: clamp(12px, 3.6vw, 20px); }
      #tg-pin .tg-pin-contenido { gap: 8px; }
      #tg-pin .tg-pin-titulo { margin: 0; font-size: clamp(22px, 3.2vw, 28px); font-weight: 500; line-height: 1.2; letter-spacing: -0.01em; }
      #tg-pin .tg-pin-sub { font-size: 15px; opacity: 0.8; }
      /* puntos del PIN: círculos vacíos que se rellenan al teclear */
      #tg-pin .tg-pin-puntos { display: flex; gap: 22px; margin: 18px 0 6px; }
      #tg-pin .tg-pin-punto {
        width: 14px; height: 14px; box-sizing: border-box; border-radius: 50%;
        border: 1.5px solid rgba(255, 255, 255, 0.9); background: transparent;
        transition: background-color 150ms ease, transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      #tg-pin .tg-pin-punto.tg-llena { background: #fff; transform: scale(1.12); }
      #tg-pin .tg-pin-puntos.tg-error { animation: tgPinSacudir 420ms ease; }
      #tg-pin .tg-pin-puntos.tg-error .tg-pin-punto { border-color: #ff6b6b; }
      #tg-pin .tg-pin-puntos.tg-error .tg-pin-punto.tg-llena { background: #ff6b6b; }
      #tg-pin .tg-pin-msg { min-height: 20px; font-size: 14px; color: #ff9b9b; }
      /* teclado numérico: botones redondos de cristal (mismo estilo que los botones de la extensión) */
      #tg-pin .tg-pin-teclado { display: grid; grid-template-columns: repeat(3, var(--tg-k)); gap: var(--tg-kgap); justify-content: center; margin-top: 6px; }
      #tg-pin .tg-pin-tecla {
        width: var(--tg-k); height: var(--tg-k); padding: 0; margin: 0; box-sizing: border-box; border-radius: 50%; cursor: pointer;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
        border: 1px solid rgba(255, 255, 255, 0.28); background: rgba(0, 0, 0, 0.4); color: #fff;
        font-family: inherit; -webkit-tap-highlight-color: transparent; touch-action: manipulation; outline: 0;
        -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
        transition: transform 0.2s ease, background-color 0.15s ease, border-color 0.15s ease;
      }
      #tg-pin .tg-pin-tecla:hover { transform: scale(1.06); }
      #tg-pin .tg-pin-tecla:active, #tg-pin .tg-pin-tecla.tg-pulsada { transform: scale(0.92); background: rgba(255, 255, 255, 0.28); border-color: rgba(255, 255, 255, 0.6); transition-duration: 0.05s; }
      #tg-pin .tg-pin-tecla:focus-visible { box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5); }
      #tg-pin .tg-pin-tecla-num { font-size: calc(var(--tg-k) * 0.44); font-weight: 400; line-height: 1; }
      #tg-pin .tg-pin-tecla-letras { font-size: calc(var(--tg-k) * 0.13); font-weight: 600; letter-spacing: 0.2em; text-indent: 0.2em; line-height: 1; min-height: calc(var(--tg-k) * 0.13); opacity: 0.9; }
      #tg-pin .tg-pin-tecla-cero { grid-column: 2; }
      /* fila de abajo: "¿Olvidaste el PIN?" a la izquierda y Cancelar/Borrar a la derecha */
      #tg-pin .tg-pin-pie { display: flex; justify-content: space-between; align-items: center; width: calc(var(--tg-k) * 3 + var(--tg-kgap) * 2); margin-top: 14px; }
      #tg-pin .tg-pin-accion {
        background: none; border: 0; color: #fff; font: inherit; font-size: 16px; cursor: pointer; padding: 8px 12px; border-radius: 9999px;
        transition: background-color 0.15s ease, transform 0.2s ease; -webkit-tap-highlight-color: transparent; outline: 0;
      }
      #tg-pin .tg-pin-accion:hover { background: rgba(255, 255, 255, 0.12); }
      #tg-pin .tg-pin-accion:active { transform: scale(0.95); }
      #tg-pin .tg-pin-accion:focus-visible { box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5); }
      #tg-pin .tg-pin-olvido { font-size: 14px; opacity: 0.9; }
      @keyframes tgPinSacudir { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-12px); } 40% { transform: translateX(10px); } 60% { transform: translateX(-8px); } 80% { transform: translateX(5px); } }
      @media (prefers-reduced-motion: reduce) { #tg-pin, #tg-pin .tg-pin-contenido, #tg-pin .tg-pin-tecla, #tg-pin .tg-pin-punto { transition: none; } #tg-pin .tg-pin-puntos.tg-error { animation: none; } }
      @keyframes tgBloqueoFlota { 0%, 100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, -8px); } }
      @media (prefers-reduced-motion: reduce) { #tg-bloqueo .tg-b-pista { animation: none; } }
    `;
    (document.head || raiz).appendChild(estilo);

    // ---- FONDO DETRÁS DEL BODY + el body (con TODO y su fondo) en sus propiedades iniciales mientras está bloqueado ----
    // - mientras está bloqueado, el body se queda en escala BLOQUEO_ESCALA_INICIAL y opacidad BLOQUEO_OPACIDAD_INICIAL
    // - detrás del body hay otro fondo (#tg-bloqueo-fondo) para que se vea algo mientras el body entra/sale
    // - el fondo del body "sube" al canvas del html y no se escalaba con el body: mientras dura el bloqueo y la
    //   animación se le da un color al html para que el fondo se quede PEGADO al body
    function colorFondoBody() {
      const b = document.body;
      const c = b ? getComputedStyle(b).backgroundColor : '';
      return c && !/rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent' ? c : '#000';
    }
    function crearFondoDetras() {
      let f = document.getElementById('tg-bloqueo-fondo');
      if (f) return f;
      f = document.createElement('div');
      f.id = 'tg-bloqueo-fondo';
      raiz.appendChild(f);
      aplicarFondoBloqueo(f);
      return f;
    }
    function ponerBodyInicial() {
      const b = document.body;
      if (!b) return;
      crearFondoDetras();
      raiz.style.setProperty('background-color', colorFondoBody(), 'important');
      b.style.setProperty('min-height', '100vh', 'important');
      b.style.setProperty('transform', 'scale(' + BLOQUEO_ESCALA_INICIAL + ')'); // sin !important: las animaciones no vencen a un !important
      b.style.setProperty('opacity', String(BLOQUEO_OPACIDAD_INICIAL));
    }
    function quitarBodyInicial() {
      const b = document.body;
      raiz.style.removeProperty('background-color');
      if (b) {
        b.style.removeProperty('transform');
        b.style.removeProperty('opacity');
        b.style.removeProperty('min-height');
      }
      const f = document.getElementById('tg-bloqueo-fondo');
      if (f) f.remove();
    }
    function animarBody(desde, hasta, opDesde, opHasta, alTerminar) {
      const b = document.body;
      if (!b) { if (alTerminar) alTerminar(); return; }
      if (animBody) animBody.cancel();
      const anim = b.animate(
        [
          { opacity: opDesde, transform: 'scale(' + desde + ')' },
          { opacity: opHasta, transform: 'scale(' + hasta + ')' }
        ],
        { duration: BLOQUEO_DURACION_BODY_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' }
      );
      animBody = anim;
      anim.onfinish = () => {
        if (animBody !== anim) return; // empezó otra animación
        animBody = null;
        anim.cancel();
        if (alTerminar) alTerminar();
      };
    }

    // ---- PANTALLA DE PIN ----
    // Se muestra cuando se desliza hacia arriba (o Espacio). El fondo es el del bloqueo, difuminado.
    // Si todavía no hay PIN guardado, primero se pide crearlo (dos veces). ESC vuelve a la pantalla de bloqueo.
    async function hashPin(pin) {
      try {
        const datos = new TextEncoder().encode('tg-bloqueo:' + pin);
        const h = await crypto.subtle.digest('SHA-256', datos);
        return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (e) { return 'plano:' + pin; } // sin crypto.subtle
    }
    function guardarPin(hash) {
      bloqueoPinHash = hash;
      try {
        if (hash === null) prefsBorrar('geminiPinBloqueo');
        else prefsGuardar({ geminiPinBloqueo: hash });
      } catch (e) { /* queda solo en memoria */ }
    }

    const PIN_TECLAS = [
      { n: '1', l: '' }, { n: '2', l: 'ABC' }, { n: '3', l: 'DEF' }, { n: '4', l: 'GHI' }, { n: '5', l: 'JKL' },
      { n: '6', l: 'MNO' }, { n: '7', l: 'PQRS' }, { n: '8', l: 'TUV' }, { n: '9', l: 'WXYZ' }, { n: '0', l: '' }
    ];
    function crearPantallaPin(opc) {
      const pin = h('div', { id: 'tg-pin' },
        h('div', { class: 'tg-pin-fondo' }),
        h('div', { class: 'tg-pin-contenido' },
          h('h1', { class: 'tg-pin-titulo' }),
          h('div', { class: 'tg-pin-sub' }),
          h('div', { class: 'tg-pin-puntos', 'aria-hidden': 'true' }, Array.from({ length: BLOQUEO_PIN_LARGO }, () => h('span', { class: 'tg-pin-punto' }))),
          h('div', { class: 'tg-pin-msg', role: 'alert' }),
          h('div', { class: 'tg-pin-teclado' },
            PIN_TECLAS.map((t) => h('button', { type: 'button', class: 'tg-pin-tecla' + (t.n === '0' ? ' tg-pin-tecla-cero' : ''), 'data-d': t.n, 'aria-label': t.n },
              h('span', { class: 'tg-pin-tecla-num' }, t.n),
              h('span', { class: 'tg-pin-tecla-letras' }, t.l)))),
          h('div', { class: 'tg-pin-pie' },
            h('button', { type: 'button', class: 'tg-pin-accion tg-pin-olvido' }, '¿Olvidaste el PIN?'),
            h('button', { type: 'button', class: 'tg-pin-accion tg-pin-borrar' }, 'Cancelar'))
        )
      );
      // mismo fondo que el bloqueo (queda difuminado por CSS)
      const fondoPin = pin.querySelector('.tg-pin-fondo');
      if (bloqueoFondoPersonalizado && bloqueoFondoTipo === 'video') {
        ponerMedio(fondoPin, bloqueoFondoPersonalizado, 'video'); // el mismo video, difuminado por el CSS de .tg-pin-fondo
      } else {
        const fondoBloqueo = document.getElementById('tg-bloqueo-fondo');
        const imagen = (fondoBloqueo && fondoBloqueo.style.backgroundImage) ||
          (bloqueoFondoPersonalizado ? 'url("' + bloqueoFondoPersonalizado + '")' : '');
        if (imagen) fondoPin.style.backgroundImage = imagen;
      }
      raiz.appendChild(pin);

      const elSub = pin.querySelector('.tg-pin-sub');
      const elTitulo = pin.querySelector('.tg-pin-titulo');
      const elCajas = pin.querySelector('.tg-pin-puntos');
      const cajas = [...pin.querySelectorAll('.tg-pin-punto')];
      const elMsg = pin.querySelector('.tg-pin-msg');
      const elOlvido = pin.querySelector('.tg-pin-olvido');
      const elBorrar = pin.querySelector('.tg-pin-borrar');

      let modo = bloqueoPinHash ? 'ingresar' : 'crear1';
      let primero = '';
      let digitos = '';
      let ocupado = false;
      let cerrado = false;

      function pintar() {
        if (modo === 'ingresar') { elTitulo.textContent = 'Ingresa tu código PIN'; elSub.textContent = 'Se requiere para desbloquear'; }
        else if (modo === 'crear1') { elTitulo.textContent = 'Crea tu código PIN'; elSub.textContent = 'Elige ' + BLOQUEO_PIN_LARGO + ' dígitos'; }
        else { elTitulo.textContent = 'Confirma tu código PIN'; elSub.textContent = 'Un último paso'; }
        elOlvido.style.visibility = modo === 'ingresar' ? '' : 'hidden';
        elBorrar.textContent = digitos.length ? 'Borrar' : 'Cancelar'; // como en el iPhone: Cancelar vuelve, Borrar quita el último dígito
        cajas.forEach((c, i) => {
          c.classList.toggle('tg-llena', i < digitos.length);
        });
      }
      function error(mensaje) {
        ocupado = true;
        elMsg.textContent = mensaje;
        elCajas.classList.remove('tg-error');
        void elCajas.offsetWidth;
        elCajas.classList.add('tg-error');
        setTimeout(() => {
          if (cerrado) return;
          elCajas.classList.remove('tg-error');
          digitos = '';
          ocupado = false;
          pintar();
        }, 460);
      }
      async function evaluar() {
        if (cerrado) return;
        ocupado = true;
        elMsg.textContent = '';
        if (modo === 'ingresar') {
          if ((await hashPin(digitos)) === bloqueoPinHash) { opc.alCorrecto(); return; }
          error('PIN incorrecto. Inténtalo de nuevo.');
        } else if (modo === 'crear1') {
          primero = digitos; digitos = ''; modo = 'crear2'; ocupado = false; pintar();
        } else if (digitos === primero) {
          guardarPin(await hashPin(digitos));
          opc.alCorrecto();
        } else {
          modo = 'crear1'; primero = '';
          error('Los códigos no coinciden. Vuelve a crearlo.');
        }
      }
      function anadirDigito(d) {
        if (ocupado || cerrado || digitos.length >= BLOQUEO_PIN_LARGO) return;
        digitos += d;
        elMsg.textContent = '';
        pintar();
        if (digitos.length === BLOQUEO_PIN_LARGO) { ocupado = true; setTimeout(() => { ocupado = false; evaluar(); }, 160); }
      }
      function borrarDigito() {
        if (ocupado || cerrado) return;
        digitos = digitos.slice(0, -1); elMsg.textContent = ''; pintar();
      }
      function tecla(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (ocupado || cerrado) return;
        if (/^[0-9]$/.test(e.key)) {
          anadirDigito(e.key);
          // el botón correspondiente se "pulsa" también al usar el teclado físico
          const b = pin.querySelector('.tg-pin-tecla[data-d="' + e.key + '"]');
          if (b) { b.classList.add('tg-pulsada'); setTimeout(() => b.classList.remove('tg-pulsada'), 110); }
        } else if (e.key === 'Backspace') {
          borrarDigito();
        } else if (e.key === 'Escape') {
          opc.alVolver();
        }
      }
      pin.querySelectorAll('.tg-pin-tecla').forEach((b) => b.addEventListener('click', () => anadirDigito(b.getAttribute('data-d'))));
      elBorrar.addEventListener('click', () => {
        if (ocupado || cerrado) return;
        if (digitos.length) borrarDigito(); else opc.alVolver();
      });
      elOlvido.addEventListener('click', () => {
        if (ocupado || cerrado) return;
        if (window.confirm('¿Restablecer el PIN? Se desbloqueará la pantalla y deberás crear uno nuevo la próxima vez que la bloquees.')) {
          guardarPin(null);
          opc.alCorrecto();
        }
      });
      window.addEventListener('keydown', tecla, true);
      pintar();
      requestAnimationFrame(() => requestAnimationFrame(() => pin.classList.add('tg-pin-visible')));

      return {
        cerrar(conAnimacion) {
          if (cerrado) return;
          cerrado = true;
          window.removeEventListener('keydown', tecla, true);
          pin.classList.remove('tg-pin-visible');
          setTimeout(() => pin.remove(), conAnimacion ? 400 : 0);
        }
      };
    }

    // ---- bloquear ----
    function pausarCuerpo(v) { raiz.classList.toggle('tg-bloqueo-pausa', !!v); }
    function bloquear(animado) {
      if (bloqueado) return;
      bloqueado = true;
      fijarPantallaBloqueada(true); // desde ya, nada más de la extensión trabaja
      let desbloqueado = false;
      const pantalla = h('div', { id: 'tg-bloqueo' },
        h('div', { class: 'tg-b-hora' }),
        h('div', { class: 'tg-b-fecha' }),
        h('div', { class: 'tg-b-pista' },
          h('span', null, 'Presiona'),
          h('span', { class: 'tg-b-tecla' }, 'Espacio'),
          h('span', null, 'para continuar'))
      );
      if (animado) pantalla.classList.add('tg-subiendo'); // empieza arriba y baja
      raiz.appendChild(pantalla);
      raiz.classList.add('tg-bloqueado');

      const elHora = pantalla.querySelector('.tg-b-hora');
      const elFecha = pantalla.querySelector('.tg-b-fecha');
      function actualizarReloj() {
        const ahora = new Date();
        elHora.textContent = ahora.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
        const fecha = ahora.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
        elFecha.textContent = fecha.charAt(0).toUpperCase() + fecha.slice(1);
      }
      actualizarReloj();
      let relojId = null; // el reloj solo muestra HH:MM: despierta una vez por minuto, no cada segundo
      const programarReloj = () => { relojId = setTimeout(() => { actualizarReloj(); programarReloj(); }, 60000 - (Date.now() % 60000) + 50); };
      programarReloj();

      // mientras está bloqueado, la página de atrás no recibe clics ni teclas
      const ponerInert = (v) => { if (document.body) document.body.inert = v; };
      ponerInert(true);
      if (!document.body) {
        document.addEventListener('DOMContentLoaded', () => { if (!desbloqueado) { ponerInert(true); ponerBodyInicial(); } }, { once: true });
      }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

      if (animado) {
        // la pantalla baja y el body se aleja hasta sus propiedades iniciales (escala 1.3, opacidad 0) y se queda así
        if (animBody) { animBody.cancel(); animBody = null; }
        ponerBodyInicial();
        void pantalla.offsetHeight;
        pantalla.classList.remove('tg-subiendo');
        const b = document.body;
        if (b) {
          const anim = b.animate(
            [
              { opacity: 1, transform: 'scale(1)' },
              { opacity: BLOQUEO_OPACIDAD_INICIAL, transform: 'scale(' + BLOQUEO_ESCALA_INICIAL + ')' }
            ],
            { duration: BLOQUEO_DURACION_BODY_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
          );
          animBody = anim;
          anim.onfinish = () => { if (animBody === anim) { animBody = null; anim.cancel(); } if (!desbloqueado) pausarCuerpo(true); }; // se queda con el estilo inicial
        } else pausarCuerpo(true);
      } else {
        ponerBodyInicial(); // al cargar: el body ya está en sus propiedades iniciales
        pausarCuerpo(true);
      }

      // 1) deslizar hacia arriba (o Espacio): la pantalla de bloqueo sube y debajo aparece la de PIN
      let enPin = false;
      let pinUI = null;
      function mostrarPin() {
        if (enPin || desbloqueado) return;
        enPin = true;
        pantalla.classList.remove('tg-arrastrando');
        pantalla.style.removeProperty('transform');
        pantalla.style.removeProperty('--tg-bloqueo-blur');
        pantalla.style.pointerEvents = 'none';
        pantalla.classList.add('tg-subiendo');
        window.removeEventListener('keydown', alTeclear, true);
        pinUI = crearPantallaPin({ alCorrecto: desbloquear, alVolver: volverABloqueo });
      }
      // ESC en la pantalla de PIN: la pantalla de bloqueo vuelve a bajar
      function volverABloqueo() {
        if (!enPin || desbloqueado) return;
        enPin = false;
        if (pinUI) { pinUI.cerrar(true); pinUI = null; }
        pantalla.classList.remove('tg-subiendo');
        pantalla.style.removeProperty('pointer-events');
        window.addEventListener('keydown', alTeclear, true);
      }
      // 2) PIN correcto: el body entra desde sus propiedades iniciales hasta lo normal
      function desbloquear() {
        if (desbloqueado) return;
        desbloqueado = true;
        pausarCuerpo(false);            // el body vuelve a pintarse para la animación de entrada
        fijarPantallaBloqueada(false);  // y todo lo demás se reanuda
        pantalla.classList.remove('tg-arrastrando');
        pantalla.style.removeProperty('transform');
        window.removeEventListener('keydown', alTeclear, true);
        window.removeEventListener('keyup', bloquearTecla, true);
        window.removeEventListener('keypress', bloquearTecla, true);
        clearTimeout(relojId);
        ponerInert(false);
        if (pinUI) { pinUI.cerrar(true); pinUI = null; }
        animarBody(BLOQUEO_ESCALA_INICIAL, 1, BLOQUEO_OPACIDAD_INICIAL, 1, quitarBodyInicial);
        // (el estilo inicial sigue puesto hasta que termina la animación; la animación lo tapa sin saltos)
        pantalla.classList.add('tg-subiendo');
        setTimeout(() => {
          pantalla.remove();
          raiz.classList.remove('tg-bloqueado');
          bloqueado = false;
        }, Math.max(BLOQUEO_DURACION_MS, 400) + 80);
      }

      // DESLIZAR HACIA ARRIBA: basta con subir ~18 % de la pantalla (entre 70 y 150 px), o dar un "flick" rápido
      const BLOQUEO_FLICK_PX_MS = 0.45;
      const BLOQUEO_UMBRAL_PX = () => Math.max(70, Math.min(window.innerHeight * 0.18, 150));
      let arrastre = null;
      pantalla.addEventListener('pointerdown', (e) => {
        if (!e.isPrimary || e.button !== 0 || desbloqueado || enPin) return;
        arrastre = { pointerId: e.pointerId, inicioY: e.clientY, distancia: 0, t: performance.now(), y: e.clientY, vel: 0 };
        pantalla.classList.add('tg-arrastrando');
        pantalla.setPointerCapture(e.pointerId);
      });
      pantalla.addEventListener('pointermove', (e) => {
        if (!arrastre || e.pointerId !== arrastre.pointerId) return;
        arrastre.distancia = Math.max(0, arrastre.inicioY - e.clientY);
        const ahora = performance.now(), dt = ahora - arrastre.t;
        if (dt > 0) { arrastre.vel = (arrastre.y - e.clientY) / dt; arrastre.t = ahora; arrastre.y = e.clientY; } // px/ms hacia arriba
        pantalla.style.transform = 'translateY(-' + arrastre.distancia + 'px)';
        pantalla.style.setProperty('--tg-bloqueo-blur', Math.min(12, arrastre.distancia / BLOQUEO_UMBRAL_PX() * 12) + 'px');
      });
      function terminarArrastre(e, permitirDesbloqueo) {
        if (!arrastre || e.pointerId !== arrastre.pointerId) return;
        if (permitirDesbloqueo) arrastre.distancia = Math.max(0, arrastre.inicioY - e.clientY);
        const distancia = arrastre.distancia;
        const arrastre_vel = arrastre.vel;
        arrastre = null;
        if (pantalla.hasPointerCapture(e.pointerId)) pantalla.releasePointerCapture(e.pointerId);
        pantalla.classList.remove('tg-arrastrando');
        pantalla.style.removeProperty('transform');
        pantalla.style.removeProperty('--tg-bloqueo-blur');
        const vel = arrastre_vel;
        if (permitirDesbloqueo && (distancia >= BLOQUEO_UMBRAL_PX() || (vel > BLOQUEO_FLICK_PX_MS && distancia > 30))) mostrarPin();
      }
      pantalla.addEventListener('pointerup', (e) => terminarArrastre(e, true));
      pantalla.addEventListener('pointercancel', (e) => terminarArrastre(e, false));

      function bloquearTecla(e) { e.preventDefault(); e.stopImmediatePropagation(); }
      function alTeclear(e) {
        // solo ESPACIO desbloquea; el resto de teclas no llega a la página
        if (e.code === 'Space' || e.key === ' ') {
          if (!e.repeat) mostrarPin();
        }
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      window.addEventListener('keydown', alTeclear, true);
      window.addEventListener('keyup', bloquearTecla, true);
      window.addEventListener('keypress', bloquearTecla, true);
    }

    // ALT + L: vuelve a bloquear la pantalla (solo si no está ya bloqueada)
    window.addEventListener('keydown', (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyL' || (e.key || '').toLowerCase() === 'l')) {
        if (bloqueado || !vibesOn) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        bloquear(true);
      }
    }, true);

    // BLOQUEAR AL PERDER EL FOCO
    // Se vuelve a poner la pantalla de bloqueo (sin animación, nadie la ve) cuando:
    //  - cambias de pestaña o minimizas (la página pasa a estar oculta), o
    //  - la ventana pierde el foco (Alt+Tab, clic en otra ventana o en la barra de direcciones).
    // Excepciones: el foco pasa a un iframe de la propia página, o hubo un clic/toque en la página justo antes (selector de archivos
    // del sistema: "Subir archivos", "Cambiar fondo"...). BLOQUEO_FOCO_GRACIA_MS = 0 desactiva esa excepción.
    const BLOQUEO_FOCO_GRACIA_MS = 800;
    let ultimaInteraccion = -1e9;
    ['pointerdown', 'mousedown', 'touchstart'].forEach((ev) =>
      window.addEventListener(ev, () => { ultimaInteraccion = performance.now(); }, { capture: true, passive: true }));
    function bloquearPorFoco() {
      if (bloqueado || !vibesOn) return;
      bloquear(false);
    }
    window.addEventListener('blur', (e) => {
      if (e.target !== window) return;
      if (BLOQUEO_FOCO_GRACIA_MS > 0 && performance.now() - ultimaInteraccion < BLOQUEO_FOCO_GRACIA_MS) return;
      setTimeout(() => { if (!document.hasFocus()) bloquearPorFoco(); }, 0); // si el foco fue a un iframe, el documento sigue con foco
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) bloquearPorFoco(); });

    bloquear(false); // al cargar la página por primera vez
  })();

  // Input tipo file oculto (lo abre el ítem "Cambiar fondo" del menú de ajustes)
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*,video/*,.gif';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  const bloqueoFileInput = document.createElement('input');
  bloqueoFileInput.type = 'file';
  bloqueoFileInput.accept = 'image/*,video/*,.gif';
  bloqueoFileInput.style.display = 'none';
  document.body.appendChild(bloqueoFileInput);

  // MODO OSCURO / CLARO
  let temaActual = 'oscuro';
  function aplicarTema(tema) {
    temaActual = tema;
    document.documentElement.setAttribute('data-tema', tema);
  }
  aplicarTema('oscuro');

  // BURBUJA PERSONALIZADA (color, tono y transparencia de TUS mensajes; se guarda en chrome.storage)
  const BURBUJA_BASE = { h: 221, s: 100, tono: 50, alfa: 70 }; // = azul original rgba(0, 89, 255, 0.7)
  let burbuja = Object.assign({}, BURBUJA_BASE);
  let fondoGeminiActual = '';
  let fondoGeminiTipo = 'imagen';   // 'imagen' | 'video' (en video, fondoGeminiActual es una blob URL)
  function avisarCambioFondos() { document.dispatchEvent(new Event('tg-fondos-cambiados')); }
  // tono: 0 = oscuro, 50 = color puro, 100 = blanco
  function burbujaL(b) { return b.tono <= 50 ? 12 + (b.tono / 50) * 38 : 50 + ((b.tono - 50) / 50) * 46; }
  function burbujaCSS(b, conAlfa) { return 'hsla(' + b.h + ', ' + b.s + '%, ' + burbujaL(b).toFixed(1) + '%, ' + (conAlfa === false ? 1 : b.alfa / 100) + ')'; }
  function burbujaTexto(b) { return burbujaL(b) > 68 ? '#1f1f1f' : '#ffffff'; }
  (function () {
    const est = document.createElement('style');
    est.id = 'tg-burbuja-style';
    est.textContent = `
      html.tg-burbuja-pers .user-query-bubble-with-background {
        background-color: var(--tg-burbuja-bg) !important;
        color: var(--tg-burbuja-texto) !important;
      }
      html.tg-burbuja-pers .user-query-bubble-with-background *:not(img):not(svg):not(path) {
        color: var(--tg-burbuja-texto) !important;
      }
    `;
    document.head.appendChild(est);
  })();
  function aplicarBurbuja(guardar) {
    const raiz = document.documentElement;
    raiz.style.setProperty('--tg-burbuja-bg', burbujaCSS(burbuja));
    raiz.style.setProperty('--tg-burbuja-texto', burbujaTexto(burbuja));
    raiz.classList.add('tg-burbuja-pers');
    if (guardar) guardarBurbujaDebounce();
  }
  // los sliders disparan decenas de eventos por segundo: se guarda solo al soltar/pausar
  const guardarBurbujaDebounce = (function () {
    let t = null;
    return function () { clearTimeout(t); t = setTimeout(() => prefsGuardar({ geminiBurbuja: Object.assign({}, burbuja) }), 300); };
  })();
  function restablecerBurbuja() {
    burbuja = Object.assign({}, BURBUJA_BASE);
    const raiz = document.documentElement;
    raiz.classList.remove('tg-burbuja-pers');
    raiz.style.removeProperty('--tg-burbuja-bg');
    raiz.style.removeProperty('--tg-burbuja-texto');
    prefsBorrar('geminiBurbuja');
  }
  // (el tema ya no tiene botón propio: se sigue automáticamente desde el menú "Tema" de Gemini,
  //  ver detectarTemaDelBody más abajo)


  // IMÁGENES DE FONDO: se guardan en su calidad y tamaño originales (sin reducir ni recomprimir).
  function optimizarYLeer(file, reader) { reader['readAsDataURL'](file); }
  // data URL -> blob URL (la regla CSS queda de pocos bytes y el navegador no reparsea megas de texto)
  let ultimoBlobFondo = null;
  function dataUrlABlobUrl(d) {
    try {
      const coma = d.indexOf(',');
      const mime = (d.slice(5, coma).split(';')[0]) || 'image/png';
      const bin = atob(d.slice(coma + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      if (ultimoBlobFondo) { const vieja = ultimoBlobFondo; setTimeout(() => URL.revokeObjectURL(vieja), 3000); }
      ultimoBlobFondo = url;
      return url;
    } catch (e) { return null; }
  }

  // Función para aplicar el fondo y ordenar los mensajes
  function aplicarFondo(base64Data, tipo, sinBlob) {
    tipo = tipo === 'video' ? 'video' : 'imagen';
    let urlImg = base64Data;
    if (tipo === 'imagen' && !sinBlob && typeof base64Data === 'string' && base64Data.indexOf('data:') === 0) {
      const b = dataUrlABlobUrl(base64Data);
      if (b) { urlImg = b; const sonda = new Image(); sonda.onerror = () => aplicarFondo(base64Data, 'imagen', true); sonda.src = b; } // si la página bloquea blob:, vuelve al data URL
    }
    fondoGeminiActual = urlImg;
    fondoGeminiTipo = tipo;
    gestionarVideoGemini(base64Data, tipo);
    avisarCambioFondos();
    // imagen: se pinta en body/.main-container; video: esos quedan transparentes y el <video> fijo se ve detrás
    const reglaFondoBody = tipo === 'video'
      ? `
      html.tg-fondo-video, html.tg-fondo-video body, html.tg-fondo-video .mat-app-background, html.tg-fondo-video .main-container {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
      }`
      : `
      body, .mat-app-background, .main-container {
        background-image: url('${urlImg}') !important;
        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
      }`;
    let styleTag = document.getElementById('gemini-custom-bg-style');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'gemini-custom-bg-style';
      if (!vibesOn) styleTag.setAttribute('media', 'not all');
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = `

      /* TEMA: variables (oscuro por defecto) */

      /* Forzar contenedor y carrusel para que muestren la imagen grande */
     
    
      :root {
        --tg-sidebar-bg: rgba(0, 0, 0, 0.2);
        --tg-resp-bg: rgba(0, 0, 0, 0.8);
        --tg-input-bg: rgba(0, 0, 0, 0.55);
        --tg-texto: #ffffff;
        --tg-texto-suave: rgba(255, 255, 255, 0.7);
      }
      html[data-tema="claro"] {
        --tg-sidebar-bg: rgba(255, 255, 255, 0.35);
        --tg-resp-bg: rgba(255, 255, 255, 0.78);
        --tg-input-bg: rgba(255, 255, 255, 0.65);
        --tg-texto: #1f1f1f;
        --tg-texto-suave: rgba(31, 31, 31, 0.6);
      }

      /* TEMA CLARO: texto oscuro (tu burbuja azul y el código no se tocan) */
      html[data-tema="claro"] bard-sidenav,
      html[data-tema="claro"] bard-sidenav :where(div, span, a, button, mat-icon, gem-icon) {
        color: var(--tg-texto) !important;
      }
      html[data-tema="claro"] .response-container,
      html[data-tema="claro"] .response-container :where(p, li, h1, h2, h3, h4, h5, h6, strong, em, span, a, td, th, blockquote, button, mat-icon, gem-icon):not(code *):not(code-block *) {
        color: var(--tg-texto) !important;
      }
      html[data-tema="claro"] input-area-v2 :where(.picker-primary-text, .picker-secondary-text, button, mat-icon, gem-icon) {
        color: var(--tg-texto) !important;
      }

      /* ANIMACIONES DE BURBUJAS */
      @keyframes burbujaUsuarioEntrada {
        0%   { opacity: 0; transform: translateX(40px) scale(0.85); }
        60%  { transform: translateX(-4px) scale(1.02); }
        100% { opacity: 1; transform: translateX(0) scale(1); }
      }
      @keyframes burbujaRespuestaEntrada {
        0%   { opacity: 0; transform: translateX(-40px) scale(0.85); }
        60%  {transform: translateX(4px) scale(1.02); }
        100% { opacity: 1; transform: translateX(0) scale(1); }
      }

      

      @keyframes fotoEntrada {
        /* SIN fade: la foto va de invisible (visibility) a 100% opaca de golpe y se anima solo con movimiento/escala */
        0% {
            opacity: 0;
            transform: scale(0.01) translateY(30px);
            
          }
          60% {
            opacity: 1;
            transform: scale(1.02) translateY(-8px);
            
          }
          80% {
            transform: scale(0.98) translateY(2px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          
          }
      }

      /* Ocultas hasta que entren en pantalla (el JS les pone data-anim="in") */
      [data-anim="wait"] {
        opacity: 0 !important;
        /* fuera de pantalla / escondidas: sin blur de fondo (no se ve y cuesta pintar) */
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      /* entró a pantalla durante el envío de un prompt: aparece sin repetir su animación */
      html body [data-anim][data-sin-anim][data-sin-anim] { animation: none !important; opacity: 1 !important; visibility: visible !important; }

      /* Tu mensaje: entra desde la derecha con un pequeño rebote */
      .user-query-bubble-with-background {
        transform-origin: bottom right !important;
        transition: transform 0.25s ease, background-color 0.25s ease !important;
      }
      .user-query-bubble-with-background[data-anim="in"] {
        animation: burbujaUsuarioEntrada 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both !important;
        
      }

      /* Tu mensaje RECIÉN ENVIADO: ya NO se anima con CSS; sale volando un clon desde la caja de escribir (ver volarDesdeInput en el JS) */

      /* Fotos adjuntas: aparecen UNA POR UNA (--i = posición, lo pone el JS) */
      .query-file-carousel .scrollable-area > * {
        transform-origin: bottom right !important;
      }
      /* mientras espera su turno: oculta con visibility (nunca con opacity) */
      .query-file-carousel .scrollable-area > [data-anim="wait"] {
        opacity: 1 !important;
        visibility: hidden !important;
      }
      /* ninguna parte de la foto tiene fade ni transición de opacidad */
      .query-file-carousel .scrollable-area > * {
        opacity: 1 !important;
      }
      .query-file-carousel .scrollable-area > * *:not(.file-preview-container) {
        opacity: 1 !important;
        transition-property: none !important;
        animation: none !important;
      }
      .query-file-carousel .scrollable-area > [data-anim="in"] {
        animation: fotoEntrada 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both !important;
        animation-delay: calc(var(--i, 0) * 140ms) !important;
      }

      /* Respuesta: sube suavemente desde abajo */
      .response-container {
        transform-origin: bottom left !important;
        transition: transform 0.3s ease, background-color 0.3s ease !important;
      }
      .response-container[data-anim="in"] {
        animation: burbujaRespuestaEntrada 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both !important;
      }

      /* Respeta a quien tiene desactivadas las animaciones en su sistema */
      @media (prefers-reduced-motion: reduce) {
        [data-anim="wait"] { opacity: 1 !important; }
        .query-file-carousel .scrollable-area > [data-anim="wait"] { visibility: visible !important; }
        .user-query-bubble-with-background,
        .query-file-carousel .scrollable-area > *,
        .response-container {
          animation: none !important;
          transition: none !important;
        }
      }

      ${reglaFondoBody}

      /* Quitar fondos negros, sombras y degradados del contenedor inferior */
      chat-app, .chat-container, 
      infinite-scroller, .infinite-scroller,
      .bottom-container,  .input-gradient {
        background-color: transparent !important;
        background: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
      }

      /* TUS MENSAJES (PROMPTS) PEGADOS A LA DERECHA DEL TODO */
      user-query, 
      .user-query-container, 
      .query-bubble-with-status {
      color: #ffff !important;
        display: flex !important;
        justify-content: flex-end !important;
        align-items: flex-end !important;
        width: 100% !important;
        margin-left: auto !important;
        margin-right: 0 !important;
      }

      /* EFECTO BLUR EN LA BARRA LATERAL (SIDENAV) */
      bard-sidenav, side-navigation-content, .sidenav-with-history-container {
        background-color: var(--tg-sidebar-bg) !important;
        backdrop-filter: blur(14px) !important;
        -webkit-backdrop-filter: blur(14px) !important;
      }

      .user-query-bubble-with-background {
        background-color: rgba(0, 89, 255, 0.7) !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
        border-radius: 18px 18px 4px 18px !important;

        margin-left: auto !important;
        margin-right: 0 !important;
        padding: 12px 16px !important;
        display: inline-block !important;
      }

      /* MIS RESPUESTAS A LA IZQUIERDA */
      model-response, .model-response-container {
        align-items: flex-start !important;
        width: 100% !important;
      }

      .response-container {
        background-color: var(--tg-resp-bg) !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
        border-radius: 18px 18px 18px 4px !important;
        max-width: 800px !important;
        margin: 16px auto 16px 0 !important;
        padding: 24px !important;
        box-sizing: border-box !important;
      }

      /* QUITAR DEGRADADOS DE LA BARRA LATERAL */
      .top-gradient-container,
      .top-gradient,
      .bottom-gradient-container,
      .bottom-gradient {
        display: none !important;
        background: none !important;
        background-image: none !important;
        box-shadow: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      /* Quitar máscaras de desvanecido (fade).
         En vista angosta (media query) Gemini desvanece la parte de arriba del chat con un mask-image en
         .chat-history-scroll-container: ese degradado tapaba lo que hay detrás del header, así que los
         botones y la etiqueta "Gemini Automático" no tenían nada que difuminar (blur). */
      .chat-history-scroll-container,
      .chat-history-scroll-container.lm,
      .chat-history-scroll-container.lm.remove-desktop-scroll-mask,
      .chat-app:has(> top-bar-actions:not(.shrink-to-fit)) .chat-history-scroll-container.lm.remove-desktop-scroll-mask,
      chat-window,
      infinite-scroller,
      .infinite-scroller,
      .overflow-container,
      .chat-history,
      .expandable-section-content,
      side-navigation-content,
      bard-sidenav {
        -webkit-mask-image: none !important;
        mask-image: none !important;
      }

      /* Degradado del área inferior del chat: solo transparente, sin ocultar el input */
      .bottom-container::before,
      .bottom-container::after,
      .input-gradient::before,
      .input-gradient::after {
        background: none !important;
        background-image: none !important;
        box-shadow: none !important;
      }

      /* BLUR EN LA CAJA DE ESCRIBIR (todos los estados: vacío y escribiendo) */
      input-area-v2 .text-input-field,
      input-area-v2 .input-area-fieldset > .text-input-field {
        background: var(--tg-input-bg) !important;
        background-color: var(--tg-input-bg) !important;
        backdrop-filter: blur(10px) !important;
        -webkit-backdrop-filter: blur(10px) !important;
        border-radius: 28px !important;
        box-shadow: none !important;
      }

      /* Texto legible sobre fondos claros */
      input-area-v2 .ql-editor {
        color: var(--tg-texto) !important;
      }
      input-area-v2 .ql-editor.ql-blank::before {
        color: var(--tg-texto-suave) !important;
      }

      /* Contenedores externos e internos transparentes para no tapar el blur */
      .input-area-container,
      input-area-v2,
      input-area-v2 .input-area,
      .input-area-fieldset,
      .text-input-field-main-area,
      .text-input-field_textarea-inner,
      .textarea-wrapper,
      rich-textarea,
      .ql-editor,
      .leading-actions-wrapper,
      .trailing-actions-wrapper,
      .model-picker-container,
      new-model-picker-glow,
      .glow-content,
      .input-buttons-wrapper-bottom {
        background: transparent !important;
        background-color: transparent !important;
        box-shadow: none !important;
      }


      /* ============================================================
   FIX: imágenes adjuntas encimadas con la burbuja azul
   Reemplaza el bloque viejo:
     .query-file-carousel, .scrollable-area { transform: scale(1.5) ... }
   (ese scale se aplicaba 2 veces, porque .scrollable-area está dentro del carrusel,
    y además no ocupaba espacio real, por eso se montaba sobre el texto)
   ============================================================ */

/* 1) Los contenedores .user-query-container (hay 3 anidados) estaban en fila:
      ahora van en columna -> primero las fotos, debajo la burbuja, todo a la derecha */
user-query,
user-query .user-query-container {
  flex-direction: column !important;
  align-items: flex-end !important;
  justify-content: flex-start !important;
}

/* 2) Envoltorio externo de las fotos: ancho completo y sin recorte de 112px */
user-query .file-preview-container:has(> .query-file-carousel) {
  width: 100% !important;
  height: auto !important;
  overflow: visible !important;
  border-radius: 0 !important;
}

/* 3) Carrusel: SIN transform, ocupa su espacio real */
.query-file-carousel,
.query-file-carousel .scrollable-area {
  transform: none !important;
  overflow: visible !important;
}
/* 3b) NADA RECORTA LA ANIMACIÓN DE LAS FOTOS/VIDEOS GRANDES.
       Gemini le pone a cada turno de la conversación content-visibility: auto (+ contain-intrinsic-size), y eso activa
       "paint containment": todo lo que se sale de la caja del turno se recorta. La animación de entrada (fotoEntrada: rebote
       con scale 1.02 / translateY(-8px) y arranque desde abajo) sale unos píxeles de esa caja, y mientras más grande es la foto
       más se nota el corte (sobre todo arriba). Solo se quita en los turnos que traen fotos/videos (así los chats largos sin
       multimedia conservan la optimización de Gemini). */
.conversation-container[data-tg-media],
.conversation-container.turn-content-visibility[data-tg-media] {
  content-visibility: visible !important;
  contain: none !important;
  overflow: visible !important;
}
/* y los contenedores del mensaje que envuelven al carrusel tampoco recortan (la foto con su caja redonda sigue en
   .file-preview-container, que conserva su overflow: hidden para el borde redondeado) */
user-query[data-tg-media],
user-query[data-tg-media] user-query-content,
user-query[data-tg-media] .user-query-container,
user-query[data-tg-media] .query-content,
.query-file-carousel,
user-query-file-carousel,
user-query-file-preview {
  overflow: visible !important;
  contain: none !important;
  content-visibility: visible !important;
}
.query-file-carousel {
  display: flex !important;
  justify-content: flex-end !important;
  width: 100% !important;
  margin: 0 0 10px 0 !important;
}
.query-file-carousel .scrollable-area {
  display: flex !important;
  flex-wrap: wrap !important;          /* si no caben, bajan de línea en vez de montarse */
  justify-content: flex-end !important;
  gap: 10px !important;
  white-space: normal !important;
  max-width: 100% !important;
}
.query-file-carousel .scrollable-area > * {
  flex: 0 0 auto !important;
}

/* 4) TAMAÑO ADAPTATIVO: pocas fotos = grandes, muchas fotos = más pequeñas.
      El JS (ajustarCarruseles) calcula --tam para cada carrusel según cuántas fotos
      tiene y cuánto ancho hay disponible. Si aun así no caben, bajan de línea. */
.query-file-carousel user-query-file-preview .file-preview-container {
  max-width: calc(100vw - 24px) !important;
  width: var(--tam, 168px) !important;
  height: var(--tam, 168px) !important;
  border-radius: 16px !important;
  overflow: hidden !important;
  transition: width 0.25s ease, height 0.25s ease !important;
}
/* 4a) UNA SOLA foto/video: se muestra completa, con su proporción real (sin recortar) y del mayor tamaño que cabe en la interfaz.
       El JS (ajustarCarrusel) mide la imagen y pone --tam-w / --tam-h en el carrusel; mientras no se sabe su medida, queda el cuadrado normal. */
.query-file-carousel .scrollable-area[data-tg-unica] > * {
  max-width: 100% !important;
}
.query-file-carousel .scrollable-area[data-tg-unica] user-query-file-preview .file-preview-container {
  width: var(--tam-w, var(--tam, 168px)) !important;
  height: var(--tam-h, var(--tam, 168px)) !important;
  max-width: 100% !important;
  border-radius: 20px !important;
}
.query-file-carousel .preview-image-button,
.query-file-carousel .preview-image-button.large-preview-image {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  padding: 0 !important;
  border: 0 !important;
  background: none !important;
  display: block !important;
}
.query-file-carousel .preview-image {
  width: 100% !important;
  height: 100% !important;
  max-height: none !important;
  object-fit: cover !important;
  display: block !important;
}

/* 4b) VIDEOS / FOTOS: quitar el degradado oscuro (fade) y la franja cortada.
       Gemini pone encima de la miniatura un ::before con degradado negro y un
       overlay al pasar el mouse; con el tamaño forzado quedaba a medias.
       Aquí se eliminan todos los overlays y el video/miniatura rellena el cuadro completo. */
.query-file-carousel :is(.file-preview-container, .preview-video-button, .preview-image-button,
                         .video-preview-img-container, .new-file-preview-file, .embedded-video-thumbnail)::before,
.query-file-carousel :is(.file-preview-container, .preview-video-button, .preview-image-button,
                         .video-preview-img-container, .new-file-preview-file, .embedded-video-thumbnail)::after {
  content: none !important;
  display: none !important;
  background: none !important;
  transition: none !important;
}
.query-file-carousel .scrollable-area * {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  filter: none !important;
  -webkit-mask-image: none !important;
  mask-image: none !important;
}
.query-file-carousel .preview-video-button,
.query-file-carousel .preview-video-button.large-preview-video {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  padding: 0 !important;
  border: 0 !important;
  background: none !important;
  display: block !important;
  position: relative !important;
  overflow: hidden !important;
}
.query-file-carousel .video-preview-img-container {
  display: block !important;
  position: relative !important;
  width: 100% !important;
  height: 100% !important;
}
.query-file-carousel .video-preview-img-container img,
.query-file-carousel .preview-video-button > img,
.query-file-carousel .preview-video-button video {
  width: 100% !important;
  height: 100% !important;
  max-height: none !important;
  object-fit: cover !important;
  display: block !important;
  border-radius: 0 !important;
}

/* 4c) MENSAJES LARGOS (colapsados): camuflar el degradado y el botón de "expandir".
       Gemini tapa el final de la última línea con un degradado oscuro (.luminous-expand-fade)
       y un botón con fondo oscuro (.luminous-toggle-pill). Aquí:
       - se quita el degradado y el fondo del botón (queda solo la flechita)
       - el texto de la última línea se desvanece hacia el color REAL de la burbuja con una máscara,
         así no hay ningún bloque de otro color encima. */
.user-query-bubble-with-background .luminous-expand-fade {
  display: none !important;
}
.user-query-bubble-with-background .luminous-toggle-pill,
.user-query-bubble-with-background .luminous-toggle-button {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  color: #ffffff !important;
}
.user-query-bubble-with-background .luminous-toggle-pill gem-icon,
.user-query-bubble-with-background .luminous-toggle-pill mat-icon {
  color: #ffffff !important;
}
.user-query-bubble-with-background:has(.luminous-toggle-container) .query-text.collapsed {
  -webkit-mask-image:
    linear-gradient(#000, #000),
    linear-gradient(to right, #000 calc(100% - 5.5rem), transparent calc(100% - 2.2rem));
  mask-image:
    linear-gradient(#000, #000),
    linear-gradient(to right, #000 calc(100% - 5.5rem), transparent calc(100% - 2.2rem));
  -webkit-mask-size: 100% calc(100% - var(--line-height, 1.5em)), 100% var(--line-height, 1.5em);
  mask-size: 100% calc(100% - var(--line-height, 1.5em)), 100% var(--line-height, 1.5em);
  -webkit-mask-position: top, bottom;
  mask-position: top, bottom;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

/* 6) BARRA SUPERIOR DERECHA
       - se oculta el botón "Actualizar" (upsell)
       - el botón de los 3 puntitos recibe fondo redondo con blur, igual que la caja de escribir */
top-bar-actions .buttons-container.adv-upsell,
top-bar-actions g1-dynamic-upsell-button {
  display: none !important;
}
/* mismo estilo redondo para TODOS los botones de icono de la barra superior:
   3 puntitos, lápiz de "nuevo chat" y menú hamburguesa (esquina izquierda en ventana angosta) */
.top-bar-actions:not(.lm-enabled) button.mat-mdc-icon-button:not(.lm-enabled),
.side-nav-menu-button:not(.lm-enabled) button.mat-mdc-icon-button:not(.lm-enabled),
chat-app-side-nav-menu-button:not(.lm-enabled) button.mat-mdc-icon-button:not(.lm-enabled) {
  width: 44px !important;
  height: 44px !important;
  padding: 0 !important;
  border-radius: 50% !important;
  background: var(--tg-input-bg) !important;
  background-color: var(--tg-input-bg) !important;
  backdrop-filter: blur(10px) !important;
  -webkit-backdrop-filter: blur(10px) !important;
  box-shadow: none !important;
  overflow: hidden !important;
  align-items: center !important;
  justify-content: center !important;
  transition: transform 0.2s ease !important;
}
/* (sin display: Gemini oculta algunos de estos botones con display:none y así se respeta) */
top-bar-actions conversation-actions-icon button.mat-mdc-icon-button {
  display: inline-flex !important;
}

top-bar-actions button.mat-mdc-icon-button .mat-mdc-button-persistent-ripple,
top-bar-actions button.mat-mdc-icon-button .mat-mdc-button-ripple,
.side-nav-menu-button button.mat-mdc-icon-button .mat-mdc-button-persistent-ripple,
.side-nav-menu-button button.mat-mdc-icon-button .mat-mdc-button-ripple {
  border-radius: 50% !important;
}
top-bar-actions button.mat-mdc-icon-button mat-icon,
top-bar-actions button.mat-mdc-icon-button gem-icon,
.side-nav-menu-button button.mat-mdc-icon-button mat-icon,
.side-nav-menu-button button.mat-mdc-icon-button gem-icon {
  color: var(--tg-texto) !important;
}

/* 6b) ETIQUETA "Gemini Automático" (selector de modo de la barra superior, vista angosta):
       misma píldora redonda translúcida que los botones de arriba */

top-bar-actions .left-section button.mat-mdc-button,
top-bar-actions .center-section button.mat-mdc-button {
  min-height: 44px !important;
  height: 44px !important;
  padding: 0 16px !important;
  border-radius: 9999px !important;
  background: var(--tg-input-bg) !important;
  background-color: var(--tg-input-bg) !important;
  backdrop-filter: blur(10px) !important;
  -webkit-backdrop-filter: blur(10px) !important;
  box-shadow: none !important;
  overflow: hidden !important;
  transition: transform 0.2s ease !important;
}
top-bar-actions bard-mode-switcher button:hover,
top-bar-actions [data-test-id="bard-mode-menu-button"]:hover {
  transform: scale(1.04) !important;
}
top-bar-actions bard-mode-switcher button .mat-mdc-button-persistent-ripple,
top-bar-actions bard-mode-switcher button .mat-mdc-button-ripple {
  border-radius: 9999px !important;
}
top-bar-actions bard-mode-switcher button,
top-bar-actions bard-mode-switcher button :where(span, mat-icon, gem-icon) {
  color: var(--tg-texto) !important;
}

/* 6c) ETIQUETA "Gemini Automático" DEL HEADER (vista angosta): el selector de modo aparece fuera de la caja de escribir
       (junto al menú hamburguesa). Todo selector de modo que NO esté dentro de input-area-v2 recibe la misma píldora
       redonda con fondo translúcido y blur que los demás botones del header. */
bard-mode-switcher:not(:is(input-area-v2 *)) :is(.pill-ui-logo-container, .gem-menu-redesign) {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border: 0 !important;
}
bard-mode-switcher:not(:is(input-area-v2 *)) button
 {
  display: inline-flex !important;
  align-items: center !important;
  min-height: 44px !important;
  height: 44px !important;
  padding: 0 16px !important;
  border-radius: 9999px !important;
  border: 0 !important;
  background: var(--tg-input-bg) !important;
  background-color: var(--tg-input-bg) !important;
  background-image: none !important;
  backdrop-filter: blur(10px) !important;
  -webkit-backdrop-filter: blur(10px) !important;
  box-shadow: none !important;
  overflow: hidden !important;
  transition: transform 0.2s ease !important;
}
bard-mode-switcher:not(:is(input-area-v2 *)) button:hover {
  transform: scale(1.04) !important;
}
bard-mode-switcher:not(:is(input-area-v2 *)) button :is(.mat-mdc-button-persistent-ripple, .mdc-button__ripple, .mat-mdc-button-ripple) {
  border-radius: 9999px !important;
}
bard-mode-switcher:not(:is(input-area-v2 *)) button :is(.picker-primary-text, .picker-secondary-text, span, mat-icon, gem-icon) {
  color: var(--tg-texto) !important;
}
bard-mode-switcher:not(:is(input-area-v2 *)) button .picker-secondary-text {
  opacity: 0.7;
}

/* 6d) VISTA ANGOSTA (media query de Gemini): header y menú lateral */
/* una sola capa de fondo en la etiqueta: todo lo que la rodea queda sin fondo (el JS marca además cualquier capa opaca extra) */
.side-nav-menu-button,
.side-nav-menu-button.with-pill-ui,
top-bar-actions,
top-bar-actions .top-bar-actions,
top-bar-actions .left-section,
top-bar-actions .center-section,
bard-mode-switcher:not(:is(input-area-v2 *)),
bard-mode-switcher:not(:is(input-area-v2 *)) :is(.mdc-button__label, .logo-pill-label-container, .input-area-switch-label) {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
[data-tg-sin-fondo] {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  border-color: transparent !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
/* MENÚ LATERAL: estas reglas SOLO aplican en escritorio; en vista angosta (9:16) no se toca el menú lateral */
@media (min-width: 960px) {
.mat-drawer.mat-sidenav,
mat-sidenav,
[data-tg-capa="blur"] {
  background: var(--tg-sidebar-bg) !important;
  background-color: var(--tg-sidebar-bg) !important;
  background-image: none !important;
  -webkit-backdrop-filter: blur(14px) !important;
  backdrop-filter: blur(14px) !important;
}
/* una sola capa con blur: las de dentro quedan sin fondo (un blur dentro de otro no ve la imagen de fondo) */
.mat-drawer.mat-sidenav .mat-drawer-inner-container,
.mat-drawer.mat-sidenav bard-sidenav,
.mat-drawer.mat-sidenav side-navigation-content,
.mat-drawer.mat-sidenav .sidenav-with-history-container,
mat-sidenav bard-sidenav,
mat-sidenav side-navigation-content,
mat-sidenav .sidenav-with-history-container,
[data-tg-capa="limpia"] {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
}
/* DIVS DE GEMINI QUE TAPAN EL FADE: sin fondo ni degradé propio (los botones sí se quedan, solo se les quita lo de los contenedores) */
.lm-glow { display: none !important; }
top-bar-actions, top-bar-actions .top-bar-actions, top-bar-actions .left-section, top-bar-actions .center-section,
top-bar-actions .right-section, top-bar-actions .buttons-container,
.side-nav-menu-button, .side-nav-menu-button .menu-button-wrapper, chat-app-side-nav-menu-button, side-nav-menu-button,
.top-bar-actions::before, .top-bar-actions::after, top-bar-actions::before, top-bar-actions::after {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
  -webkit-mask-image: none !important;
  mask-image: none !important;
}
/* botones del header POR ENCIMA del fade (el fade queda detrás) */
.side-nav-menu-button, top-bar-actions { z-index: 6 !important; }

/* HEADER EN VISTA ANGOSTA: todo en una fila, centrado vertical, mismo margen a izquierda y derecha y mismo espacio entre piezas */
@media (max-width: 959.98px) {
  top-bar-actions .top-bar-actions {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    column-gap: 12px !important;
    padding-inline: 12px !important;
    box-sizing: border-box !important;
  }
  top-bar-actions .left-section {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    margin: 0 !important;
  }
  top-bar-actions .left-section > *,
  top-bar-actions .right-section > * { margin-block: 0 !important; align-self: center !important; }
  top-bar-actions .left-section bard-mode-switcher,
  .side-nav-menu-button bard-mode-switcher { margin-inline-start: 0 !important; }
  .side-nav-menu-button {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    margin: 0 !important;
  }
  /* el aro blanco de foco del botón de menú no debe verse pegado a la píldora */
  .side-nav-menu-button button:focus, .side-nav-menu-button button:focus-visible { outline: none !important; }
  top-bar-actions .right-section {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    margin: 0 !important;
  }
  /* sin barra de scroll visible en vista angosta: reserva ~15px a la derecha, recorta los botones del header y se les monta encima */
  html, body, chat-window, main, infinite-scroller, #chat-history, .chat-history, .chat-history-scroll-container {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }
  html::-webkit-scrollbar, body::-webkit-scrollbar, chat-window::-webkit-scrollbar, main::-webkit-scrollbar,
  infinite-scroller::-webkit-scrollbar, #chat-history::-webkit-scrollbar, .chat-history::-webkit-scrollbar,
  .chat-history-scroll-container::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
  /* el header no debe recortar a sus botones */
  top-bar-actions, top-bar-actions .top-bar-actions, top-bar-actions .right-section, top-bar-actions .left-section { overflow: visible !important; }
  top-bar-actions .right-section .buttons-container:not(:has(button)),
  top-bar-actions .right-section .buttons-container.hidden { display: none !important; }
  /* sin aro blanco de foco en los botones del header */
  top-bar-actions button:focus-visible, top-bar-actions button:focus { outline: none !important; box-shadow: none !important; }
  top-bar-actions .mat-focus-indicator::before, top-bar-actions .mat-focus-indicator::after { border: 0 !important; display: none !important; }
  top-bar-actions .buttons-container:not(.hidden):not(:empty) {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    margin: 0 !important;
  }
  /* VISTA ANGOSTA: el chat sube hasta topar arriba del todo (top: 0).
     Gemini deja 68px de padding-top en <chat-app> para el header, pero el header (botón de menú y botones de arriba) ya es
     position:fixed, así que flota encima del chat y no necesita ese hueco. Se quita el hueco y esos 68px pasan al scroller
     del chat: el primer mensaje arranca debajo del header y, al hacer scroll, los mensajes se pierden por detrás de él (con el fade).
     OJO: NO se toca la altura de mat-sidenav-container / side-navigation-v2: Gemini los deja colapsados (height:0; z-index:987) y con
     fondo opaco, y si se estiran tapan TODA la pantalla (pantalla negra). Tampoco se cambia el position del header (ya es fixed). */
  chat-app { padding-top: 0 !important; }
  infinite-scroller.chat-history { padding-top: 68px !important; scroll-padding-top: 68px !important; }
}

/* 7) IA PROCESANDO EL PROMPT: sin la caja grande oscura.
       "Procesando" = el contenedor aún no tiene texto de respuesta ni el pie .response-footer.complete.
       Mientras tanto la caja desaparece y solo queda una pastillita pequeña con los tres puntitos
       animados, pegada a la izquierda (donde irá la respuesta). Cuando llega el texto, la caja
       normal de la respuesta vuelve a aparecer sola. */
.response-container[data-tg-cargando][data-tg-cargando] {
  background: transparent !important;
  background-color: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  box-shadow: none !important;
  border: 0 !important;
  padding: 0 !important;
  width: fit-content !important;
  max-width: 100% !important;
  min-height: 0 !important;
  margin: 12px auto 12px 0 !important;
}
/* LOS TRES PUNTITOS DE CARGA: se buscan donde estén (no dependen de .response-container).
   - el propio <thinking-dots-animation> es la burbuja: mismo estilo que las respuestas, a la izquierda
   - el JS (marcarPuntosCarga) marca con data-tg-puntos a todos sus contenedores para quitarles el centrado
     de Gemini (margin auto / max-width) y pegarlos a la izquierda; al desaparecer los puntos se desmarcan */
thinking-dots-animation:not(.response-container-header *) {
  display: inline-flex !important;
  flex: 0 0 auto !important;
  width: max-content !important;
  min-width: 72px !important;
  max-width: 100% !important;
  height: auto !important;
  align-items: center !important;
  justify-content: center !important;
  align-self: flex-start !important;
  position: static !important;
  transform: none !important;
  opacity: 1 !important;
  visibility: visible !important;
  margin: 12px auto 12px 0 !important;
  padding: 16px 22px !important;
  box-sizing: border-box !important;
  border-radius: 18px 18px 18px 4px !important;
  background: var(--tg-resp-bg) !important;
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  color: var(--tg-texto) !important;
}
[data-tg-puntos] {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-start !important;
  width: fit-content !important;
  max-width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 auto 0 0 !important;
  padding: 0 !important;
  overflow: visible !important;
  opacity: 1 !important;
  visibility: visible !important;
  transform: none !important;
  background: none !important;
  box-shadow: none !important;
  border: 0 !important;
  -webkit-mask-image: none !important;
  mask-image: none !important;
}

/* TEXTO DE ESTADO JUNTO A LOS PUNTITOS ("Organizing project focus shift"...): todo va DENTRO de una sola burbuja.
   El JS marca con data-tg-burbuja al contenedor más chico que trae los puntitos y el texto. */
[data-tg-puntos][data-tg-burbuja] {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 14px !important;
  width: fit-content !important;
  max-width: min(100%, 640px) !important;
  margin: 12px auto 12px 0 !important;
  padding: 16px 22px !important;
  box-sizing: border-box !important;
  border-radius: 18px 18px 18px 4px !important;
  background: var(--tg-resp-bg) !important;
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  color: var(--tg-texto) !important;
  white-space: nowrap !important;
  flex-wrap: nowrap !important;
}
[data-tg-burbuja] *:not(thinking-dots-animation *) {
  white-space: nowrap !important;
  width: auto !important;
  max-width: none !important;
  min-width: 0 !important;
  flex: 0 0 auto !important;
}
[data-tg-burbuja] thinking-dots-animation:not(.response-container-header *) {
  background: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  padding: 0 !important;
  margin: 0 !important;
  min-width: 0 !important;
  flex: 0 0 auto !important;
}
[data-tg-burbuja] :not(thinking-dots-animation):not(thinking-dots-animation *) {
  color: var(--tg-texto) !important;
  -webkit-text-fill-color: var(--tg-texto) !important;
  text-align: left !important;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}
/* contenedores de controles/estado vacíos: que no ocupen espacio */
.response-container[data-tg-cargando][data-tg-cargando] .response-container-header-controls {
  display: none !important;
}
/* contenido vacío de la respuesta: que no ocupe espacio ni muestre nada hasta que llegue el texto */
.response-container[data-tg-cargando][data-tg-cargando] :is(.presented-response-container, .response-container-content) {
  margin: 0 !important;
  padding: 0 !important;
  min-height: 0 !important;
}

/* 8) "Gemini Automático" (selector de modo dentro de la caja de escribir): sin fondo ni blur propio */
input-area-v2 bard-mode-switcher button,
input-area-v2 bard-mode-switcher .pill-ui-logo-container,
input-area-v2 bard-mode-switcher .mdc-button__ripple,
input-area-v2 bard-mode-switcher .mat-mdc-button-persistent-ripple,
input-area-v2 .model-picker-container button,
input-area-v2 new-model-picker-glow .glow-content {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  box-shadow: none !important;
  border: 0 !important;
}

/* 9) BOTONES COPIAR Y EDITAR DEBAJO DE TU MENSAJE: mismo fondo redondo con blur que los botones de la barra superior */
.luminous-actions-container {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 8px !important;
  /* aparecen/desaparecen con escala desde la derecha */
  transform-origin: right center !important;
  transform: scale(0) !important;
  opacity: 0 !important;
  visibility: visible !important;
  pointer-events: none !important;
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease !important;
}
user-query:hover .luminous-actions-container,
.luminous-actions-container:hover,
.luminous-actions-container:focus-within {
  transform: scale(1) !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}
/* en pantallas táctiles (sin hover) se quedan siempre visibles */
@media (hover: none) {
  .luminous-actions-container { transform: scale(1) !important; opacity: 1 !important; pointer-events: auto !important; }
}
@media (prefers-reduced-motion: reduce) {
  .luminous-actions-container { transition: none !important; }
}
gem-icon-button[data-test-id="prompt-copy-button"],
gem-icon-button[data-test-id="prompt-edit-button"] {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 50% !important;
  background: var(--tg-input-bg) !important;
  background-color: var(--tg-input-bg) !important;
  backdrop-filter: blur(10px) !important;
  -webkit-backdrop-filter: blur(10px) !important;
  box-shadow: none !important;
  overflow: hidden !important;
  transition: transform 0.2s ease !important;
}
gem-icon-button[data-test-id="prompt-copy-button"] button,
gem-icon-button[data-test-id="prompt-edit-button"] button {
  width: 36px !important;
  height: 36px !important;
  padding: 0 !important;
  border-radius: 50% !important;
  background: transparent !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}
gem-icon-button[data-test-id="prompt-copy-button"]:hover,
gem-icon-button[data-test-id="prompt-edit-button"]:hover {
  transform: scale(1.08) !important;
}
gem-icon-button[data-test-id="prompt-copy-button"] .mat-mdc-button-persistent-ripple,
gem-icon-button[data-test-id="prompt-copy-button"] .mat-mdc-button-ripple,
gem-icon-button[data-test-id="prompt-edit-button"] .mat-mdc-button-persistent-ripple,
gem-icon-button[data-test-id="prompt-edit-button"] .mat-mdc-button-ripple {
  border-radius: 50% !important;
}
gem-icon-button[data-test-id="prompt-copy-button"] :where(mat-icon, gem-icon),
gem-icon-button[data-test-id="prompt-edit-button"] :where(mat-icon, gem-icon) {
  color: var(--tg-texto) !important;
}

/* 10) "CREANDO TU IMAGEN…": texto en UNA sola línea y dentro de la burbuja (junto al indicador de carga).
       El JS (marcarCreando) marca el texto con data-tg-creando-texto y su contenedor con data-tg-creando-caja. */
[data-tg-creando-caja] {
  display: inline-flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 12px !important;
  width: max-content !important;
  max-width: 100% !important;
  height: auto !important;
  padding: 10px 20px 10px 12px !important;
  box-sizing: border-box !important;
  border-radius: 18px 18px 18px 4px !important;
  background: var(--tg-resp-bg) !important;
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  color: var(--tg-texto) !important;
}
/* con la burbuja de los puntitos ya identificada: la caja no pinta nada y la burbuja contiene punto(s) + texto en una línea */
[data-tg-creando-caja][data-tg-creando-unica] {
  background: transparent !important;
  background-color: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  padding: 0 !important;
  gap: 0 !important;
  border-radius: 0 !important;
}
[data-tg-creando-burbuja] {
  display: inline-flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 12px !important;
  width: max-content !important;
  max-width: 100% !important;
  height: auto !important;
  padding: 14px 22px 14px 18px !important;
  box-sizing: border-box !important;
  border-radius: 18px 18px 18px 4px !important;
  background: var(--tg-resp-bg) !important;
  background-color: var(--tg-resp-bg) !important;
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  box-shadow: none !important;
  color: var(--tg-texto) !important;
}
[data-tg-creando-caja]:not([data-tg-creando-unica]) > :not([data-tg-creando-texto]) {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  flex: 0 0 auto !important;
}
[data-tg-creando-texto],
[data-tg-creando-texto] * {
  white-space: nowrap !important;
  width: auto !important;
  max-width: none !important;
  margin: 0 !important;
  color: var(--tg-texto) !important;
}
[data-tg-creando-texto] { flex: 0 0 auto !important; }

/* 5) La burbuja azul nunca se sale de la pantalla */
.user-query-bubble-with-background {
  max-width: min(85%, 640px) !important;
  overflow-wrap: anywhere !important;
}

/* VISTA ANGOSTA: la burbuja de respuesta no debe quedar pegada a los bordes */
@media (max-width: 959.98px) {
  /* ANCHO MÁXIMO DE LAS BURBUJAS EN VISTA ANGOSTA (cambia estos dos números para ajustarlo) */
  :root {
    --tg-ancho-usuario: 76%;   /* tus mensajes: % del ancho del chat */
    --tg-ancho-ia: 86%;        /* respuestas de la IA */
  }
  .response-container {
    margin: 16px auto 16px 12px !important; /* pegada a la izquierda con 12px de aire */
    max-width: var(--tg-ancho-ia) !important;
    padding: 18px !important;              /* un poco menos de relleno interno */
  }
  /* tus mensajes: más angostos y con el mismo aire de 12px a la derecha que el header */
  .user-query-bubble-with-background {
    max-width: var(--tg-ancho-usuario) !important;
    margin-right: 12px !important;
  }
  /* la burbuja de los tres puntitos también con su margen izquierdo */
  thinking-dots-animation:not(.response-container-header *) {
    margin: 12px 12px 12px 12px !important;
  }
  [data-tg-puntos][data-tg-burbuja] { margin: 12px 12px 12px 12px !important; }
  /* imágenes y contenido multimedia: se alinean con la burbuja del mensaje (lo hace el JS alinearMultimedia, midiendo) */
  /* el prompt, un poco más abajo en vista angosta */
  html input-container { padding-bottom: 8px !important; }
}

p.gds-body-s.ng-star-inserted {
    text-shadow: 3px 3px 10px #000000;
    color: white;
}

    `;
  }

  const VIBES_ESTILOS = ['tg-ligero-style', 'tg-bloqueo-style', 'gemini-custom-bg-style', 'tg-burbuja-style', 'tg-vp-style',
    'tg-puntos-retraso-style', 'tg-fade-style', 'tg-fondo-cero-style', 'tg-menus-style', 'tg-colapso-style']; // (tg-lenis-style NO va aquí: el scroll suave no depende de Vibes)
  function aplicarVibes() {
    document.documentElement.classList.toggle('tg-vibes-off', !vibesOn);
    VIBES_ESTILOS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (vibesOn) el.removeAttribute('media'); else el.setAttribute('media', 'not all');
    });
    try {
      destruirLenis(); mantenerLenis(); // el scroller real cambia según Vibes: se vuelve a elegir (Lenis depende solo de su propio interruptor)
      if (!vibesOn) {
        document.querySelectorAll('[data-tg-burbuja]').forEach((e) => e.style.removeProperty('translate'));
        document.querySelectorAll('video.tg-medio-video').forEach((v) => { if (v.closest('#tg-fondo-video')) v.pause(); });
      } else {
        registrarBurbujas(document.body);
        document.querySelectorAll('#tg-fondo-video video.tg-medio-video').forEach((v) => { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); });
      }
      Tareas.marcar('layout'); Tareas.marcar('cero'); Tareas.marcar('menuLateral'); Tareas.marcar('colapso');
    } catch (e) { /* aún no está todo creado: se vuelve a llamar al final de la carga */ }
  }
  function cambiarVibes(v) {
    vibesOn = !!v;
    try { localStorage.setItem(VIBES_CLAVE_LS, vibesOn ? '1' : '0'); } catch (e) { /* sin localStorage */ }
    prefsGuardar({ geminiVibesActivo: vibesOn });
    aplicarVibes();
  }

  // Aplica preferencias (las guardadas, las inyectadas por Dart al inicio o las que Dart mande después con tgAplicarPreferencias).
  // Acepta valores parciales: solo toca lo que viene en el objeto.
  function aplicarPreferencias(result) {
    if (!result || typeof result !== 'object') return;
    if (result.geminiPinBloqueo) {
      bloqueoPinHash = String(result.geminiPinBloqueo);
    }
    if (result.geminiVibesActivo === true || result.geminiVibesActivo === false || result.geminiVibesActivo === 'true' || result.geminiVibesActivo === 'false') {
      const nv = result.geminiVibesActivo === true || result.geminiVibesActivo === 'true';
      if (nv !== vibesOn) {
        vibesOn = nv;
        try { localStorage.setItem(VIBES_CLAVE_LS, nv ? '1' : '0'); } catch (e) { /* sin localStorage */ }
        aplicarVibes();
      }
    }
    const activo = result.geminiBloqueoActivo;
    if (activo === true || activo === false || activo === 'true' || activo === 'false') {
      try { localStorage.setItem(BLOQUEO_CLAVE_LS, (activo === true || activo === 'true') ? '1' : '0'); } catch (e) { /* sin localStorage */ }
    }
    if (result.geminiTema === 'claro' || result.geminiTema === 'oscuro') {
      aplicarTema(result.geminiTema);
    }
    if (result.geminiPerfil === 'auto' || result.geminiPerfil === 'maximo' || result.geminiPerfil === 'ligero') {
      perfilModo = result.geminiPerfil;
      try { localStorage.setItem(PERFIL_CLAVE_LS, perfilModo); } catch (e) { /* sin localStorage */ }
      aplicarPerfil();
    }
    if (result.geminiSinBlur === true || result.geminiSinBlur === false || result.geminiSinBlur === 'true' || result.geminiSinBlur === 'false') {
      sinBlur = result.geminiSinBlur === true || result.geminiSinBlur === 'true';
      try { localStorage.setItem(SINBLUR_CLAVE_LS, sinBlur ? '1' : '0'); } catch (e) { /* sin localStorage */ }
      aplicarSinBlur();
    }
    if (result.geminiLenis === true || result.geminiLenis === false || result.geminiLenis === 'true' || result.geminiLenis === 'false') {
      const v = result.geminiLenis === true || result.geminiLenis === 'true';
      if (v !== lenisUsuario) {
        lenisUsuario = v;
        try { localStorage.setItem(LENIS_CLAVE_LS, v ? '1' : '0'); } catch (e) { /* sin localStorage */ }
        if (!v) { try { destruirLenis(); } catch (e) { /* aún no iniciado */ } }
      }
    }
    let b = result.geminiBurbuja;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } } // Dart puede mandarla como texto JSON
    if (b && typeof b === 'object') {
      burbuja = Object.assign({}, BURBUJA_BASE, b);
      aplicarBurbuja(false);
    }
    if (result.geminiFondoTipo === 'video') {
      bdLeer('gemini').then((blob) => {
        if (blob) aplicarFondo(nuevaUrlVideo('gemini', blob), 'video');
      }).catch((err) => console.error('No se pudo leer el video de fondo de Gemini:', err));
    } else if (result.geminiFondo) {
      aplicarFondo(result.geminiFondo);
    }
    if (result.geminiFondoBloqueoTipo === 'video') {
      bdLeer('bloqueo').then((blob) => {
        if (!blob) return;
        bloqueoFondoPersonalizado = nuevaUrlVideo('bloqueo', blob);
        bloqueoFondoTipo = 'video';
        avisarCambioFondos();
        aplicarFondoBloqueo(document.getElementById('tg-bloqueo-fondo'));
      }).catch((err) => console.error('No se pudo leer el video de fondo del bloqueo:', err));
    } else if (result.geminiFondoBloqueo) {
      bloqueoFondoPersonalizado = result.geminiFondoBloqueo;
      bloqueoFondoTipo = 'imagen';
      avisarCambioFondos();
      aplicarFondoBloqueo(document.getElementById('tg-bloqueo-fondo'));
    }
  }
  // para que Dart mande valores en cualquier momento: controller.evaluateJavascript(source: 'window.tgAplicarPreferencias({...})')
  window.tgAplicarPreferencias = function (obj) {
    try { aplicarPreferencias(typeof obj === 'string' ? JSON.parse(obj) : obj); } catch (e) { console.warn('[tg] tgAplicarPreferencias:', e); }
  };

  // Cargar preferencias guardadas / inyectadas
  prefsLeer(['geminiFondo', 'geminiFondoBloqueo', 'geminiTema', 'geminiPinBloqueo', 'geminiBurbuja', 'geminiBloqueoActivo', 'geminiFondoTipo', 'geminiFondoBloqueoTipo', 'geminiPerfil', 'geminiLenis', 'geminiSinBlur', 'geminiVibesActivo'], aplicarPreferencias);

  // Evento al seleccionar imagen o video
  const esVideoArchivo = (f) => !!f && (/^video\//i.test(f.type) || /\.(mp4|webm|mov|m4v|ogv)$/i.test(f.name || ''));
  const almacenLocal = () => almacenPrefs; // siempre existe: guarda en Flutter y/o chrome.storage

  // video: el archivo va a IndexedDB; en chrome.storage solo queda la marca del tipo (y se borra la imagen anterior)
  async function cambiarFondoVideo(file, destino) {
    if (file.size > VIDEO_MAX_MB * 1024 * 1024) {
      avisarTg('El video pesa más de ' + VIDEO_MAX_MB + ' MB. Elige uno más liviano (por ejemplo, comprímelo o recórtalo).');
      return;
    }
    try {
      await bdGuardar(destino, file);
    } catch (err) {
      console.error('No se pudo guardar el video de fondo:', err);
      avisarTg('No se pudo guardar el video (¿falta espacio en el navegador?).');
      return;
    }
    const url = nuevaUrlVideo(destino, file);
    const alm = almacenLocal();
    if (destino === 'gemini') {
      aplicarFondo(url, 'video');
      if (alm) { alm.set({ geminiFondoTipo: 'video' }); alm.remove('geminiFondo'); }
    } else {
      bloqueoFondoPersonalizado = url;
      bloqueoFondoTipo = 'video';
      avisarCambioFondos();
      aplicarFondoBloqueo(document.getElementById('tg-bloqueo-fondo'));
      if (alm) { alm.set({ geminiFondoBloqueoTipo: 'video' }); alm.remove('geminiFondoBloqueo'); }
    }
  }

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    fileInput.value = '';
    if (!file) return;
    if (esVideoArchivo(file)) { cambiarFondoVideo(file, 'gemini'); return; }

    const reader = new FileReader();
    reader.onload = function (evt) {
      const base64Data = evt.target.result;
      if (typeof base64Data !== 'string') {
        console.error('No se pudo leer la imagen de fondo seleccionada.');
        return;
      }
      aplicarFondo(base64Data, 'imagen');
      bdBorrar('gemini').catch(() => {}); // si antes había un video, se libera
      liberarUrlVideo('gemini');

      const alm = almacenLocal();
      if (alm) {
        alm.set({ geminiFondo: base64Data, geminiFondoTipo: 'imagen' }, function () {
          if (errorAlmacen()) {
            console.error('No se pudo guardar la imagen de fondo:', errorAlmacen().message);
          }
        });
      }
    };
    reader.onerror = () => console.error('Error al leer la imagen de fondo seleccionada:', reader.error);
    optimizarYLeer(file, reader);
  });

  bloqueoFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    bloqueoFileInput.value = '';
    if (!file) return;
    if (esVideoArchivo(file)) { cambiarFondoVideo(file, 'bloqueo'); return; }

    const reader = new FileReader();
    reader.onload = function () {
      if (typeof reader.result !== 'string') {
        console.error('No se pudo leer la imagen del fondo de bloqueo seleccionada.');
        return;
      }
      bloqueoFondoPersonalizado = reader.result;
      bloqueoFondoTipo = 'imagen';
      avisarCambioFondos();
      aplicarFondoBloqueo(document.getElementById('tg-bloqueo-fondo'));
      bdBorrar('bloqueo').catch(() => {});
      liberarUrlVideo('bloqueo');
      const alm = almacenLocal();
      if (alm) {
        alm.set({ geminiFondoBloqueo: bloqueoFondoPersonalizado, geminiFondoBloqueoTipo: 'imagen' }, function () {
          if (errorAlmacen()) {
            console.error('No se pudo guardar la imagen del fondo de bloqueo:', errorAlmacen().message);
          }
        });
      }
    };
    reader.onerror = () => console.error('Error al leer la imagen del fondo de bloqueo:', reader.error);
    optimizarYLeer(file, reader);
  });

  // ANIMAR BURBUJAS CADA VEZ QUE ENTRAN EN PANTALLA
  // - al salir por completo del campo de la pantalla (scroll) se ocultan (data-anim="wait")
  // - al volver a entrar, tras ESPERA_VISIBLE_MS, se repite su animación de entrada (data-anim="in")
  const SELECTOR_BURBUJAS = '.user-query-bubble-with-background, .response-container, .query-file-carousel .scrollable-area > *';
  const REANIMAR_AL_ENTRAR = true;    // true = fuera del envío, las burbujas se esconden al salir de pantalla y se animan al volver
  const DURACION_ENVIO_MS = 2200;     // mientras dura la animación de enviar el prompt, NO se esconden ni reaparecen las burbujas
  let envioHasta = 0;
  const enEnvio = () => performance.now() < envioHasta;
  // pausa de las animaciones de esconder/reaparecer burbujas (se activa al expandir/contraer una respuesta larga: el cambio de altura mueve todo)
  let colapsoPausaHasta = 0;
  const enPausaColapso = () => performance.now() < colapsoPausaHasta;
  const ESPERA_VISIBLE_MS = 150; // debe seguir visible este tiempo (evita gastar la animación en saltos de scroll)
  const temporizadores = new WeakMap();

  // FOTOS/VIDEOS DE UN MENSAJE RECIÉN ENVIADO: su animación de entrada empieza DESPUÉS de que la burbuja del mensaje termina la suya
  // (el vuelo desde la caja de escribir). Si la burbuja aún vuela, se vuelve a preguntar cada pocos ms; al aterrizar se espera
  // una pausa corta y entonces arranca la animación de las fotos (con su escalonado --i).
  const SELECTOR_MEDIA = '.query-file-carousel .scrollable-area > *';
  const PAUSA_TRAS_BURBUJA_MS = 140;
  function retrasoPorBurbuja(el) {
    if (!el.matches || !el.matches(SELECTOR_MEDIA) || !enEnvio()) return 0;
    const mensaje = el.closest('user-query');
    const burbuja = mensaje && mensaje.querySelector('.user-query-bubble-with-background');
    if (!burbuja) return 0; // mensaje solo con fotos: no hay burbuja que esperar
    if (burbuja._vuelo) return 80; // la burbuja todavía está volando
    // el vuelo de este envío aún no arrancó (la burbuja está por salir): se espera, el límite lo pone enEnvio()
    if (ultimoEnvio && !ultimoEnvio.usado && !sinMovimiento() && burbuja.getAttribute('data-anim') === 'wait') {
      const todos = document.querySelectorAll('user-query');
      if (!todos.length || todos[todos.length - 1] === mensaje) return 80;
    }
    if (burbuja._aterrizoEn) { // ya aterrizó: pausa corta antes de las fotos
      const falta = burbuja._aterrizoEn + PAUSA_TRAS_BURBUJA_MS - performance.now();
      if (falta > 0) return falta;
    }
    return 0;
  }

  // ENVÍO DE UN PROMPT: se guarda dónde estaba la caja de escribir; la burbuja nueva sale desde ahí (una sola vez por envío)
  let ultimoEnvio = null;
  function marcarEnvio() {
    const p = document.querySelector('input-area-v2 .text-input-field') || document.querySelector('input-area-v2');
    if (!p) return;
    const r = p.getBoundingClientRect();
    if (r.width < 1) return;
    envioHasta = performance.now() + DURACION_ENVIO_MS;
    ultimoEnvio = { t: performance.now(), x: r.left + Math.min(180, r.width / 3), y: r.top + r.height / 2, usado: false };
    puntosInicio = 0; puntosSinVerDesde = 0; envioParaScroll = performance.now(); usuarioMovioScroll = false; // nuevo envío: se vuelve a seguir mensaje y respuesta
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    if (e.target && e.target.closest && e.target.closest('input-area-v2, rich-textarea')) marcarEnvio();
  }, true);
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button.send-button, button[aria-label*="Enviar"], button[aria-label*="Send"]');
    if (b && b.closest('input-area-v2')) marcarEnvio();
  }, true);
  // ============================================================================================
  // SALIDA DESDE LA CAJA DE ESCRIBIR (con un CLON "fantasma", animado 100 % con JS, sin CSS)
  // Por qué no se anima la burbuja real: vive metida dentro de infinite-scroller > ... > user-query > ... > span, y esos
  // contenedores recortan lo que sale de ellos (overflow); además la caja de escribir está en OTRA rama del DOM
  // (input-container), así que la burbuja real nunca puede "viajar" hasta ahí sin cortarse. Y como Gemini hace scroll justo
  // después de enviar, el destino se mueve mientras la animación corre.
  // Solución: se clona la burbuja, el clon vuela en position:fixed colgado de <html> (nada lo recorta, queda por encima de
  // todo) y en CADA fotograma se vuelve a medir dónde está la burbuja real (así sigue el scroll) y se calcula la posición,
  // la escala y el blur del clon a partir de VUELO_KEYFRAMES. Al llegar, el clon se quita y se muestra la real en el mismo
  // instante, sin repetir ninguna animación.
  // ============================================================================================
  const VUELO_MS = 1400;                        // duración total del vuelo (ms)
  const VUELO_EASING = [0.34, 1.56, 0.64, 1];   // cubic-bezier que se aplica ENTRE cada par de keyframes (igual que en CSS)
  const VUELO_Z = '2147482000';                 // por encima del chat, del fade y de la caja de escribir (debajo de bloqueo/panel)
  // KEYFRAMES (equivalen a 0% / 40% / 60% / 100% del @keyframes de CSS):
  //   t       punto de la línea de tiempo (0 a 1)
  //   origen  true = sale de la caja de escribir (el desplazamiento es el vector hasta el input; sigue al input aunque haya scroll)
  //   dx, dy  desplazamiento respecto a donde queda la burbuja, como FRACCIÓN de su ancho / alto (0.3 = 30 %). Si falta = 0
  //   escala  tamaño (1 = el final)
  //   blur    desenfoque en px
  // El último keyframe es donde queda la burbuja real (dx = dy = 0, escala 1, blur 0).
  const VUELO_KEYFRAMES = (typeof window !== 'undefined' && window.VUELO_KEYFRAMES)
    ? window.VUELO_KEYFRAMES
    : ([
  // 0%: translate(var(--tg-dx, 0px), var(--tg-dy, 80px)) scaleX(120%) scaleY(120%); filter: blur(50px);
  { t: 0,   origen: true, dx: 0,   dy: 0.8,   scaleX: 2, scaleY: 0.3, blur: 40, backdropFilter: 0 },

  // 40%: translate(30%, 80%) scaleX(30%) scaleY(30%); filter: blur(100px);
  { t: 0.4, dx: -0.01, dy: -0.1, scaleX: 1, scaleY: 1, blur: 20, },
  { t: 0.41, dx: -.01, dy: 0.2, scaleX: 1, scaleY: 1, blur: 20, },
  { t: 0.43, dx: 0, dy: -0.1, scaleX: 1, scaleY: 1, blur: 10, },
  // 100%: destino final
  { t: 0.7,                 dx: -.05,   dy: 0,   scaleX: 1.1,   scaleY: 1,   blur: 0 },

   { t: 1,                 dx: 0,   dy: 0,   scaleX: 1,   scaleY: 1,   blur: 0 }
]);

  // cubic-bezier(x1, y1, x2, y2) como función (igual que la de CSS: x = tiempo, y = progreso, puede pasarse de 1 = rebote)
  function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = (s) => ((ax * s + bx) * s + cx) * s;
    const Y = (s) => ((ay * s + by) * s + cy) * s;
    const dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let s = x;
      for (let i = 0; i < 8; i++) { // Newton
        const e = X(s) - x;
        if (Math.abs(e) < 1e-6) return Y(s);
        const d = dX(s);
        if (Math.abs(d) < 1e-6) break;
        s -= e / d;
      }
      let lo = 0, hi = 1; // bisección de respaldo
      for (let i = 0; i < 30; i++) { s = (lo + hi) / 2; if (X(s) < x) lo = s; else hi = s; }
      return Y(s);
    };
  }
  const vueloEase = cubicBezier(VUELO_EASING[0], VUELO_EASING[1], VUELO_EASING[2], VUELO_EASING[3]);

  // estado del clon en el instante t (0-1): desplazamiento (px), escala, blur y backdrop-filter. vx/vy = vector hasta la caja de escribir; w/h = tamaño de la burbuja
  function vueloEstado(t, vx, vy, w, h, origBF) {
    const K = (typeof window !== 'undefined' && window.VUELO_KEYFRAMES) ? window.VUELO_KEYFRAMES : VUELO_KEYFRAMES;
    let i = 0;
    while (i < K.length - 2 && t > K[i + 1].t) i++;
    const a = K[i], b = K[i + 1];
    const e = vueloEase(Math.min(1, Math.max(0, (t - a.t) / ((b.t - a.t) || 1))));
    const pos = (k) => {
      if (k.origen) {
        return {
          x: vx + (k.dx ? k.dx * w : 0),
          y: vy + (k.dy ? k.dy * h : 0)
        };
      }
      return {
        x: (k.dx || 0) * w,
        y: (k.dy || 0) * h
      };
    };
    const pa = pos(a), pb = pos(b);
    const L = (u, v) => u + (v - u) * e;
    const getSX = (k) => k.scaleX ?? k.escalaX ?? k.scale ?? k.escala ?? 1;
    const getSY = (k) => k.scaleY ?? k.escalaY ?? k.scale ?? k.escala ?? 1;
    const sX = L(getSX(a), getSX(b));
    const sY = L(getSY(a), getSY(b));

    // Control de backdropFilter / backdrop-filter
    let backdropFilterVal = undefined;
    const hasBF = K.some((k) => k.backdropFilter !== undefined || k['backdrop-filter'] !== undefined || k.backdropBlur !== undefined);
    if (hasBF) {
      const parseBF = (val, fbBlur, fbExtra) => {
        if (val === undefined || val === null) return { blur: fbBlur, extra: fbExtra };
        if (typeof val === 'number') return { blur: val, extra: fbExtra };
        const s = String(val).trim();
        if (!s || s === 'none') return { blur: 0, extra: '', isNone: true };
        const m = s.match(/blur\(\s*([\d.]+)\s*px\s*\)/i);
        if (m) {
          const r = s.replace(/blur\(\s*[\d.]+\s*px\s*\)/i, '').trim();
          return { blur: parseFloat(m[1]), extra: r || fbExtra };
        }
        return { blur: fbBlur, extra: s };
      };
      const defBF = parseBF(origBF, 0, '');
      const aBF = parseBF(a.backdropFilter ?? a['backdrop-filter'] ?? a.backdropBlur, defBF.blur, defBF.extra);
      const bBF = parseBF(b.backdropFilter ?? b['backdrop-filter'] ?? b.backdropBlur, defBF.blur, defBF.extra);
      if (aBF.isNone && bBF.isNone) {
        backdropFilterVal = 'none';
      } else {
        const bfBlur = Math.max(0, L(aBF.blur, bBF.blur));
        const extra = bBF.extra || aBF.extra || '';
        backdropFilterVal = `blur(${Math.round(bfBlur)}px)${extra ? ' ' + extra : ''}`; // entero: cambia menos veces => menos re-rasterizados
      }
    }

    return {
      x: L(pa.x, pb.x),
      y: L(pa.y, pb.y),
      scaleX: sX,
      scaleY: sY,
      escalaX: sX,
      escalaY: sY,
      blur: sinBlur ? 0 : Math.max(0, L(a.blur ?? 0, b.blur ?? 0)) * (perfilLigero() ? 0.5 : 1),
      backdropFilter: sinBlur ? 'none' : backdropFilterVal
    };
  }

  function prepararSalidaDesdeInput(el) {
    if (!ultimoEnvio || ultimoEnvio.usado || performance.now() - ultimoEnvio.t > 6000) return;
    if (!el.matches('.user-query-bubble-with-background')) return;
    if (!vibesOn || sinMovimiento()) return; // sin animaciones: entra con la animación normal (o sin ninguna)
    // solo la burbuja del ÚLTIMO mensaje (al cargar mensajes viejos arriba no debe volar nada)
    const mensaje = el.closest('user-query');
    if (mensaje) {
      const todos = document.querySelectorAll('user-query');
      if (todos.length && todos[todos.length - 1] !== mensaje) return;
    }
    if (!(el.textContent || '').trim()) return; // aún sin contenido: se reintenta (el clon saldría vacío)
    if (window.matchMedia && window.matchMedia('(max-width: 959.98px)').matches) alinearBurbujaUsuario(el);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    ultimoEnvio.usado = true;
    el.setAttribute('data-origen', 'input'); // marca: "esta burbuja salió del input" (la usa el observador de visibilidad)
    volarDesdeInput(el, r, ultimoEnvio);
  }

  function volarDesdeInput(el, r0, origen) {
    // 1) clon de la burbuja, sin ids ni marcas de animación, fuera del scroller
    const g = el.cloneNode(true);
    ['id', 'data-anim', 'data-origen', 'data-sin-anim', 'style'].forEach((a) => g.removeAttribute(a));
    g.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
    g.querySelectorAll('[data-anim], [data-sin-anim]').forEach((e) => { e.removeAttribute('data-anim'); e.removeAttribute('data-sin-anim'); });
    g.setAttribute('aria-hidden', 'true');
    g.inert = true;
    const cs = getComputedStyle(el);
    const origBF = cs.getPropertyValue('backdrop-filter') || cs.getPropertyValue('-webkit-backdrop-filter') || '';
    // !important inline: vence a los !important de la hoja (margin, max-width, transform-origin, transition...)
    const fijar = (k, v) => g.style.setProperty(k, v, 'important');
    fijar('position', 'fixed'); fijar('left', '0'); fijar('top', '0'); fijar('right', 'auto'); fijar('bottom', 'auto');
    fijar('margin', '0'); fijar('box-sizing', 'border-box'); fijar('max-width', 'none'); fijar('max-height', 'none');
    fijar('width', r0.width + 'px'); fijar('height', r0.height + 'px');
    fijar('z-index', VUELO_Z); fijar('pointer-events', 'none');
    fijar('transform-origin', 'center center'); fijar('transition', 'none'); fijar('animation', 'none');
    fijar('will-change', 'transform, filter, backdrop-filter'); fijar('contain', 'layout paint');
    // fuera de user-query el clon ya no hereda la tipografía/color: se copian tal cual los tiene la real
    ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color'].forEach((p) => fijar(p, cs.getPropertyValue(p)));

    let w = r0.width, h = r0.height;
    let destino = r0;
    // pinta el clon para el instante p (0-1) de la animación, midiendo dónde está AHORA la burbuja real
    function pintar(p) {
      const rt = el.getBoundingClientRect(); // Gemini hace scroll y mueve el layout mientras vuela
      if (rt.width >= 1 && rt.height >= 1) destino = rt;
      if (Math.abs(destino.width - w) > 0.5 || Math.abs(destino.height - h) > 0.5) {
        w = destino.width; h = destino.height;
        fijar('width', w + 'px'); fijar('height', h + 'px');
      }
      const st = vueloEstado(p, origen.x - (destino.left + w / 2), origen.y - (destino.top + h / 2), w, h, origBF);
      // solo se escribe lo que cambió respecto al fotograma anterior
      const tr = `translate(${(destino.left + st.x).toFixed(2)}px, ${(destino.top + st.y).toFixed(2)}px) scaleX(${st.scaleX.toFixed(4)}) scaleY(${st.scaleY.toFixed(4)})`;
      if (tr !== g._tgTr) { g._tgTr = tr; fijar('transform', tr); }
      const fl = `blur(${st.blur.toFixed(1)}px)`;
      if (fl !== g._tgFl) { g._tgFl = fl; fijar('filter', fl); }
      if (st.backdropFilter !== undefined && st.backdropFilter !== g._tgBf) {
        g._tgBf = st.backdropFilter;
        fijar('backdrop-filter', st.backdropFilter);
        fijar('-webkit-backdrop-filter', st.backdropFilter);
      }
    }
    pintar(0); // ya en su sitio (en la caja de escribir) antes de aparecer: sin parpadeo en la esquina
    document.documentElement.appendChild(g); // colgado de <html>: ningún transform/overflow del body o del chat lo afecta

    // 2) la burbuja real se queda escondida (data-anim="wait" -> opacity 0) hasta que el clon aterriza
    el._vuelo = g;
    const t0 = performance.now();

    function aterrizar() {
      if (el._vuelo !== g) return;
      el._vuelo = null;
      finMuestreoFps();
      el._aterrizoEn = performance.now(); // las fotos del mismo mensaje esperan a este momento (ver retrasoPorBurbuja)
      g.remove();
      if (!el.isConnected) return;
      el._animado = true;
      el.setAttribute('data-sin-anim', ''); // aparece tal cual, sin repetir animación (el clon ya hizo el trabajo)
      el.setAttribute('data-anim', 'in');
    }
    function cuadro(ahora) {
      if (el._vuelo !== g) { g.remove(); return; }
      if (!el.isConnected) { el._vuelo = null; g.remove(); return; }
      const p = Math.min(1, Math.max(0, (ahora - t0) / VUELO_MS));
      muestrearFps(ahora);
      pintar(p);
      if (p >= 1) { aterrizar(); return; }
      requestAnimationFrame(cuadro);
    }
    requestAnimationFrame(cuadro);
    setTimeout(aterrizar, VUELO_MS + 1500); // seguro: si la pestaña estaba en segundo plano (rAF pausado) no se queda escondida
  }

  const entradasVisPendientes = []; // avisos recibidos con la pantalla bloqueada: se procesan al desbloquear
  const alCambiarVisibilidad = (entradasNuevas) => {
    if (pantallaBloqueada) { entradasVisPendientes.push(...entradasNuevas); return; }
    const entradas = entradasVisPendientes.length ? entradasVisPendientes.splice(0).concat(entradasNuevas) : entradasNuevas;
    entradas.forEach((entrada) => {
      const el = entrada.target;
      if (!el.isConnected) { // Gemini lo quitó del DOM: se deja de vigilar
        if (temporizadores.has(el)) { clearTimeout(temporizadores.get(el)); temporizadores.delete(el); }
        observadorVisibilidad.unobserve(el);
        return;
      }
      if (entrada.isIntersecting) {
        el._visto = true;
        if (el._vuelo) return; // está volando desde la caja de escribir: el clon se encarga de mostrarla
        if (temporizadores.has(el) || el.getAttribute('data-anim') === 'in') return;
        temporizadores.set(el, setTimeout(() => {
          temporizadores.delete(el);
          prepararSalidaDesdeInput(el);
          if (el._vuelo) return; // arrancó el vuelo: no se programa la animación normal

          const activarAnimacion = () => {
            temporizadores.delete(el);
            if (!el.isConnected || el.getAttribute('data-anim') !== 'wait') return;

            const espera = retrasoPorBurbuja(el); // fotos/videos: esperan a que termine la animación de la burbuja
            if (espera > 0) { temporizadores.set(el, setTimeout(activarAnimacion, espera)); return; }

            if ((enEnvio() || enPausaColapso()) && el._animado && !el.hasAttribute('data-origen')) {
              el.setAttribute('data-sin-anim', '');
            }

            el._animado = true;
            el.setAttribute('data-anim', 'in');
          };

          activarAnimacion();

        }, ESPERA_VISIBLE_MS));
      } else {
        if (temporizadores.has(el)) {
          clearTimeout(temporizadores.get(el));
          temporizadores.delete(el);
        }
        if (el._vuelo) return; // volando: se queda escondida hasta aterrizar
        if (!REANIMAR_AL_ENTRAR || enEnvio() || enPausaColapso()) return; // durante el envío (o al expandir/contraer una respuesta): sin esconder/reaparecer, se queda como está
        // una burbuja recién enviada que ya arrancó NO se reinicia por el primer aviso "no visible" (aún sin posición calculada)
        if (el.hasAttribute('data-origen') && !el._visto) return;
        // salió de la pantalla: se esconde hasta que vuelva a aparecer
        if (el.getAttribute('data-anim') === 'in') { el.removeAttribute('data-origen'); el.removeAttribute('data-sin-anim'); el._visto = false; el.setAttribute('data-anim', 'wait'); }
      }
    });
  };
  const observadorVisibilidad = new IntersectionObserver(alCambiarVisibilidad, { threshold: 0 });
  document.addEventListener('tg-bloqueo-cambio', () => { if (!pantallaBloqueada && entradasVisPendientes.length) alCambiarVisibilidad([]); });

  function registrarBurbujas(raiz) {
    if (!vibesOn || !raiz.querySelectorAll) return;
    const lista = raiz.matches && raiz.matches(SELECTOR_BURBUJAS)
      ? [raiz, ...raiz.querySelectorAll(SELECTOR_BURBUJAS)]
      : raiz.querySelectorAll(SELECTOR_BURBUJAS);
    lista.forEach((el) => {
      if (el.hasAttribute('data-anim')) return;
      el.setAttribute('data-anim', 'wait');
      observadorVisibilidad.observe(el);
      // mensaje recién enviado: sale desde el input de inmediato, sin esperar los 150 ms del observador
      if (ultimoEnvio && !ultimoEnvio.usado && el.matches('.user-query-bubble-with-background')) {
        prepararSalidaDesdeInput(el);
        
      }
    });
  }


  // VISTA PREVIA DE FOTOS Y VIDEOS (EL LIGHTBOX DE GEMINI, MEJORADO)
  // - se usa el lightbox original de Gemini (.image-expansion-dialog-panel), centrado en la pantalla (centro-centro)
  // - al abrirse crece con transición de escala desde la miniatura donde diste clic
  // - al cerrarse (clic fuera, botón de cerrar o ESC) vuelve a la miniatura con la transición inversa
  (function vistaPreviaMultimedia() {
    const DURACION_MS = 420;
    const DURACION_CIERRE_MS = 320;
    const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const ANCHO_MAX = '62vw';
    const ALTO_MAX = '88vh';
    const SEL_PANEL = '.image-expansion-dialog-panel';
    const SEL_FONDO = '.image-expansion-dialog-backdrop';
    const SEL_MINIATURA = '.preview-image-button, .preview-video-button';

    const estilo = document.createElement('style');
    estilo.id = 'tg-vp-style';
    estilo.textContent = `
      /* centrada en la pantalla, en horizontal y en vertical */
      .cdk-global-overlay-wrapper:has(${SEL_PANEL}) {
        justify-content: center !important;
        align-items: center !important;
      }
      ${SEL_FONDO} {
        background: rgba(0, 0, 0, 0.35) !important;
        -webkit-backdrop-filter: blur(6px) !important; backdrop-filter: blur(6px) !important;
      }
      ${SEL_PANEL} {
        max-width: ${ANCHO_MAX} !important;
        max-height: ${ALTO_MAX} !important;
      }
      ${SEL_PANEL} :is(mat-dialog-container, .mat-mdc-dialog-inner-container, .mat-mdc-dialog-surface, expansion-dialog) {
        background: transparent !important;
        box-shadow: none !important;
        max-height: ${ALTO_MAX} !important;
      }
      /* el fondo desenfocado de pantalla completa se quita para que se siga viendo el chat */
      ${SEL_PANEL} .blurred-image-bg { display: none !important; }
      /* ENCABEZADO: botón de volver y nombre del archivo fijos en la ESQUINA SUPERIOR IZQUIERDA de la pantalla */
      ${SEL_PANEL} .arrow-back-container {
        position: fixed !important;
        top: 16px !important; left: 16px !important; right: auto !important; bottom: auto !important;
        width: auto !important; height: auto !important; margin: 0 !important; padding: 0 !important;
        transform: none !important; z-index: 10 !important;
        background: transparent !important; box-shadow: none !important;
      }
      /* píldoras redondeadas (mismo estilo que la interfaz) */
      ${SEL_PANEL} .arrow-back-container .dialog-title {
        display: flex !important; align-items: center !important; gap: 10px !important;
      }
      ${SEL_PANEL} .arrow-back-container gem-icon-button,
      ${SEL_PANEL} .arrow-back-container .arrow-back-button {
        width: 50px !important; height: 50px !important; min-width: 50px !important;
        display: inline-flex !important; align-items: center !important; justify-content: center !important;
        border-radius: 50% !important;
        background: var(--tg-input-bg) !important;
        -webkit-backdrop-filter: blur(10px) !important; backdrop-filter: blur(10px) !important;
        box-shadow: none !important; overflow: hidden !important;
        transition: transform 0.2s ease !important;
      }
      ${SEL_PANEL} .arrow-back-container .arrow-back-button button {
        width: 50px !important; height: 50px !important; padding: 0 !important; border-radius: 50% !important;
        background: transparent !important; display: inline-flex !important; align-items: center !important; justify-content: center !important;
      }
      ${SEL_PANEL} .arrow-back-container .arrow-back-button:hover { transform: scale(1.08) !important; }
      ${SEL_PANEL} .arrow-back-container :is(mat-icon, gem-icon) { color: var(--tg-texto) !important; font-size: 26px !important; }
      ${SEL_PANEL} [data-tg-nombre] {
        display: inline-flex !important; align-items: center !important; gap: 10px !important;
        height: 50px !important; padding: 0 22px 0 16px !important;
        border-radius: 9999px !important;
        background: var(--tg-input-bg) !important;
        -webkit-backdrop-filter: blur(10px) !important; backdrop-filter: blur(10px) !important;
        box-shadow: none !important;
        color: var(--tg-texto) !important; font-size: 18px !important;
        max-width: min(60vw, 520px) !important; box-sizing: border-box !important;
      }
      ${SEL_PANEL} [data-tg-nombre] :is(span, div, p) {
        color: var(--tg-texto) !important; font-size: 18px !important;
        white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;
      }
      ${SEL_PANEL} mat-dialog-content { display: block; } /* un elemento en línea no admite transform */
      ${SEL_PANEL} mat-dialog-content :is(img, video, canvas) {
        max-width: ${ANCHO_MAX} !important;
        max-height: ${ALTO_MAX} !important;
        border-radius: 20px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
      }
    `;
    (document.head || document.documentElement).appendChild(estilo);

    const sinMovimiento = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let origenEl = null;   // contenedor de la miniatura donde se dio clic
    let origenRect = null; // su posición al momento del clic
    let cerrando = false;
    let permitirCierre = false; // true mientras se reenvía el cierre original a Gemini

    // lo que se escala es el contenido (foto/video), no el panel: así el encabezado fijo no se deforma
    const objetivoDe = (panel) => panel.querySelector('mat-dialog-content') || panel;
    const encabezadoDe = (panel) => panel.querySelector('.arrow-back-container');

    // transform que lleva el panel (en su lugar final) al centro de la miniatura, a su tamaño
    function transformHacia(rectPanel, rectDestino) {
      const dx = (rectDestino.left + rectDestino.width / 2) - (rectPanel.left + rectPanel.width / 2);
      const dy = (rectDestino.top + rectDestino.height / 2) - (rectPanel.top + rectPanel.height / 2);
      const s = Math.max(0.05, Math.min(rectDestino.width / rectPanel.width, rectDestino.height / rectPanel.height));
      return 'translate(' + dx + 'px, ' + dy + 'px) scale(' + s + ')';
    }
    function miniaturaVisible() {
      if (!origenEl || !origenEl.isConnected) return null;
      const r = origenEl.getBoundingClientRect();
      const ok = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
      return ok ? r : null;
    }

    // ---- APERTURA: escala desde la miniatura hasta la derecha-centro ----
    function animarApertura(panel) {
      cerrando = false;
      const desde = origenRect;
      if (!desde || !vibesOn || sinMovimiento()) return;
      panel.style.setProperty('visibility', 'hidden'); // se muestra al arrancar la animación (sin parpadeo)
      let intentos = 0;
      const lanzar = () => {
        if (!panel.isConnected) return;
        const objetivo = objetivoDe(panel);
        const r = objetivo.getBoundingClientRect();
        // la foto/video puede tardar en tener tamaño: se espera (máx. ~1 s)
        if ((r.width < 40 || r.height < 40) && intentos++ < 60) { requestAnimationFrame(lanzar); return; }
        panel.style.removeProperty('visibility');
        if (r.width < 1 || r.height < 1) return;
        objetivo.animate(
          [
            { transform: transformHacia(r, desde), opacity: 0.35 },
            { transform: 'translate(0, 0) scale(1)', opacity: 1 }
          ],
          { duration: DURACION_MS, easing: EASING }
        );
        const cab = encabezadoDe(panel);
        if (cab) cab.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURACION_MS, easing: 'ease' });
        const fondo = document.querySelector(SEL_FONDO);
        if (fondo) fondo.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURACION_MS, easing: 'ease' });
      };
      requestAnimationFrame(lanzar);
    }

    // ---- CIERRE: escala inversa hacia la miniatura y luego se deja que Gemini cierre de verdad ----
    function pedirCierre(accionOriginal) {
      const panel = document.querySelector(SEL_PANEL);
      if (!panel || !vibesOn || sinMovimiento()) { accionOriginal(); return; }
      if (cerrando) return;
      cerrando = true;
      const objetivo = objetivoDe(panel);
      const r = objetivo.getBoundingClientRect();
      const destino = miniaturaVisible();
      const final = destino
        ? { transform: transformHacia(r, destino), opacity: 0.35 }
        : { transform: 'translate(0, 0) scale(0.85)', opacity: 0 }; // la miniatura ya no se ve: se encoge y se desvanece
      const anim = objetivo.animate(
        [{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, final],
        { duration: DURACION_CIERRE_MS, easing: EASING, fill: 'forwards' }
      );
      const cab = encabezadoDe(panel);
      if (cab) cab.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURACION_CIERRE_MS, easing: 'ease', fill: 'forwards' });
      const fondo = document.querySelector(SEL_FONDO);
      if (fondo) fondo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURACION_CIERRE_MS, easing: 'ease', fill: 'forwards' });
      const terminar = () => {
        permitirCierre = true;
        try { accionOriginal(); } finally { permitirCierre = false; }
        setTimeout(() => { cerrando = false; }, 50);
      };
      anim.onfinish = terminar;
      anim.oncancel = terminar;
    }

    // clics: recuerda la miniatura pulsada y frena el cierre inmediato de Gemini
    document.addEventListener('click', (e) => {
      if (permitirCierre) return;
      const t = e.target;
      if (!t || !t.closest) return;
      const mini = t.closest(SEL_MINIATURA);
      if (mini) {
        origenEl = mini.closest('.file-preview-container') || mini;
        origenRect = origenEl.getBoundingClientRect();
        return; // Gemini abre su lightbox normalmente
      }
      if (!document.querySelector(SEL_PANEL)) return;
      const esFondo = t.closest(SEL_FONDO) || (t.classList && t.classList.contains('cdk-global-overlay-wrapper'));
      const esCerrar = t.closest(SEL_PANEL + ' [mat-dialog-close]');
      if (esFondo || esCerrar) {
        e.preventDefault();
        e.stopImmediatePropagation();
        pedirCierre(() => { (esFondo ? (document.querySelector(SEL_FONDO) || t) : t).click(); });
      }
    }, true);

    window.addEventListener('keydown', (e) => {
      if (permitirCierre || e.key !== 'Escape' || !document.querySelector(SEL_PANEL)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      pedirCierre(() => {
        const ev = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true });
        (document.activeElement || document.body).dispatchEvent(ev);
      });
    }, true);

    // marca el contenedor del nombre del archivo (icono + texto) para darle fondo de píldora
    function marcarEncabezado(panel) {
      const cab = panel.querySelector('.arrow-back-container');
      if (!cab || cab.querySelector('[data-tg-nombre]')) return !!(cab && cab.querySelector('[data-tg-nombre]'));
      const boton = cab.querySelector('.arrow-back-button, [mat-dialog-close]');
      const walker = document.createTreeWalker(cab, NodeFilter.SHOW_TEXT);
      let texto = null;
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (!n.textContent.trim()) continue;
        const pe = n.parentElement;
        if (!pe || pe.closest('mat-icon, gem-icon') || (boton && boton.contains(pe))) continue;
        texto = pe; break;
      }
      if (!texto) return false;
      // sube mientras el padre siga sin incluir el botón de volver (así el icono de archivo y el nombre quedan juntos)
      let el = texto;
      while (el.parentElement && el.parentElement !== cab &&
             !el.parentElement.classList.contains('dialog-title') &&
             !(boton && el.parentElement.contains(boton))) {
        el = el.parentElement;
      }
      el.setAttribute('data-tg-nombre', '');
      return true;
    }
    function vigilarEncabezado(panel) {
      if (marcarEncabezado(panel)) return;
      const mo = new MutationObserver(() => { if (!panel.isConnected || marcarEncabezado(panel)) mo.disconnect(); });
      mo.observe(panel, { childList: true, subtree: true, characterData: true });
      setTimeout(() => mo.disconnect(), 4000);
    }

    // detecta cuándo Gemini abre el lightbox para animarlo
    function buscarPanel(nodo) {
      if (!nodo || nodo.nodeType !== 1) return;
      const panel = nodo.matches && nodo.matches(SEL_PANEL) ? nodo : (nodo.querySelector && nodo.querySelector(SEL_PANEL));
      if (panel && !panel.dataset.tgVp) {
        panel.dataset.tgVp = '1';
        vigilarEncabezado(panel);
        animarApertura(panel);
      }
    }
    // solo se vigila el contenedor de overlays de Angular (.cdk-overlay-container), no todo el body
    const moPanel = new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach(buscarPanel);
    });
    let overlayVigilado = null;
    function vigilarOverlay() {
      const c = document.querySelector('.cdk-overlay-container');
      if (!c || c === overlayVigilado) return;
      overlayVigilado = c;
      moPanel.observe(c, { childList: true, subtree: true });
      buscarPanel(c);
    }
    vigilarOverlay();
    if (!overlayVigilado) { // el contenedor se crea la primera vez que se abre algo: se espera solo a hijos directos del body
      const moBody = new MutationObserver(() => { vigilarOverlay(); if (overlayVigilado) moBody.disconnect(); });
      moBody.observe(document.body, { childList: true });
    }
  })();


  // TAMAÑO ADAPTATIVO DE LAS FOTOS ADJUNTAS
  // 1 foto = grande ... 8+ fotos = pequeñas (o bajan de línea si ya no caben).
  const TOPES_FOTO = [340, 250, 200, 160, 130, 110, 96, 84]; // px máximos para 1..8 fotos
  const MIN_FOTO = 72;  // nunca más pequeña que esto
  const GAP_FOTO = 10;  // debe coincidir con el gap del CSS
  // UNA SOLA foto/video: tamaño completo, con su proporción real, ajustado a la interfaz
  const MAX_ANCHO_UNICA = 640;     // px: igual que el ancho máximo de la burbuja de mensaje
  const MAX_ALTO_UNICA = 520;      // px: tope de alto (además nunca pasa de ALTO_VENTANA_UNICA de la ventana)
  const ALTO_VENTANA_UNICA = 0.55; // fracción del alto de la ventana
  function ajustarCarrusel(area) {
    const carrusel = area.closest('.query-file-carousel') || area;
    // nunca más ancha que la pantalla (12px de aire a cada lado)
    const ancho = Math.min(carrusel.clientWidth || area.clientWidth, document.documentElement.clientWidth - 24);
    if (!(ancho > 0)) return; // aún no tiene layout; el ResizeObserver lo reintenta
    const n = Math.max(area.children.length, 1);
    const tope = TOPES_FOTO[Math.min(n, TOPES_FOTO.length) - 1];
    const cabeEnUnaFila = (ancho - (n - 1) * GAP_FOTO) / n;
    const tam = Math.round(Math.min(tope, Math.max(MIN_FOTO, cabeEnUnaFila)));
    // posición de cada foto (para entrar una por una) y retraso de la burbuja
    [...area.children].forEach((hijo, i) => hijo.style.setProperty('--i', i));
    const mensaje = area.closest('user-query');
    if (mensaje) mensaje.style.setProperty('--retraso-burbuja', Math.min(n, 8) * 140 + 'ms');
    if (area.dataset.tgTam !== String(tam)) {
      area.dataset.tgTam = String(tam);
      area.style.setProperty('--tam', tam + 'px');
    }
    // una sola foto/video: se mide su proporción y se le da el mayor tamaño que cabe (sin recortarla)
    let unica = null;
    if (n === 1 && area.children[0]) {
      const medio = area.children[0].querySelector('img.preview-image, .video-preview-img-container img, .preview-video-button > img, video, img');
      let nw = 0, nh = 0;
      if (medio) {
        nw = medio.naturalWidth || medio.videoWidth || 0;
        nh = medio.naturalHeight || medio.videoHeight || 0;
        if ((!nw || !nh) && !medio._tgEsperaMedida) { // aún no cargó: se vuelve a medir cuando cargue
          medio._tgEsperaMedida = true;
          medio.addEventListener(medio.tagName === 'VIDEO' ? 'loadedmetadata' : 'load', () => ajustarCarrusel(area), { once: true });
        }
      }
      if (nw > 0 && nh > 0) {
        const maxW = Math.min(ancho, MAX_ANCHO_UNICA);
        const maxH = Math.min(Math.round(window.innerHeight * ALTO_VENTANA_UNICA), MAX_ALTO_UNICA);
        const ratio = nw / nh;
        const w = Math.max(Math.round(Math.min(maxW, maxH * ratio)), MIN_FOTO);
        unica = { w, h: Math.max(Math.round(w / ratio), 1) };
      }
    }
    if (unica) {
      area.setAttribute('data-tg-unica', '');
      area.style.setProperty('--tam-w', unica.w + 'px');
      area.style.setProperty('--tam-h', unica.h + 'px');
    } else if (area.hasAttribute('data-tg-unica')) {
      area.removeAttribute('data-tg-unica');
      area.style.removeProperty('--tam-w');
      area.style.removeProperty('--tam-h');
    }
  }
  // si cambia el alto de la ventana, la foto única se vuelve a ajustar
  let ajusteVentanaPendiente = false;
  window.addEventListener('resize', () => {
    if (ajusteVentanaPendiente || pantallaBloqueada) return;
    ajusteVentanaPendiente = true;
    requestAnimationFrame(() => { ajusteVentanaPendiente = false; ajustarCarruseles(document.body); });
  });
  const observadorAncho = new ResizeObserver((entradas) => {
    if (pantallaBloqueada) return; // al desbloquear se reajusta todo (ver más abajo)
    entradas.forEach((e) => {
      const area = e.target.querySelector && e.target.querySelector('.scrollable-area');
      if (area) ajustarCarrusel(area);
    });
  });
  function ajustarCarruseles(raiz) {
    if (!raiz || !raiz.querySelectorAll) return;
    const areas = new Set();
    if (raiz.matches && raiz.matches('.query-file-carousel .scrollable-area')) areas.add(raiz);
    raiz.querySelectorAll('.query-file-carousel .scrollable-area').forEach((a) => areas.add(a));
    const padre = raiz.closest && raiz.closest('.query-file-carousel .scrollable-area');
    if (padre) areas.add(padre); // se añadió/quitó una foto en un carrusel existente
    areas.forEach((a) => {
      const carrusel = a.closest('.query-file-carousel');
      // reemplaza a los :has(.query-file-carousel) del CSS (se reevaluaban en cada nodo nuevo)
      const uq = a.closest('user-query');
      if (uq && !uq.hasAttribute('data-tg-media')) {
        uq.setAttribute('data-tg-media', '');
        const cc = uq.closest('.conversation-container');
        if (cc) cc.setAttribute('data-tg-media', '');
      }
      if (carrusel && !carrusel.dataset.tgObs) {
        carrusel.dataset.tgObs = '1';
        observadorAncho.observe(carrusel); // recalcula si cambia el ancho de la ventana
      }
      ajustarCarrusel(a);
    });
  }
  ajustarCarruseles(document.body);


  // ÍTEM "CAMBIAR FONDO" DENTRO DEL MENÚ DE AJUSTES DE GEMINI
  const ID_ITEM_FONDO = 'tg-item-cambiar-fondo';
  const ETIQUETA_FONDO = 'Cambiar fondo';
  const ID_ITEM_FONDO_BLOQUEO = 'tg-item-cambiar-fondo-bloqueo';
  const ETIQUETA_FONDO_BLOQUEO = 'Cambiar fondo del bloqueo';
  const ID_ITEM_PERSONALIZAR = 'tg-item-personalizar';
  const ETIQUETA_PERSONALIZAR = 'Personalizar';
  const ICONO_FONDO = 'wallpaper';
  const ICONO_PERSONALIZAR = 'tune';

  const ESTILO_PERSONALIZAR = document.createElement('style');
  ESTILO_PERSONALIZAR.id = 'tg-personalizar-style';
  ESTILO_PERSONALIZAR.textContent = `
    /* ===== MENÚ DE AJUSTES: mismo estilo que el menú lateral de conversaciones (translúcido + blur fuerte) ===== */
    .desktop-settings-menu {
      --m-hover: rgba(255, 255, 255, 0.1);
      --m-texto: var(--tg-texto, #ffffff);
      color: var(--m-texto) !important;
    }
    html[data-tema="claro"] .desktop-settings-menu {
      --m-hover: rgba(0, 0, 0, 0.07);
      --m-texto: var(--tg-texto, #1f1f1f);
    }
    /* la MISMA receta del menú lateral de escritorio (bard-sidenav): fondo --tg-sidebar-bg + blur(20px).
       Una sola capa lleva el blur; las demás quedan transparentes (un blur dentro de otro no ve la imagen de fondo). */
    [data-tg-menu-capa="blur"],
    .desktop-settings-menu:not([data-tg-menu-capa]) {
      background: var(--tg-sidebar-efectivo, var(--tg-sidebar-bg, rgba(0, 0, 0, 0.45))) !important;
      background-color: var(--tg-sidebar-efectivo, var(--tg-sidebar-bg, rgba(0, 0, 0, 0.45))) !important;
      background-image: none !important;
      -webkit-backdrop-filter: blur(14px) !important;
      backdrop-filter: blur(14px) !important;
      border: 0 !important;
      border-radius: 18px !important;
      box-shadow: none !important;
      overflow: hidden !important;
    }
    /* menú "+" (mat-card) y <gem-menu>: sin animación propia de CSS (la copia de los mat-menu la pone el script) */
    mat-card[data-tg-menu-capa="blur"], gem-menu[data-tg-menu-capa="blur"] {
      animation: none !important;
      --tg-hover: rgba(255, 255, 255, 0.1);
    }
    html[data-tema="claro"] mat-card[data-tg-menu-capa="blur"], html[data-tema="claro"] gem-menu[data-tg-menu-capa="blur"] {
      --tg-hover: rgba(0, 0, 0, 0.07);
    }
    /* botones del menú "+" SIN fondo propio: solo se resaltan al pasar el cursor */
    mat-card[data-tg-menu-capa="blur"] {
      --mdc-list-list-item-container-color: transparent;
      --mat-list-list-item-container-color: transparent;
      --mdc-list-list-item-hover-container-color: transparent;
    }
    mat-card[data-tg-menu-capa="blur"] :is(uploader, toolbox-drawer, toolbox-drawer-item, .simplified-file-uploader, .content-only-container, .menu-list-container) {
      background: transparent !important;
      box-shadow: none !important;
    }
    mat-card[data-tg-menu-capa="blur"] :is(.mat-mdc-list-item, .mdc-list-item, button[mat-list-item], .toolbox-drawer-item-list-button, .lm-menu-item-theme) {
      background: transparent !important;
      background-color: transparent !important;
      box-shadow: none !important;
      border-radius: 12px !important;
      transition: background-color 0.15s ease !important;
    }
    mat-card[data-tg-menu-capa="blur"] :is(.mat-mdc-list-item, .mdc-list-item, button[mat-list-item], .toolbox-drawer-item-list-button, .lm-menu-item-theme):hover:not([disabled]) {
      background: var(--tg-hover) !important;
      background-color: var(--tg-hover) !important;
    }
    gem-menu[data-tg-menu-capa="blur"] { padding: 6px 0 !important; }
    [data-tg-menu-capa="limpia"] {
      background: transparent !important;
      background-color: transparent !important;
      background-image: none !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
      box-shadow: none !important;
      border: 0 !important;
    }
    .desktop-settings-menu > *,
    .desktop-settings-menu .mat-mdc-menu-content {
      background: transparent !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
    .desktop-settings-menu .mat-mdc-menu-item {
      border-radius: 12px !important;
      color: var(--m-texto) !important;
      background: transparent !important;
      transition: background-color 0.15s ease !important;
    }
    .desktop-settings-menu .mat-mdc-menu-item:hover,
    .desktop-settings-menu .mat-mdc-menu-item:focus-visible {
      background: var(--m-hover) !important;
    }
    .desktop-settings-menu .mat-mdc-menu-item .mat-mdc-menu-item-text,
    .desktop-settings-menu .mat-mdc-menu-item mat-icon,
    .desktop-settings-menu .mat-mdc-menu-item gem-icon {
      color: var(--m-texto) !important;
    }
    /* ítems propios con ícono SVG (el tamaño lo da la misma clase que usan los demás íconos del menú) */
    .desktop-settings-menu .tg-menu-ico { display: inline-flex !important; align-items: center; justify-content: center; font-size: 0 !important; }
    .desktop-settings-menu .tg-menu-ico::before, .desktop-settings-menu .tg-menu-ico::after { content: none !important; }
    .desktop-settings-menu .tg-menu-ico svg {
      width: 100%; height: 100%; min-width: 20px; min-height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
    }

    /* ===== PANEL PERSONALIZAR: mismo lenguaje visual que la página (cristal + blur, esquinas redondas, píldoras) ===== */
    #tg-personalizar-backdrop {
      --p-panel: var(--tg-sidebar-efectivo, var(--tg-sidebar-bg, rgba(0, 0, 0, 0.45)));
      --p-ia: var(--tg-resp-bg, rgba(0, 0, 0, 0.8));
      --p-card: var(--tg-input-bg, rgba(0, 0, 0, 0.55));
      --p-texto: var(--tg-texto, #ffffff);
      --p-suave: var(--tg-texto-suave, rgba(255, 255, 255, 0.7));
      --p-borde: rgba(255, 255, 255, 0.14);
      --p-hover: rgba(255, 255, 255, 0.1);
      --p-sombra: rgba(0, 0, 0, 0.45);
      position: fixed; inset: 0; z-index: 2147483646;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      font-family: 'Google Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
      opacity: 0; pointer-events: none; transition: opacity 180ms ease;
    }
    html[data-tema="claro"] #tg-personalizar-backdrop {
      --p-panel: var(--tg-sidebar-efectivo, var(--tg-sidebar-bg, rgba(255, 255, 255, 0.6)));
      --p-ia: var(--tg-resp-bg, rgba(255, 255, 255, 0.78));
      --p-card: var(--tg-input-bg, rgba(255, 255, 255, 0.65));
      --p-texto: var(--tg-texto, #1f1f1f);
      --p-suave: var(--tg-texto-suave, rgba(31, 31, 31, 0.6));
      --p-borde: rgba(0, 0, 0, 0.12);
      --p-hover: rgba(0, 0, 0, 0.07);
      --p-sombra: rgba(0, 0, 0, 0.2);
      background: rgba(255, 255, 255, 0.25);
    }
    #tg-personalizar-backdrop.tg-visible { opacity: 1; pointer-events: auto; }
    #tg-personalizar-backdrop *, #tg-personalizar-backdrop *::before, #tg-personalizar-backdrop *::after { box-sizing: border-box; }
    #tg-personalizar-panel {
      width: min(860px, calc(100vw - 40px));
      max-height: min(88vh, 820px);
      overflow-y: auto; overflow-x: hidden;
      background: var(--p-panel);
      border: 0;
      border-radius: 28px;
      box-shadow: 0 24px 80px var(--p-sombra);
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      color: var(--p-texto);
      padding: 24px 28px 26px;
      transform: translateY(14px) scale(0.98);
      transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
      scrollbar-width: thin; scrollbar-color: var(--p-borde) transparent;
    }
    #tg-personalizar-backdrop.tg-visible #tg-personalizar-panel { transform: translateY(0) scale(1); }
    #tg-personalizar-panel :where(h2, h3, p, span, label, button, div) { color: inherit; text-shadow: none; }

    .tg-p-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
    .tg-p-header { margin: 0; font-size: clamp(22px, 2.4vw, 28px); font-weight: 600; letter-spacing: -0.01em; }
    .tg-p-cerrar {
      width: 44px; height: 44px; flex: none; padding: 0; border: 0; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
      background: var(--p-card); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      color: var(--p-texto); transition: transform 0.2s ease;
    }
    .tg-p-cerrar:hover { transform: scale(1.08); }
    .tg-p-cerrar svg, .tg-p-ico { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

    .tg-p-seccion { margin-top: 22px; }
    .tg-p-titulo { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
    .tg-p-sub { margin: 0 0 14px; font-size: 14px; color: var(--p-suave) !important; }

    .tg-p-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 16px; align-items: stretch; }
    .tg-p-controles { display: flex; flex-direction: column; gap: 10px; }
    .tg-p-fila {
      background: var(--p-card); border: 1px solid var(--p-borde); border-radius: 18px; padding: 14px 16px;
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    }
    .tg-p-fila-cab { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-size: 15px; font-weight: 500; }
    .tg-p-valor { font-size: 13px; font-weight: 400; color: var(--p-suave) !important; font-variant-numeric: tabular-nums; }

    .tg-p-colores { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .tg-p-color {
      width: 32px; height: 32px; padding: 0; border-radius: 50%; cursor: pointer; flex: none;
      border: 2px solid transparent; outline: 0; transition: transform 0.15s ease, box-shadow 0.15s ease;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
    }
    .tg-p-color:hover { transform: scale(1.12); }
    .tg-p-color.tg-sel { box-shadow: 0 0 0 2px var(--p-panel), 0 0 0 4px var(--p-texto); }
    .tg-p-color-libre {
      position: relative; overflow: hidden;
      background: conic-gradient(#ff3b30, #ffcc00, #34c759, #00c7be, #0a84ff, #bf5af2, #ff3b30);
    }
    .tg-p-color-libre input { position: absolute; inset: -8px; width: 48px; height: 48px; opacity: 0; cursor: pointer; border: 0; padding: 0; }

    .tg-p-rango {
      -webkit-appearance: none; appearance: none; display: block; width: 100%; height: 12px; margin: 6px 0;
      border-radius: 99px; outline: 0; cursor: pointer; border: 1px solid var(--p-borde);
      background: var(--ramp, #888);
    }
    .tg-p-rango::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none; width: 24px; height: 24px; border-radius: 50%;
      background: #fff; border: 4px solid var(--tg-pers-solido, #0059ff); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }
    .tg-p-rango::-moz-range-thumb {
      width: 16px; height: 16px; border-radius: 50%; background: #fff;
      border: 4px solid var(--tg-pers-solido, #0059ff); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }
    .tg-p-rango:focus-visible { box-shadow: 0 0 0 3px var(--p-hover); }
    .tg-p-rampa-eti { display: flex; justify-content: space-between; margin-top: 6px; }
    .tg-p-rampa-eti button {
      background: transparent; border: 0; padding: 2px 6px; border-radius: 99px; cursor: pointer;
      font: inherit; font-size: 12px; color: var(--p-suave) !important; transition: background 0.15s ease;
    }
    .tg-p-rampa-eti button:hover, .tg-p-rampa-eti button.tg-sel { background: var(--p-hover); color: var(--p-texto) !important; }

    .tg-p-vista {
      position: relative; min-height: 190px; border-radius: 22px; overflow: hidden; border: 1px solid var(--p-borde);
      background-size: cover; background-position: center; background-color: #101827;
      display: flex; flex-direction: column; justify-content: center; gap: 12px; padding: 18px 16px;
    }
    .tg-p-vista-eti {
      position: absolute; top: 10px; left: 12px; font-size: 12px; padding: 3px 10px; border-radius: 99px;
      background: rgba(0, 0, 0, 0.45); color: #fff !important; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    }
    .tg-p-msg-usuario, .tg-p-msg-ia { max-width: 86%; font-size: 14px; line-height: 1.35; padding: 10px 14px; }
    .tg-p-msg-usuario {
      align-self: flex-end; border-radius: 18px 18px 4px 18px;
      background: var(--tg-pers-bg, rgba(0, 89, 255, 0.7)); color: var(--tg-pers-texto, #fff) !important;
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      transition: background-color 0.15s ease;
    }
    .tg-p-msg-usuario * { color: inherit !important; }
    .tg-p-msg-ia {
      align-self: flex-start; border-radius: 18px 18px 18px 4px;
      background: var(--p-ia); color: var(--p-texto) !important; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    }

    .tg-p-acciones { display: flex; justify-content: flex-end; margin-top: 12px; }
    .tg-p-btn {
      display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 9999px; cursor: pointer;
      border: 1px solid var(--p-borde); background: var(--p-card); color: var(--p-texto) !important; font: inherit; font-size: 14px;
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); transition: transform 0.2s ease, background 0.15s ease;
    }
    .tg-p-btn:hover { transform: scale(1.04); background: var(--p-hover); }
    .tg-p-btn[hidden] { display: none; }

    .tg-p-fondos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
    .tg-p-fondo-col { display: flex; flex-direction: column; align-items: center; gap: 10px; min-width: 0; }
    .tg-p-fondo {
      position: relative; display: block; width: 100%; aspect-ratio: 16 / 10; padding: 0; overflow: hidden; cursor: pointer;
      border-radius: 20px; border: 1px solid var(--p-borde); outline: 0;
      background-color: #101827; background-image: linear-gradient(135deg, #1f2937, #0b1220);
      background-size: cover; background-position: center; text-align: left;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .tg-p-fondo:hover, .tg-p-fondo:focus-visible { transform: translateY(-2px); box-shadow: 0 10px 30px var(--p-sombra); }
    .tg-p-fondo:focus-visible { box-shadow: 0 0 0 3px var(--p-texto); }
    .tg-p-cambiar {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 8px;
      background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
      color: #fff !important; font-size: 15px; font-weight: 500; opacity: 0; transition: opacity 0.2s ease;
    }
    .tg-p-fondo:hover .tg-p-cambiar, .tg-p-fondo:focus-visible .tg-p-cambiar { opacity: 1; }
    .tg-p-cambiar * { color: #fff !important; }
    .tg-p-fondo-nombre { font-size: 16px; font-weight: 500; }
    /* interruptor de la pantalla de bloqueo (mismo estilo que los switch de Gemini) */
    .tg-p-toggle, .tg-p-toggle-espacio { width: 100%; height: 56px; }
    .tg-p-toggle-espacio { visibility: hidden; }
    .tg-p-toggle {
      display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px 0 16px;
      background: var(--p-card); border: 1px solid var(--p-borde); border-radius: 18px;
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    }
    .tg-p-toggle-txt { display: flex; flex-direction: column; min-width: 0; text-align: left; }
    .tg-p-toggle-tit { font-size: 15px; font-weight: 500; line-height: 1.25; }
    .tg-p-toggle-sub { font-size: 12px; color: var(--p-suave) !important; line-height: 1.25; }
    .tg-p-switch {
      --sw-on: #a8c7fa; --sw-on-manija: #062e6f; --sw-on-check: #d3e3fd;
      position: relative; flex: none; width: 52px; height: 32px; padding: 0; border: 0; border-radius: 16px;
      background: transparent; cursor: pointer; outline: 0;
    }
    html[data-tema="claro"] .tg-p-switch { --sw-on: #0b57d0; --sw-on-manija: #ffffff; --sw-on-check: #0b57d0; }
    .tg-p-sw-track {
      position: absolute; inset: 0; border-radius: 16px; border: 2px solid var(--p-suave); background: transparent;
      transition: background-color 0.2s ease, border-color 0.2s ease;
    }
    .tg-p-sw-handle {
      position: absolute; top: 50%; left: 8px; width: 16px; height: 16px; border-radius: 50%;
      transform: translateY(-50%); background: var(--p-suave);
      display: flex; align-items: center; justify-content: center;
      transition: left 0.22s cubic-bezier(0.3, 0.8, 0.3, 1), width 0.2s ease, height 0.2s ease, background-color 0.2s ease;
    }
    .tg-p-sw-handle svg { width: 16px; height: 16px; fill: var(--sw-on-check); opacity: 0; transition: opacity 0.15s ease; }
    .tg-p-switch[aria-checked="true"] .tg-p-sw-track { background: var(--sw-on); border-color: var(--sw-on); }
    .tg-p-switch[aria-checked="true"] .tg-p-sw-handle { left: 24px; width: 24px; height: 24px; background: var(--sw-on-manija); }
    .tg-p-switch[aria-checked="true"] .tg-p-sw-handle svg { opacity: 1; }
    .tg-p-switch:hover .tg-p-sw-handle { filter: brightness(1.12); }
    .tg-p-switch:focus-visible .tg-p-sw-track { box-shadow: 0 0 0 3px var(--p-hover); }
    /* mini pantalla de Gemini */
    .tg-m-lateral {
      position: absolute; top: 0; bottom: 0; left: 0; width: 20%; background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); padding: 10px 8px; display: flex; flex-direction: column; gap: 6px;
    }
    .tg-m-lateral i { display: block; height: 7px; border-radius: 99px; background: rgba(255, 255, 255, 0.35); }
    .tg-m-lateral i:first-child { width: 60%; background: rgba(255, 255, 255, 0.6); }
    .tg-m-chat { position: absolute; top: 0; bottom: 0; left: 20%; right: 0; padding: 12px; display: flex; flex-direction: column; gap: 7px; justify-content: flex-end; }
    .tg-m-usuario { align-self: flex-end; width: 42%; height: 18px; border-radius: 10px 10px 3px 10px; background: var(--tg-pers-bg, rgba(0, 89, 255, 0.7)); transition: background-color 0.15s ease; }
    .tg-m-ia { align-self: flex-start; width: 66%; height: 34px; border-radius: 10px 10px 10px 3px; background: rgba(0, 0, 0, 0.72); }
    .tg-m-input { height: 20px; border-radius: 99px; background: rgba(0, 0, 0, 0.55); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); margin-top: 3px; }
    /* mini pantalla de bloqueo */
    .tg-m-bloqueo { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff !important; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.45); }
    .tg-m-bloqueo * { color: #fff !important; }
    .tg-m-hora { font-size: clamp(28px, 5vw, 46px); font-weight: 500; line-height: 1; letter-spacing: -0.03em; transform: translateY(-6px); }
    .tg-m-fecha { font-size: 12px; opacity: 0.9; margin-top: 4px; transform: translateY(-6px); text-transform: capitalize; }
    .tg-m-tecla {
      position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); padding: 3px 14px; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase;
      border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.45); border-bottom-width: 3px; background: rgba(255, 255, 255, 0.12); text-shadow: none;
    }

    @media (max-width: 680px) {
      #tg-personalizar-panel { width: calc(100vw - 20px); padding: 18px 16px 20px; border-radius: 24px; }
      .tg-p-grid, .tg-p-fondos { grid-template-columns: 1fr; }
      .tg-p-toggle-espacio { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      #tg-personalizar-backdrop, #tg-personalizar-panel, .tg-p-fondo, .tg-p-cambiar, .tg-p-sw-track, .tg-p-sw-handle { transition: none !important; }
    }
  `;
  document.head.appendChild(ESTILO_PERSONALIZAR);
  (function () {
    // la parte de los menús flotantes va en su propia hoja para poder apagarla; el panel Personalizar queda siempre disponible
    const t = ESTILO_PERSONALIZAR.textContent;
    const i = t.indexOf('/* ===== PANEL PERSONALIZAR');
    if (i > 0) {
      const m = document.createElement('style');
      m.id = 'tg-menus-style';
      m.textContent = t.slice(0, i);
      ESTILO_PERSONALIZAR.textContent = t.slice(i);
      document.head.appendChild(m);
    }
    // base: siempre activo (incluso con Vibes apagado)
    const b = document.createElement('style');
    b.id = 'tg-vibes-base-style';
    b.textContent = `
      html.tg-vibes-off #tg-fondo-video, html.tg-vibes-off #tg-fade-chat { display: none !important; }
      .desktop-settings-menu .tg-menu-ico { display: inline-flex !important; align-items: center; justify-content: center; font-size: 0 !important; }
      .desktop-settings-menu .tg-menu-ico::before, .desktop-settings-menu .tg-menu-ico::after { content: none !important; }
      .desktop-settings-menu .tg-menu-ico svg { width: 100%; height: 100%; min-width: 20px; min-height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      #tg-personalizar-panel.tg-vibes-apagado .tg-p-seccion:not(.tg-p-seccion-vibes) { opacity: 0.5; }
      /* ÁREA SEGURA (barra de estado de Android) EN LA BARRA LATERAL: siempre activo, con o sin Gemini Vibes.
         --tg-safe-top lo calcula el JS (env(safe-area-inset-top) o el valor de tgSetSafeArea) */
      .sidenav-with-history-container.mobile { padding-top: var(--tg-safe-top, 0px) !important; box-sizing: border-box !important; }
    `;
    document.head.appendChild(b);
  })();

  function cerrarMenuAjustes() {
    const fondo = document.querySelector('.cdk-overlay-backdrop');
    if (fondo) { fondo.click(); return; }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  }

  const SVG_MENU = {
    personalizar: () => hs('svg', { viewBox: '0 0 24 24' },
      hs('path', { d: 'M4 7h9M17 7h3M4 17h3M11 17h9' }), hs('circle', { cx: 15, cy: 7, r: 2 }), hs('circle', { cx: 9, cy: 17, r: 2 })),
    fondo: () => hs('svg', { viewBox: '0 0 24 24' },
      hs('rect', { x: 3, y: 4, width: 18, height: 16, rx: 3 }), hs('circle', { cx: 9, cy: 10, r: 1.8 }), hs('path', { d: 'M21 16l-5-5-8 9' })),
    bloqueo: () => hs('svg', { viewBox: '0 0 24 24' },
      hs('rect', { x: 5, y: 11, width: 14, height: 9, rx: 2.5 }), hs('path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }), hs('circle', { cx: 12, cy: 15.5, r: 1 }))
  };
  function ponerIcono(item, tipo) {
    let icono = item.querySelector('mat-icon, gem-icon');
    if (!icono) {
      icono = document.createElement('mat-icon');
      item.insertBefore(icono, item.firstChild);
    }
    ['fonticon', 'data-mat-icon-name', 'data-mat-icon-type', 'ng-reflect-font-icon'].forEach((a) => icono.removeAttribute(a));
    icono.classList.remove('lumi-symbols', 'mat-ligature-font');
    icono.classList.add('tg-menu-ico');
    icono.textContent = '';
    icono.appendChild((SVG_MENU[tipo] || SVG_MENU.fondo)());
  }

  function ponerTexto(item, texto) {
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    const nodos = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (n.textContent.trim() && !n.parentElement.closest('mat-icon')) nodos.push(n);
    }
    if (nodos.length) {
      nodos[0].textContent = texto;
      nodos.slice(1).forEach((n) => n.remove());
    } else {
      item.appendChild(document.createTextNode(texto));
    }
  }

  function crearItemFondo(menu, id, etiqueta, input) {
    const items = [...menu.querySelectorAll('.mat-mdc-menu-item')];
    // plantilla: un ítem normal (sin submenú) para heredar exactamente el estilo de Gemini
    const plantilla =
      items.find((i) => !i.hasAttribute('aria-haspopup') && !i.querySelector('.mat-mdc-menu-submenu-icon, .gem-menu-item-trailing-icon')) ||
      items.find((i) => !i.hasAttribute('aria-haspopup'));
    let item;
    if (plantilla) {
      item = plantilla.cloneNode(true);
      ['id', 'jslog', 'data-test-id', 'aria-describedby', 'cdk-describedby-host', 'aria-controls',
       'aria-haspopup', 'aria-expanded', 'href', 'target', 'data-ved', 'data-hveid', 'decode-data-ved']
        .forEach((a) => item.removeAttribute(a));
      item.querySelectorAll('[id], [jslog]').forEach((e) => { e.removeAttribute('id'); e.removeAttribute('jslog'); });
      item.querySelectorAll('.gem-menu-item-trailing-icon, .gem-menu-item-hover-trailing-icon, .mat-mdc-menu-submenu-icon')
        .forEach((e) => e.remove());
      ponerTexto(item, etiqueta);
    } else {
      // sin plantilla: ítem mínimo con las mismas clases
      item = document.createElement('button');
      item.className = 'mat-mdc-menu-item mat-focus-indicator lm-menu-item-theme';
      item.setAttribute('role', 'menuitem');
      item.appendChild(h('mat-icon', {
        role: 'img', class: 'mat-icon notranslate lm-icon-m lumi-symbols mat-ligature-font mat-icon-no-color', 'aria-hidden': 'true',
        'data-mat-icon-type': 'font', fonticon: ICONO_FONDO, 'data-mat-icon-name': ICONO_FONDO
      }));
      item.appendChild(h('span', { class: 'mat-mdc-menu-item-text' }, etiqueta));
    }
    item.id = id;
    ponerIcono(item, id === ID_ITEM_FONDO_BLOQUEO ? 'bloqueo' : 'fondo');
    item.setAttribute('type', 'button');
    item.removeAttribute('disabled');
    item.setAttribute('aria-disabled', 'false');
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (input) input.click();
      cerrarMenuAjustes();
    });
    return item;
  }

  function crearItemPersonalizar(menu) {
    const items = [...menu.querySelectorAll('.mat-mdc-menu-item')];
    const plantilla =
      items.find((i) => !i.hasAttribute('aria-haspopup') && !i.querySelector('.mat-mdc-menu-submenu-icon, .gem-menu-item-trailing-icon')) ||
      items.find((i) => !i.hasAttribute('aria-haspopup'));
    let item;
    if (plantilla) {
      item = plantilla.cloneNode(true);
      ['id', 'jslog', 'data-test-id', 'aria-describedby', 'cdk-describedby-host', 'aria-controls',
       'aria-haspopup', 'aria-expanded', 'href', 'target', 'data-ved', 'data-hveid', 'decode-data-ved']
        .forEach((a) => item.removeAttribute(a));
      item.querySelectorAll('[id], [jslog]').forEach((e) => { e.removeAttribute('id'); e.removeAttribute('jslog'); });
      item.querySelectorAll('.gem-menu-item-trailing-icon, .gem-menu-item-hover-trailing-icon, .mat-mdc-menu-submenu-icon')
        .forEach((e) => e.remove());
      ponerTexto(item, ETIQUETA_PERSONALIZAR);
    } else {
      item = document.createElement('button');
      item.className = 'mat-mdc-menu-item mat-focus-indicator lm-menu-item-theme';
      item.setAttribute('role', 'menuitem');
      item.appendChild(h('mat-icon', {
        role: 'img', class: 'mat-icon notranslate lm-icon-m lumi-symbols mat-ligature-font mat-icon-no-color', 'aria-hidden': 'true',
        'data-mat-icon-type': 'font', fonticon: ICONO_PERSONALIZAR, 'data-mat-icon-name': ICONO_PERSONALIZAR
      }));
      item.appendChild(h('span', { class: 'mat-mdc-menu-item-text' }, ETIQUETA_PERSONALIZAR));
    }
    item.id = ID_ITEM_PERSONALIZAR;
    ponerIcono(item, 'personalizar');
    item.setAttribute('type', 'button');
    item.removeAttribute('disabled');
    item.setAttribute('aria-disabled', 'false');
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      abrirPanelPersonalizar();
      cerrarMenuAjustes();
    });
    return item;
  }

  function abrirPanelPersonalizar() {
    actualizarFondoMenuLateral();
    const previo = document.getElementById('tg-personalizar-backdrop');
    if (previo) { if (previo._limpiar) previo._limpiar(); previo.remove(); }

    const SVG_CERRAR = () => hs('svg', { viewBox: '0 0 24 24' }, hs('path', { d: 'M6 6l12 12M18 6L6 18' }));
    const SVG_IMAGEN = () => hs('svg', { class: 'tg-p-ico', viewBox: '0 0 24 24' },
      hs('rect', { x: 3, y: 4, width: 18, height: 16, rx: 3 }), hs('circle', { cx: 9, cy: 10, r: 1.8 }), hs('path', { d: 'M21 16l-5-5-8 9' }));
    const SVG_RESET = () => hs('svg', { class: 'tg-p-ico', viewBox: '0 0 24 24' },
      hs('path', { d: 'M4 12a8 8 0 1 0 3-6.2' }), hs('path', { d: 'M4 4v5h5' }));

    const COLORES = [
      { n: 'Azul', h: 221, s: 100 }, { n: 'Violeta', h: 265, s: 85 }, { n: 'Rosa', h: 330, s: 85 },
      { n: 'Rojo', h: 3, s: 85 }, { n: 'Naranja', h: 24, s: 95 }, { n: 'Ámbar', h: 44, s: 95 },
      { n: 'Verde', h: 145, s: 65 }, { n: 'Turquesa', h: 174, s: 80 }, { n: 'Cian', h: 195, s: 90 },
      { n: 'Gris', h: 215, s: 0 }
    ];

    const backdrop = h('div', { id: 'tg-personalizar-backdrop' },
      h('div', { id: 'tg-personalizar-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Personalizar' },
        h('div', { class: 'tg-p-top' },
          h('h2', { class: 'tg-p-header' }, 'Personalizar'),
          h('button', { class: 'tg-p-cerrar', type: 'button', 'aria-label': 'Cerrar' }, SVG_CERRAR())
        ),
        h('section', { class: 'tg-p-seccion tg-p-seccion-vibes' },
          h('div', { class: 'tg-p-toggle' },
            h('span', { class: 'tg-p-toggle-txt' },
              h('span', { class: 'tg-p-toggle-tit' }, 'Gemini Vibes'),
              h('span', { class: 'tg-p-toggle-sub' }, 'Apágalo para volver a la estética normal de Gemini')
            ),
            h('button', { class: 'tg-p-switch', type: 'button', role: 'switch', 'aria-checked': 'true', 'aria-label': 'Activar o desactivar Gemini Vibes', 'data-r': 'sw-vibes' },
              h('span', { class: 'tg-p-sw-track' }),
              h('span', { class: 'tg-p-sw-handle' },
                hs('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
                  hs('path', { d: 'M19.69 5.23 8.96 15.96l-4.23-4.23L2.96 13.5l6 6L21.46 7z' }))
              )
            )
          )
        ),
        h('section', { class: 'tg-p-seccion' },
          h('h3', { class: 'tg-p-titulo' }, 'Burbuja de tus mensajes'),
          h('p', { class: 'tg-p-sub' }, 'Elige el color, qué tan oscuro o claro es y cuánto se transparenta.'),
          h('div', { class: 'tg-p-grid' },
            h('div', { class: 'tg-p-controles' },
              h('div', { class: 'tg-p-fila' },
                h('div', { class: 'tg-p-fila-cab' }, h('span', null, 'Colores')),
                h('div', { class: 'tg-p-colores', 'data-r': 'colores' })
              ),
              h('div', { class: 'tg-p-fila' },
                h('div', { class: 'tg-p-fila-cab' },
                  h('span', null, 'Tono (oscuro, color, blanco)'),
                  h('span', { class: 'tg-p-valor', 'data-r': 'tono-valor' })
                ),
                h('input', { class: 'tg-p-rango', type: 'range', min: 0, max: 100, step: 1, 'data-r': 'tono', 'aria-label': 'Tono' }),
                h('div', { class: 'tg-p-rampa-eti' },
                  h('button', { type: 'button', 'data-tono': '0' }, 'Oscuro'),
                  h('button', { type: 'button', 'data-tono': '50' }, 'Color'),
                  h('button', { type: 'button', 'data-tono': '100' }, 'Blanco')
                )
              ),
              h('div', { class: 'tg-p-fila' },
                h('div', { class: 'tg-p-fila-cab' },
                  h('span', null, 'Transparencia'),
                  h('span', { class: 'tg-p-valor', 'data-r': 'alfa-valor' })
                ),
                h('input', { class: 'tg-p-rango', type: 'range', min: 20, max: 100, step: 1, 'data-r': 'alfa', 'aria-label': 'Opacidad de la burbuja' })
              )
            ),
            h('div', null,
              h('div', { class: 'tg-p-vista', 'data-r': 'vista' },
                h('span', { class: 'tg-p-vista-eti' }, 'Vista previa'),
                h('div', { class: 'tg-p-msg-ia' }, '¿Cómo se ve tu burbuja?'),
                h('div', { class: 'tg-p-msg-usuario' }, 'Así se verán tus mensajes')
              ),
              h('div', { class: 'tg-p-acciones' },
                h('button', { class: 'tg-p-btn', type: 'button', 'data-r': 'reset-burbuja' }, SVG_RESET(), 'Restablecer')
              )
            )
          )
        ),
        h('section', { class: 'tg-p-seccion' },
          h('h3', { class: 'tg-p-titulo' }, 'Fondos de pantalla'),
          h('p', { class: 'tg-p-sub' }, 'Toca el fondo para cambiarlo (imagen, GIF o video).'),
          h('div', { class: 'tg-p-fondos' },
            h('div', { class: 'tg-p-fondo-col' },
              h('div', { class: 'tg-p-toggle-espacio', 'aria-hidden': 'true' }),
              h('button', { class: 'tg-p-fondo', type: 'button', 'data-r': 'fondo-gemini', 'aria-label': 'Cambiar el fondo de la pantalla de Gemini' },
                h('span', { class: 'tg-m-lateral' }, h('i'), h('i'), h('i')),
                h('span', { class: 'tg-m-chat' },
                  h('span', { class: 'tg-m-usuario' }),
                  h('span', { class: 'tg-m-ia' }),
                  h('span', { class: 'tg-m-input' })
                ),
                h('span', { class: 'tg-p-cambiar' }, SVG_IMAGEN(), 'Cambiar fondo')
              ),
              h('span', { class: 'tg-p-fondo-nombre' }, 'Pantalla de Gemini')
            ),
            h('div', { class: 'tg-p-fondo-col' },
              h('div', { class: 'tg-p-toggle' },
                h('span', { class: 'tg-p-toggle-txt' },
                  h('span', { class: 'tg-p-toggle-tit' }, 'Pantalla de bloqueo'),
                  h('span', { class: 'tg-p-toggle-sub' }, 'Mostrar al entrar a la página')
                ),
                h('button', { class: 'tg-p-switch', type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': 'Mostrar la pantalla de bloqueo al entrar a la página', 'data-r': 'sw-bloqueo' },
                  h('span', { class: 'tg-p-sw-track' }),
                  h('span', { class: 'tg-p-sw-handle' },
                    hs('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
                      hs('path', { d: 'M19.69 5.23 8.96 15.96l-4.23-4.23L2.96 13.5l6 6L21.46 7z' }))
                  )
                )
              ),
              h('button', { class: 'tg-p-fondo', type: 'button', 'data-r': 'fondo-bloqueo', 'aria-label': 'Cambiar el fondo de la pantalla de bloqueo' },
                h('span', { class: 'tg-m-bloqueo' },
                  h('span', { class: 'tg-m-hora', 'data-r': 'hora' }),
                  h('span', { class: 'tg-m-fecha', 'data-r': 'fecha' }),
                  h('span', { class: 'tg-m-tecla' }, 'Espacio')
                ),
                h('span', { class: 'tg-p-cambiar' }, SVG_IMAGEN(), 'Cambiar fondo')
              ),
              h('span', { class: 'tg-p-fondo-nombre' }, 'Pantalla de Bloqueo'),
              h('button', { class: 'tg-p-btn', type: 'button', 'data-r': 'reset-bloqueo', hidden: true }, SVG_RESET(), 'Restablecer fondo')
            )
          )
        )
      )
    );

    const q = (r) => backdrop.querySelector('[data-r="' + r + '"]');
    const panel = backdrop.querySelector('#tg-personalizar-panel');

    // ---- interruptor general Gemini Vibes ----
    (function () {
      const swV = q('sw-vibes');
      const pintarVibes = () => {
        swV.setAttribute('aria-checked', vibesOn ? 'true' : 'false');
        panel.classList.toggle('tg-vibes-apagado', !vibesOn);
      };
      swV.addEventListener('click', () => { cambiarVibes(!vibesOn); pintarVibes(); });
      pintarVibes();
    })();

    // ---- rendimiento ----
    (function () {
      const OPC = [
        { v: 'auto', t: 'Automático' }, { v: 'maximo', t: 'Máximo' }, { v: 'ligero', t: 'Ligero' }
      ];
      const fila = h('div', { class: 'tg-p-colores' });
      const botones = OPC.map((o) => {
        const b = h('button', { class: 'tg-p-btn', type: 'button', 'data-perfil': o.v }, o.t);
        b.addEventListener('click', () => { cambiarPerfil(o.v); pintarPerfil(); });
        fila.appendChild(b);
        return b;
      });
      function pintarPerfil() {
        botones.forEach((b) => { const on = b.getAttribute('data-perfil') === perfilModo; b.style.background = on ? 'var(--p-hover)' : ''; b.style.outline = on ? '2px solid var(--p-texto)' : ''; });
      }
      const swL = h('button', { class: 'tg-p-switch', type: 'button', role: 'switch', 'aria-checked': lenisUsuario ? 'true' : 'false', 'aria-label': 'Scroll suave (Lenis)' },
        h('span', { class: 'tg-p-sw-track' }),
        h('span', { class: 'tg-p-sw-handle' },
          hs('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, hs('path', { d: 'M19.69 5.23 8.96 15.96l-4.23-4.23L2.96 13.5l6 6L21.46 7z' }))));
      swL.addEventListener('click', () => { cambiarLenis(!lenisUsuario); swL.setAttribute('aria-checked', lenisUsuario ? 'true' : 'false'); });
      const filaLenis = h('div', { class: 'tg-p-toggle', style: 'margin-top:12px' },
        h('span', { class: 'tg-p-toggle-txt' },
          h('span', { class: 'tg-p-toggle-tit' }, 'Scroll suave (Lenis)'),
          h('span', { class: 'tg-p-toggle-sub' }, 'Apágalo para usar el scroll nativo. En pantallas táctiles ya no se usa.')),
        swL);
      const swB = h('button', { class: 'tg-p-switch', type: 'button', role: 'switch', 'aria-checked': sinBlur ? 'true' : 'false', 'aria-label': 'Desactivar efectos de desenfoque' },
        h('span', { class: 'tg-p-sw-track' }),
        h('span', { class: 'tg-p-sw-handle' },
          hs('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, hs('path', { d: 'M19.69 5.23 8.96 15.96l-4.23-4.23L2.96 13.5l6 6L21.46 7z' }))));
      swB.addEventListener('click', () => { cambiarSinBlur(!sinBlur); swB.setAttribute('aria-checked', sinBlur ? 'true' : 'false'); });
      const filaBlur = h('div', { class: 'tg-p-toggle tg-p-ctl-blur', style: 'margin-top:12px' },
        h('span', { class: 'tg-p-toggle-txt' },
          h('span', { class: 'tg-p-toggle-tit' }, 'Desactivar desenfoque'),
          h('span', { class: 'tg-p-toggle-sub' }, 'Quita todos los efectos de desenfoque (cristal). Ayuda si va lento.')),
        swB);
      panel.appendChild(h('section', { class: 'tg-p-seccion tg-p-seccion-vibes' },
        h('h3', { class: 'tg-p-titulo' }, 'Rendimiento'),
        h('p', { class: 'tg-p-sub' }, 'Automático reduce los efectos de desenfoque solo si tu equipo va a tirones. Máximo los deja siempre al tope.'),
        fila,
        filaBlur,
        filaLenis));
      pintarPerfil();
    })();

    // ---- burbuja ----
    const contColores = q('colores');
    const sliderTono = q('tono');
    const sliderAlfa = q('alfa');
    const botonesColor = COLORES.map((c) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tg-p-color'; b.title = c.n; b.setAttribute('aria-label', c.n);
      b.style.background = 'hsl(' + c.h + ', ' + c.s + '%, 50%)';
      b.addEventListener('click', () => { burbuja.h = c.h; burbuja.s = c.s; cambioBurbuja(); });
      contColores.appendChild(b);
      return b;
    });
    const libre = document.createElement('label');
    libre.className = 'tg-p-color tg-p-color-libre'; libre.title = 'Color personalizado';
    const inputColor = document.createElement('input');
    inputColor.type = 'color'; inputColor.setAttribute('aria-label', 'Color personalizado');
    libre.appendChild(inputColor);
    contColores.appendChild(libre);
    inputColor.addEventListener('input', () => {
      const hsl = hexAHsl(inputColor.value);
      burbuja.h = hsl.h; burbuja.s = Math.max(hsl.s, 0); cambioBurbuja();
    });

    function hexAHsl(hex) {
      const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
      let h = 0, s = 0;
      if (d) {
        s = d / (1 - Math.abs(2 * l - 1));
        if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
        h = Math.round(h * 60); if (h < 0) h += 360;
      }
      return { h: h, s: Math.round(s * 100), l: Math.round(l * 100) };
    }
    function hslAHex(h, s, l) {
      s /= 100; l /= 100;
      const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
      const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
      return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
    }

    function pintarBurbuja() {
      const solido = burbujaCSS(burbuja, false);
      backdrop.style.setProperty('--tg-pers-bg', burbujaCSS(burbuja));
      backdrop.style.setProperty('--tg-pers-texto', burbujaTexto(burbuja));
      backdrop.style.setProperty('--tg-pers-solido', solido);
      const h = burbuja.h, s = burbuja.s;
      sliderTono.style.setProperty('--ramp', 'linear-gradient(to right, hsl(' + h + ',' + s + '%,12%), hsl(' + h + ',' + s + '%,50%), hsl(' + h + ',' + s + '%,96%))');
      sliderAlfa.style.setProperty('--ramp', 'linear-gradient(to right, ' + burbujaCSS({ h: h, s: s, tono: burbuja.tono, alfa: 15 }) + ', ' + solido + '), repeating-conic-gradient(rgba(128,128,128,0.45) 0 25%, transparent 0 50%) 0 0 / 10px 10px');
      sliderTono.value = burbuja.tono;
      sliderAlfa.value = burbuja.alfa;
      q('tono-valor').textContent = burbuja.tono < 25 ? 'Oscuro' : burbuja.tono > 75 ? 'Blanco' : 'Color';
      q('alfa-valor').textContent = (100 - burbuja.alfa) + '% transparente';
      botonesColor.forEach((b, i) => b.classList.toggle('tg-sel', COLORES[i].h === burbuja.h && COLORES[i].s === burbuja.s));
      const esLibre = !COLORES.some((c) => c.h === burbuja.h && c.s === burbuja.s);
      libre.classList.toggle('tg-sel', esLibre);
      inputColor.value = hslAHex(burbuja.h, burbuja.s, 50);
      backdrop.querySelectorAll('[data-tono]').forEach((b) => b.classList.toggle('tg-sel', +b.dataset.tono === burbuja.tono));
    }
    function cambioBurbuja() { pintarBurbuja(); aplicarBurbuja(true); }

    sliderTono.addEventListener('input', () => { burbuja.tono = +sliderTono.value; cambioBurbuja(); });
    sliderAlfa.addEventListener('input', () => { burbuja.alfa = +sliderAlfa.value; cambioBurbuja(); });
    backdrop.querySelectorAll('[data-tono]').forEach((b) => b.addEventListener('click', () => { burbuja.tono = +b.dataset.tono; cambioBurbuja(); }));
    q('reset-burbuja').addEventListener('click', () => { restablecerBurbuja(); pintarBurbuja(); });

    // ---- fondos ----
    function urlBloqueoPorDefecto() {
      return urlFondoBloqueoDefecto();
    }
    function pintarFondos() {
      ponerMedio(q('vista'), fondoGeminiActual, fondoGeminiTipo);
      ponerMedio(q('fondo-gemini'), fondoGeminiActual, fondoGeminiTipo);
      if (bloqueoFondoPersonalizado) ponerMedio(q('fondo-bloqueo'), bloqueoFondoPersonalizado, bloqueoFondoTipo);
      else ponerMedio(q('fondo-bloqueo'), urlBloqueoPorDefecto(), 'imagen');
      q('reset-bloqueo').hidden = !bloqueoFondoPersonalizado;
    }
    function pintarReloj() {
      const ahora = new Date();
      q('hora').textContent = ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      q('fecha').textContent = ahora.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    q('fondo-gemini').addEventListener('click', () => fileInput.click());
    q('fondo-bloqueo').addEventListener('click', () => bloqueoFileInput.click());
    const sw = q('sw-bloqueo');
    const pintarSwitch = () => sw.setAttribute('aria-checked', bloqueoActivoGuardado() ? 'true' : 'false');
    sw.addEventListener('click', () => { guardarBloqueoActivo(!bloqueoActivoGuardado()); pintarSwitch(); });
    pintarSwitch();
    q('reset-bloqueo').addEventListener('click', () => {
      bloqueoFondoPersonalizado = '';
      bloqueoFondoTipo = 'imagen';
      aplicarFondoBloqueo(document.getElementById('tg-bloqueo-fondo'));
      bdBorrar('bloqueo').catch(() => {});
      liberarUrlVideo('bloqueo');
      const alm = almacenLocal();
      if (alm) alm.remove(['geminiFondoBloqueo', 'geminiFondoBloqueoTipo']);
      pintarFondos();
    });
    document.addEventListener('tg-fondos-cambiados', pintarFondos);

    // ---- cierre ----
    function onTecla(e) { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } }
    function limpiar() {
      document.removeEventListener('tg-fondos-cambiados', pintarFondos);
      document.removeEventListener('keydown', onTecla, true);
    }
    function cerrar() {
      limpiar();
      backdrop.classList.remove('tg-visible');
      setTimeout(() => backdrop.remove(), 200);
    }
    backdrop._limpiar = limpiar;
    document.addEventListener('keydown', onTecla, true);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) cerrar(); });
    backdrop.querySelector('.tg-p-cerrar').addEventListener('click', cerrar);
    panel.addEventListener('click', (e) => e.stopPropagation());

    pintarBurbuja();
    pintarFondos();
    pintarReloj();
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => { backdrop.classList.add('tg-visible'); backdrop.querySelector('.tg-p-cerrar').focus({ preventScroll: true }); });
  }

  
  function agregarItemFondo(menu) {
    if (!menu) return;
    const items = [...menu.querySelectorAll('.mat-mdc-menu-item')];
    if (!items.length) return; // los ítems aún no se han dibujado; se reintenta cuando aparezcan
    const tema = items.find((i) => /\b(tema|theme)\b/i.test(i.textContent));
    let ancla = menu.querySelector('#' + ID_ITEM_PERSONALIZAR) || menu.querySelector('#' + ID_ITEM_FONDO) || tema || items[items.length - 1];

    if (!menu.querySelector('#' + ID_ITEM_PERSONALIZAR)) {
      const itemPersonalizar = crearItemPersonalizar(menu);
      ancla.parentElement.insertBefore(itemPersonalizar, ancla.nextSibling);
      ancla = itemPersonalizar;
    }

    // (los ítems "Cambiar fondo" y "Cambiar fondo del bloqueo" ya no van en el menú: ahora se cambian desde el panel Personalizar)
    menu.querySelectorAll('#' + ID_ITEM_FONDO + ', #' + ID_ITEM_FONDO_BLOQUEO).forEach((e) => e.remove());
  }

  // El menú lateral apila varias capas translúcidas (bard-sidenav + side-navigation-content + ...): el color que
  // se ve es la suma de todas. Se calcula ese color real y se usa en el menú de ajustes y en el panel Personalizar,
  // así los tres se ven IGUAL de oscuros.
  function actualizarFondoMenuLateral() {
    try {
      const capas = [...document.querySelectorAll('mat-sidenav, .mat-drawer.mat-sidenav, bard-sidenav, side-navigation-content, .sidenav-with-history-container')];
      if (!capas.length) { document.documentElement.style.removeProperty('--tg-sidebar-efectivo'); return; }
      const prof = (e) => { let n = 0; while (e.parentElement) { e = e.parentElement; n++; } return n; };
      capas.sort((a, b) => prof(a) - prof(b)); // de afuera hacia adentro
      let r = 0, g = 0, b = 0, a = 0;
      capas.forEach((el) => {
        const c = parsearColor(getComputedStyle(el).backgroundColor);
        if (!c || c.a <= 0) return;
        const sa = c.a, oa = sa + a * (1 - sa);
        r = (c.r * sa + r * a * (1 - sa)) / oa; g = (c.g * sa + g * a * (1 - sa)) / oa; b = (c.b * sa + b * a * (1 - sa)) / oa; a = oa;
      });
      if (a > 0) document.documentElement.style.setProperty('--tg-sidebar-efectivo', 'rgba(' + Math.round(r) + ', ' + Math.round(g) + ', ' + Math.round(b) + ', ' + a.toFixed(3) + ')');
    } catch (e) { /* nunca debe romper la página */ }
  }

  function marcarCapasMenu(menu) {
    if (!vibesOn) return;
    actualizarFondoMenuLateral();
    const panel = (menu.closest && menu.closest('.mat-mdc-menu-panel')) || menu;
    const capas = new Set([menu]);
    let el = menu;
    while (el && el !== panel) { capas.add(el); el = el.parentElement; }
    menu.querySelectorAll('.mat-mdc-menu-content').forEach((c) => capas.add(c));
    [...menu.children].forEach((c) => capas.add(c));
    capas.delete(panel);
    panel.setAttribute('data-tg-menu-capa', 'blur');
    capas.forEach((c) => c.setAttribute('data-tg-menu-capa', 'limpia'));
  }

  // MENÚS FLOTANTES: ajustes, opciones de conversación, "+" de adjuntos, submenú de Tema y <gem-menu>.
  // Todos llevan el mismo vidrio que el menú lateral (una sola capa con blur de fondo).
  // Animación: los mat-menu (ajustes, conversación, Tema) ya traen la nativa de Gemini: aparecen con un zoom corto
  // (0.8 -> 1, 120 ms) y se van con un fundido (100 ms). El menú "+" y <gem-menu> NO la traen: se les copia la misma.
  const SEL_MENUS = '.mat-mdc-menu-panel, mat-card.lm-menu-theme, gem-menu';
  const menusPropios = new Set();                      // menús que animamos nosotros (los que no son mat-menu)
  let ultimoClic = { el: null, x: 0, y: 0, t: 0 };     // último clic/toque: de ahí nace el zoom
  function sinMovimiento() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  function origenDelMenu() {
    const expandidos = [...document.querySelectorAll('[aria-expanded="true"][aria-haspopup]')]
      .filter((e) => e.tagName !== 'GEM-MENU' && e.getBoundingClientRect().width > 0);
    let el = expandidos.length ? expandidos[expandidos.length - 1] : null;
    if (!el && ultimoClic.el && ultimoClic.el.isConnected && Date.now() - ultimoClic.t < 1500) el = ultimoClic.el;
    if (el) { const r = el.getBoundingClientRect(); if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    if (Date.now() - ultimoClic.t < 1500) return { x: ultimoClic.x, y: ultimoClic.y };
    return null;
  }
  // esquina del menú más cercana al botón que lo abrió (como hace Angular Material con transform-origin)
  function esquinaDelMenu(el) {
    const r = (el.closest('.cdk-overlay-pane') || el).getBoundingClientRect();
    const o = origenDelMenu();
    if (!o || (!r.width && !r.height)) return 'left top';
    return (o.x < r.left + r.width / 2 ? 'left' : 'right') + ' ' + (o.y > r.top + r.height / 2 ? 'bottom' : 'top');
  }
  function aparecerMenuPropio(el) {
    menusPropios.add(el);
    if (!el.animate || sinMovimiento()) return;
    el.style.transformOrigin = esquinaDelMenu(el);
    el.animate(
      [{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'none' }],
      { duration: 120, easing: 'cubic-bezier(0, 0, 0.2, 1)' }
    );
  }
  // al cerrar, Gemini quita estos menús al instante: se deja una copia que se desvanece como en los mat-menu
  function desvanecerMenusPropios() {
    [...menusPropios].forEach((el) => {
      menusPropios.delete(el);
      if (!el.isConnected || !el.animate || sinMovimiento()) return;
      try {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const cs = getComputedStyle(el);
        const copia = el.cloneNode(true);
        copia.removeAttribute('id');
        copia.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
        copia.setAttribute('aria-hidden', 'true');
        Object.assign(copia.style, {
          inset: 'auto', position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
          margin: '0', padding: cs.padding, maxWidth: 'none', maxHeight: 'none', zIndex: '2147483000', pointerEvents: 'none',
          animation: 'none', transition: 'none', transform: 'none', opacity: '1', visibility: 'visible',
          display: cs.display === 'inline' || cs.display === 'contents' ? 'block' : cs.display,
          color: cs.color, fontFamily: cs.fontFamily, fontSize: cs.fontSize
        });
        copia.setAttribute('popover', 'manual'); // los menús viven en la capa superior del navegador: la copia también
        document.body.appendChild(copia);
        try { if (copia.showPopover) copia.showPopover(); } catch (e) { /* sin popover: queda como elemento fijo */ }
        const fin = () => copia.remove();
        const a = copia.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, delay: 25, easing: 'linear', fill: 'both' });
        a.onfinish = fin; a.oncancel = fin;
      } catch (e) { /* nunca debe romper la página */ }
    });
  }
  // cualquier forma de cerrarlos: Esc, clic fuera, o clic en una opción que no abre un submenú
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') desvanecerMenusPropios(); }, true);
  document.addEventListener('pointerdown', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    ultimoClic = { el: t.closest('button, [role="button"], [role^="menuitem"], [aria-haspopup]') || t, x: e.clientX, y: e.clientY, t: Date.now() };
    if (menusPropios.size && !t.closest(SEL_MENUS)) desvanecerMenusPropios();
  }, true);
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!menusPropios.size || !t || !t.closest || !t.closest(SEL_MENUS)) return;
    const it = t.closest('.mat-mdc-menu-item, .mat-mdc-list-item, gem-menu-item');
    const hp = it && it.getAttribute('aria-haspopup');
    if (!it || hp === 'menu' || hp === 'true' || it.getAttribute('aria-disabled') === 'true' || it.disabled) return;
    desvanecerMenusPropios();
  }, true);

  // <gem-menu> (selector de modelo, nivel de pensamiento, opciones de conversación): se crea con data-visible="false"
  // y pasa a "true" un instante después, así que la animación debe empezar en ese momento (y cada vez que se reutilice)
  function vigilarGemMenu(gm) {
    if (gm._tgVigilado) return;
    gm._tgVigilado = true;
    gm._tgVisible = false;
    const revisar = () => {
      const v = gm.getAttribute('data-visible') === 'true';
      if (v && !gm._tgVisible) aparecerMenuPropio(gm);
      if (!v) menusPropios.delete(gm);
      gm._tgVisible = v;
    };
    new MutationObserver(revisar).observe(gm, { attributes: true, attributeFilter: ['data-visible'] });
    revisar();
  }

  // vidrio: una sola capa con blur (el propio menú); los contenedores que lo envuelven quedan transparentes
  function marcarMenuFlotante(el) {
    if (!el || el._tgRegistrado || !vibesOn) return;
    if (el.tagName !== 'GEM-MENU' && !el.closest('.cdk-overlay-pane')) return;
    el._tgRegistrado = true;
    actualizarFondoMenuLateral();
    const pane = el.closest('.cdk-overlay-pane');
    if (pane) {
      let p = el.parentElement;
      while (p) {
        p.setAttribute('data-tg-menu-capa', 'limpia');
        if (p === pane) break;
        p = p.parentElement;
      }
    }
    el.setAttribute('data-tg-menu-capa', 'blur');
    el.querySelectorAll('.mat-mdc-menu-content, mat-action-list').forEach((c) => c.setAttribute('data-tg-menu-capa', 'limpia'));
    if (el.tagName === 'GEM-MENU') vigilarGemMenu(el); else if (el.matches('mat-card')) aparecerMenuPropio(el);
  }

  // ===== MENÚ DE AJUSTES MÓVIL (hoja inferior / bottom sheet) =====
  // En vista angosta Gemini no abre el menú de escritorio (.desktop-settings-menu) sino una hoja inferior con
  // <mat-action-list class="mobile-settings-and-help-menu">. Aquí se agrega un botón "Personalizar" justo debajo de "Tema"
  // que abre el mismo panel de personalización (abrirPanelPersonalizar) y cierra la hoja.
  const ID_ITEM_PERSONALIZAR_MOVIL = 'tg-item-personalizar-movil';
  (function () {
    const est = document.createElement('style');
    est.id = 'tg-personalizar-movil-style';
    est.textContent = `
      #${ID_ITEM_PERSONALIZAR_MOVIL} .tg-menu-ico-m { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; color: inherit; }
      #${ID_ITEM_PERSONALIZAR_MOVIL} .tg-menu-ico-m svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      #${ID_ITEM_PERSONALIZAR_MOVIL} mat-icon { display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(est);
  })();

  function crearItemPersonalizarMovil(lista) {
    const items = [...lista.querySelectorAll(':scope > .mat-mdc-list-item')];
    // plantilla: un botón normal (sin flecha a la derecha ni enlace) para heredar el estilo exacto de Gemini
    const plantilla =
      items.find((i) => i.tagName === 'BUTTON' && !i.classList.contains('mdc-list-item--with-trailing-meta')) ||
      items.find((i) => !i.classList.contains('mdc-list-item--with-trailing-meta'));
    if (!plantilla) return null;
    const item = plantilla.cloneNode(true);
    ['id', 'jslog', 'data-test-id', 'aria-describedby', 'cdk-describedby-host', 'aria-controls', 'aria-haspopup',
     'aria-expanded', 'href', 'target', 'rel', 'routerlink', 'queryparamshandling']
      .forEach((a) => item.removeAttribute(a));
    item.querySelectorAll('[id], [jslog]').forEach((e) => { e.removeAttribute('id'); e.removeAttribute('jslog'); });
    item.id = ID_ITEM_PERSONALIZAR_MOVIL;
    item.setAttribute('type', 'button');
    item.setAttribute('role', 'button');
    item.removeAttribute('disabled');
    item.setAttribute('aria-disabled', 'false');
    ponerTexto(item, ETIQUETA_PERSONALIZAR);
    // icono: se reemplaza el glifo de Gemini por el mismo icono SVG que usa el menú de escritorio
    const contIcono = item.querySelector('gem-icon') || item.querySelector('mat-icon');
    if (contIcono) {
      contIcono.querySelectorAll('mat-icon').forEach((m) => m.remove());
      const span = h('span', { class: 'tg-menu-ico-m', 'aria-hidden': 'true' }, SVG_MENU.personalizar());
      contIcono.appendChild(span);
    }
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      abrirPanelPersonalizar();
      cerrarMenuAjustes();
    });
    return item;
  }

  function agregarItemMovil() {
    document.querySelectorAll('.mobile-settings-and-help-menu').forEach((lista) => {
      if (lista.querySelector('#' + ID_ITEM_PERSONALIZAR_MOVIL)) return;
      const items = [...lista.children].filter((i) => i.matches && i.matches('.mat-mdc-list-item, [mat-list-item]'));
      if (!items.length) return; // aún no se dibujan las opciones: se reintenta
      // ancla: el ítem "Tema" (por su título o por su icono "routine"); si no se encuentra, antes del primer separador
      const textoItem = (i) => ((i.querySelector('[matlistitemtitle], .mat-mdc-list-item-title') || i).textContent || '').trim();
      let ancla = items.find((i) => /^(tema|theme)$/i.test(textoItem(i))) ||
                  items.find((i) => i.querySelector('[fonticonname="routine"], [data-mat-icon-name="routine"]'));
      let antesDe = ancla ? ancla.nextSibling : null;
      if (!ancla) {
        if (items.length < 5) return; // la lista aún se está dibujando
        const sep = lista.querySelector(':scope > mat-divider');
        if (!sep) return;
        antesDe = sep;
      }
      const nuevo = crearItemPersonalizarMovil(lista);
      if (!nuevo) { console.warn('[tg] no se encontró plantilla para el botón Personalizar móvil'); return; }
      lista.insertBefore(nuevo, antesDe);
      console.log('[tg] botón Personalizar agregado al menú móvil');
    });
  }

  const SEL_RAPIDO = '.mobile-settings-and-help-menu, .desktop-settings-menu, .mat-mdc-menu-panel, mat-card.lm-menu-theme, gem-menu, mat-bottom-sheet-container, gem-bottom-sheet';
  function buscarMenuAjustes(nodo) {
    if (!nodo || nodo.nodeType !== 1) return;
    // salida barata: casi todos los nodos nuevos no tienen nada que ver con menús (una sola consulta en vez de ~6)
    if (!nodo.closest('.cdk-overlay-container, ' + SEL_RAPIDO) && !nodo.querySelector(SEL_RAPIDO)) return;
    if ((nodo.matches && nodo.matches('mat-bottom-sheet-container, gem-bottom-sheet, .mobile-settings-and-help-menu')) ||
        (nodo.querySelector && nodo.querySelector('.mobile-settings-and-help-menu')) ||
        (nodo.closest && nodo.closest('.mobile-settings-and-help-menu'))) {
      try { agregarItemMovil(); } catch (e) { console.warn('[tg] error en agregarItemMovil:', e); }
    }
    const menus = new Set();
    if (nodo.matches && nodo.matches('.desktop-settings-menu')) menus.add(nodo);
    if (nodo.querySelectorAll) nodo.querySelectorAll('.desktop-settings-menu').forEach((m) => menus.add(m));
    const padre = nodo.closest && nodo.closest('.desktop-settings-menu');
    if (padre) menus.add(padre);
    menus.forEach((m) => { marcarCapasMenu(m); agregarItemFondo(m); });
    const flotantes = new Set();
    if (nodo.matches && nodo.matches(SEL_MENUS)) flotantes.add(nodo);
    if (nodo.querySelectorAll) nodo.querySelectorAll(SEL_MENUS).forEach((m) => flotantes.add(m));
    const padreMenu = nodo.closest && nodo.closest(SEL_MENUS);
    if (padreMenu) flotantes.add(padreMenu);
    flotantes.forEach(marcarMenuFlotante);
  }
  buscarMenuAjustes(document.body);

  // Burbujas ya existentes
  registrarBurbujas(document.body);

  // ============================================================================================
  // PLANIFICADOR + UN SOLO MutationObserver (optimización)
  // - Tareas: cada tarea de layout solo corre si fue marcada, UNA vez por frame, y nunca con la pestaña oculta.
  //   Reemplaza a los setInterval que medían el DOM cada 300/700/2000 ms.
  // - Un único MutationObserver agrupa los nodos nuevos por frame e IGNORA el texto que llega en streaming
  //   (.markdown / code-block): ahí no hay burbujas, menús ni carruseles que buscar.
  // ============================================================================================
  const Tareas = (function () {
    const reg = new Map(), sucias = new Set();
    let programado = false;
    function correr() {
      programado = false;
      if (document.hidden || pantallaBloqueada) return; // se retoma en visibilitychange / al desbloquear
      const lista = Array.from(sucias); sucias.clear();
      lista.forEach((n) => { try { reg.get(n)(); } catch (e) { console.warn('[tg] error en tarea ' + n + ':', e); } });
    }
    function pedir() { if (!programado && !pantallaBloqueada) { programado = true; requestAnimationFrame(correr); } }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && sucias.size) pedir(); });
    // al desbloquear se ponen al día TODAS las tareas (durante el bloqueo no corrió ninguna)
    function reanudar() { reg.forEach((f, n) => sucias.add(n)); if (!document.hidden) pedir(); }
    document.addEventListener('tg-bloqueo-cambio', () => { if (!pantallaBloqueada) reanudar(); });
    return {
      registrar(n, f) { reg.set(n, f); },
      marcar(n) { sucias.add(n); if (!document.hidden && !pantallaBloqueada) pedir(); }
    };
  })();
  // setInterval que no trabaja con la pestaña oculta
  const cada = (fn, ms) => setInterval(() => { if (!document.hidden && !pantallaBloqueada) { try { fn(); } catch (e) { console.warn('[tg] ' + fn.name + ':', e); } } }, ms);

  Tareas.registrar('layout', () => { actualizarVarSafeTop(); limpiarCapasEtiqueta(); alinearHeaderAngosto(); alinearMultimedia(); asegurarFadeChat(); });
  Tareas.registrar('menuLateral', () => { marcarCapasMenuLateral(); actualizarFondoMenuLateral(); });
  Tareas.registrar('cero', () => actualizarFondoCero());
  Tareas.registrar('tema', () => revisarTemaBody());
  Tareas.registrar('colapso', () => gestionarColapsoRespuestas());

  // el layout se recalcula SOLO cuando cambian de tamaño las piezas que importan
  const roLayout = new ResizeObserver(() => Tareas.marcar('layout'));
  function observarLayout() {
    ['#chat-history', 'top-bar-actions', 'input-container', 'input-area-v2 .text-input-field', 'infinite-scroller', 'bard-mode-switcher']
      .forEach((sel) => { const e = document.querySelector(sel); if (e && !e._tgRO) { e._tgRO = true; roLayout.observe(e); } });
  }
  window.addEventListener('resize', () => { Tareas.marcar('layout'); Tareas.marcar('menuLateral'); });

  // marca (desde JS, no con :has() en CSS) los contenedores de respuesta que todavía no tienen texto
  function marcarCargandoRespuesta() {
    const todos = document.querySelectorAll('.response-container');
    for (let i = Math.max(0, todos.length - 2); i < todos.length; i++) {
      const r = todos[i];
      const cargando = !r.querySelector('.response-footer.complete') &&
        !r.querySelector('.markdown p, .markdown li, .markdown h1, .markdown h2, .markdown h3, .markdown h4, .markdown h5, .markdown h6, .markdown pre, .markdown table, .markdown ul, .markdown ol, .markdown blockquote');
      if (cargando !== r.hasAttribute('data-tg-cargando')) r.toggleAttribute('data-tg-cargando', cargando);
    }
  }

  // ============================================================================================
  // RESPUESTAS LARGAS DE GEMINI: SE CONTRAEN Y SE PUEDEN EXPANDIR (igual que las burbujas del usuario)
  // - solo se evalúa una respuesta YA COMPLETA (.response-footer.complete): mientras se escribe NO se contrae
  // - si la respuesta se vio escribiéndose en esta sesión, al terminar se queda EXTENDIDA (con botón para contraerla)
  // - las respuestas que ya estaban terminadas (historial, chat recargado) y miden más de COLAPSO_UMBRAL_PX arrancan contraídas
  // - contraída: altura COLAPSO_ALTO_PX con desvanecido abajo + botón redondo "expandir"
  // ============================================================================================
  const COLAPSO_ALTO_PX = 250;     // alto de la respuesta contraída
  const COLAPSO_UMBRAL_PX = 420;   // desde este alto (contenido completo) se considera "larguísima"
  const COLAPSO_MS = 380;
  (function () {
    const est = document.createElement('style');
    est.id = 'tg-colapso-style';
    est.textContent = `
      /* alto del desvanecido: registrado como <length> para poder animarlo (el desvanecido aparece/desaparece suave) */
      @property --tg-fade { syntax: '<length>'; inherits: false; initial-value: 110px; }
      .response-container[data-tg-colapso="contraida"] > .presented-response-container {
        max-height: ${COLAPSO_ALTO_PX}px !important;
        overflow: hidden !important;
      }
      .response-container[data-tg-colapso="contraida"] > .presented-response-container,
      .response-container > .presented-response-container[data-tg-fade-anim] {
        -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - var(--tg-fade)), transparent 100%) !important;
        mask-image: linear-gradient(to bottom, #000 calc(100% - var(--tg-fade)), transparent 100%) !important;
      }
      .tg-colapso-toggle { display: flex; justify-content: flex-end; margin: 6px 0 0; position: relative; z-index: 1; transition: margin-top ${COLAPSO_MS}ms cubic-bezier(0.22, 1, 0.36, 1); }
      .response-container[data-tg-colapso="contraida"] > .tg-colapso-toggle { margin-top: -34px; }
      .tg-colapso-btn {
        height: 40px; padding: 0 12px 0 16px; border: 0; border-radius: 9999px; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        background: var(--tg-input-bg, rgba(0, 0, 0, 0.55)); color: var(--tg-texto, #fff);
        font: inherit; font-size: 14px; line-height: 1; white-space: nowrap;
        -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
        transition: transform 0.2s ease;
      }
      .tg-colapso-btn:hover { transform: scale(1.04); }
      .tg-colapso-txt::before { content: 'Mostrar mensaje completo'; }
      .response-container[data-tg-colapso="expandida"] .tg-colapso-txt::before { content: 'Mostrar menos'; }
      .tg-colapso-btn svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.3s ease; }
      .response-container[data-tg-colapso="expandida"] .tg-colapso-btn svg { transform: rotate(180deg); }
      @media (prefers-reduced-motion: reduce) { .tg-colapso-btn, .tg-colapso-btn svg, .tg-colapso-toggle { transition: none; } }
    `;
    (document.head || document.documentElement).appendChild(est);
  })();

  function quitarColapso(r, cont) {
    if (r.hasAttribute('data-tg-colapso')) r.removeAttribute('data-tg-colapso');
    const t = r.querySelector(':scope > .tg-colapso-toggle');
    if (t) t.remove();
    r._tgColapsoEval = false;
    r._tgColapsoIntentos = 0;
  }

  // al contraer una respuesta larga el scroll sube SUAVEMENTE (junto con la animación de la burbuja) hasta dejar su inicio a la vista
  let colapsoScrollId = 0;
  function scrollSuaveHaciaRespuesta(r) {
    const scroller = contenedorScroll(r);
    const margen = 84 + (typeof alturaAreaSuperior === 'function' ? alturaAreaSuperior() : 0); // aire bajo el header
    const id = ++colapsoScrollId;
    const t0 = performance.now();
    let parado = false;
    const parar = () => { parado = true; };
    window.addEventListener('wheel', parar, { once: true, passive: true });
    window.addEventListener('touchmove', parar, { once: true, passive: true });
    function cuadro() {
      if (parado || id !== colapsoScrollId || !r.isConnected) return;
      const t = performance.now() - t0;
      const falta = r.getBoundingClientRect().top - margen; // negativo = el inicio quedó arriba de lo visible
      if (falta < -1) {
        let paso = falta * 0.16; // avance proporcional (ease-out)
        if (paso > -1) paso = -1;
        scroller.scrollTop += paso;
      } else if (t > COLAPSO_MS + 250) return; // alineado y la animación ya terminó
      if (t < 3000) requestAnimationFrame(cuadro);
    }
    requestAnimationFrame(cuadro);
  }

  function cambiarColapso(r, cont, expandir) {
    const completo = cont.scrollHeight;
    // las burbujas no se esconden/reaparecen mientras todo se acomoda (se recargaban las animaciones)
    colapsoPausaHasta = performance.now() + COLAPSO_MS + 1800;
    const anima = !!cont.animate && !sinMovimiento();
    const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
    if (expandir) {
      r.setAttribute('data-tg-colapso', 'expandida');
      if (anima && completo > COLAPSO_ALTO_PX) {
        cont.style.setProperty('overflow', 'hidden');
        cont.setAttribute('data-tg-fade-anim', ''); // el desvanecido se mantiene mientras crece y se va apagando
        const fin = () => { cont.style.removeProperty('overflow'); cont.removeAttribute('data-tg-fade-anim'); };
        const a = cont.animate(
          [{ maxHeight: COLAPSO_ALTO_PX + 'px', '--tg-fade': '110px' }, { maxHeight: completo + 'px', '--tg-fade': '0px' }],
          { duration: COLAPSO_MS, easing });
        a.onfinish = fin; a.oncancel = fin;
      }
    } else {
      r.setAttribute('data-tg-colapso', 'contraida');
      if (anima) {
        cont.animate(
          [{ maxHeight: completo + 'px', '--tg-fade': '0px' }, { maxHeight: COLAPSO_ALTO_PX + 'px', '--tg-fade': '110px' }],
          { duration: COLAPSO_MS, easing });
        scrollSuaveHaciaRespuesta(r);
      } else if (r.getBoundingClientRect().top < 0) {
        r.scrollIntoView({ block: 'start' });
      }
    }
  }

  function crearToggleColapso(r, cont) {
    const btn = h('button', { class: 'tg-colapso-btn', type: 'button', 'aria-label': 'Expandir o contraer respuesta', 'aria-expanded': 'false' },
      h('span', { class: 'tg-colapso-txt' }),
      hs('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, hs('path', { d: 'M6 9l6 6 6-6' })));
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { pararSeguimiento(); } catch (err) { /* aún no definido */ }
      const expandir = r.getAttribute('data-tg-colapso') !== 'expandida';
      cambiarColapso(r, cont, expandir);
      btn.setAttribute('aria-expanded', expandir ? 'true' : 'false');
    });
    const caja = h('div', { class: 'tg-colapso-toggle' }, btn);
    cont.insertAdjacentElement('afterend', caja);
    return btn;
  }

  function gestionarColapsoRespuestas() {
    document.querySelectorAll('.response-container').forEach((r) => {
      const cont = r.querySelector(':scope > .presented-response-container');
      if (!cont) return;
      if (!vibesOn) { if (r.hasAttribute('data-tg-colapso') || r._tgColapsoEval) quitarColapso(r, cont); return; }
      if (r._tgColapsoEval) return; // ya decidido: no se vuelve a medir
      const completa = !!r.querySelector('.response-footer.complete');
      if (!completa) { r._tgStreaming = true; return; } // se está escribiendo: nunca se contrae
      const alto = cont.scrollHeight;
      if (alto > COLAPSO_UMBRAL_PX) {
        r._tgColapsoEval = true;
        const btn = crearToggleColapso(r, cont);
        const contraer = !r._tgStreaming; // si se vio escribir en vivo, se queda extendida
        r.setAttribute('data-tg-colapso', contraer ? 'contraida' : 'expandida');
        btn.setAttribute('aria-expanded', contraer ? 'false' : 'true');
      } else if ((r._tgColapsoIntentos = (r._tgColapsoIntentos || 0) + 1) >= 4) {
        r._tgColapsoEval = true; // corta y no se contrae (imágenes que cargan tarde pueden cambiar el alto: se reintenta unas veces)
      }
    });
  }

  const loteNodos = [];
  let loteQuitaron = false, lotePendiente = false;
  const enMarkdown = (n) => !!(n && n.closest && n.closest('.markdown, code-block'));
  const RE_CREANDO_RAPIDO = /^\s*(Creando|Generando)\b/i;
  new MutationObserver((mutaciones) => {
    if (pantallaBloqueada) {
      // bloqueado: no se procesa nada; solo se anotan los nodos nuevos (barato) y se procesan al desbloquear
      for (const m of mutaciones) {
        for (const n of m.addedNodes) if (n.nodeType === 1 && loteNodos.length < 1500) loteNodos.push(n);
        if (m.removedNodes.length) loteQuitaron = true;
      }
      return;
    }
    for (const m of mutaciones) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) {
          loteNodos.push(n);
          // menús (ajustes, "+", Tema...): se procesan AL INSTANTE, igual que antes, para que el botón "Personalizar"
          // y el vidrio estén puestos antes del primer pintado. Los nodos del streaming se ignoran.
          if (!enMarkdown(n)) { try { buscarMenuAjustes(n); } catch (e) { console.warn('[tg] error en menú:', e); } }
        } else if (n.nodeType === 3 && n.parentElement && RE_CREANDO_RAPIDO.test(n.data)) loteNodos.push(n.parentElement);
      }
      if (m.removedNodes.length && !enMarkdown(m.target)) loteQuitaron = true; // se quitó una foto / un mensaje
    }
    if (!lotePendiente) { lotePendiente = true; requestAnimationFrame(procesarLote); }
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('tg-bloqueo-cambio', () => {
    if (pantallaBloqueada || lotePendiente || (!loteNodos.length && !loteQuitaron)) return;
    lotePendiente = true; requestAnimationFrame(procesarLote); // lo acumulado durante el bloqueo
  });

  function procesarLote() {
    lotePendiente = false;
    const nodos = loteNodos.splice(0);
    const quito = loteQuitaron; loteQuitaron = false;
    let hizoAlgo = quito;
    const buscandoCreando = envioParaScroll && performance.now() - envioParaScroll < 10 * 60 * 1000;
    let tocoEstructura = quito;
    for (const n of nodos) {
      if (!n.isConnected || enMarkdown(n)) continue; // texto que llega en streaming: nada que hacer
      hizoAlgo = true;
      // cada paso aislado: si uno falla no se pierden los demás ni el resto del lote
      try { registrarBurbujas(n); } catch (e) { console.warn('[tg] registrarBurbujas:', e); }
      try { ajustarCarruseles(n); } catch (e) { console.warn('[tg] ajustarCarruseles:', e); }
      try { detectarMensajeNuevo(n); } catch (e) { console.warn('[tg] detectarMensajeNuevo:', e); }
      try { if (buscandoCreando || n.tagName === 'THINKING-DOTS-ANIMATION') marcarCreando(n); } catch (e) { console.warn('[tg] marcarCreando:', e); }
      if (n.matches && (n.matches('user-query, .query-file-carousel, .user-query-bubble-with-background') || n.querySelector('.user-query-bubble-with-background, .query-file-carousel'))) Tareas.marcar('layout');
      if (!tocoEstructura && (/^(ZERO|MODULAR|USER-QUERY|MODEL-RESPONSE|CHAT-WINDOW|INFINITE)/.test(n.tagName) ||
          (n.classList && n.classList.contains('zero-state-container')))) tocoEstructura = true;
    }
    if (hizoAlgo) { programarMarcado(); Tareas.marcar('colapso'); }
    if (hizoAlgo || document.querySelector('.response-container[data-tg-cargando]')) marcarCargandoRespuesta();
    if (tocoEstructura) Tareas.marcar('cero');
    if (quito) Tareas.marcar('layout');
  }

  // AUTO-SCROLL SUAVE: CALCULA HASTA DÓNDE LLEGA CADA MENSAJE Y DEJA SU FINAL JUSTO ENCIMA DE LA CAJA DE ESCRIBIR
  // - al enviar tu prompt: el final de tu burbuja queda justo encima de la caja de escribir
  // - al responder la IA: mide la respuesta, la sigue mientras crece y su final queda justo encima de la caja
  // - el movimiento es un desplazamiento suave por fotograma (sube o baja según haga falta)
  // - si mueves el scroll tú mismo (rueda/táctil/teclado) deja de seguir hasta el siguiente mensaje
  const AUTO_SCROLL = true;         // true = al ENVIAR un prompt el chat se desplaza suavemente hasta tu mensaje; false = desactivado
  const MARGEN_SCROLL = 24;         // px libres entre el final del mensaje y la caja de escribir
  const SUAVIDAD_SCROLL = 0.14;     // 0-1: menor = más lento y suave
  const ESTABLE_MS = 1500;          // tras este tiempo alineado y sin cambios, se deja de vigilar
  let siguiendoMensaje = false;
  let mensajeSeguido = null;
  let observadorTamano = null;
  let cuadroScroll = null;
  let desdeEstable = 0;

  function contenedorScroll(desde) {
    let el = desde && desde.parentElement;
    while (el && el !== document.body && el !== document.documentElement) {
      const o = getComputedStyle(el).overflowY;
      if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
      el = el.parentElement;
    }
    return document.querySelector('#chat-history') || document.scrollingElement || document.documentElement;
  }

  function limiteInferiorVisible() {
    const caja = document.querySelector('input-area-v2 .text-input-field') || document.querySelector('input-area-v2');
    const arriba = caja ? caja.getBoundingClientRect().top : window.innerHeight;
    return arriba - MARGEN_SCROLL;
  }

  // distancia (px) entre el final del mensaje y donde debe quedar: positivo = hay que bajar, negativo = subir
  function faltaParaAlinear(el) {
    return el.getBoundingClientRect().bottom - limiteInferiorVisible();
  }

  function cuadroAjuste() {
    cuadroScroll = null;
    if (pantallaBloqueada) return; // se retoma al desbloquear (ver más abajo)
    if (!siguiendoMensaje || !mensajeSeguido || !mensajeSeguido.isConnected) return;
    const cont = contenedorScroll(mensajeSeguido);
    const falta = faltaParaAlinear(mensajeSeguido);
    if (Math.abs(falta) >= 1) {
      desdeEstable = 0;
      // avance proporcional (ease-out): rápido si falta mucho, muy suave al llegar; mínimo 1 px para no atascarse
      let paso = falta * SUAVIDAD_SCROLL;
      if (Math.abs(paso) < 1) paso = Math.sign(falta);
      const antes = cont.scrollTop;
      cont.scrollTop = antes + paso;
      if (cont.scrollTop === antes) desdeEstable = desdeEstable || performance.now(); // no puede moverse más (tope)
    } else if (!desdeEstable) {
      desdeEstable = performance.now();
    }
    if (desdeEstable && performance.now() - desdeEstable > ESTABLE_MS) return; // alineado y quieto: descansa
    cuadroScroll = requestAnimationFrame(cuadroAjuste);
  }

  // ¿hay un envío reciente cuya respuesta todavía se debe seguir? (se cancela si la persona mueve el scroll)
  let usuarioMovioScroll = false;
  let envioParaScroll = 0;
  function respuestaPendiente() {
    return AUTO_SCROLL && vibesOn && !usuarioMovioScroll && envioParaScroll && performance.now() - envioParaScroll < 10 * 60 * 1000;
  }
  function seguirSinReactivar(el) {
    if (usuarioMovioScroll) return;
    seguirMensaje(el);
  }

  function activarAjuste() {
    if (!AUTO_SCROLL || !vibesOn || pantallaBloqueada) return;
    desdeEstable = 0;
    if (!cuadroScroll) cuadroScroll = requestAnimationFrame(cuadroAjuste);
  }

  function seguirMensaje(el) {
    if (!AUTO_SCROLL || !vibesOn) return;
    if (!el || el === mensajeSeguido) return;
    mensajeSeguido = el;
    siguiendoMensaje = true;
    if (observadorTamano) observadorTamano.disconnect();
    // cada vez que el mensaje cambia de tamaño (la IA escribiendo, imágenes, etc.) se vuelve a calcular
    observadorTamano = new ResizeObserver(() => { if (siguiendoMensaje) activarAjuste(); });
    observadorTamano.observe(el);
    activarAjuste();
  }

  // PUNTITOS DE CARGA
  // - marca con data-tg-puntos a los contenedores de <thinking-dots-animation> para pegarlos a la izquierda
  // - mientras la IA carga, el scroll baja hasta esa burbuja y la deja justo encima de la caja de escribir;
  //   cuando llega la respuesta, el seguimiento pasa a la respuesta
  // APARICIÓN RETRASADA DE LA BURBUJA "THINKING": tarda PUNTOS_RETRASO_MS en aparecer y entra con un fundido + zoom suave (no de golpe).
  // Se oculta con opacidad (sigue ocupando su lugar, así el scroll y el layout no cambian) y se muestra con una transición.
  const PUNTOS_RETRASO_MS = 1700;
  const puntosRetrasados = new Set();
  (function () {
    const est = document.createElement('style');
    est.id = 'tg-puntos-retraso-style';
    est.textContent = `
      html body [data-tg-puntos-retraso] {
        transition: opacity 0.6s ease, scale 0.6s cubic-bezier(0.22, 1, 0.36, 1) !important;
        transform-origin: bottom left !important;
      }
      html body [data-tg-puntos-retraso="oculto"] {
        visibility: hidden !important;
        opacity: 0 !important;
        filter: blur(30px) !important;
        scale: 0.85 !important;
        pointer-events: none !important;
      }
      @media (prefers-reduced-motion: reduce) {
        html body [data-tg-puntos-retraso] { transition: none !important; }
        html body [data-tg-puntos-retraso="oculto"] { scale: 1 !important; }
      }
    `;
    (document.head || document.documentElement).appendChild(est);
  })();
  // La espera es UNA sola por cada "thinking" (desde que aparece hasta que llega la respuesta), no una por elemento:
  // si mientras piensa Gemini cambia el mensaje ("Pensando…" -> "Creando tu imagen…") y crea otro elemento, ese NO vuelve a esperar:
  // si todavía falta tiempo se oculta hasta la MISMA hora que el primero, y si ya pasó aparece de inmediato.
  let puntosInicio = 0;        // momento en que empezó la espera de este thinking (0 = ninguna en curso)
  let puntosSinVerDesde = 0;   // desde cuándo no hay ninguna burbuja de carga en pantalla
  function retrasarPuntos(el) {
    if (!el || el._tgRetraso) return;
    const ahora = performance.now();
    if (!puntosInicio) puntosInicio = ahora;
    const resta = PUNTOS_RETRASO_MS - (ahora - puntosInicio);
    el._tgRetraso = true;
    puntosRetrasados.add(el);
    if (resta <= 0) { el.setAttribute('data-tg-puntos-retraso', 'visible'); return; } // ya pasó la espera: aparece directo
    el.setAttribute('data-tg-puntos-retraso', 'oculto');
    void el.offsetWidth; // se pinta oculta antes de la cuenta regresiva (así la transición sí se ve)
    setTimeout(() => {
      if (el.isConnected && el.hasAttribute('data-tg-puntos-retraso')) el.setAttribute('data-tg-puntos-retraso', 'visible');
    }, resta);
  }

  function marcarPuntosCarga() {
    if (!vibesOn) return;
    // casi siempre no hay nada cargando: salida barata (antes recorría el DOM 3 veces por segundo)
    if (!puntosRetrasados.size &&
        !document.querySelector('thinking-dots-animation, [data-tg-puntos], [data-tg-burbuja], [data-tg-creando-caja]')) {
      if (!puntosSinVerDesde) puntosSinVerDesde = performance.now();
      else if (performance.now() - puntosSinVerDesde > 3000) puntosInicio = 0;
      return;
    }
    document.querySelectorAll('[data-tg-puntos]').forEach((el) => {
      if (!el.querySelector('thinking-dots-animation')) el.removeAttribute('data-tg-puntos');
    });
    // terminó de cargar: se limpia para que el siguiente mensaje vuelva a esperar sus 2 segundos
    puntosRetrasados.forEach((el) => {
      if (!el.isConnected || (el.tagName !== 'THINKING-DOTS-ANIMATION' && !el.querySelector('thinking-dots-animation') && !el.hasAttribute('data-tg-creando-caja'))) {
        el.removeAttribute('data-tg-puntos-retraso');
        delete el._tgRetraso;
        puntosRetrasados.delete(el);
      }
    });
    const visibles = [];
    const envolturas = new Set();
    document.querySelectorAll('thinking-dots-animation').forEach((d) => {
      if (!d.getClientRects().length) return; // los ocultos por Gemini se ignoran
      visibles.push(d);
      // contenedor más chico que trae los puntitos Y el texto de estado ("Organizing...", "Pensando..."): será la burbuja
      for (let w = d.parentElement, n = 0; w && n < 5 && w !== document.body; w = w.parentElement, n++) {
        if (w.querySelector('user-query') || w.matches('infinite-scroller, #chat-history, main, chat-window, model-response')) break;
        const t = (w.textContent || '').trim();
        if (t.length > 160) break;
        if (t.length) { envolturas.add(w); break; }
      }
      let el = d.parentElement;
      let tope = d; // el contenedor más externo que envuelve SOLO a la burbuja: es el que se oculta y se muestra
      while (el && el !== document.body && el !== document.documentElement) {
        // se detiene al llegar al contenedor de toda la conversación (el que ya trae tu mensaje dentro)
        if (el.querySelector('user-query') || el.matches('infinite-scroller, #chat-history, main, chat-window')) break;
        if (!el.hasAttribute('data-tg-puntos')) el.setAttribute('data-tg-puntos', '');
        tope = el;
        el = el.parentElement;
      }
      retrasarPuntos(tope);
    });
    // ¿sigue habiendo algo cargando? si pasa un rato sin nada, el próximo thinking vuelve a tener su espera
    if (visibles.length || document.querySelector('[data-tg-creando-caja]')) puntosSinVerDesde = 0;
    else if (!puntosSinVerDesde) puntosSinVerDesde = performance.now();
    else if (performance.now() - puntosSinVerDesde > 3000) puntosInicio = 0;
    document.querySelectorAll('[data-tg-burbuja]').forEach((el) => { if (!envolturas.has(el)) { el.removeAttribute('data-tg-burbuja'); el.style.removeProperty('translate'); } });
    envolturas.forEach((el) => { if (!el.hasAttribute('data-tg-burbuja')) el.setAttribute('data-tg-burbuja', ''); });
    // alineación a la izquierda: se mide dónde quedó y se corrige el desfase (cualquier margen/relleno heredado de Gemini)
    const histo = document.querySelector('#chat-history');
    if (histo) {
      const objetivo = histo.getBoundingClientRect().left + (window.matchMedia('(max-width: 959.98px)').matches ? 12 : 14);
      envolturas.forEach((el) => {
        el.style.removeProperty('translate');
        const dx = el.getBoundingClientRect().left - objetivo;
        if (Math.abs(dx) > 1) el.style.setProperty('translate', (-dx) + 'px 0', 'important');
      });
    }
    if (!respuestaPendiente()) return;
    if (visibles.length) {
      // mientras la IA carga: el scroll baja hasta la burbuja de los puntitos
      const burbuja = visibles[visibles.length - 1];
      if (burbuja !== mensajeSeguido) seguirSinReactivar(burbuja);
    } else if (mensajeSeguido && mensajeSeguido.tagName === 'THINKING-DOTS-ANIMATION') {
      // terminó de cargar: se sigue la respuesta
      const respuestas = document.querySelectorAll('model-response');
      if (respuestas.length) seguirSinReactivar(respuestas[respuestas.length - 1]);
    }
  }
  let marcadoPendiente = false;
  function programarMarcado() {
    if (marcadoPendiente || pantallaBloqueada) return;
    marcadoPendiente = true;
    requestAnimationFrame(() => { marcadoPendiente = false; marcarPuntosCarga(); });
  }
  cada(marcarPuntosCarga, 1000); // el observer ya lo dispara al instante cuando aparece algo
  marcarPuntosCarga();

  // "CREANDO TU IMAGEN…": busca ese texto en lo que Gemini va añadiendo y marca el texto y su contenedor
  const RE_CREANDO = /^\s*(Creando|Generando)\b[^\n]{0,40}$/i;
  function marcarCreando(nodo) {
    if (!vibesOn || !nodo || nodo.nodeType !== 1 || nodo.hasAttribute('data-tg-creando-texto')) return;
    const largo = (nodo.textContent || '').length;
    if (largo > 400) { // un nodo grande: se mira dentro de él sin recorrer todo el chat
      if (nodo.querySelectorAll) nodo.querySelectorAll('div, span, p').forEach((h) => {
        if (h.children.length === 0 && RE_CREANDO.test(h.textContent || '')) marcarCreando(h);
      });
      return;
    }
    // hoja de texto: el nodo o el primer descendiente sin hijos cuyo texto empiece por "Creando…"
    let hoja = null;
    if (nodo.children.length === 0 && RE_CREANDO.test(nodo.textContent || '')) hoja = nodo;
    else if (nodo.querySelectorAll) hoja = [...nodo.querySelectorAll('*')].find((h) => h.children.length === 0 && RE_CREANDO.test(h.textContent || '')) || null;
    if (!hoja || hoja.closest('user-query, .user-query-bubble-with-background, input-area-v2, bard-sidenav, mat-dialog-container')) return;
    // el bloque de texto = hoja + padres que no contienen nada más que ese texto
    let texto = hoja;
    while (texto.parentElement && texto.parentElement.textContent.trim() === hoja.textContent.trim() && texto.parentElement.children.length === 1) {
      texto = texto.parentElement;
    }
    // la burbuja = el primer ancestro que contiene también el indicador de carga (otro elemento junto al texto)
    let caja = texto.parentElement;
    let subidas = 0;
    while (caja && caja.children.length < 2 && subidas++ < 3) caja = caja.parentElement;
    if (!caja || caja === document.body || caja.matches('infinite-scroller, #chat-history, main, chat-window')) return;
    texto.setAttribute('data-tg-creando-texto', '');
    caja.setAttribute('data-tg-creando-caja', '');
    // la burbuja y su texto aparecen JUNTOS (el texto vive fuera del contenedor de los puntitos: sin esto se veía el texto sin burbuja)
    retrasarPuntos(caja);
    // el texto pasa DENTRO de la burbuja de los tres puntitos (la que ya existe), sin crear otra
    const burbuja = [...caja.children].find((c) => c !== texto && !c.contains(texto));
    if (burbuja) {
      burbuja.setAttribute('data-tg-creando-burbuja', '');
      burbuja.appendChild(texto);
      caja.setAttribute('data-tg-creando-unica', '');
    }
  }

  function detectarMensajeNuevo(nodo) {
    if (!nodo || nodo.nodeType !== 1) return;
    // solo reacciona a TU mensaje recién enviado (no al cargar conversaciones viejas ni a las respuestas de la IA)
    // la respuesta de la IA también se sigue mientras carga y crece (hasta que la persona mueva el scroll)
    if (respuestaPendiente()) {
      let resp = [];
      if (nodo.matches && nodo.matches('model-response')) resp = [nodo];
      else if (nodo.querySelectorAll) resp = [...nodo.querySelectorAll('model-response')];
      if (resp.length) { seguirSinReactivar(resp[resp.length - 1]); return; }
    }
    if (!ultimoEnvio || ultimoEnvio.scrolleado || performance.now() - ultimoEnvio.t > 6000) return;
    let lista = [];
    if (nodo.matches && nodo.matches('user-query')) lista = [nodo];
    else if (nodo.querySelectorAll) lista = [...nodo.querySelectorAll('user-query')];
    if (lista.length) {
      ultimoEnvio.scrolleado = true;
      mensajeSeguido = null; // fuerza un seguimiento nuevo aunque sea el mismo elemento
      seguirMensaje(lista[lista.length - 1]);
    }
  }

  // (los nodos nuevos los procesa el observer único de arriba: procesarLote)

  // si la persona sube con el scroll, se deja de seguir el mensaje
  const pararSeguimiento = () => { siguiendoMensaje = false; usuarioMovioScroll = true; };
  window.addEventListener('wheel', (e) => { pararSeguimiento(); }, { passive: true, capture: true });
  window.addEventListener('touchmove', pararSeguimiento, { passive: true, capture: true });
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'PageUp', 'Home'].includes(e.key) && !/^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName) && !(e.target && e.target.isContentEditable)) pararSeguimiento();
  }, true);

  // CAPAS EXTRA EN VISTA ANGOSTA (no se conoce el DOM exacto de ese estado, así que se detectan por su fondo real)
  // 1) etiqueta "Gemini Automático": cualquier capa con fondo/blur alrededor de su botón se deja sin fondo (queda solo la píldora)
  // 2) menú lateral: la capa opaca más externa se vuelve translúcida con blur y las de dentro quedan limpias
  function tieneFondo(el) {
    const cs = getComputedStyle(el);
    const c = parsearColor(cs.backgroundColor);
    return (c && c.a > 0.02) || (cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.boxShadow && cs.boxShadow !== 'none') ||
           (cs.backgroundImage && cs.backgroundImage !== 'none');
  }
  function limpiarCapasEtiqueta() {
    document.querySelectorAll('bard-mode-switcher').forEach((sw) => {
      if (sw.closest('input-area-v2')) return;
      const boton = sw.querySelector('button');
      if (!boton) return;
      if (sw._tgBoton === boton && sw._tgAncho === window.innerWidth) return; // ya procesado
      sw._tgBoton = boton; sw._tgAncho = window.innerWidth;
      // hacia fuera (contenedores) hasta el cuerpo de la app
      let el = sw;
      while (el && el !== document.body && !el.matches('chat-app, main, chat-app-orchestrator, html')) {
        if (!el.hasAttribute('data-tg-sin-fondo') && el !== boton && tieneFondo(el)) el.setAttribute('data-tg-sin-fondo', '');
        el = el.parentElement;
      }
      // hacia dentro (la píldora la dibuja SOLO el botón)
      boton.querySelectorAll('*').forEach((h) => {
        if (h.matches('.mat-mdc-button-persistent-ripple, .mat-focus-indicator, .mat-mdc-button-touch-target, .mdc-button__ripple, mat-icon, gem-icon')) return;
        if (!h.hasAttribute('data-tg-sin-fondo') && tieneFondo(h)) h.setAttribute('data-tg-sin-fondo', '');
      });
    });
  }
  function marcarCapasMenuLateral() {
    if (!vibesOn) return; // con Vibes apagado las hojas propias están desactivadas
    if (window.matchMedia && window.matchMedia('(max-width: 959.98px)').matches) {
      // vista angosta: el menú lateral no se modifica (se limpian marcas de cuando la ventana era ancha)
      document.querySelectorAll('[data-tg-capa]').forEach((e) => e.removeAttribute('data-tg-capa'));
      return;
    }
    const contenido = document.querySelector('side-navigation-content');
    if (!contenido) return;
    const opacas = [];
    let el = contenido;
    while (el && el !== document.body && !el.matches('chat-app, main, chat-app-orchestrator, html')) {
      if (el.hasAttribute('data-tg-capa')) { opacas.push(el); el = el.parentElement; continue; }
      const c = parsearColor(getComputedStyle(el).backgroundColor);
      if (c && c.a > 0.45) opacas.push(el);
      el = el.parentElement;
    }
    // la más externa lleva el blur; las demás quedan limpias
    opacas.forEach((o, i) => o.setAttribute('data-tg-capa', i === opacas.length - 1 ? 'blur' : 'limpia'));
  }
  // FADE "GLASS" ARRIBA Y ABAJO DEL CHAT (blur progresivo, como en iOS)
  // El texto que pasa por detrás de la barra superior y de la caja de escribir se va difuminando poco a poco hacia el borde
  // de la pantalla y se vela con un tinte suave. Son varias capas con backdrop-filter de blur creciente (0.5px -> 16px), cada una
  // con una máscara en degradé, más una capa de tinte.
  // IMPORTANTE: las capas NO forman parte del layout del chat. Van en UN solo elemento flotante (position: fixed) que se coloca encima
  // de #chat-history con medidas calculadas en JS: no ocupa espacio, no mueve ni toca ningún mensaje. Se agrega dentro de
  // chat-window-content, después de #chat-history, para que quede encima de los mensajes y por debajo de la barra superior y de la
  // caja de escribir (que están después en el DOM / con más z-index). Ajustes rápidos: FADE_CHAT (apagar), FADE_CAPAS (suavidad),
  // y las variables --tg-fade-tinte / --tg-fade-rgb.
  const FADE_CHAT = true;
  const FADE_CAPAS = 2;
  const FADE_BLURS = [4, 10]; // px por capa (menos capas = menos pasadas de backdrop-filter por fotograma)
  (function () {
    if (!FADE_CHAT) return;
    const est = document.createElement('style');
    est.id = 'tg-fade-style';
    est.textContent = `
      hallucination-disclaimer, condensed-tos-disclaimer { display: none !important; }
      
      /* UN SOLO SCROLLER: La página y todos los contenedores exteriores quedan bloqueados sin scroll */
      html, body, chat-app, chat-app-orchestrator, main.chat-app, .main-container,
      bard-sidenav-container, bard-sidenav-content, chat-window, chat-window-content,
      .content-container {
        overflow: hidden !important;
        max-height: 100vh !important;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;

      
      }

     
      html::-webkit-scrollbar, body::-webkit-scrollbar, chat-app::-webkit-scrollbar,
      chat-app-orchestrator::-webkit-scrollbar, main.chat-app::-webkit-scrollbar,
      .main-container::-webkit-scrollbar, bard-sidenav-container::-webkit-scrollbar,
      bard-sidenav-content::-webkit-scrollbar, chat-window::-webkit-scrollbar,
      chat-window-content::-webkit-scrollbar, .content-container::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }

      /* El contenedor padre del historial NO debe generar scroll secundario */
      #chat-history, .chat-history-scroll-container {
        overflow: hidden !important;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      #chat-history::-webkit-scrollbar, .chat-history-scroll-container::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }

      /* ÚNICO SCROLLER: Donde están las burbujas de los mensajes */
      infinite-scroller.chat-history,
      infinite-scroller {
        overflow-y: auto !important;
        overflow-x: hidden !important;
        scrollbar-width: thin !important;
        scrollbar-color: rgba(255, 255, 255, 0.25) transparent !important;
        padding-bottom: 120px !important;
        box-sizing: border-box !important;
      }
      infinite-scroller::-webkit-scrollbar {
        width: 6px !important;
      }
      infinite-scroller::-webkit-scrollbar-track {
        background: transparent !important;
      }
      infinite-scroller::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.25) !important;
        border-radius: 10px !important;
      }
      infinite-scroller::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.4) !important;
      }

      input-container { padding-bottom: 40px !important; }
      #tg-fade-chat {
        position: fixed; left: 0; top: 0; width: 0; height: 0; margin: 0; padding: 0; border: 0;
        pointer-events: none; user-select: none; contain: none;
        /* z-index: las burbujas (con transform/backdrop-filter/animaciones) crean sus propias capas y se pintaban
           POR ENCIMA del fade; con z-index el fade queda sobre mensajes, burbujas, fotos y botones del chat */
        z-index: 3; isolation: auto;
        --tg-fade-rgb: 0, 0, 0; --tg-fade-tinte: 0;
      }
      
      #tg-fade-chat .tg-fade-caja { position: absolute; left: 0; right: 0; height: var(--tg-fade-h, 120px); pointer-events: none; }
      #tg-fade-chat .tg-fade-arriba { top: 0; }
      #tg-fade-chat .tg-fade-abajo { bottom: 0; }
      #tg-fade-chat .tg-fade-caja > i { position: absolute; inset: 0; display: block; pointer-events: none; }
      /* VISTA ANGOSTA (media query de Gemini): tinte suave y chat escalado hasta topar arriba */
      @media (max-width: 959.98px) {
        #tg-fade-chat { --tg-fade-tinte: 0; }
      }
      @media print { #tg-fade-chat { display: none !important; } }
    `;
    (document.head || document.documentElement).appendChild(est);
  })();

  function crearCajaFade(clase, dir) {
    const caja = document.createElement('div');
    caja.className = 'tg-fade-caja tg-fade-' + clase;
    const ligeroF = perfilLigero();
    const n = ligeroF ? 2 : FADE_CAPAS, s = 100 / (n + 1);
    const blurs = ligeroF ? [3, 10] : FADE_BLURS;
    const pos = (v) => (Math.round(v * 100) / 100) + '%';
    for (let k = 1; k <= n; k++) {
      // cada capa difumina una franja; la franja de blur más fuerte queda en el borde de la pantalla
      const tramos = k < n ? [[(k - 1) * s, 0], [k * s, 1], [(k + 1) * s, 1], [(k + 2) * s, 0]] : [[(k - 1) * s, 0], [k * s, 1], [100, 1]];
      const mascara = 'linear-gradient(to ' + dir + ', ' + tramos.map((t) => 'rgba(0,0,0,' + t[1] + ') ' + pos(t[0])).join(', ') + ')';
      const blur = 'blur(' + (blurs[k - 1] || 14) + 'px)';
      const capa = document.createElement('i');
      capa.style.cssText = '-webkit-backdrop-filter:' + blur + ';backdrop-filter:' + blur + ';-webkit-mask-image:' + mascara + ';mask-image:' + mascara + ';';
      caja.appendChild(capa);
    }
    const tinte = document.createElement('i');
    tinte.style.background = 'linear-gradient(to ' + dir + ', rgba(var(--tg-fade-rgb), 0) 0%, ' +
      'rgba(var(--tg-fade-rgb), calc(var(--tg-fade-tinte) * 0.35)) 45%, rgba(var(--tg-fade-rgb), var(--tg-fade-tinte)) 100%)';
    caja.appendChild(tinte);
    return caja;
  }

  let fadeLigero = null;
  function asegurarFadeChat() {
    if (!FADE_CHAT) return;
    if (!vibesOn) { const apagado = document.getElementById('tg-fade-chat'); if (apagado) apagado.style.display = 'none'; return; }
    if (fadeLigero !== perfilLigero()) { // cambió el perfil: se reconstruyen las capas del fade
      fadeLigero = perfilLigero();
      const viejo = document.getElementById('tg-fade-chat'); if (viejo) viejo.remove();
    }
    const hist = document.querySelector('#chat-history');
    const contenido = hist && hist.closest('chat-window-content');
    let raiz = document.getElementById('tg-fade-chat');
    if (!hist || !contenido) { if (raiz) raiz.style.display = 'none'; return; }
    if (!raiz) {
      raiz = document.createElement('div');
      raiz.id = 'tg-fade-chat';
      raiz.setAttribute('aria-hidden', 'true');
      raiz.appendChild(crearCajaFade('arriba', 'top'));
      raiz.appendChild(crearCajaFade('abajo', 'bottom'));
    }
    // dentro de chat-window-content y DESPUÉS de #chat-history (encima de los mensajes, debajo de lo que va después)
    if (raiz.parentElement !== contenido || raiz.previousElementSibling !== hist) contenido.insertBefore(raiz, hist.nextSibling);

    // Limpieza de propiedades intrusivas: UNA sola vez por elemento (antes se repetía en cada ciclo, ~20 escrituras al DOM)
    const scroller = hist.querySelector(':scope > infinite-scroller') || hist.querySelector('infinite-scroller');
    if (hist._tgLimpioDe !== scroller) {
    hist._tgLimpioDe = scroller;
    // limpieza de la versión anterior (cajas metidas dentro del chat): no deben existir
    hist.querySelectorAll(':scope > .tg-fade').forEach((e) => e.remove());
    hist.style.removeProperty('margin-bottom');
    hist.style.removeProperty('height');
    hist.style.removeProperty('flex');
    hist.style.removeProperty('max-height');
    hist.style.removeProperty('min-height');
    const principal = document.querySelector('main.chat-app');
    if (principal) {
      ['margin-top', 'height', 'flex', 'max-height'].forEach((p) => principal.style.removeProperty(p));
    }
    const cc = hist.closest('.content-container');
    if (cc) {
      ['margin-top', 'height', 'flex', 'min-height', 'max-height'].forEach((p) => cc.style.removeProperty(p));
    }
    if (scroller) {
      scroller.style.removeProperty('padding-top');
    }
    for (let p = hist.parentElement, n = 0; p && p !== document.body && n < 8; p = p.parentElement, n++) {
      p.style.removeProperty('overflow');
      p.style.removeProperty('clip-path');
      p.style.removeProperty('contain');
    }

    // Máscaras (degradé que desvanece) en el scroller o en sus padres recortan el fondo: se anulan
    const cadena = [scroller, hist];
    for (let p = hist.parentElement, n = 0; p && p !== document.body && n < 8; p = p.parentElement, n++) cadena.push(p);
    cadena.forEach((e) => { if (!e) return; e.style.setProperty('-webkit-mask-image', 'none', 'important'); e.style.setProperty('mask-image', 'none', 'important'); });
    } // fin de la limpieza de una sola vez

    let cr = hist.getBoundingClientRect();
    if (cr.width < 1 || cr.height < 1) { raiz.style.display = 'none'; return; }
    raiz.style.display = '';
    // alturas: la barra superior y la caja de escribir pueden cambiar de alto (caja multilínea, vista angosta...)
    const barra = document.querySelector('top-bar-actions');
    const entrada = document.querySelector('input-container');
    // la "píldora" visible de la caja de escribir (sin el aviso de "Gemini es una IA..." de abajo)
    const pildora = document.querySelector('input-area-v2 .text-input-field') || document.querySelector('input-area-v2') || entrada;
    const angosta = window.matchMedia && window.matchMedia('(max-width: 959.98px)').matches;
    const topBase = angosta ? 0 : cr.top;
    const altoBase = angosta ? (cr.top > 0 ? cr.height + cr.top : cr.height) : cr.height;
    // ARRIBA: más alto que antes, apenas pasa del borde inferior de la barra superior
    let hArriba = angosta ? 110 : 120;
    if (barra) { const r = barra.getBoundingClientRect(); if (r.height > 0) hArriba = Math.min(Math.max(r.bottom - topBase + (angosta ? 20 : 24), angosta ? 95 : 80), 260); }
    // ABAJO: queda POR DETRÁS de la caja de escribir, desde un poco antes de su borde superior hasta el fondo de la pantalla
    const vh = window.innerHeight;
    let topAbajo = vh - (angosta ? 150 : 170);
    if (pildora) {
      const r = pildora.getBoundingClientRect();
      if (r.height > 0) topAbajo = r.top - (angosta ? 28 : 40);
      if (!pildora._tgFadeRO && window.ResizeObserver) { pildora._tgFadeRO = new ResizeObserver(() => Tareas.marcar('layout')); pildora._tgFadeRO.observe(pildora); }
    }
    topAbajo = Math.min(Math.max(topAbajo, topBase + 120), vh - 40);
    const hAbajo = Math.max(vh - topAbajo, 60);
    const desdeAbajo = cr.bottom - vh; // negativo si el chat termina antes del fondo: el fade llega hasta el borde de la pantalla
    // header y caja de escribir quedan ENCIMA del fade (no se desenfocan). Se hace una sola vez por elemento
    const menuIzq = document.querySelector('.side-nav-menu-button');
    // (incluye la barra de Google con el avatar de la cuenta, que vive fuera del chat y quedaba por debajo del difuminado)
    const gbBarra = document.getElementById('gb');
    [menuIzq, barra, entrada, gbBarra, gbBarra && gbBarra.parentElement].forEach((el) => {
      if (!el || el._tgZ) return;
      el._tgZ = true;
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.style.zIndex = '7';
    });
    const clave = [cr.left, topBase, cr.width, altoBase, hArriba, hAbajo, desdeAbajo].map((v) => Math.round(v * 10) / 10).join('|');
    if (raiz._tgClave === clave) return;
    raiz._tgClave = clave;
    raiz.style.setProperty('--tg-fade-h-a', hArriba + 'px');
    raiz.querySelector('.tg-fade-arriba').style.setProperty('--tg-fade-h', hArriba + 'px');
    const cajaAbajo = raiz.querySelector('.tg-fade-abajo');
    cajaAbajo.style.setProperty('--tg-fade-h', hAbajo + 'px');
    cajaAbajo.style.bottom = desdeAbajo + 'px';
    raiz.style.left = cr.left + 'px'; raiz.style.top = topBase + 'px';
    raiz.style.width = cr.width + 'px'; raiz.style.height = altoBase + 'px';
    // calibración: si algún ancestro tiene transform/filter, "fixed" se mide contra él y quedaría corrido; se corrige con lo que se mide
    const rr = raiz.getBoundingClientRect();
    const dx = rr.left - cr.left, dy = rr.top - topBase;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) { raiz.style.left = (cr.left - dx) + 'px'; raiz.style.top = (topBase - dy) + 'px'; }
  }
  // (el resize lo maneja el planificador Tareas: ver más abajo)

  // ÁREA SEGURA SUPERIOR (notch / barra de estado de Android): SOLO se usa para bajar el header y sus botones.
  // - viewport-fit=cover hace que env(safe-area-inset-top) tenga valor dentro del WebView.
  // - Si el WebView no lo informa (pasa en Flutter), se puede fijar a mano: window.tgSetSafeArea(28)  // px
  (function () {
    try {
      let meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1';
        (document.head || document.documentElement).appendChild(meta);
      }
      if (!/viewport-fit\s*=/.test(meta.content)) meta.content = (meta.content ? meta.content + ', ' : '') + 'viewport-fit=cover';
    } catch (e) { /* sin meta viewport: queda como estaba */ }
  })();
  let safeTopManual = 0;
  try { safeTopManual = Number(localStorage.getItem('tg-safe-top')) || 0; } catch (e) { /* sin localStorage */ }
  window.tgSetSafeArea = (top) => {
    safeTopManual = Math.max(0, Number(top) || 0);
    try { localStorage.setItem('tg-safe-top', String(safeTopManual)); } catch (e) { /* sin localStorage */ }
    try { actualizarVarSafeTop(); Tareas.marcar('layout'); } catch (e) { /* aún no está todo creado */ }
  };
  // Cuántos px se SUBE el header y sus botones respecto a la posición calculada (ajustable: window.tgSetHeaderOffset(12))
  let headerSubirPx = 8;
  try { const g = localStorage.getItem('tg-header-subir'); if (g !== null && g !== '') headerSubirPx = Number(g) || 0; } catch (e) { /* sin localStorage */ }
  window.tgSetHeaderOffset = (px) => {
    headerSubirPx = Number(px) || 0;
    try { localStorage.setItem('tg-header-subir', String(headerSubirPx)); } catch (e) { /* sin localStorage */ }
    try { Tareas.marcar('layout'); } catch (e) { /* aún no está todo creado */ }
  };
  let ultimoSafeVar = -1;
  function actualizarVarSafeTop() {
    const v = Math.round(alturaAreaSuperior());
    if (v === ultimoSafeVar) return;
    ultimoSafeVar = v;
    document.documentElement.style.setProperty('--tg-safe-top', v + 'px');
  }
  let sondaSafeTop = null;
  function alturaAreaSuperior() {
    let valor = 0;
    try {
      if (!sondaSafeTop || !sondaSafeTop.isConnected) {
        sondaSafeTop = document.createElement('div');
        sondaSafeTop.setAttribute('aria-hidden', 'true');
        sondaSafeTop.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top, 0px);';
        document.documentElement.appendChild(sondaSafeTop);
      }
      valor = parseFloat(getComputedStyle(sondaSafeTop).paddingTop) || 0;
    } catch (e) { /* sin env(): vale 0 */ }
    return Math.max(valor, safeTopManual);
  }

  // ALINEAR EL HEADER EN VISTA ANGOSTA (medido, porque la posición de las piezas la decide Gemini):
  // todo el header en la misma línea (centro a 12px + mitad del botón del borde de arriba), 12px de margen a ambos lados
  // y mínimo 12px de aire entre el botón de menú y la píldora "Gemini Automático".
  let headerTocado = false;
  let firmaHeader = null;
  let multimediaTocada = false;
  function alinearHeaderAngosto() {
    const izq = document.querySelector('.side-nav-menu-button');
    const pildora = document.querySelector('bard-mode-switcher:not(:is(input-area-v2 *))');
    const gb = document.getElementById('gb'); // barra de Google (avatar de la cuenta): vive FUERA de top-bar-actions
    // botones de la derecha (3 puntitos, chat temporal, nuevo chat...): se buscan por componente, no por una sola ruta frágil
    const botonesDer = Array.from(document.querySelectorAll(
      'top-bar-actions .right-section button, top-bar-actions conversation-actions-icon button, top-bar-actions temp-chat-button button, top-bar-actions new-chat-button button'));
    const estrechaH = !!(window.matchMedia && window.matchMedia('(max-width: 959.98px)').matches);
    const angostaH = vibesOn && estrechaH;
    const soloSafe = !vibesOn && estrechaH; // Vibes apagado: el header queda como el de Gemini, pero bajado por la barra de estado
    if (!angostaH && !soloSafe && !headerTocado) return; // vista ancha y nunca se tocó: no hay nada que limpiar ni medir
    headerTocado = angostaH || soloSafe;
    const barraH = document.querySelector('top-bar-actions');
    const hamb = angostaH ? document.querySelector('.side-nav-menu-button button') : null;
    const cuenta = angostaH && gb ? gb.querySelector('a[href*="SignOutOptions"], a[aria-label*="Cuenta de Google"], a[aria-label*="Google Account"]') : null;
    if (angostaH) {
      // firma de lo que afecta a la posición (offsetWidth/Height no se ven alterados por translate): si nada cambió, no se toca el DOM
      const elems = [izq, pildora, hamb, gb, cuenta].concat(botonesDer);
      const clave = [window.innerWidth, document.documentElement.clientWidth, alturaAreaSuperior(), headerSubirPx,
        pildora ? pildora.offsetWidth + ':' + (pildora.textContent || '').trim() : '', hamb ? hamb.offsetWidth : 0,
        cuenta ? cuenta.offsetWidth : 0].concat(botonesDer.map((e) => e.offsetWidth + 'x' + e.offsetHeight)).join('|');
      if (firmaHeader && firmaHeader.clave === clave && firmaHeader.elems.length === elems.length && firmaHeader.elems.every((e, i) => e === elems[i])) return;
      firmaHeader = { clave, elems };
    } else firmaHeader = null;
    // ESCRITURAS de limpieza (una sola tanda) y después TODAS las lecturas juntas: así el navegador calcula el layout una sola vez
    [izq, pildora, gb, barraH].concat(botonesDer).forEach((e) => { if (e && e.style.translate) e.style.removeProperty('translate'); });
    if (soloSafe) {
      const safe = alturaAreaSuperior();
      if (safe > 0) {
        const tops = [izq, barraH, gb].filter(Boolean);
        // si uno contiene a otro solo se mueve el externo (así no se suma dos veces)
        tops.filter((e) => !tops.some((o) => o !== e && o.contains(e)))
          .forEach((e) => e.style.setProperty('translate', '0 ' + safe + 'px', 'important'));
      }
      return;
    }
    if (!angostaH) return;
    const MARGEN = 12;
    const GAP = 8; // aire entre los botones de la derecha
    const objetivoY = MARGEN + 24 + alturaAreaSuperior() - headerSubirPx; // centro de TODOS los botones: baja lo que mida la barra de estado y sube headerSubirPx
    const ver = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
    const ancho = document.documentElement.clientWidth;
    const centroY = (r) => r.top + r.height / 2;
    // --- lecturas ---
    const rh = ver(hamb), rp = ver(pildora);
    const der = [];
    if (cuenta) { const rc = ver(cuenta); if (rc) der.push({ el: gb, r: rc, c: rc }); }
    botonesDer.forEach((bt) => {
      const r = ver(bt);
      if (r) der.push({ el: bt, r, c: ver(bt.closest('gem-icon-button')) || r }); // c = el círculo que se ve (puede ser más grande que el <button>)
    });
    der.sort((x, y) => y.c.right - x.c.right); // de derecha a izquierda según su posición natural
    // --- cálculos (sin tocar el DOM) ---
    const dxL = rh ? MARGEN - rh.left : 0, dyL = rh ? objetivoY - centroY(rh) : 0;
    let cursor = ancho - MARGEN; // borde derecho disponible para el siguiente botón
    const mover = der.map((o) => {
      const dx = cursor - o.c.right;
      cursor = o.c.right + dx - o.c.width - GAP;
      return [o.el, dx, objetivoY - centroY(o.r)];
    });
    let pil = null;
    if (pildora && rh && rp) {
      const dentro = izq && izq.contains(pildora); // si la píldora va dentro del grupo izquierdo, ya se mueve con él
      const px = rp.left + (dentro ? dxL : 0), py = centroY(rp) + (dentro ? dyL : 0);
      const dx = Math.max(0, (rh.right + dxL + MARGEN) - px);
      const dy = objetivoY - py;
      if (dx > 0.5 || Math.abs(dy) > 0.5) pil = [dx, dy];
    }
    // --- escrituras ---
    if (izq && rh) izq.style.setProperty('translate', dxL + 'px ' + dyL + 'px', 'important');
    mover.forEach((m) => { if (Math.abs(m[1]) > 0.5 || Math.abs(m[2]) > 0.5) m[0].style.setProperty('translate', m[1] + 'px ' + m[2] + 'px', 'important'); });
    if (pil) pildora.style.setProperty('translate', pil[0] + 'px ' + pil[1] + 'px', 'important');
  }
  // MULTIMEDIA ALINEADA CON EL MENSAJE (vista angosta): la imagen/video del mensaje termina en el mismo borde derecho que la burbuja de texto
  const MARGEN_DERECHO_MOVIL = 12; // px entre el borde de la pantalla y tus mensajes / multimedia (igual que el header)
  // mueve UNA burbuja de usuario para que su borde derecho quede exactamente a MARGEN_DERECHO_MOVIL del borde de la pantalla
  function alinearBurbujaUsuario(b) {
    if (b.style.translate) b.style.removeProperty('translate');
    const r = b.getBoundingClientRect();
    if (r.width < 1) return;
    const dx = (document.documentElement.clientWidth - MARGEN_DERECHO_MOVIL) - r.right;
    if (Math.abs(dx) > 0.5) b.style.setProperty('translate', dx + 'px 0', 'important');
  }
  function alinearMultimedia() {
    const angosta = vibesOn && window.matchMedia && window.matchMedia('(max-width: 959.98px)').matches;
    if (!angosta && !multimediaTocada) return;
    multimediaTocada = angosta;
    const carrs = Array.from(document.querySelectorAll('user-query[data-tg-media]'))
      .map((q) => q.querySelector('user-query-file-carousel, .query-file-carousel')).filter(Boolean);
    const burbujas = Array.from(document.querySelectorAll('.user-query-bubble-with-background'));
    // 1) escrituras: se quitan todos los desplazamientos
    carrs.forEach((c) => { if (c.style.translate) c.style.removeProperty('translate'); });
    burbujas.forEach((b) => { if (b.style.translate) b.style.removeProperty('translate'); });
    if (!angosta) return;
    const objetivo = document.documentElement.clientWidth - MARGEN_DERECHO_MOVIL;
    // 2) lecturas (un solo layout)
    const cambios = [];
    carrs.forEach((carr) => {
      let derecha = -Infinity;
      carr.querySelectorAll('.scrollable-area > *').forEach((it) => { const r = it.getBoundingClientRect(); if (r.width > 0) derecha = Math.max(derecha, r.right); });
      if (derecha === -Infinity) return;
      const dx = objetivo - derecha;
      if (Math.abs(dx) > 0.5) cambios.push([carr, dx]);
    });
    burbujas.forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.width < 1) return;
      const dx = objetivo - r.right;
      if (Math.abs(dx) > 0.5) cambios.push([b, dx]);
    });
    // 3) escrituras
    cambios.forEach(([el, dx]) => el.style.setProperty('translate', dx + 'px 0', 'important'));
  }
  // FONDO DIFUMINADO EN LA PANTALLA DE INICIO ("¿Por dónde empezamos?", chat nuevo sin mensajes)
  // SIN crear ninguna capa ni fondo nuevo: se usa tu mismo fondo del body.
  // - se detecta el estado cero: existe .zero-state-container y todavía no hay ningún user-query / model-response
  // - las capas opacas de Gemini que tapan el fondo en esa pantalla quedan transparentes (data-tg-cero-limpio)
  // - el <chat-window> (la zona de la derecha del menú lateral) recibe un backdrop-filter: difumina lo que tiene DETRÁS (tu fondo)
  // Al enviar el primer mensaje el desenfoque se desvanece y Gemini vuelve a su estilo normal.
  // OJO: el backdrop-filter solo se pone en estado cero (no de forma permanente), porque un elemento con backdrop-filter hace que
  // los blur de sus hijos (burbujas, caja de escribir) ya no vean la imagen de fondo.
  const CERO_BLUR_PX = 5;     // desenfoque del fondo
  const CERO_BRILLO = 1;       // 1 = sin oscurecer; menor = más oscuro (mejora la lectura del texto)
  (function () {
    const est = document.createElement('style');
    est.id = 'tg-fondo-cero-style';
    est.textContent = `
      
      html.tg-cero chat-window {
        -webkit-backdrop-filter: blur(${CERO_BLUR_PX}px) brightness(${CERO_BRILLO}) !important;
        backdrop-filter: blur(${CERO_BLUR_PX}px) brightness(${CERO_BRILLO}) !important;
      }
      html.tg-cero [data-tg-cero-limpio] {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
      }
      @media (prefers-reduced-motion: reduce) { chat-window { transition: none !important; } }
    `;
    (document.head || document.documentElement).appendChild(est);
  })();
  function enEstadoCero() {
    return !!document.querySelector('.zero-state-container') && !document.querySelector('#chat-history user-query, #chat-history model-response');
  }
  function actualizarFondoCero() {
    const raiz = document.documentElement;
    const cero = enEstadoCero() && !!fondoGeminiActual;
    if (!cero) {
      if (raiz.classList.contains('tg-cero')) {
        raiz.classList.remove('tg-cero');
        document.querySelectorAll('[data-tg-cero-limpio]').forEach((e) => e.removeAttribute('data-tg-cero-limpio'));
      }
      return;
    }
    // capas opacas entre la pantalla de inicio y el body: se dejan transparentes
    const EXCLUIR = 'html, body, .mat-app-background, .main-container';
    const candidatos = new Set(document.querySelectorAll(
      'chat-app-orchestrator, chat-app, main.chat-app, bard-sidenav-container, bard-sidenav-content, chat-window, chat-window-content, ' +
      '.chat-container, #chat-history, infinite-scroller, .zero-state-container, modular-zero-state, .modular-zero-state-container, ' +
      '.blur-bg, .top-section-container, .content-container'));
    for (let el = document.querySelector('.zero-state-container'); el && el !== document.body; el = el.parentElement) candidatos.add(el);
    candidatos.forEach((el) => {
      if (el.matches(EXCLUIR) || el.closest('bard-sidenav, mat-sidenav, input-container, top-bar-actions')) return;
      const cs = getComputedStyle(el);
      if (colorConFondo(cs.backgroundColor) || (cs.backgroundImage && cs.backgroundImage !== 'none')) el.setAttribute('data-tg-cero-limpio', '');
    });
    raiz.classList.add('tg-cero');
  }

  // ¿este color de fondo tapa algo? Gemini pinta sus capas con colores relativos (color(from var(...) srgb r g b / .9)),
  // que el navegador devuelve como "color(srgb 0.1 0.1 0.12 / 0.9)". parsearColor() solo entiende rgb()/rgba(), así que esas
  // capas se tomaban por transparentes y NUNCA se limpiaban: esa era la capa gris que tapaba el fondo en la pantalla de inicio.
  function colorConFondo(texto) {
    if (!texto || texto === 'transparent') return false;
    const m = texto.match(/\/\s*([\d.]+)(%?)\s*\)\s*$/);       // alfa explícito: "... / 0.9)" o "... / 90%)"
    if (m) { const a = parseFloat(m[1]) / (m[2] ? 100 : 1); return a > 0.02; }
    const c = parsearColor(texto);                            // rgb()/rgba() normales
    if (c) return c.a > 0.02;
    return /^(color|oklch|oklab|lab|lch|hsl|hwb)\(/i.test(texto); // otro formato sin alfa: se asume opaco
  }

  // SCROLL SUAVE (LENIS)
  // - Lenis se empaqueta DENTRO de la extensión (lenis.min.js, listado en el manifest ANTES de content.js): una extensión no puede
  //   cargar <script src="https://unpkg.com/..."> desde la página (CSP de Gemini + mundo aislado del content script).
  // - Gemini NO hace scroll en la ventana: el único scroller real es <infinite-scroller> (el resto está en overflow: hidden, ver el
  //   bloque del fade). Por eso Lenis se crea con wrapper = ese elemento y no sobre window.
  // - Gemini puede recrear ese elemento al cambiar de chat: cada 700 ms (mantenerCapas) se comprueba y se vuelve a crear si hace falta.
  // - El auto-scroll del envío escribe scrollTop directamente: Lenis lo sincroniza solo (onNativeScroll) cuando no está animando.
  const LENIS_ACTIVO = true;
  const LENIS_OPCIONES = {
    duration: 1.2,           // duración de la inercia (más alto = más lento/suave)
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical', // (en Lenis 1.0.x se llama "orientation"; "direction" era de versiones viejas)
    gestureOrientation: 'vertical',
    smoothWheel: true,       // suaviza la rueda del ratón ("smooth" ya no existe en 1.0.x)
    wheelMultiplier: 1,      // sensibilidad de la rueda (antes "mouseMultiplier")
    smoothTouch: false,      // en táctil se deja el scroll nativo (más fiel al dedo)
    touchMultiplier: 1
  };
  let lenis = null;
  let lenisScroller = null;
  let lenisRaf = null;
  let lenisAlto = 0;
  let lenisAvisado = false;
  (function () {
    const est = document.createElement('style');
    est.id = 'tg-lenis-style';
    est.textContent = `
      html.lenis, html.lenis body { height: auto; }
      infinite-scroller, .lenis.lenis-smooth { scroll-behavior: auto !important; }
      .lenis.lenis-smooth [data-lenis-prevent] { overscroll-behavior: contain; }
      .lenis.lenis-stopped { overflow: hidden; }
      .lenis.lenis-scrolling iframe { pointer-events: none; }
    `;
    (document.head || document.documentElement).appendChild(est);
  })();
  // el bucle rAF de Lenis solo corre mientras hay actividad (rueda/touch/scroll/teclado) y 1.5 s después; en reposo duerme
  let lenisUltimaAct = 0;
  function bucleLenis(tiempo) {
    if (!lenis || document.hidden || pantallaBloqueada) { lenisRaf = null; return; }
    lenis.raf(tiempo);
    lenisRaf = (performance.now() - lenisUltimaAct < 1500) ? requestAnimationFrame(bucleLenis) : null;
  }
  function despertarLenis() {
    if (pantallaBloqueada) return;
    lenisUltimaAct = performance.now();
    if (lenis && lenisScroller && lenisScroller.scrollHeight !== lenisAlto) { // el contenido creció: se recalcula el límite (solo al interactuar)
      lenisAlto = lenisScroller.scrollHeight;
      try { lenis.resize(); } catch (e) { /* sin resize */ }
    }
    if (!lenisRaf && lenis) lenisRaf = requestAnimationFrame(bucleLenis);
  }
  function destruirLenis() {
    if (lenisRaf) { cancelAnimationFrame(lenisRaf); lenisRaf = null; }
    if (lenis) { try { lenis.destroy(); } catch (e) { /* ya estaba destruido */ } }
    lenis = null; lenisScroller = null; lenisAlto = 0;
  }
  function mantenerLenis() {
    if (!LENIS_ACTIVO || !lenisUsuario) { if (lenis) destruirLenis(); return; }
    if (typeof Lenis === 'undefined') { // falta lenis.min.js en el manifest: no se rompe nada, solo no hay scroll suave
      if (!lenisAvisado) { lenisAvisado = true; console.warn('[tg] Lenis no está cargado: agrega lenis.min.js al manifest, ANTES de content.js.'); }
      return;
    }
    if (sinMovimiento() || esTactil()) { destruirLenis(); return; } // respeta "reducir movimiento"; en táctil el scroll nativo ya es fluido
    let scroller = document.querySelector('infinite-scroller.chat-history') || document.querySelector('infinite-scroller');
    if (!vibesOn) {
      // sin Vibes el CSS propio (que deja a <infinite-scroller> como único scroller) está apagado: se busca el contenedor que realmente hace scroll
      const cand = [document.querySelector('infinite-scroller.chat-history'), document.querySelector('infinite-scroller'),
        document.querySelector('.chat-history-scroll-container'), document.querySelector('#chat-history')];
      const real = cand.find((e) => e && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1) ||
                   cand.find((e) => e && /auto|scroll/.test(getComputedStyle(e).overflowY));
      if (real) scroller = real;
    }
    if (!scroller || !scroller.isConnected) { destruirLenis(); return; }
    if (lenis && lenisScroller === scroller) return;
    destruirLenis();
    try {
      lenis = new Lenis(Object.assign({ wrapper: scroller, content: scroller }, LENIS_OPCIONES));
      lenisScroller = scroller;
      lenisAlto = scroller.scrollHeight;
      if (!scroller._tgLenisEv) {
        scroller._tgLenisEv = true;
        // capture: se ejecuta ANTES que el manejador de Lenis, así el límite ya está actualizado en el primer gesto
        ['wheel', 'touchstart', 'touchmove', 'scroll', 'keydown'].forEach((ev) => scroller.addEventListener(ev, despertarLenis, { passive: true, capture: true }));
      }
      despertarLenis();
      console.log('[tg] Lenis activo sobre', scroller.tagName.toLowerCase());
    } catch (e) {
      lenis = null; lenisScroller = null;
      console.warn('[tg] No se pudo iniciar Lenis:', e);
    }
  }

  // pasada completa (al cargar). Después el trabajo lo hace Tareas, solo cuando algo cambia
  function mantenerCapas() {
    [mantenerLenis, agregarItemMovil, marcarCapasMenuLateral, actualizarFondoMenuLateral, observarLayout, marcarCargandoRespuesta].forEach((tarea) => {
      try { tarea(); } catch (e) { console.warn('[tg] error en ' + tarea.name + ':', e); }
    });
    Tareas.marcar('layout'); Tareas.marcar('cero');
  }
  console.log('[tg] fade v35 cargado (sin aparecer/desaparecer solo durante el envío)');
  mantenerCapas();
  // latido barato: Gemini recrea elementos al cambiar de chat, así que se re-enganchan observers y Lenis;
  // el layout/menú/tema se recalculan solo de vez en cuando (el resto lo disparan observers y eventos)
  let latido = 0;
  cada(function latidoTg() {
    latido++;
    observarLayout(); mantenerLenis(); agregarItemMovil();
    if (!(window.matchMedia && window.matchMedia('(max-width: 959.98px)').matches)) document.querySelectorAll('.desktop-settings-menu').forEach((m) => { try { if (!m.querySelector('#' + ID_ITEM_PERSONALIZAR)) { marcarCapasMenu(m); agregarItemFondo(m); } } catch (e) { /* menú aún sin dibujar */ } });
    Tareas.marcar('cero'); Tareas.marcar('colapso');
    if (latido % 3 === 0) { Tareas.marcar('layout'); Tareas.marcar('menuLateral'); }
    if (latido % 4 === 0) Tareas.marcar('tema');
  }, 2000);

  // al desbloquear: se re-enganchan observers/Lenis, se reajustan carruseles y se retoman auto-scroll y puntos de carga
  document.addEventListener('tg-bloqueo-cambio', () => {
    if (pantallaBloqueada) return;
    try { observarLayout(); mantenerLenis(); agregarItemMovil(); } catch (e) { console.warn('[tg] al desbloquear:', e); }
    requestAnimationFrame(() => {
      try { ajustarCarruseles(document.body); } catch (e) { /* sin carruseles */ }
      try { marcarPuntosCarga(); } catch (e) { /* sin puntos */ }
      try { if (siguiendoMensaje) activarAjuste(); } catch (e) { /* sin seguimiento */ }
    });
  });

  // TEMA AUTOMÁTICO SEGÚN EL COLOR DEL BODY
  // Fondo del body claro -> modo claro. Fondo oscuro -> modo oscuro.
  function parsearColor(texto) {
    const m = texto && texto.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
    if (p.length < 3 || p.slice(0, 3).some(isNaN)) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function detectarTemaDelBody() {
    const raiz = document.documentElement;
    const candidatos = [document.body, document.querySelector('.mat-app-background'), raiz];
    for (const el of candidatos) {
      if (!el) continue;
      if (el === raiz && raiz.classList.contains('tg-bloqueado')) continue; // durante el bloqueo el html lleva un color propio
      const c = parsearColor(getComputedStyle(el).backgroundColor);
      if (c && c.a > 0.5) { // ignora fondos transparentes y prueba el siguiente
        const luminosidad = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
        return luminosidad > 0.5 ? 'claro' : 'oscuro';
      }
    }
    // con un video de fondo el body es transparente: se deduce del color del TEXTO (claro sobre tema oscuro y viceversa)
    if (raiz.classList.contains('tg-fondo-video') && document.body) {
      const t = parsearColor(getComputedStyle(document.body).color);
      if (t) return (0.2126 * t.r + 0.7152 * t.g + 0.0722 * t.b) / 255 > 0.5 ? 'oscuro' : 'claro';
    }
    return null;
  }

  let ultimoTemaBody = null;
  function revisarTemaBody() {
    const tema = detectarTemaDelBody();
    if (!tema || tema === ultimoTemaBody) return;
    ultimoTemaBody = tema;
    if (tema === temaActual) return;
    aplicarTema(tema);
    prefsGuardar({ geminiTema: tema });
  }

  let revisionTimer = null;
  function programarRevision() {
    if (pantallaBloqueada) return; // bloqueado: no se revisa el tema (al desbloquear Tareas lo revisa)
    // Lenis y la propia extensión cambian clases/estilos de <html> muy seguido: se agrupa y se revisa como mucho ~3 veces por segundo
    if (revisionTimer) return;
    revisionTimer = setTimeout(() => {
      revisionTimer = null;
      if (!pantallaBloqueada) requestAnimationFrame(revisarTemaBody);
    }, 300);
  }

  // Cambios de clase/estilo en body y html (así Gemini cambia su tema)
  const opcionesAtributos = { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'theme'] };
  new MutationObserver(programarRevision).observe(document.body, opcionesAtributos);
  new MutationObserver(programarRevision).observe(document.documentElement, opcionesAtributos);

  document.addEventListener('visibilitychange', () => { if (!document.hidden) Tareas.marcar('tema'); });
  // Cambio de tema del sistema y revisión de respaldo
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', programarRevision);
  }

  revisarTemaBody();
  try { actualizarVarSafeTop(); } catch (e) { /* sin área segura */ }
  aplicarVibes(); // deja todo en el estado guardado (encendido/apagado) una vez creadas todas las hojas de estilo
})();