(function () {
  if (location.hostname !== 'gemini.google.com') return; // igual que el manifest (matches): la extensión solo corre en Gemini, nunca en accounts.google.com

  // ============================================================================================
  // KERNEL (compatibilidad entre este script y la app Flutter)
  // - TG_KERNEL sube (1, 2, 3...) cada vez que un cambio necesita una app nueva (cambia el Dart, un handler, un elemento nuevo...).
  // - content.dart tiene su propio kernel y lo publica en window.TG_KERNEL_DART. Si los dos NO coinciden (o el de la app no existe),
  //   este script NO activa nada: solo muestra un aviso sobre la página de Gemini pidiendo instalar la nueva versión desde GitHub.
  // - Desde el menú "Actualizaciones Gemini Vibes" se compara además el kernel del script NUEVO (remotaKernel) con este.
  // - content.dart lee TG_KERNEL del script descargado: debe seguir en una sola declaración, empezando la línea con const.
  // - Solo aplica dentro de la app móvil; en la extensión de Chrome no hay Dart y no se comprueba nada.
  // ============================================================================================



  const TG_KERNEL = 6; // No cambies esto, YO lo cambiare si es nesesario.

  // ============================================================================================
  // TG_FIX (versión de arreglos: decide cuándo sale la bienvenida de ACTUALIZACIÓN con las novedades)
  // - Sube de 1 en 1 CADA VEZ que se modifica este archivo (es un número, no depende del kernel).
  // - Al entrar a Gemini tras ver la bienvenida se guarda como "fix visto" (geminiFixVisto). Si el "fix visto" es distinto a este
  //   TG_FIX (o no existe: primera instalación) vuelve a salir la bienvenida de actualización.
  // - El TG_KERNEL de arriba YA NO decide la bienvenida: solo sirve para comprobar que el script y la app Flutter son compatibles.
  // - Debe seguir en una sola declaración, empezando la línea con const.
  // ============================================================================================

  const TG_FIX = 4; // Reiniciar a cero si yo cambio TG_KERNEL 


  // ============================================================================================
  // VERSIÓN Y NOTAS DE VERSIÓN (lo primero del script: es lo único que hay que editar en cada release)
  // - TG_VERSION: número que se muestra en el menú "Actualizaciones Gemini Vibes" (app móvil).
  // - TG_NOTAS_VERSION: texto libre de varias líneas; el panel lo muestra con scroll. JavaScript no tiene triple comilla
  //   como Python: el equivalente son las comillas invertidas, que permiten saltos de línea. Dentro de las notas NO uses
  //   comillas invertidas ni el signo de dólar seguido de llave.
  // - content.dart lee ambas variables del script descargado de GitHub (así el panel muestra la versión y las notas NUEVAS
  //   antes de instalarlas). Por eso cada una debe seguir en una sola declaración, empezando la línea con la palabra const.
  // ============================================================================================
  // (una sola declaración: un "const" no se puede reasignar después con +=, eso daba TypeError en cuanto TG_FIX era mayor que 0)
  const TG_VERSION = '0.' + TG_KERNEL + (TG_FIX > 0 ? '.' + TG_FIX : '');

  // NOTAS DE VERSIÓN: cada línea empieza con "•" (bullet) y un espacio; no uses comillas invertidas ni el signo de dólar seguido de llave, lo iras implementando cada vez que actualizes el codigo.
  const TG_NOTAS_VERSION = `
• Menús interactivos (cuestionarios): botones con fondo blur estilo burbuja que entran uno a uno desde la izquierda, la opción correcta se ilumina con el color de tu burbuja, textos sin halo, botones del toolbar redondos y pequeños y nueva barra de progreso translúcida.
• Nueva última pantalla de la bienvenida: «Todo listo.» con animación letra por letra; las letras llevan blur solo en nivel Alta.
• Rendimiento en móvil: nivel Medio solo desenfoca burbujas y caja de escribir; los mensajes fuera de pantalla se omiten del render.
• La bienvenida de primera vez ahora dice «¡Hola!» y alterna con «¡Gemini de toda la vida ha recibido un glow up!».
• En la tarjeta de la pantalla de bloqueo, cuando ya hay un PIN aparece el botón «Cambiar PIN» (sin pedir el actual) y avisos sobre qué pasa si lo olvidas y cómo se guarda.
• Primera vez: nueva guía «Antes de comenzar...» (fondos, color de tu burbuja y rendimiento con ajuste automático según FPS y RAM), luego te pregunta si quieres pantalla de bloqueo y al final las novedades.
• Ahora puedes poner tu propia música de bienvenida (Personalizar y Actualizaciones). «Quitar» vuelve a la canción original.
• Las pantallas de la bienvenida funcionan como páginas: desliza hacia arriba para seguir y hacia abajo para volver.
• La música de la bienvenida ahora también suena en la extensión de Chrome (con respaldo por Web Audio si la página bloquea el audio).
• Fondo de pantalla por defecto adaptativo: horizontal o vertical según la pantalla. Botón "Fondo por defecto" en Personalizar.
• La bienvenida de actualización ahora depende de TG_FIX y no del kernel.
• Nuevo menú "Actualizaciones Gemini Vibes" en la app móvil: busca y aplica la última versión sin reiniciar la app.
• El teclado ya no redimensiona la página: la caja de escribir sube con una transición y el teclado deja de cerrarse.
• Nivel de rendimiento Medio: el fondo de "¿Por dónde empezamos?" conserva su desenfoque; la animación de desenfoque de la bienvenida solo corre en Alta.
• Las burbujas del chat solo llevan blur mientras están en pantalla (nacen sin blur y lo pierden al salir).
• Los ajustes de blur, Vibes, difuminado del scroll y scroll suave ahora se conservan al reiniciar la app.
• Todas las tarjetas de la bienvenida (guía inicial, pregunta del bloqueo y novedades) ahora son un cuadro de tamaño fijo y llevan blur (solo en nivel Alta).
`;
  const TG_URL_GITHUB_APP = 'https://github.com/JuanDaCol07/gemini-vibe-script-content/releases'; // <-- pon aquí la página de la app

  window.__tgCargado = 'opt-2'; // marcador: Flutter lo lee para confirmar qué versión del script se inyectó

  // ¿estamos dentro de la app de Flutter? (el user agent del WebView de Android lleva "; wv)")
  const ES_APP_FLUTTER = (function () {
    try {
      return window.TG_ES_MOVIL === true || !!window.flutter_inappwebview || /;\s*wv\)/.test(navigator.userAgent || '');
    } catch (e) { return false; }
  })();
  const KERNEL_DART = (function () {
    const bruto = window.TG_KERNEL_DART;
    if (bruto === undefined || bruto === null || bruto === '') return null;
    const k = Number(bruto);
    return isFinite(k) ? k : null;
  })();
  // solo en la página de Gemini (no en el login de Google ni en otras páginas que cargue el WebView)
  const ES_PAGINA_GEMINI = (function () {
    try { return /(^|\.)gemini\.google\.com$/i.test(location.hostname || ''); } catch (e) { return false; }
  })();
  const KERNEL_INCOMPATIBLE = ES_APP_FLUTTER && ES_PAGINA_GEMINI && KERNEL_DART !== TG_KERNEL;

  // abre la página de la app en el navegador del teléfono: primero por el handler de Flutter (url_launcher); si la app no lo tiene, window.open
  function abrirGithubApp() {
    const respaldo = function () { try { window.open(TG_URL_GITHUB_APP, '_blank'); } catch (e) { /* sin window.open */ } };
    try {
      if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function') {
        Promise.resolve(window.flutter_inappwebview.callHandler('abrirExterno', TG_URL_GITHUB_APP))
          .then(function (ok) { if (ok !== true) respaldo(); }, respaldo);
        return;
      }
    } catch (e) { /* cae al respaldo */ }
    respaldo();
  }
  // LOGO DE GEMINI: SIEMPRE el archivo Gemini/Gemini.png.
  //  - app Flutter: Dart lo inyecta como data URL en window.TG_LOGO_GEMINI
  //  - extensión de Chrome: chrome.runtime.getURL('Gemini.png') (archivo en la raíz de la extensión; debe estar en web_accessible_resources)
  function urlLogoGemini() {
    try { if (typeof window.TG_LOGO_GEMINI === 'string' && window.TG_LOGO_GEMINI) return window.TG_LOGO_GEMINI; } catch (e) { /* sin window */ }
    try { if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) return chrome.runtime.getURL('Gemini.png'); } catch (e) { /* no es una extensión */ }
    return '';
  }
  function pantallaKernelIncompatible() {
    const montar = function () {
      if (document.getElementById('tg-kernel-aviso')) return;
      const pf = (window.TG_PREFS_INICIALES && typeof window.TG_PREFS_INICIALES === 'object') ? window.TG_PREFS_INICIALES : {};
      const claro = pf.geminiTema === 'claro';
      // el botón toma el color de TU burbuja (igual que en el panel de actualizaciones)
      let bb = pf.geminiBurbuja;
      if (typeof bb === 'string') { try { bb = JSON.parse(bb); } catch (e) { bb = null; } }
      bb = Object.assign({ h: 221, s: 100, tono: 50, alfa: 70 }, (bb && typeof bb === 'object') ? bb : {});
      const Lum = bb.tono <= 50 ? 12 + (bb.tono / 50) * 38 : 50 + ((bb.tono - 50) / 50) * 46;
      const acento = 'hsl(' + bb.h + ', ' + bb.s + '%, ' + Lum.toFixed(1) + '%)';
      const acentoTexto = Lum > 68 ? '#1f1f1f' : '#ffffff';
      const imagen = (typeof pf.geminiFondo === 'string' && pf.geminiFondo && pf.geminiFondoTipo !== 'video')
        ? 'url("' + pf.geminiFondo.replace(/"/g, '%22') + '")' : '';

      const est = document.createElement('style');
      est.textContent =
        // se esconde TODO lo de Gemini: solo queda el fondo y este panel
        'html,body{overflow:hidden !important;}' +
        'body > *:not(#tg-kernel-aviso){display:none !important;}' +
        '#tg-kernel-aviso{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;' +
        'font-family:"Google Sans","Segoe UI",system-ui,-apple-system,sans-serif;background-size:cover;background-position:center;background-repeat:no-repeat;}' +
        '#tg-kernel-aviso *{box-sizing:border-box;}' +
        '#tg-kernel-aviso .tg-k-velo{position:absolute;inset:0;pointer-events:none;background:transparent;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);}' +
        '#tg-kernel-aviso.tg-k-claro .tg-k-velo{background:transparent;}' +
        '#tg-kernel-aviso .tg-k-panel{position:relative;width:min(420px,calc(100vw - 28px));max-height:min(90vh,760px);display:flex;flex-direction:column;overflow:hidden;' +
        'border-radius:28px;background:var(--k-panel);-webkit-backdrop-filter:blur(var(--tg-bf14, 14px));backdrop-filter:blur(var(--tg-bf14, 14px));box-shadow:0 24px 80px rgba(0,0,0,0.45);color:var(--k-texto);}' +
        '#tg-kernel-aviso .tg-k-cab{position:relative;isolation:isolate;flex:none;color:#fff;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;' +
        'padding:18px 20px 26px;text-shadow:0 2px 10px rgba(0,0,0,0.45);}' +
        '#tg-kernel-aviso .tg-k-fondos{position:absolute;inset:0;z-index:-1;overflow:hidden;pointer-events:none;' +
        '-webkit-mask-image:linear-gradient(to bottom,#000 0%,#000 52%,rgba(0,0,0,0.55) 80%,transparent 100%);mask-image:linear-gradient(to bottom,#000 0%,#000 52%,rgba(0,0,0,0.55) 80%,transparent 100%);}' +
        '#tg-kernel-aviso .tg-k-fondo{position:absolute;inset:-24px;background:linear-gradient(135deg,#1f2937,#0b1220);background-size:cover;background-position:center;filter:blur(7px) brightness(0.62) saturate(1.2);}' +
        '#tg-kernel-aviso .tg-k-fondo-b{filter:blur(20px) brightness(1) saturate(1.2);-webkit-mask-image:linear-gradient(to bottom,transparent 15%,#000 85%);mask-image:linear-gradient(to bottom,transparent 15%,#000 85%);}' +
        '#tg-kernel-aviso .tg-k-titulo{margin-top:6px;font-size:15px;font-weight:600;letter-spacing:0.01em;padding:0 44px;}' +
        '#tg-kernel-aviso .tg-k-marca{display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:4px;}' +
        '#tg-kernel-aviso .tg-k-logo{display:block;width:72px;height:72px;object-fit:contain;}' +
        '#tg-kernel-aviso .tg-k-nombre{font-size:clamp(26px,8vw,32px);font-weight:500;line-height:1.1;letter-spacing:-0.01em;}' +
        '#tg-kernel-aviso .tg-k-sub{font-size:14px;opacity:0.92;}' +
        '#tg-kernel-aviso .tg-k-cuerpo{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;gap:12px;padding:4px 18px 20px;}' +
        '#tg-kernel-aviso .tg-k-eti{font-size:13px;font-weight:600;color:var(--k-texto);}' +
        '#tg-kernel-aviso .tg-k-notas{width:100%;padding:12px 14px;border-radius:16px;background:var(--k-card);border:1px solid var(--k-borde);color:var(--k-texto);' +
        'font-size:13.5px;line-height:1.45;text-align:left;overflow-wrap:anywhere;}' +
        '#tg-kernel-aviso .tg-k-btn{display:inline-flex;align-items:center;justify-content:center;min-width:220px;height:46px;padding:0 26px;margin-top:4px;border:0;border-radius:9999px;' +
        'cursor:pointer;font:inherit;font-size:15px;font-weight:500;text-decoration:none;background:' + acento + ';color:' + acentoTexto + ';-webkit-tap-highlight-color:transparent;}' +
        '#tg-kernel-aviso .tg-k-btn:active{transform:scale(0.97);}' +
        '#tg-kernel-aviso .tg-k-pie{font-size:11.5px;color:var(--k-suave);text-align:center;line-height:1.35;}';

      const aviso = document.createElement('div');
      aviso.id = 'tg-kernel-aviso';
      if (claro) aviso.className = 'tg-k-claro';
      aviso.style.setProperty('--k-panel', claro ? 'rgba(244,246,251,0.72)' : 'rgba(18,18,20,0.62)');
      aviso.style.setProperty('--k-card', claro ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)');
      aviso.style.setProperty('--k-borde', claro ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)');
      aviso.style.setProperty('--k-texto', claro ? '#1f1f1f' : '#ffffff');
      aviso.style.setProperty('--k-suave', claro ? 'rgba(31,31,31,0.6)' : 'rgba(255,255,255,0.7)');
      if (imagen) aviso.style.backgroundImage = imagen;

      const NS = 'http://www.w3.org/2000/svg';
      const el = function (tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto) e.textContent = texto;
        return e;
      };
      // estrella de Gemini (la misma que usa el panel cuando no llega el icono)
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'tg-k-logo'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      const defs = document.createElementNS(NS, 'defs');
      const grad = document.createElementNS(NS, 'linearGradient');
      grad.setAttribute('id', 'tg-k-grad'); grad.setAttribute('x1', '0'); grad.setAttribute('y1', '1'); grad.setAttribute('x2', '1'); grad.setAttribute('y2', '0');
      [['0%', '#4285f4'], ['50%', '#9b72cb'], ['100%', '#d96570']].forEach(function (p) {
        const s = document.createElementNS(NS, 'stop');
        s.setAttribute('offset', p[0]); s.setAttribute('stop-color', p[1]); grad.appendChild(s);
      });
      defs.appendChild(grad);
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('fill', 'url(#tg-k-grad)');
      path.setAttribute('d', 'M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 17 7.1 12.7 1.5 12 7.1 11.4 11.4 7.1 12 1.5z');
      svg.appendChild(defs); svg.appendChild(path);

      const fondos = el('div', 'tg-k-fondos');
      fondos.setAttribute('aria-hidden', 'true');
      const f1 = el('div', 'tg-k-fondo'), f2 = el('div', 'tg-k-fondo tg-k-fondo-b');
      if (imagen) { f1.style.backgroundImage = imagen; f2.style.backgroundImage = imagen; }
      fondos.appendChild(f1); fondos.appendChild(f2);

      const marca = el('div', 'tg-k-marca');
      const urlLogo = urlLogoGemini(); // app vieja sin TG_LOGO_GEMINI: queda la estrella dibujada
      let logoEl = svg;
      if (urlLogo) { logoEl = document.createElement('img'); logoEl.className = 'tg-k-logo'; logoEl.alt = ''; logoEl.src = urlLogo; }
      marca.appendChild(logoEl);
      marca.appendChild(el('span', 'tg-k-nombre', 'Gemini Vibes nueva versión'));
      const cab = el('div', 'tg-k-cab');
      cab.appendChild(fondos);
      cab.appendChild(el('div', 'tg-k-titulo', 'Actualización de la app'));
      cab.appendChild(marca);
      cab.appendChild(el('div', 'tg-k-sub', 'Requiere instalar la nueva versión de la app'));

      const btn = el('a', 'tg-k-btn', 'Ir a GitHub');
      btn.href = TG_URL_GITHUB_APP; btn.target = '_blank'; btn.rel = 'noopener';
      btn.addEventListener('click', function (e) { e.preventDefault(); abrirGithubApp(); });
      const cuerpo = el('div', 'tg-k-cuerpo');
      cuerpo.appendChild(el('div', 'tg-k-eti', 'Notas de versión:'));
      cuerpo.appendChild(el('div', 'tg-k-notas', 'Esta actualización cambia partes internas de la app, por eso no se puede instalar desde aquí. Para seguir actualizando, busca la nueva versión de la app en GitHub, descárgala e instálala.'));
      cuerpo.appendChild(btn);
      cuerpo.appendChild(el('div', 'tg-k-pie', 'Instala la nueva versión de la app para seguir usando Gemini Vibes.'));

      const panel = el('div', 'tg-k-panel');
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Actualización de la app');
      panel.appendChild(cab); panel.appendChild(cuerpo);
      aviso.appendChild(est); aviso.appendChild(el('div', 'tg-k-velo')); aviso.appendChild(panel);
      document.documentElement.appendChild(aviso);

      // fondo en VIDEO (si es lo que tiene guardado): se lee de IndexedDB y va detrás de todo
      try {
        if (pf.geminiFondoTipo === 'video') {
          const r = indexedDB.open('tg-fondos-extension', 1);
          r.onsuccess = function () {
            try {
              const bd = r.result;
              if (!bd.objectStoreNames.contains('videos')) { bd.close(); return; }
              const g = bd.transaction('videos', 'readonly').objectStore('videos').get('gemini');
              g.onsuccess = function () {
                const blob = g.result;
                bd.close();
                if (!blob || !aviso.isConnected) return;
                const v = document.createElement('video');
                v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
                v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;pointer-events:none;';
                v.src = URL.createObjectURL(blob);
                aviso.style.isolation = 'isolate';
                aviso.insertBefore(v, aviso.firstChild);
                const pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
              };
              g.onerror = function () { bd.close(); };
            } catch (e) { /* sin video: queda el fondo normal */ }
          };
        }
      } catch (e) { /* sin fondo personalizado: queda el fondo normal */ }
    };
    if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar, { once: true });
  }
  if (KERNEL_INCOMPATIBLE) {
    // todo lo demás queda desactivado: no se crea ninguna hoja de estilo, observer, bloqueo ni menú
    console.warn('[tg] kernel incompatible: script=' + TG_KERNEL + ' app=' + KERNEL_DART);
    pantallaKernelIncompatible();
    return;
  }
  // ¿el script nuevo encontrado en GitHub necesita otra app? (remotaKernel lo calcula Dart leyendo TG_KERNEL del script descargado)
  function kernelRemotoDistinto(d) {
    return !!d && !!d.hayNueva && (d.remotaKernel === undefined || d.remotaKernel === null || Number(d.remotaKernel) !== TG_KERNEL);
  }
  // PANTALLA DE BLOQUEO (se muestra al cargar la página; ESPACIO la sube y el body entra con zoom;
  // ALT + L la vuelve a bajar para bloquear de nuevo)
  // Se activa/desactiva con el interruptor del panel Personalizar. Se guarda en chrome.storage (geminiBloqueoActivo) y se
  // copia en localStorage para poder leerlo al instante al cargar la página (chrome.storage es asíncrono y habría parpadeo).
  const BLOQUEO_CLAVE_LS = 'tg-bloqueo-activo';
  const BIENVENIDA_CLAVE_LS = 'tg-bienvenida-activa'; // interruptor "Mostrar bienvenida" (clave de preferencias: geminiBienvenidaActiva; content.dart debe tenerla en clavesValidas). Por defecto ENCENDIDO

  // ============================================================================================
  // ESTADO GLOBAL "BLOQUEADO" (ahorro de recursos)
  // Mientras la pantalla de bloqueo / PIN está encima, NADA de lo demás debe trabajar: planificador de tareas, observers,
  // intervalos, Lenis, auto-scroll, videos de fondo de Gemini y animaciones CSS quedan en pausa. Al desbloquear se dispara el
  // evento 'tg-bloqueo-cambio' y cada parte se pone al día (una sola vez, sin repetir lo que se perdió).
  // ============================================================================================
  let pantallaBloqueada = false;
  // marcas de tiempo (performance.now) para que el planificador no compita con la animación de envío ni con el teclado
  let cargandoConv = false; // true mientras está la barrita de "Cargando la conversación": mensajes ocultos y el content no toca las burbujas
  let tgForma = null;       // lo rellena el indicador de carga: montar(el)/parar(el) para reutilizarlo (ej. botón de actualizaciones)
  let vueloHasta = 0;       // mientras dura el vuelo del mensaje enviado
  let escribiendoHasta = 0; // mientras se está escribiendo en la caja
  // true mientras el body está escalado (bloqueado o durante el zoom de entrada/salida): en ese tiempo NO se mide el layout
  // (getBoundingClientRect devolvería medidas escaladas y el header / burbujas quedarían mal colocados)
  let cuerpoEscalado = false;
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
    const vb = PREFS_INICIALES.geminiBienvenidaActiva;
    if (vb === true || vb === false || vb === 'true' || vb === 'false') {
      try { localStorage.setItem(BIENVENIDA_CLAVE_LS, (vb === true || vb === 'true') ? '1' : '0'); } catch (e) { /* sin localStorage */ }
    }
    const v = PREFS_INICIALES.geminiBloqueoActivo;
    if (v === true || v === false || v === 'true' || v === 'false') {
      try { localStorage.setItem(BLOQUEO_CLAVE_LS, (v === true || v === 'true') ? '1' : '0'); } catch (e) { /* sin localStorage */ }
    }
  })();

  // ============================================================================================
  // NIVEL DE BLUR (Personalizar > Rendimiento > Baja / Media / Alta; clave geminiBlurNivel; por defecto "alta")
  // Sustituye al antiguo perfil (Automático / Máximo / Ligero) y al interruptor "Desactivar desenfoque".
  //   baja  → NADA de blur (menús y panel Personalizar quedan con fondo opaco; transparencia de tu burbuja fija en 10 %): ni backdrop-filter, ni filter(blur) en animaciones (vuelo de la burbuja, puntitos, fondo del PIN),
  //           ni el blur fade de arriba/abajo del chat (en su lugar va el fade LITE: tu fondo de pantalla con máscara en degradé, sin blur).
  //   media → blur SOLO en las burbujas del chat, la caja de escribir, los botones de arriba (+ copiar/editar), la barra lateral,
  //           los menús contextuales, el marco de Personalizar y el fondo de "¿Por dónde empezamos?". Sin blur fade (lleva el fade LITE: el fondo en degradé, sin blur). En el bloqueo solo lleva blur el fondo del PIN.
  //           La animación de vuelo de la burbuja NO lleva filter(blur) (ni en media ni en baja).
  //           El fondo de la BIENVENIDA (#tg-bloqueo-fondo.tg-bv-fondo) queda fijo en blur(5px) en media y baja (SIN animación); la animación 56→5px solo corre en alta.
  //   alta  → cada parámetro de blur tal como está definido en cada elemento (no se toca nada).
  // Todo se hace con la clase html.tg-blur-baja / html.tg-blur-media y UNA hoja de estilos dentro de @layer: las declaraciones
  // !important de una capa ganan a las !important sin capa, así que no importa qué tan específico sea el selector original.
  // ============================================================================================
  const BLUR_NIVEL_LS = 'tg-blur-nivel';
  const NIVELES_BLUR = ['baja', 'media', 'alta'];
  // OPACIDAD EXTRA en los fondos que se quedan SIN blur (sin blur los fondos translúcidos se leen peor). 0.05 = +5 %.
  //   --tg-sb-extra     → fondos de burbujas / caja de escribir / botones de arriba (solo en "baja", que es donde pierden el blur)
  //   --tg-sb-extra-nb  → fondos que pierden el blur en "baja" Y en "media" (menús, barra lateral, panel, teclado del PIN...)
  const BLUR_OPACIDAD_EXTRA = 0.05;
  // En "baja", la caja de escribir y los botones de arriba reciben ADEMÁS este extra (se suma al de arriba) para distinguirse sin blur.
  // Se aplica con --tg-sb-extra-ctl, que solo existe en "baja".
  const BLUR_OPACIDAD_CONTROLES_BAJA = 0;
  let nivelBlur = 'alta';
  let nivelBlurExplicito = false; // true si el usuario ya eligió un nivel (si no, se migra del ajuste antiguo)
  try {
    const ng = localStorage.getItem(BLUR_NIVEL_LS) || PREFS_INICIALES.geminiBlurNivel;
    if (NIVELES_BLUR.indexOf(ng) >= 0) { nivelBlur = ng; nivelBlurExplicito = true; }
    else {
      // migración de los ajustes antiguos: "Desactivar desenfoque" → baja; perfil "Ligero" → media
      const sb = localStorage.getItem('tg-sin-blur'), si = PREFS_INICIALES.geminiSinBlur;
      const pf = localStorage.getItem('tg-perfil') || PREFS_INICIALES.geminiPerfil;
      if (sb === '1' || (sb === null && (si === true || si === 'true'))) nivelBlur = 'baja';
      else if (pf === 'ligero') nivelBlur = 'media';
    }
  } catch (e) { /* sin localStorage: queda en alta */ }
  let sinBlur = nivelBlur === 'baja'; // atajo para el JS (vuelo de la burbuja): true solo en "baja"
  let alCambiarNivelBlur = null;      // hook: lo asigna la sección de la burbuja (transparencia fija en "baja")
  // TECLADO (app móvil, ver tgSetTeclado): px del teclado que de verdad TAPAN la página (0 = cerrado o ya redimensionada por Android)
  // y px que se ha subido la caja de escribir en este instante. El fade de abajo los lee para terminar donde empieza el teclado.
  let tecladoKbEf = 0, tecladoAplicado = 0;
  // QUITAR DIFUMINADO DEL SCROLL (todos los niveles; clave geminiSinFade; por defecto apagado): no hay ningún fade arriba/abajo del chat
  const SINFADE_CLAVE_LS = 'tg-sin-fade';
  let sinFadeScroll = false;
  try {
    const fg = localStorage.getItem(SINFADE_CLAVE_LS), fi = PREFS_INICIALES.geminiSinFade;
    if (fg === '0' || fg === '1') sinFadeScroll = fg === '1';
    else if (fi === true || fi === 'true') sinFadeScroll = true;
  } catch (e) { /* sin localStorage */ }
  function cambiarSinFade(v) {
    sinFadeScroll = !!v;
    try { localStorage.setItem(SINFADE_CLAVE_LS, sinFadeScroll ? '1' : '0'); } catch (e) { /* sin localStorage */ }
    prefsGuardar({ geminiSinFade: sinFadeScroll });
    try { Tareas.marcar('layout'); } catch (e) { /* aún no está todo creado */ }
  }
  function aplicarNivelBlur() {
    const r = document.documentElement;
    sinBlur = nivelBlur === 'baja';
    r.classList.toggle('tg-blur-baja', nivelBlur === 'baja');
    r.classList.toggle('tg-blur-media', nivelBlur === 'media');
    if (nivelBlur === 'baja') r.style.setProperty('--tg-sb-extra', String(BLUR_OPACIDAD_EXTRA)); else r.style.removeProperty('--tg-sb-extra');
    if (nivelBlur === 'baja') r.style.setProperty('--tg-sb-extra-ctl', String(BLUR_OPACIDAD_EXTRA + BLUR_OPACIDAD_CONTROLES_BAJA)); else r.style.removeProperty('--tg-sb-extra-ctl');
    if (nivelBlur !== 'alta') r.style.setProperty('--tg-sb-extra-nb', String(BLUR_OPACIDAD_EXTRA)); else r.style.removeProperty('--tg-sb-extra-nb');
    if (alCambiarNivelBlur) alCambiarNivelBlur();
  }
  function cambiarNivelBlur(n) {
    if (NIVELES_BLUR.indexOf(n) < 0) return;
    nivelBlur = n; nivelBlurExplicito = true;
    try { localStorage.setItem(BLUR_NIVEL_LS, n); } catch (e) { /* sin localStorage */ }
    prefsGuardar({ geminiBlurNivel: n });
    aplicarNivelBlur();

  // ===== MODO TÁCTIL RÁPIDO (solo app móvil / ES_APP_FLUTTER) =====
  // 1) toque inmediato en botones (sin espera de doble-toque ni resaltado) · 2) la caja de escribir pierde el blur mientras se escribe
  // 3) los botones de arriba pierden el blur mientras se hace scroll (se re-desenfocaban en cada fotograma) · 4) radio de 14px -> 9px.
  // Todo cuelga de html.tg-movil: en la extensión de Chrome no se activa. Dentro de @layer para ganar a los !important sin capa.
  const MOVIL_OPACIDAD_ESCRIBIENDO = 0.95; // opacidad con la que queda la caja al quitarle el blur (0.95 = casi opaca, sin salto al escribir)
  const MOVIL_OPACIDAD_SCROLL = 0.3;      // igual, para los botones de arriba mientras se hace scroll
  (function () {
    if (typeof ES_APP_FLUTTER === 'undefined' || !ES_APP_FLUTTER) return;
    const r = document.documentElement;
    r.classList.add('tg-movil');
    const st = document.createElement('style');
    st.id = 'tg-movil-rapido';
    const BOTONES_ARRIBA = [
      'top-bar-actions button.mat-mdc-icon-button', '.side-nav-menu-button button.mat-mdc-icon-button',
      'chat-app-side-nav-menu-button button.mat-mdc-icon-button', 'top-bar-actions .left-section button.mat-mdc-button',
      'top-bar-actions .center-section button.mat-mdc-button', 'bard-mode-switcher:not(:is(input-area-v2 *)) button'
    ].map((x) => 'html.tg-movil.tg-scrolleando ' + x).join(',\n');
    st.textContent = `
      @layer tg-blur {
        html.tg-movil { --tg-bf14: 9px; }
        html.tg-movil user-query, html.tg-movil model-response { content-visibility: auto; contain-intrinsic-size: auto 400px; }
        html.tg-movil.tg-blur-media :is(input-area-v2, top-bar-actions, bard-sidenav) { will-change: auto !important; }
        html.tg-movil :is(button, [role="button"], [role="menuitem"], a, summary, label, input, textarea, select) {
          touch-action: manipulation !important; -webkit-tap-highlight-color: transparent !important;
        }
        html.tg-movil:not(.tg-blur-baja)[data-tg-teclado] input-area-v2 .text-input-field,
        html.tg-movil:not(.tg-blur-baja)[data-tg-teclado] input-area-v2 .input-area-fieldset > .text-input-field,
        html.tg-movil:not(.tg-blur-baja) input-area-v2 .text-input-field:focus-within,
        html.tg-movil:not(.tg-blur-baja) input-area-v2 .input-area-fieldset > .text-input-field:focus-within {
          -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
          box-shadow: inset 0 0 0 100vmax rgba(0, 0, 0, ${MOVIL_OPACIDAD_ESCRIBIENDO}) !important;
        }
        html[data-tema="claro"].tg-movil:not(.tg-blur-baja)[data-tg-teclado] input-area-v2 .text-input-field,
        html[data-tema="claro"].tg-movil:not(.tg-blur-baja)[data-tg-teclado] input-area-v2 .input-area-fieldset > .text-input-field,
        html[data-tema="claro"].tg-movil:not(.tg-blur-baja) input-area-v2 .text-input-field:focus-within,
        html[data-tema="claro"].tg-movil:not(.tg-blur-baja) input-area-v2 .input-area-fieldset > .text-input-field:focus-within {
          box-shadow: inset 0 0 0 100vmax rgba(255, 255, 255, ${MOVIL_OPACIDAD_ESCRIBIENDO}) !important;
        }
        ${BOTONES_ARRIBA.replace(/html\.tg-movil\.tg-scrolleando/g, 'html.tg-movil:not(.tg-blur-baja).tg-scrolleando')} {
          -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
          box-shadow: inset 0 0 0 100vmax rgba(0, 0, 0, ${MOVIL_OPACIDAD_SCROLL}) !important;
        }
        ${BOTONES_ARRIBA.replace(/html\.tg-movil\.tg-scrolleando/g, 'html[data-tema="claro"].tg-movil:not(.tg-blur-baja).tg-scrolleando')} {
          box-shadow: inset 0 0 0 100vmax rgba(255, 255, 255, ${MOVIL_OPACIDAD_SCROLL}) !important;
        }
      }`;
    document.head.appendChild(st);
    // clase tg-scrolleando mientras el chat se desplaza (un solo temporizador; solo toca el DOM al empezar y al terminar)
    let activo = false, ultimo = 0, timer = null;
    const FIN_MS = 180;
    function revisar() {
      timer = null;
      const falta = FIN_MS - (performance.now() - ultimo);
      if (falta > 10) { timer = setTimeout(revisar, falta); return; }
      activo = false; r.classList.remove('tg-scrolleando');
    }
    document.addEventListener('scroll', () => {
      ultimo = performance.now();
      if (!activo) { activo = true; r.classList.add('tg-scrolleando'); }
      if (!timer) timer = setTimeout(revisar, FIN_MS);
    }, { capture: true, passive: true });
  })();
    try { Tareas.marcar('layout'); Tareas.marcar('menuLateral'); } catch (e) { /* aún no está todo creado */ }
  }
  function esTactil() { return !!(window.matchMedia && window.matchMedia('(hover: none)').matches); }
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
  (function () {
    // elementos que SÍ conservan su blur en el nivel "media" (el resto pierde el backdrop-filter)
    const PERMITIDOS = [
      '.user-query-bubble-with-background',
      '.response-container',
      'thinking-dots-animation:not(.response-container-header *, [data-tg-burbuja] *)',
      '[data-tg-puntos][data-tg-burbuja]',
      '[data-tg-creando-burbuja]',
      '[data-tg-creando-caja]:not([data-tg-creando-unica])',
      'input-area-v2 .text-input-field',
      'input-area-v2 .input-area-fieldset > .text-input-field',
      'immersive-panel button.option',
    ].join(', ');
    const est = document.createElement('style');
    est.id = 'tg-blur-style'; // no está en VIBES_ESTILOS: funciona con Vibes encendido o apagado
    est.textContent = `
      @layer tg-blur {
        /* BAJA: ningún backdrop-filter en ningún elemento */
        html.tg-blur-baja *, html.tg-blur-baja *::before, html.tg-blur-baja *::after {
          -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
        }
        /* BAJA: sin filter(blur) en el fondo del PIN (queda solo oscurecido) ni en los puntitos de "pensando" */
        html.tg-blur-baja #tg-pin .tg-pin-fondo { filter: brightness(0.5) saturate(1.1) !important; inset: 0 !important; }
        html.tg-blur-baja body [data-tg-puntos-retraso="oculto"] { filter: none !important; }
        /* BAJA: sin blur, los menús contextuales y el marco de Personalizar pasan a fondo OPACO (translúcido sin blur se lee mal) */
        html.tg-blur-baja [data-tg-menu-capa="blur"],
        html.tg-blur-baja .desktop-settings-menu:not([data-tg-menu-capa]),
        html.tg-blur-baja #tg-personalizar-panel {
          background: rgb(32, 33, 36) !important; background-color: rgb(32, 33, 36) !important; background-image: none !important;
        }
        html[data-tema="claro"].tg-blur-baja [data-tg-menu-capa="blur"],
        html[data-tema="claro"].tg-blur-baja .desktop-settings-menu:not([data-tg-menu-capa]),
        html[data-tema="claro"].tg-blur-baja #tg-personalizar-panel {
          background: rgb(244, 246, 251) !important; background-color: rgb(244, 246, 251) !important;
        }
        /* BAJA y MEDIA: el subtítulo alterno de la BIENVENIDA no usa filter(blur) al cruzarse (solo opacidad + desplazamiento) */
        html.tg-blur-baja #tg-bloqueo .tg-b-bv-sub > span, html.tg-blur-baja #tg-bloqueo .tg-b-bv-sub > span.tg-off,
        html.tg-blur-media #tg-bloqueo .tg-b-bv-sub > span, html.tg-blur-media #tg-bloqueo .tg-b-bv-sub > span.tg-off {
          filter: none !important; transition-property: opacity, transform !important;
        }
        /* MEDIA: todo pierde el backdrop-filter MENOS burbujas, caja de escribir, botones de arriba, barra lateral y fondo del inicio.
           La pantalla de bloqueo solo conserva el filter(blur) del fondo del PIN (.tg-pin-fondo), que no es backdrop-filter. */
        html.tg-blur-media *:not(${PERMITIDOS}),
        html.tg-blur-media *:not(${PERMITIDOS})::before,
        html.tg-blur-media *:not(${PERMITIDOS})::after {
          -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
        }
      }
    `;
    (document.head || document.documentElement).appendChild(est);
  })();
  aplicarNivelBlur();
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
  // interruptor "Mostrar bienvenida" (INDEPENDIENTE del bloqueo): la bienvenida de INICIO sale al entrar a la página aunque el bloqueo esté apagado
  function bienvenidaActivaGuardada() { try { return localStorage.getItem(BIENVENIDA_CLAVE_LS) !== '0'; } catch (e) { return true; } }
  function guardarBienvenidaActiva(v) {
    try { localStorage.setItem(BIENVENIDA_CLAVE_LS, v ? '1' : '0'); } catch (e) { /* sin localStorage */ }
    prefsGuardar({ geminiBienvenidaActiva: !!v });
  }
  const MOSTRAR_BIENVENIDA = bienvenidaActivaGuardada() && vibesOn;

  // ============================================================================================
  // FIX VISTO (pantalla de bienvenida tras actualizar)
  // - "fix visto" = el último TG_FIX con el que se abrió Gemini Vibes (el de ANTES de actualizar). Se guarda en localStorage y en
  //   las preferencias (clave geminiFixVisto; content.dart debe tenerla en clavesValidas).
  // - Si es distinto al TG_FIX de este script (o no existe: primera instalación) se muestra la pantalla de bienvenida, al estilo de
  //   la de bloqueo. Al deslizarla hacia arriba (o Espacio) entra Gemini con la misma transición de desbloqueo y ENTONCES se actualiza
  //   la variable. Si la cierras sin deslizar, la bienvenida vuelve a salir la próxima vez.
  // - Si la pantalla de bloqueo está activada, la bienvenida lleva al PIN como siempre (no se salta la seguridad).
  // ============================================================================================
  const FIX_VISTO_LS = 'tg-fix-visto';
  function fixVistoGuardado() {
    try {
      const g = localStorage.getItem(FIX_VISTO_LS);
      if (g !== null && g !== '') return Number(g);
    } catch (e) { /* sin localStorage */ }
    const p = PREFS_INICIALES.geminiFixVisto;
    return (p === undefined || p === null || p === '') ? null : Number(p);
  }
  function guardarFixVisto(k) {
    try { localStorage.setItem(FIX_VISTO_LS, String(k)); } catch (e) { /* sin localStorage */ }
    prefsGuardar({ geminiFixVisto: k });
  }
  // DOS BIENVENIDAS (la misma pantalla, distinto subtítulo y recorrido):
  //  · ACTUALIZACIÓN (BIENVENIDA_PENDIENTE): el fix guardado NO coincide con TG_FIX (o no existe: primera instalación). Sale UNA vez por cada
  //    fix nuevo, OBLIGATORIAMENTE (aunque la pantalla de bienvenida esté desactivada en Personalizar). Subtítulos "¡Su extensión se ha actualizado!"
  //    ↔ "Versión X"; al deslizar: PIN (si la pantalla está activada) → novedades de la actualización → Gemini. Al entrar a Gemini se guarda el fix visto.
  //  · INICIO (sin actualización): solo si el interruptor "Mostrar bienvenida" de Personalizar está activado (independiente del bloqueo). Subtítulos
  //    "¡Más hermoso que nunca!" ↔ "¡Bienvenido de vuelta!"; al deslizar: PIN (solo si el interruptor "Pantalla de bloqueo" está activado) → directo a Gemini, SIN novedades.
  const BIENVENIDA_PENDIENTE = vibesOn && fixVistoGuardado() !== TG_FIX;
  // PRIMERA VEZ (instalación nueva): antes de las novedades salen la guía "Antes de comenzar..." y la pregunta de la pantalla de bloqueo
  const ONBOARDING_LS = 'tg-onboarding-visto';
  function onboardingVisto() {
    try { if (localStorage.getItem(ONBOARDING_LS) === '1') return true; } catch (e) { /* sin localStorage */ }
    const v = PREFS_INICIALES.geminiOnboardingVisto;
    return v === true || v === 'true';
  }
  function guardarOnboardingVisto() {
    try { localStorage.setItem(ONBOARDING_LS, '1'); } catch (e) { /* sin localStorage */ }
    prefsGuardar({ geminiOnboardingVisto: true });
  }
  const PRIMERA_VEZ = BIENVENIDA_PENDIENTE && !onboardingVisto(); // la guía sale UNA vez si nunca se completó (antes exigía también fixVisto === null: en la extensión de Chrome el localStorage de Gemini ya traía un fix visto de versiones anteriores y la guía nunca aparecía)
  const BLOQUEO_OPACIDAD_INICIAL = 0;   // opacidad del body al empezar la transición (termina en 1)
  const BLOQUEO_ESCALA_INICIAL = 1.3;   // escala del body al empezar la transición (termina en 1)
  const BLOQUEO_DURACION_MS = 300;     // duración de la subida de la pantalla y de la entrada del body
  const BLOQUEO_DURACION_BODY_MS = BLOQUEO_DURACION_MS * 2.5; // duración de la animación del body (zoom)
  const BLOQUEO_FONDO_ARCHIVO = "img/8e2b943a517014c877bc7f688c5bdad9.jpg"; // fondo detrás del body (archivo dentro de la extensión)
  // AUDIO DE FONDO DE LA BIENVENIDA: suena en bucle mientras está la pantalla de bienvenida y se apaga (fade) al entrar.
  // Archivo en la RAÍZ de la extensión (junto a manifest.json); debe estar en web_accessible_resources. En la app Flutter se puede
  // inyectar una URL/data URL con geminiAudioBienvenida (window.TG_PREFS_INICIALES).
  const BIENVENIDA_AUDIO_ARCHIVO = "Yume 2kki OST Lotus Waters.mp3";
  const BIENVENIDA_AUDIO_VOLUMEN = 1; // 0 a 1
  const BIENVENIDA_AUDIO_FADE_MS = 3000;
  const BIENVENIDA_SUB_CAMBIO_MS = 4000; // cada cuánto alterna el subtítulo de la bienvenida
  const BIENVENIDA_MARCA_RETRASO_MS = 800; // la animación del logo empieza este tiempo DESPUÉS de que arranca la canción
  const BIENVENIDA_BLUR_MS = Math.round(BIENVENIDA_MARCA_RETRASO_MS * 0.6); // el desenfoque 28→5px dura menos que el retraso: termina ANTES de que empiece el logo
  function urlAudioBienvenida() {
    try { if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) return chrome.runtime.getURL(encodeURI(BIENVENIDA_AUDIO_ARCHIVO)); } catch (e) { /* no es una extensión */ }
    return typeof PREFS_INICIALES.geminiAudioBienvenida === 'string' ? PREFS_INICIALES.geminiAudioBienvenida : '';
  }
  // ============================================================================================
  // MÚSICA DE BIENVENIDA PERSONALIZADA (Personalizar > bienvenida, panel de Actualizaciones)
  // - El archivo se guarda como data URL en geminiAudioBienvenida (+ el nombre en geminiAudioBienvenidaNombre).
  // - App Flutter: Dart lo decodifica y lo reproduce (handler 'audioBienvenida', acción 'recargar' = usar la canción nueva).
  // - Extensión: audioBienvenida() lo lee de chrome.storage. "Quitar" vuelve a la canción original.
  // ============================================================================================
  function recargarAudioFlutter() {
    try {
      const fl = window.flutter_inappwebview;
      if (ES_APP_FLUTTER && fl && fl.callHandler) { const r = fl.callHandler('audioBienvenida', 'recargar'); if (r && r.catch) r.catch(() => {}); }
    } catch (e) { /* sin puente */ }
  }
  function elegirMusicaBienvenida(alTerminar) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'audio/*,.mp3,.m4a,.aac,.ogg,.wav,.flac'; inp.style.display = 'none';
    document.documentElement.appendChild(inp);
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        if (typeof r.result !== 'string') return;
        musicaCache = r.result;
        borrarOriginalMusica();   // canción nueva = original nuevo (se guarda aparte al editarla)
        try { PREFS_INICIALES.geminiAudioBienvenidaNombre = f.name; } catch (e) { /* solo lectura */ }
        prefsGuardar({ geminiAudioBienvenida: r.result, geminiAudioBienvenidaNombre: f.name });
        recargarAudioFlutter();
        if (alTerminar) alTerminar(f.name);
      };
      r.onerror = () => console.error('No se pudo leer la canción:', r.error);
      r.readAsDataURL(f);
    });
    inp.click();
  }
  function quitarMusicaBienvenida() {
    musicaCache = null;
    borrarOriginalMusica();
    try { delete PREFS_INICIALES.geminiAudioBienvenidaNombre; } catch (e) { /* solo lectura */ }
    prefsBorrar(['geminiAudioBienvenida', 'geminiAudioBienvenidaNombre']);
    recargarAudioFlutter();
  }
  // ============================================================================================
  // EDITOR DE MÚSICA DE BIENVENIDA (Personalizar > Música de bienvenida > Editar)
  // - Ondas con una rayita fija en el centro (triángulo hacia abajo): ahí EMPIEZA a sonar la canción. Arrastra las ondas para moverla.
  //   Las ondas de la izquierda (lo que se salta) se hacen más pequeñas y transparentes cuanto más lejos, con transición de rebote suave.
  // - Línea de arriba: punto = posición actual, con el minuto encima (m:ss). También se puede arrastrar.
  // - Fade (entrada y salida) y Duración (desde el punto de inicio; al máximo = hasta que termine la canción).
  // - Guardar = se renderiza una COPIA recortada (WAV con el fade aplicado) y reemplaza la música guardada. Así funciona igual en la
  //   extensión y en la app Flutter (Dart reproduce el archivo ya recortado, no hace falta tocar Dart).
  // ============================================================================================
  const EDM_SEG = 0.25;                     // segundos que representa cada barrita
  const EDM_BAR = 4, EDM_STEP = 8;          // ancho de la barrita y separación entre centros (px)
  const EDM_N = 64;                         // barritas reutilizadas (cubren hasta ~512 px)
  const EDM_ALTO = 64;                      // alto máximo de una barrita (px)
  let musicaCache = null;                   // data URL de la canción recién elegida/guardada (evita leer storage antes de que termine de escribir)
  function fmtTiempo(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function dataUrlABuffer(u) {
    const b = atob(u.slice(u.indexOf(',') + 1)), x = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) x[i] = b.charCodeAt(i);
    return x.buffer;
  }
  function bufferAWav(b) {
    const ch = b.numberOfChannels, n = b.length, sr = b.sampleRate, ab = new ArrayBuffer(44 + n * ch * 2), v = new DataView(ab);
    const e = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    e(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); e(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true);
    v.setUint16(34, 16, true); e(36, 'data'); v.setUint32(40, n * ch * 2, true);
    const d = []; for (let c = 0; c < ch; c++) d.push(b.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const x = Math.max(-1, Math.min(1, d[c][i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
    return ab;
  }
  // devuelve una Promise<ArrayBuffer WAV> con la copia recortada (desde ini, dur segundos) y con el fade aplicado
  function renderizarRecorte(buf, ini, dur, fade) {
    const ch = Math.min(2, buf.numberOfChannels), rate = buf.sampleRate;
    const oc = new OfflineAudioContext(ch, Math.max(1, Math.ceil(dur * rate)), rate);
    const s = oc.createBufferSource(), g = oc.createGain();
    s.buffer = buf; s.connect(g); g.connect(oc.destination);
    if (fade > 0) {
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(1, fade);
      g.gain.setValueAtTime(1, Math.max(fade, dur - fade)); g.gain.linearRampToValueAtTime(0, dur);
    }
    s.start(0, ini, dur);
    return oc.startRendering().then(bufferAWav);
  }
  // MP3 SIN RECOMPRIMIR: copia solo los frames del tramo elegido (mismo bitrate y calidad que el original). Devuelve ArrayBuffer o null si no es un MP3 válido.
  function cortarMp3(ab, ini, dur) {
    const u = new Uint8Array(ab), n = u.length;
    const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
    let p = 0;
    if (n > 10 && u[0] === 0x49 && u[1] === 0x44 && u[2] === 0x33) p = 10 + ((u[6] & 127) << 21 | (u[7] & 127) << 14 | (u[8] & 127) << 7 | (u[9] & 127));
    const trozos = []; let t = 0, frames = 0;
    while (p + 4 <= n) {
      if (u[p] !== 0xff || (u[p + 1] & 0xe0) !== 0xe0) { p++; continue; }
      const ver = (u[p + 1] >> 3) & 3, capa = (u[p + 1] >> 1) & 3, bi = u[p + 2] >> 4, si = (u[p + 2] >> 2) & 3, pad = (u[p + 2] >> 1) & 1;
      if (ver === 1 || capa !== 1 || bi === 0 || bi === 15 || si === 3) { p++; continue; }
      const br = (ver === 3 ? BR1 : BR2)[bi] * 1000, sr = SR[ver][si];
      const len = ver === 3 ? Math.floor(144 * br / sr) + pad : Math.floor(72 * br / sr) + pad, dt = (ver === 3 ? 1152 : 576) / sr;
      if (len < 24 || p + len > n) break;
      if (t + dt > ini && t < ini + dur) trozos.push(u.subarray(p, p + len));
      t += dt; frames++; p += len;
      if (t >= ini + dur) break;
    }
    if (frames < 10 || !trozos.length) return null;
    let tot = 0; trozos.forEach((x) => { tot += x.length; });
    const o = new Uint8Array(tot); let q = 0; trozos.forEach((x) => { o.set(x, q); q += x.length; });
    return o.buffer;
  }
  let musicaOrig;                           // undefined = leer de las preferencias; objeto {url, nombre, edicion} = valor vigente (url '' = no hay original guardado aparte)
  function leerEdicion(s) { try { const o = JSON.parse(s); return (o && typeof o === 'object') ? o : null; } catch (e) { return null; } }
  function borrarOriginalMusica() {
    musicaOrig = { url: '', nombre: '', edicion: null };
    prefsBorrar(['geminiAudioBienvenidaOriginal', 'geminiAudioBienvenidaOriginalNombre', 'geminiAudioBienvenidaEdicion']);
  }
  // Devuelve SIEMPRE la canción ORIGINAL (sin recortar) + los ajustes de la última edición, para poder recortar también lo que ya se cortó.
  //  - Si ya hay original guardado aparte: ese.
  //  - Si la canción por defecto fue editada (edicion.orig === 'defecto'): se vuelve a leer la de la extensión.
  //  - Si la canción es propia y aún no se había editado: la propia es el original (se guardará aparte en la primera edición).
  function obtenerAudioParaEditar(cb) {
    const deUrl = (u, nombre, ed, info) => { fetch(u).then((x) => x.arrayBuffer()).then((ab) => cb(ab, nombre, ed, info)).catch(() => cb(null)); };
    const deDatos = (c, nombre, ed, info) => {
      if (/^data:/.test(c)) { try { cb(dataUrlABuffer(c), nombre, ed, info); } catch (e) { cb(null); } } else deUrl(c, nombre, ed, info);
    };
    prefsLeer(['geminiAudioBienvenida', 'geminiAudioBienvenidaNombre', 'geminiAudioBienvenidaOriginal', 'geminiAudioBienvenidaOriginalNombre', 'geminiAudioBienvenidaEdicion'], (r) => {
      const s = (k) => (typeof r[k] === 'string' ? r[k] : '');
      const actual = musicaCache || s('geminiAudioBienvenida');
      const nombreActual = s('geminiAudioBienvenidaNombre') || 'Canción';
      const o = musicaOrig !== undefined ? musicaOrig : { url: s('geminiAudioBienvenidaOriginal'), nombre: s('geminiAudioBienvenidaOriginalNombre'), edicion: leerEdicion(s('geminiAudioBienvenidaEdicion')) };
      const urlDef = ES_APP_FLUTTER ? '' : urlAudioBienvenida();
      if (o.url) { deDatos(o.url, o.nombre || nombreActual, o.edicion, { orig: 'propia', origUrl: o.url, guardado: true }); return; }
      if (!actual || (o.edicion && o.edicion.orig === 'defecto' && urlDef)) {
        if (urlDef) deUrl(urlDef, BIENVENIDA_AUDIO_ARCHIVO, actual ? o.edicion : null, { orig: 'defecto' }); else cb(null);
        return;
      }
      deDatos(actual, nombreActual, null, { orig: 'propia', origUrl: actual, guardado: false });
    });
  }
  function abrirEditorMusica(alGuardar) {
    if (document.getElementById('tg-edm')) return;
    if (!document.getElementById('tg-edm-style')) {
      const st = document.createElement('style'); st.id = 'tg-edm-style';
      st.textContent = `
        #tg-edm { --edm-ac: #1a73e8; --edm-tx: #fff; --edm-inv: #f0b429; --edm-card: #0f0805; position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; padding: 14px; box-sizing: border-box;
          background: rgba(0,0,0,0.55); font-family: 'Google Sans', 'Segoe UI', system-ui, -apple-system, sans-serif; color: #fff; }
        #tg-edm * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        .tg-edm-card { width: 100%; max-width: 460px; background: var(--edm-card); border-radius: 28px; padding: 18px 18px 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.6); user-select: none; -webkit-user-select: none; }
        .tg-edm-top { display: flex; align-items: center; gap: 10px; }
        .tg-edm-tit { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
        .tg-edm-tit b { font-size: 18px; font-weight: 600; }
        .tg-edm-tit span { font-size: 13px; opacity: 0.6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tg-edm-ic { flex: none; width: 40px; height: 40px; border-radius: 50%; border: 0; background: transparent; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
        .tg-edm-ic svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        .tg-edm-ic.tg-edm-play { width: 44px; height: 44px; background: var(--edm-ac); color: var(--edm-tx); }
        .tg-edm-ic.tg-edm-play svg { fill: currentColor; stroke: none; width: 22px; height: 22px; }
        .tg-edm-ic[disabled] { opacity: 0.4; pointer-events: none; }
        .tg-edm-fila { display: flex; align-items: flex-end; gap: 14px; margin-top: 10px; }
        .tg-edm-pista { position: relative; flex: 1 1 auto; height: 44px; touch-action: none; cursor: pointer; margin-right: 6px; }
        .tg-edm-pista::before { content: ''; position: absolute; left: 0; right: 0; top: 30px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.22); }
        .tg-edm-tramo { position: absolute; top: 30px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.75); }
        .tg-edm-punto { position: absolute; top: 32px; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; background: var(--edm-ac); box-shadow: 0 0 0 3px color-mix(in srgb, var(--edm-ac) 30%, transparent); }
        .tg-edm-fin { position: absolute; top: 32px; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: rgba(255,255,255,0.8); }
        .tg-edm-hora { position: absolute; top: 0; transform: translateX(-50%); font-size: 13px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: rgba(255,255,255,0.14); white-space: nowrap; }
        .tg-edm-onda { position: relative; height: ${EDM_ALTO + 46}px; margin-top: 14px; overflow: hidden; touch-action: none; cursor: grab; }
        .tg-edm-onda:active { cursor: grabbing; }
        /* la barrita se rellena de izquierda a derecha con --f (0 a 100 %): el color de relleno es el complementario del énfasis (--edm-inv) */
        .tg-edm-b { position: absolute; left: 0; top: calc(50% + 8px); width: ${EDM_BAR}px; height: 10px; border-radius: 2px; opacity: 0;
          background: linear-gradient(90deg, var(--edm-inv) calc(var(--f, 0) * 1%), #fff calc(var(--f, 0) * 1%));
          transform-origin: 50% 50%; will-change: translate, scale, opacity;
          transition: scale 0.55s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.45s ease; }
        /* marcas de corte: solo se mueven si el usuario las agarra (zona táctil de 44 px) */
        .tg-edm-linea { position: absolute; left: 0; top: 0; bottom: 0; width: 44px; margin-left: -22px; z-index: 2; cursor: ew-resize; touch-action: none; will-change: translate; }
        .tg-edm-linea::after { content: ''; position: absolute; left: 50%; top: 16px; bottom: 0; width: 3px; margin-left: -1.5px; border-radius: 2px; background: var(--edm-ac); }
        .tg-edm-linea::before { content: ''; position: absolute; left: 50%; top: 4px; margin-left: -7px; border: 7px solid transparent; border-top: 11px solid var(--edm-ac); border-bottom: 0; }
        .tg-edm-lfin { z-index: 1; }
        .tg-edm-lfin::after { background: rgba(255,255,255,0.85); }
        .tg-edm-lfin::before { border-top-color: rgba(255,255,255,0.85); }
        .tg-edm-onda:not(.tg-edm-lista) .tg-edm-linea { visibility: hidden; }
        .tg-edm-aj { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; }
        .tg-edm-aj label { display: grid; grid-template-columns: 74px 1fr 82px; align-items: center; gap: 10px; font-size: 14px; }
        .tg-edm-aj label em { font-style: normal; font-size: 13px; opacity: 0.75; text-align: right; }
        .tg-edm-aj input[type=range] { width: 100%; accent-color: var(--edm-ac); margin: 0; }
        .tg-edm-msg { min-height: 18px; margin-top: 10px; font-size: 12.5px; opacity: 0.7; text-align: center; }
        html.tg-panel-seguro.tg-panel-seguro immersive-panel :is(.option-container, .hint-button-container gem-button, .navigation-buttons-container gem-button) { animation: none !important; }
      @media (prefers-reduced-motion: reduce) { .tg-edm-b { transition: none; } }`;
      (document.head || document.documentElement).appendChild(st);
    }
    // ---------- estado ----------
    let buf = null, total = 0, picos = null, nB = 0;
    let ini = 0;              // punto de inicio elegido (s), sobre la canción ORIGINAL completa
    let centro = 0;           // tiempo (s) que se ve en el centro de las ondas: solo es la vista, NO mueve el corte
    let durFija = null;       // null = hasta el final de la canción
    let fade = 2;             // s (entrada y salida)
    let nombre = 'Canción';
    let infoOrig = { orig: 'propia' };   // de dónde sale el original (ver obtenerAudioParaEditar)
    let reproPos = null;      // segundos reproducidos desde el inicio del corte (null = nada que mostrar). Se queda al pausar como referencia.
    let o0 = 0, t0r = 0, seguir = true;
    let ctx = null, fuente = null, gan = null, raf = 0, sonando = false, guardando = false, cw = 0, crudo = null;
    const durEf = () => durFija == null ? Math.max(1, total - ini) : Math.max(1, Math.min(durFija, total - ini));
    const fadeEf = () => Math.min(fade, durEf() / 2);
    const vistaPos = () => reproPos == null ? ini : Math.min(total, ini + reproPos);

    // ---------- DOM ----------
    const svg = (d, extra) => hs('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, hs('path', Object.assign({ d }, extra || {})));
    const bX = h('button', { class: 'tg-edm-ic', type: 'button', 'aria-label': 'Cerrar' }, svg('M6 6l12 12M18 6L6 18'));
    const bOk = h('button', { class: 'tg-edm-ic', type: 'button', 'aria-label': 'Guardar', disabled: true }, svg('M5 12.5l4.5 4.5L19 7.5'));
    const bPlay = h('button', { class: 'tg-edm-ic tg-edm-play', type: 'button', 'aria-label': 'Escuchar', disabled: true });
    const tSub = h('span', null, 'Cargando…');
    const hora = h('span', { class: 'tg-edm-hora' }, '0:00');
    const punto = h('span', { class: 'tg-edm-punto' });
    const fin = h('span', { class: 'tg-edm-fin' });
    const tramo = h('span', { class: 'tg-edm-tramo' });
    const pista = h('div', { class: 'tg-edm-pista' }, tramo, fin, punto, hora);
    const linea = h('span', { class: 'tg-edm-linea', 'aria-label': 'Inicio del corte' });
    const lineaFin = h('span', { class: 'tg-edm-linea tg-edm-lfin', 'aria-label': 'Final del corte' });
    const onda = h('div', { class: 'tg-edm-onda' });
    const rFade = h('input', { type: 'range', min: '0', max: '8', step: '0.5', value: String(fade) });
    const rDur = h('input', { type: 'range', min: '1', max: '60', step: '1', value: '60' });
    const vFade = h('em', null, '');
    const vDur = h('em', null, '');
    const msg = h('div', { class: 'tg-edm-msg' }, '');
    const pool = [];
    for (let k = 0; k < EDM_N; k++) { const b = h('span', { class: 'tg-edm-b' }); b._j = null; b._f = -1; pool.push(b); onda.appendChild(b); }
    onda.appendChild(lineaFin); onda.appendChild(linea);
    const velo = h('div', { id: 'tg-edm' },
      h('div', { class: 'tg-edm-card', role: 'dialog', 'aria-label': 'Editar música de bienvenida' },
        h('div', { class: 'tg-edm-top' }, h('div', { class: 'tg-edm-tit' }, h('b', null, 'Editar música'), tSub), bX, bOk),
        h('div', { class: 'tg-edm-fila' }, bPlay, pista),
        onda,
        h('div', { class: 'tg-edm-aj' },
          h('label', null, 'Fade', rFade, vFade),
          h('label', null, 'Duración', rDur, vDur)),
        msg));
    // paleta de la burbuja: énfasis, texto, fondo de la tarjeta (mismo tono, muy oscuro) y color de relleno (complementario del énfasis)
    try {
      const b = burbuja;
      velo.style.setProperty('--edm-ac', burbujaCSS(b, false));
      velo.style.setProperty('--edm-tx', burbujaTexto(b));
      velo.style.setProperty('--edm-card', 'hsl(' + b.h + ', ' + Math.min(40, b.s * 0.45).toFixed(0) + '%, 8%)');
      velo.style.setProperty('--edm-inv', 'hsl(' + ((b.h + 180) % 360) + ', ' + Math.max(55, Math.min(100, b.s)) + '%, 62%)');
    } catch (e) { /* quedan los colores por defecto */ }
    document.documentElement.appendChild(velo);

    const iconoPlay = () => { bPlay.textContent = ''; bPlay.appendChild(svg(sonando ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5v14l11-7z')); };
    iconoPlay();

    // ---------- dibujo ----------
    function pintarOnda() {
      if (!picos) return;
      const pi = centro / EDM_SEG, base = Math.floor(pi) - (EDM_N >> 1), cx = cw / 2;
      const piIni = ini / EDM_SEG, piFin = (ini + durEf()) / EDM_SEG;
      const xPlay = reproPos == null ? null : cx + ((ini + reproPos) / EDM_SEG - pi) * EDM_STEP;
      for (let j = base; j < base + EDM_N; j++) {
        const el = pool[((j % EDM_N) + EDM_N) % EDM_N];
        const fuera = j < 0 || j >= nB;
        const cortada = j < piIni - 0.5 || j > piFin - 0.5;      // lo que se corta (antes del inicio o después del final): más pequeño y transparente
        const esc = cortada ? 0.45 : 1;
        let op = cortada ? 0.3 : 1;
        if (fuera) op = 0;
        const x = cx + (j - pi) * EDM_STEP - EDM_BAR / 2;
        if (el._j !== j) { el._j = j; el.style.height = (8 + (EDM_ALTO - 8) * (fuera ? 0 : picos[j])) + 'px'; }
        el.style.translate = x + 'px -50%';
        el.style.scale = '1 ' + esc;
        el.style.opacity = String(op);
        // relleno suave: la barrita se va llenando de izquierda a derecha según por dónde va la reproducción
        let fr = 0;
        if (xPlay !== null && !fuera && !cortada) fr = Math.round(Math.max(0, Math.min(1, (xPlay - x) / EDM_BAR)) * 100);
        if (el._f !== fr) { el._f = fr; el.style.setProperty('--f', String(fr)); }
      }
      linea.style.translate = (cx + (piIni - pi) * EDM_STEP) + 'px 0';
      lineaFin.style.translate = (cx + (piFin - pi) * EDM_STEP) + 'px 0';
    }
    function pintarPista() {
      const vp = vistaPos(), f = total ? Math.min(1, vp / total) : 0, fe = total ? Math.min(1, (ini + durEf()) / total) : 1;
      punto.style.left = (f * 100) + '%'; hora.style.left = Math.max(7, Math.min(93, f * 100)) + '%';
      hora.textContent = fmtTiempo(vp);
      tramo.style.left = ((total ? ini / total : 0) * 100) + '%'; tramo.style.width = (Math.max(0, fe - (total ? ini / total : 0)) * 100) + '%';
      fin.style.left = (fe * 100) + '%';
    }
    function pintarAjustes() {
      const maxD = Math.max(1, Math.floor(total - ini)), minD = Math.min(3, maxD);
      rDur.min = String(minD); rDur.max = String(maxD);
      rDur.value = String(durFija == null ? maxD : Math.min(durFija, maxD));
      vDur.textContent = (durFija == null || durFija >= maxD) ? 'Hasta el final' : fmtTiempo(durFija);
      rFade.max = String(Math.max(0, Math.min(8, Math.floor(durEf() / 2 * 2) / 2)));
      rFade.value = String(Math.min(fade, parseFloat(rFade.max)));
      vFade.textContent = fade > 0 ? fade.toFixed(1).replace('.0', '') + ' s' : 'Sin fade';
    }
    function pintarTodo() { pintarAjustes(); pintarPista(); pintarOnda(); }

    // ---------- vista previa ----------
    // parar(true): se detiene y se borra el relleno. parar(false): se detiene pero el relleno queda como referencia de por dónde iba.
    function parar(borrar) {
      if (raf) cancelAnimationFrame(raf); raf = 0;
      if (fuente) { try { fuente.onended = null; fuente.stop(); } catch (e) { /* ya parado */ } fuente = null; }
      if (gan) { try { gan.disconnect(); } catch (e) { /* nada */ } gan = null; }
      sonando = false;
      if (borrar) reproPos = null;
      iconoPlay(); pintarPista(); pintarOnda();
    }
    function pausar() {
      if (sonando && ctx) reproPos = Math.max(0, Math.min(durEf(), o0 + ctx.currentTime - t0r));
      parar(false);
    }
    function reproducir() {
      if (!buf) return;
      parar(false);
      try {
        if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); }
        if (ctx.state === 'suspended') ctx.resume();
        const dur = durEf(), f = fadeEf();
        const o = (reproPos == null || reproPos >= dur - 0.05) ? 0 : reproPos;   // reanuda donde se pausó; si ya terminó, desde el inicio
        const t0 = ctx.currentTime + 0.05;
        o0 = o; t0r = t0; reproPos = o; seguir = true;
        if (cw && (cw / 2 + (ini / EDM_SEG - centro / EDM_SEG) * EDM_STEP < 8 || cw / 2 + (ini / EDM_SEG - centro / EDM_SEG) * EDM_STEP > cw * 0.6)) centro = ini + o;
        gan = ctx.createGain(); fuente = ctx.createBufferSource(); fuente.buffer = buf;
        fuente.connect(gan); gan.connect(ctx.destination);
        const g = gan.gain, env = (x) => f > 0 ? Math.max(0, Math.min(1, x / f, (dur - x) / f)) : 1;
        g.setValueAtTime(env(o), t0);
        if (f > 0) {
          if (o < f) g.linearRampToValueAtTime(1, t0 + (f - o));
          if (o < dur - f) g.setValueAtTime(1, t0 + (dur - f - o));
          g.linearRampToValueAtTime(0, t0 + (dur - o));
        }
        const mia = fuente;
        mia.onended = () => { if (fuente === mia) { reproPos = dur; parar(false); } };   // al terminar queda todo relleno
        mia.start(t0, ini + o, dur - o);
        sonando = true; iconoPlay();
        const paso = () => {
          if (!sonando) return;
          reproPos = Math.min(dur, Math.max(0, o + ctx.currentTime - t0));
          // la vista solo se desplaza cuando la reproducción llega al 70 % del ancho (así se ve cómo se va rellenando)
          if (seguir && cw) {
            const xp = cw / 2 + ((ini + reproPos) / EDM_SEG - centro / EDM_SEG) * EDM_STEP, lim = cw * 0.7;
            if (xp > lim) centro = Math.min(total, centro + ((xp - lim) / EDM_STEP) * EDM_SEG);
          }
          pintarPista(); pintarOnda(); raf = requestAnimationFrame(paso);
        };
        raf = requestAnimationFrame(paso);
      } catch (e) { sonando = false; iconoPlay(); msg.textContent = 'No se pudo reproducir la vista previa.'; }
    }

    // ---------- gestos ----------
    const acotar = (v, a, b) => Math.max(a, Math.min(b, v));
    function moverInicio(s) { ini = acotar(s, 0, Math.max(0, total - 1)); parar(true); pintarTodo(); }
    function moverFin(t) {
      const maxD = Math.max(1, total - ini), minD = Math.min(3, maxD), d = acotar(t - ini, minD, maxD);
      durFija = d >= maxD - 0.05 ? null : d; parar(true); pintarTodo();
    }
    // las ondas SOLO desplazan la vista (no tocan el punto de corte)
    onda.addEventListener('pointerdown', (ev) => {
      if (!buf || (ev.target.closest && ev.target.closest('.tg-edm-linea'))) return;
      seguir = false;
      const x0 = ev.clientX, c0 = centro;
      try { onda.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura */ }
      const mover = (e) => { centro = acotar(c0 - ((e.clientX - x0) / EDM_STEP) * EDM_SEG, 0, total); pintarOnda(); };
      const soltar = () => { onda.removeEventListener('pointermove', mover); onda.removeEventListener('pointerup', soltar); onda.removeEventListener('pointercancel', soltar); };
      onda.addEventListener('pointermove', mover); onda.addEventListener('pointerup', soltar); onda.addEventListener('pointercancel', soltar);
    });
    // las marcas (inicio de color, final blanca) solo se mueven si las agarras
    function engarzarMarca(el, leer, poner) {
      el.addEventListener('pointerdown', (ev) => {
        if (!buf) return;
        ev.preventDefault(); ev.stopPropagation();
        const x0 = ev.clientX, t0 = leer();
        try { el.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura */ }
        const mover = (e) => poner(t0 + ((e.clientX - x0) / EDM_STEP) * EDM_SEG);
        const soltar = () => { el.removeEventListener('pointermove', mover); el.removeEventListener('pointerup', soltar); el.removeEventListener('pointercancel', soltar); };
        el.addEventListener('pointermove', mover); el.addEventListener('pointerup', soltar); el.addEventListener('pointercancel', soltar);
      });
    }
    engarzarMarca(linea, () => ini, moverInicio);
    engarzarMarca(lineaFin, () => ini + durEf(), moverFin);
    pista.addEventListener('pointerdown', (ev) => {
      if (!buf) return;
      try { pista.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura */ }
      const poner = (e) => { const r = pista.getBoundingClientRect(); moverInicio(((e.clientX - r.left) / r.width) * total); centro = ini; seguir = false; pintarOnda(); };
      poner(ev);
      const soltar = () => { pista.removeEventListener('pointermove', poner); pista.removeEventListener('pointerup', soltar); pista.removeEventListener('pointercancel', soltar); };
      pista.addEventListener('pointermove', poner); pista.addEventListener('pointerup', soltar); pista.addEventListener('pointercancel', soltar);
    });
    rFade.addEventListener('input', () => { fade = parseFloat(rFade.value) || 0; parar(true); pintarAjustes(); });
    rDur.addEventListener('input', () => {
      const v = parseInt(rDur.value, 10), maxD = parseInt(rDur.max, 10);
      durFija = v >= maxD ? null : v; parar(true); pintarAjustes(); pintarPista(); pintarOnda();
    });
    bPlay.addEventListener('click', () => { if (sonando) pausar(); else reproducir(); });

    // ---------- cerrar / guardar ----------
    function cerrar() {
      parar(true); document.removeEventListener('keydown', alTeclear, true);
      try { if (ctx) ctx.close(); } catch (e) { /* nada */ }
      velo.remove();
    }
    function alTeclear(e) { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } }
    document.addEventListener('keydown', alTeclear, true);
    bX.addEventListener('click', cerrar);
    velo.addEventListener('pointerdown', (e) => { if (e.target === velo) cerrar(); });
    bOk.addEventListener('click', () => {
      if (!buf || guardando) return;
      guardando = true; parar(true); bOk.disabled = true; bPlay.disabled = true; msg.textContent = 'Guardando tu copia editada…';
      // el corte SIEMPRE sale del original completo. Sin fade y con MP3 de origen: se corta el MP3 tal cual (calidad idéntica). Con fade: WAV a calidad original.
      let mp3 = null; try { if (fadeEf() === 0 && crudo) mp3 = cortarMp3(crudo, ini, durEf()); } catch (e) { mp3 = null; }
      (mp3 ? Promise.resolve({ ab: mp3, ext: 'mp3', tipo: 'audio/mpeg' }) : renderizarRecorte(buf, ini, durEf(), fadeEf()).then((ab) => ({ ab, ext: 'wav', tipo: 'audio/wav' })))
      .then((res) => new Promise((ok, fallo) => {
        const r = new FileReader();
        r.onload = () => ok({ url: r.result, ext: res.ext }); r.onerror = () => fallo(r.error);
        r.readAsDataURL(new Blob([res.ab], { type: res.tipo }));
      })).then((res) => {
        const url = res.url;
        const base = nombre.replace(/\.[^.]+$/, '').replace(/ \(editada\)$/, '');
        const nuevo = base + ' (editada).' + res.ext;
        const ed = { ini, dur: durFija, fade, orig: infoOrig.orig };
        const datos = { geminiAudioBienvenida: url, geminiAudioBienvenidaNombre: nuevo, geminiAudioBienvenidaEdicion: JSON.stringify(ed) };
        // la canción propia original se guarda aparte la primera vez que se edita; la de la extensión se vuelve a leer del archivo
        if (infoOrig.orig === 'propia' && infoOrig.origUrl && !infoOrig.guardado) { datos.geminiAudioBienvenidaOriginal = infoOrig.origUrl; datos.geminiAudioBienvenidaOriginalNombre = nombre; }
        musicaCache = url;
        musicaOrig = { url: infoOrig.orig === 'propia' ? (infoOrig.origUrl || '') : '', nombre, edicion: ed };
        try { PREFS_INICIALES.geminiAudioBienvenidaNombre = nuevo; } catch (e) { /* solo lectura */ }
        prefsGuardar(datos);
        recargarAudioFlutter();
        if (alGuardar) alGuardar(nuevo);
        cerrar();
      }).catch((e) => {
        console.warn('[tg] no se pudo guardar la música editada:', e);
        guardando = false; bOk.disabled = false; bPlay.disabled = false;
        msg.textContent = 'No se pudo guardar la canción editada (puede que el dispositivo se quede sin espacio).';
      });
    });

    // ---------- carga (siempre el ORIGINAL completo) ----------
    obtenerAudioParaEditar((ab, nom, edi, info) => {
      if (!document.getElementById('tg-edm')) return;
      if (!ab) { tSub.textContent = 'Sin canción'; msg.textContent = 'Primero elige una canción con «Elegir» para poder editarla.'; return; }
      nombre = nom || nombre; infoOrig = info || infoOrig; crudo = ab.slice(0); // copia: decodeAudioData consume el original
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!ctx) ctx = new AC();
      const alDecodificar = (b) => {
        if (!document.getElementById('tg-edm')) return;
        buf = b; total = b.duration; nB = Math.ceil(total / EDM_SEG); picos = new Float32Array(nB);
        const d = b.getChannelData(0), sr = b.sampleRate, por = Math.max(1, Math.floor(sr * EDM_SEG));
        let mx = 0.0001;
        for (let i = 0; i < nB; i++) {
          let m = 0; const a = i * por, z = Math.min(d.length, a + por), salto = Math.max(1, Math.floor(por / 200));
          for (let s = a; s < z; s += salto) { const v = Math.abs(d[s]); if (v > m) m = v; }
          picos[i] = m; if (m > mx) mx = m;
        }
        for (let i = 0; i < nB; i++) picos[i] = Math.sqrt(picos[i] / mx);
        // se restauran los ajustes de la última edición (sobre la canción completa)
        if (edi) {
          if (typeof edi.ini === 'number' && isFinite(edi.ini)) ini = acotar(edi.ini, 0, Math.max(0, total - 1));
          durFija = (typeof edi.dur === 'number' && edi.dur > 0) ? edi.dur : null;
          if (typeof edi.fade === 'number' && edi.fade >= 0) fade = edi.fade;
        }
        centro = ini;
        tSub.textContent = nombre; cw = onda.clientWidth || 380;
        onda.classList.add('tg-edm-lista');
        bOk.disabled = false; bPlay.disabled = false; msg.textContent = 'Arrastra la rayita de color (inicio) y la blanca (final). Las ondas solo mueven la vista.';
        pintarTodo();
      };
      const fallo = () => { tSub.textContent = 'No se pudo leer'; msg.textContent = 'No se pudo decodificar esta canción.'; };
      try { const p = ctx.decodeAudioData(ab, alDecodificar, fallo); if (p && p.catch) p.catch(() => {}); } catch (e) { fallo(); }
    });
    window.addEventListener('resize', function alCambiar() {
      if (!document.getElementById('tg-edm')) { window.removeEventListener('resize', alCambiar); return; }
      cw = onda.clientWidth || cw; pintarOnda();
    });
  }
  function crearFilaMusica() {
    if (!document.getElementById('tg-mus-style')) {
      const e = document.createElement('style'); e.id = 'tg-mus-style';
      e.textContent = `
        .tg-mus { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
        .tg-mus-txt { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; text-align: left; }
        .tg-mus-tit { font-size: 14px; font-weight: 500; }
        .tg-mus-sub { font-size: 12px; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tg-mus-bt { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; flex: none; }
        .tg-mus-b { font: inherit; font-size: 13px; color: inherit; background: rgba(127,127,127,0.18); border: 1px solid rgba(127,127,127,0.35); border-radius: 999px; padding: 7px 14px; cursor: pointer; }
        .tg-mus-b[hidden] { display: none; }`;
      (document.head || document.documentElement).appendChild(e);
    }
    const sub = h('span', { class: 'tg-mus-sub' }, 'Predeterminada');
    const bElegir = h('button', { class: 'tg-mus-b', type: 'button' }, 'Elegir');
    const bQuitar = h('button', { class: 'tg-mus-b', type: 'button', hidden: true }, 'Quitar');
    const bEditar = h('button', { class: 'tg-mus-b', type: 'button' }, 'Editar');
    const pintar = (n) => { sub.textContent = n || 'Predeterminada'; bQuitar.hidden = !n; bElegir.textContent = n ? 'Cambiar' : 'Elegir'; };
    prefsLeer(['geminiAudioBienvenidaNombre'], (r) => pintar(typeof r.geminiAudioBienvenidaNombre === 'string' ? r.geminiAudioBienvenidaNombre : ''));
    bElegir.addEventListener('click', () => elegirMusicaBienvenida((n) => { pintar(n); abrirEditorMusica(pintar); })); // al elegir una canción nueva se abre el editor
    bEditar.addEventListener('click', () => abrirEditorMusica(pintar));
    bQuitar.addEventListener('click', () => { quitarMusicaBienvenida(); pintar(''); });
    return h('div', { class: 'tg-mus' },
      h('span', { class: 'tg-mus-txt' }, h('span', { class: 'tg-mus-tit' }, 'Música de bienvenida'), sub),
      h('span', { class: 'tg-mus-bt' }, bEditar, bElegir, bQuitar));
  }
  let bloqueoFondoPersonalizado = '';   // imagen (data URL) o video (blob URL) del fondo del bloqueo
  let fondoBienvenidaActivo = false;   // la pantalla actual es la BIENVENIDA: su fondo es el de Gemini difuminado
  let bvFondoGemini = { url: '', tipo: 'imagen' }; // copia del fondo custom de Gemini (la rellena aplicarFondo; fondoGeminiActual se declara más abajo)
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
          'padding:12px 18px;border-radius:14px;background:rgba(0,0,0, calc(0.82 + var(--tg-sb-extra-nb, 0)));color:#fff;font:14px/1.35 "Google Sans","Segoe UI",system-ui,sans-serif;' +
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
  // con el PIN abierto, el bloqueo ya está fuera de la pantalla (subió): sus videos se pausan, solo sigue el del propio PIN
  const esVideoDelBloqueo = (v) => !!(v.closest && v.closest(document.getElementById('tg-pin') ? '#tg-pin' : '#tg-bloqueo, #tg-bloqueo-fondo, #tg-pin'));
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

  // fondo de la BIENVENIDA = fondo custom de Gemini ({url, tipo}); null si no hay ninguno
  function medioFondoBienvenida() {
    if (bvFondoGemini.url) return bvFondoGemini;
    const pf = PREFS_INICIALES; // antes de que lleguen las preferencias: usa la imagen inyectada para no ver un parpadeo
    if (typeof pf.geminiFondo === 'string' && pf.geminiFondo && pf.geminiFondoTipo !== 'video') return { url: pf.geminiFondo, tipo: 'imagen' };
    return null;
  }
  // fondo del bloqueo (imagen o video propio; si no hay, la imagen por defecto de la extensión)
  function aplicarFondoBloqueo(f) {
    if (!f) return;
    if (!fondoBienvenidaActivo) f.classList.remove('tg-bv-enfocar'); // la clase que dispara el desenfoque la pone enfocarFondoBv() en bloquear
    if (fondoBienvenidaActivo) {
      if (nivelBlur !== 'alta') { // media y baja: SIN animación; el fondo nace directo en su desenfoque final (5px)
        f.style.removeProperty('filter');
        f.style.setProperty('transition', 'none'); // que no se anime ni siquiera por transición
        f.classList.add('tg-bv-enfocar');
        requestAnimationFrame(() => requestAnimationFrame(() => f.style.removeProperty('transition')));
      } else if (!f.classList.contains('tg-bv-enfocar')) f.style.setProperty('filter', 'blur(56px)'); // alta: punto de partida garantizado (el mismo 56px de la animación)
    } else f.style.removeProperty('filter');
    f.classList.toggle('tg-bv-fondo', fondoBienvenidaActivo); // bienvenida: difuminado siempre (ver CSS), sin importar el nivel de blur
    try {
      if (fondoBienvenidaActivo) {
        const mb = medioFondoBienvenida();
        if (mb) { ponerMedio(f, mb.url, mb.tipo); return; }
        // sin fondo custom de Gemini: cae al fondo del bloqueo de siempre (también difuminado)
      }
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
    if (!MOSTRAR_PANTALLA_BLOQUEO && !BIENVENIDA_PENDIENTE && !MOSTRAR_BIENVENIDA) return;

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
        transition: transform ${BLOQUEO_DURACION_MS}ms cubic-bezier(0.7, 0, 0.2, 1);
        user-select: none; cursor: grab; touch-action: none;
      }
      #tg-bloqueo.tg-subiendo { transform: translateY(-100%); }
      #tg-bloqueo.tg-subiendo .tg-b-pista { animation-play-state: paused; }
      #tg-bloqueo.tg-subiendo, #tg-bloqueo.tg-arrastrando { will-change: transform; }
      #tg-bloqueo.tg-arrastrando { transition: none; cursor: grabbing; }
      #tg-bloqueo-fondo {
        position: fixed; inset: 0; z-index: -1; pointer-events: none;
        background-color: #0b0b0f;
        background-size: cover; background-position: center; background-repeat: no-repeat;
      }
      /* BIENVENIDA: fondo custom de Gemini difuminado SIEMPRE; la animación 56→5px SOLO corre en nivel Alta (en Media y Baja queda directo en 5px, sin animar) */
      @keyframes tgBvDesenfoque { from { filter: blur(56px); } to { filter: blur(5px); } }
      #tg-bloqueo-fondo.tg-bv-fondo {
        inset: -60px;
        filter: blur(56px); /* arranca muy difuminado; sin !important para que la animación pueda actuar */
      }
      /* .tg-bv-enfocar (la pone enfocarFondoBv() cuando el fondo ya está cargado y pintado): estado final 5px + animación tgBvDesenfoque 28→5px */
      #tg-bloqueo-fondo.tg-bv-fondo.tg-bv-enfocar { filter: blur(5px); }
      html:not(.tg-blur-baja):not(.tg-blur-media) #tg-bloqueo-fondo.tg-bv-fondo.tg-bv-enfocar {
        animation: tgBvDesenfoque 2.8s cubic-bezier(0.22, 1, 0.36, 1) backwards;
      }
      @media (prefers-reduced-motion: reduce) { #tg-bloqueo-fondo.tg-bv-fondo.tg-bv-enfocar { animation: none !important; } }
      /* panel de NOVEDADES: el mismo fondo, un poco más oscuro (brillo 0.9) */
      #tg-bloqueo-fondo.tg-bv-fondo { transition: filter 600ms linear; }
      #tg-bloqueo-fondo.tg-bv-fondo.tg-nv-atenuado { filter: blur(56px) !important; }
      #tg-bloqueo > * { position: relative; z-index: 1; }
      #tg-bloqueo .tg-b-hora { font-size: clamp(72px, 15vw, 180px); font-weight: 500; line-height: 1; letter-spacing: -0.03em; transform: translateY(-12vh); }
      #tg-bloqueo .tg-b-fecha { font-size: clamp(16px, 2.2vw, 24px); opacity: 0.85; transform: translateY(-12vh); }
      /* BIENVENIDA (tras actualizar): mismo estilo que la hora y la fecha, pero al centro */
      /* BIENVENIDA: marca animada (logo grande e invisible que se encoge al centro; luego se va a la izquierda y entra el nombre por la derecha) */
      #tg-bloqueo .tg-b-bv-marca { display: flex; align-items: center; justify-content: center; }
      #tg-bloqueo .tg-b-bv-logo { flex: none; display: block; width: clamp(64px, 17vw, 96px); height: clamp(64px, 17vw, 96px); opacity: 0; transform: scale(7); will-change: transform, opacity; object-fit: contain; user-select: none; -webkit-user-drag: none; }
      #tg-bloqueo .tg-b-bv-caja { display: flex; overflow: hidden; width: 0; flex: none; }
      #tg-bloqueo .tg-b-bv-nombre { flex: none; white-space: nowrap; font-size: clamp(34px, 9vw, 64px); font-weight: 500; line-height: 1.15; letter-spacing: -0.02em; padding: 0.06em 0.1em 0.1em 0.3em; opacity: 0; text-shadow: 0 2px 14px rgba(0, 0, 0, 0.4); }
      #tg-bloqueo.tg-bv-pre .tg-b-bv-sub, #tg-bloqueo.tg-bv-pre .tg-b-pista { opacity: 0; }
      #tg-bloqueo .tg-b-bv-titulo { font-size: clamp(34px, 9vw, 72px); font-weight: 500; line-height: 1.1; letter-spacing: -0.02em; padding: 0 24px; text-shadow: 0 2px 14px rgba(0, 0, 0, 0.4); }
      #tg-bloqueo .tg-b-bv-sub { font-size: clamp(16px, 2.2vw, 24px); opacity: 0.85; text-shadow: 0 2px 10px rgba(0, 0, 0, 0.4); }
      /* subtítulo que alterna: "¡Su extensión se ha actualizado!" <-> "Versión X" (se apilan y se cruzan suavemente) */
      #tg-bloqueo .tg-b-bv-sub { display: grid; justify-items: center; text-align: center; padding: 0 24px; }
      #tg-bloqueo .tg-b-bv-sub > span { grid-area: 1 / 1; transition: opacity 800ms ease, transform 800ms cubic-bezier(0.22, 1, 0.36, 1), filter 800ms ease; }
      #tg-bloqueo .tg-b-bv-sub > span.tg-off { opacity: 0; transform: translateY(8px); filter: blur(4px); }
      @media (prefers-reduced-motion: reduce) { #tg-bloqueo .tg-b-bv-sub > span { transition: none; } }      #tg-bloqueo .tg-b-pista {
        position: absolute; bottom: 7vh; left: 50%; transform: translateX(-50%);
        display: flex; flex-direction: column; align-items: center; gap: 12px;
        font-size: 15px; opacity: 0.9; animation: tgBloqueoFlota 2.2s ease-in-out infinite;
        width: max-content; max-width: calc(100vw - 16px); white-space: nowrap; /* una sola línea */
      }
      #tg-bloqueo .tg-b-tecla {
        min-width: 220px; padding: 10px 28px; border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.45); border-bottom-width: 4px;
        background: rgba(255, 255, 255, calc(0.12 + var(--tg-sb-extra-nb, 0))); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        font-size: 14px; letter-spacing: 0.14em; text-transform: uppercase;
      }
      /* BIENVENIDA: NOVEDADES de la actualización (tarjeta blanca dentro de la propia pantalla; sube desde abajo y hay que volver a deslizar) */
      .tg-pg > .tg-b-nv { position: absolute; top: 0; left: 0; right: 0; bottom: calc(7vh + 56px); padding: 16px; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 1; }
      /* TARJETAS (novedades, "Antes de comenzar...", pregunta del bloqueo): rectángulos ALTOS (ancho hasta 440px, alto ~1.6x el ancho, mínimo 600px si cabe;
         si la pantalla es baja ocupan todo el alto disponible). En pantallas grandes se ESCALAN enteras (texto incluido) con zoom: ver ajustarEscalaTarjetas(). */
      .tg-pg .tg-b-nv-tarjeta { --tg-cuadro: min(440px, calc(100vw - 32px)); --tg-alto: min(calc(100vh - 7vh - 56px - 32px), max(calc(var(--tg-cuadro) * 1.6), 600px)); position: relative; pointer-events: auto; flex: none; box-sizing: border-box; width: var(--tg-cuadro); height: var(--tg-alto); zoom: var(--tg-esc, 1); display: flex; flex-direction: column; background: rgba(255, 255, 255, 0.72); -webkit-backdrop-filter: blur(24px) saturate(1.4); backdrop-filter: blur(24px) saturate(1.4); color: #1f1f1f; text-align: left; cursor: grab;
        border-radius: 28px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35); overflow: hidden; transform: translateY(120vh); transition: transform 520ms cubic-bezier(0.32, 0.72, 0, 1); will-change: transform; }
      .tg-pg .tg-b-nv.tg-nv-visible .tg-b-nv-tarjeta { transform: translateY(0); }
      .tg-pg .tg-b-nv-cab { flex: none; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 22px 22px 8px; text-align: center; }
      .tg-pg .tg-b-nv-logo { display: block; width: 44px; height: 44px; object-fit: contain; margin-bottom: 4px; }
      .tg-pg .tg-b-nv-titulo { margin: 0; font-size: 22px; font-weight: 500; letter-spacing: -0.01em; line-height: 1.2; }
      .tg-pg .tg-b-nv-version { font-size: 13px; color: #5f6368; }
      .tg-pg .tg-b-nv-lista { flex: 1 1 auto; min-height: 0; overflow-y: auto; touch-action: pan-y; margin: 0; padding: 10px 24px 22px; list-style: none; user-select: text; cursor: auto; }
      .tg-pg .tg-b-nv-lista li { position: relative; padding: 8px 0 8px 18px; font-size: 14.5px; line-height: 1.45; color: #3c4043; overflow-wrap: anywhere; }
      .tg-pg .tg-b-nv-lista li::before { content: ''; position: absolute; left: 0; top: 15px; width: 7px; height: 7px; border-radius: 50%; background: var(--tg-nv-acento, #1a73e8); }
      @media (prefers-reduced-motion: reduce) { .tg-pg .tg-b-nv-tarjeta { transition: none; } }
      /* PANEL DE NOVEDADES: pantalla propia, deslizante, separada de la bienvenida (mismo fondo, sube desde abajo y se desliza hacia arriba para entrar) */
      .tg-pg {
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #fff; overflow: hidden;
        font-family: 'Google Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
        transition: transform 800ms cubic-bezier(0.32, 0.72, 0, 1); /* frenada larga estilo iOS: entra y sale suave */
        user-select: none; cursor: grab; touch-action: none;
      }
      .tg-pg.tg-subiendo { transform: translateY(-100%); }
      .tg-pg.tg-abajo { transform: translateY(100%); }
      .tg-pg.tg-abajo, .tg-pg.tg-subiendo { will-change: transform; }
      .tg-pg.tg-subiendo, .tg-pg.tg-arrastrando { will-change: transform; }
      .tg-pg.tg-arrastrando { transition: none; cursor: grabbing; }
      /* la tarjeta ya no sube sola desde abajo: el que se desliza es el panel completo */
      .tg-pg .tg-b-nv-tarjeta { transform: none; transition: none; }
      .tg-pg .tg-b-pista {
        position: absolute; bottom: 7vh; left: 50%; transform: translateX(-50%);
        display: flex; flex-direction: column; align-items: center; gap: 12px;
        font-size: 15px; opacity: 0.9; animation: tgBloqueoFlota 2.2s ease-in-out infinite;
        width: max-content; max-width: calc(100vw - 16px); white-space: nowrap;
      }
      @media (prefers-reduced-motion: reduce) { .tg-pg .tg-b-pista { animation: none; } }
      /* PANTALLA DE PIN (aparece debajo al deslizar la pantalla de bloqueo hacia arriba) */
      #tg-pin {
        position: fixed; inset: 0; z-index: 2147483646; overflow: hidden; color: #fff;
        display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
        font-family: 'Google Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
        opacity: 0; transition: opacity 350ms ease; user-select: none;
      }
      #tg-pin.tg-pin-visible { opacity: 1; }
      #tg-pin.tg-pin-sobre { z-index: 2147483647; background: #0b0d12; } /* PIN superpuesto a las tarjetas de la bienvenida (se crea desde la pregunta del bloqueo) */
      #tg-pin .tg-pin-fondo {
        position: absolute; inset: -60px; z-index: 0; pointer-events: none;
        background-color: #ffffff00; background-size: cover; background-position: center; background-repeat: no-repeat;
        filter: blur(28px) brightness(0.5) saturate(1.1);
        transform: translateZ(0); /* capa propia: el blur se calcula una vez y no se repite al tocar las teclas */
      }
      /* PIN dentro de la BIENVENIDA: mismo fondo que ella (Gemini difuminado, sin teñir). Clase propia a propósito: las reglas de nivel Baja apuntan a .tg-pin-fondo */
      #tg-pin .tg-pin-fondo-bv {
        position: absolute; inset: -60px; z-index: 0; pointer-events: none;
        background-color: #ffffff00; background-size: cover; background-position: center; background-repeat: no-repeat;
        filter: blur(28px);
        transform: translateZ(0);
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
        border: 1px solid rgba(255, 255, 255, 0.28); background: rgba(0, 0, 0, calc(0.45 + var(--tg-sb-extra-nb, 0))); color: #fff;
        font-family: inherit; -webkit-tap-highlight-color: transparent; touch-action: manipulation; outline: 0;
        /* SIN backdrop-filter a propósito: el fondo del PIN ya va desenfocado (28px), así que un segundo blur por tecla casi no se nota
           pero obligaba a re-desenfocar 10 capas en cada toque (eso era el lag). Mismo aspecto, toque instantáneo. */
        -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
        will-change: transform; transition: transform 0.12s ease, background-color 0.1s ease, border-color 0.1s ease;
      }
      @media (hover: hover) { #tg-pin .tg-pin-tecla:hover { transform: scale(1.06); } } /* en el celular el hover se queda pegado: solo con mouse */
      #tg-pin .tg-pin-tecla:active, #tg-pin .tg-pin-tecla.tg-pulsada { transform: scale(0.92); background: rgba(255, 255, 255, 0.28); border-color: rgba(255, 255, 255, 0.6); transition-duration: 0s; }
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
      @media (hover: hover) { #tg-pin .tg-pin-accion:hover { background: rgba(255, 255, 255, 0.12); } }
      #tg-pin .tg-pin-accion:active { transform: scale(0.95); }
      #tg-pin .tg-pin-accion:focus-visible { box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5); }
      #tg-pin .tg-pin-olvido { font-size: 14px; opacity: 0.9; }
      #tg-pin .tg-pin-notas { width: calc(var(--tg-k) * 3 + var(--tg-kgap) * 2); max-width: calc(100vw - 40px); margin-top: 14px; display: flex; flex-direction: column; gap: 6px; text-align: center; font-size: 12px; line-height: 1.35; opacity: 0.8; }
      #tg-pin .tg-pin-notas[hidden] { display: none; }
      @keyframes tgPinSacudir { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-12px); } 40% { transform: translateX(10px); } 60% { transform: translateX(-8px); } 80% { transform: translateX(5px); } }
      @media (prefers-reduced-motion: reduce) { #tg-pin, #tg-pin .tg-pin-contenido, #tg-pin .tg-pin-tecla, #tg-pin .tg-pin-punto { transition: none; } #tg-pin .tg-pin-puntos.tg-error { animation: none; } }
      @keyframes tgBloqueoFlota { 0%, 100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, -8px); } }
      @media (prefers-reduced-motion: reduce) { #tg-bloqueo .tg-b-pista { animation: none; } }
    `;
    (document.head || raiz).appendChild(estilo);
    const estiloOb = document.createElement('style');
    estiloOb.id = 'tg-onboarding-style';
    estiloOb.textContent = `
      .tg-pg .tg-ob-tarjeta { width: var(--tg-cuadro); }
      /* DEGRADADO INFERIOR: avisa que se puede seguir desplazando. Solo se ve (clase tg-mas) si el contenido de la tarjeta tiene más por mostrar abajo */
      .tg-pg .tg-b-nv-tarjeta::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 84px; pointer-events: none; opacity: 0; transition: opacity 220ms ease;
        background: linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.88) 78%, rgba(255, 255, 255, 0.96) 100%); z-index: 2; }
      .tg-pg .tg-b-nv-tarjeta.tg-mas::after { opacity: 1; }
      html.tg-blur-media .tg-pg .tg-b-nv-tarjeta::after, html.tg-blur-baja .tg-pg .tg-b-nv-tarjeta::after { background: linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, #ffffff 80%); }
      /* blur de las tarjetas SOLO en nivel Alta: en Media y Baja quedan blancas, opacas y sin backdrop-filter */
      html.tg-blur-media .tg-pg .tg-b-nv-tarjeta, html.tg-blur-baja .tg-pg .tg-b-nv-tarjeta { background: #ffffff; -webkit-backdrop-filter: none; backdrop-filter: none; }
      .tg-pg .tg-ob-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; padding: 0 20px 22px; cursor: auto; text-align: left; }
      .tg-pg .tg-ob-sec { padding: 14px 0; border-top: 1px solid rgba(0,0,0,0.08); }
      .tg-pg .tg-ob-sec:first-child { border-top: 0; }
      .tg-pg .tg-ob-h { margin: 0 0 3px; font-size: 15px; font-weight: 600; }
      .tg-pg .tg-ob-p { margin: 0 0 10px; font-size: 12.5px; line-height: 1.35; color: #5f6368; }
      .tg-pg .tg-ob-fondos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .tg-pg .tg-ob-col { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; font-size: 12.5px; color: #3c4043; }
      .tg-pg .tg-ob-prev { position: relative; width: min(100%, 118px); aspect-ratio: 9 / 18; padding: 0; border: 1px solid rgba(0,0,0,0.15); border-radius: 18px; overflow: hidden; cursor: pointer;
        background: linear-gradient(135deg, #1f2937, #0b1220) center / cover no-repeat; color: #fff; }
      .tg-pg .tg-ob-hora { position: absolute; top: 16%; left: 0; right: 0; text-align: center; font-size: 26px; font-weight: 300; text-shadow: 0 1px 6px rgba(0,0,0,0.5); }
      .tg-pg .tg-ob-mini-u { position: absolute; right: 8px; top: 38%; width: 52%; height: 18px; border-radius: 10px; }
      .tg-pg .tg-ob-mini-i { position: absolute; left: 8px; top: 50%; width: 60%; height: 18px; border-radius: 10px; background: rgba(0,0,0,0.55); }
      .tg-pg .tg-ob-cambiar { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); font-size: 11px; padding: 4px 10px; border-radius: 999px; background: rgba(0,0,0,0.55); white-space: nowrap; }
      .tg-pg .tg-ob-reset { font: inherit; font-size: 11.5px; padding: 5px 10px; border-radius: 999px; border: 1px solid rgba(0,0,0,0.18); background: #f1f3f4; color: #1f1f1f; cursor: pointer; }
      .tg-pg .tg-ob-reset[hidden] { display: none; }
      .tg-pg .tg-ob-colores { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
      .tg-pg .tg-ob-color { width: 32px; height: 32px; padding: 0; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
      .tg-pg .tg-ob-color[aria-pressed="true"] { border-color: #1f1f1f; box-shadow: inset 0 0 0 2px #fff; }
      .tg-pg .tg-ob-burb { margin-left: auto; width: fit-content; max-width: 85%; padding: 10px 14px; border-radius: 18px 18px 4px 18px; font-size: 13.5px; }
      .tg-pg .tg-ob-seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
      .tg-pg .tg-ob-opt { padding: 9px 4px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.18); background: #f1f3f4; color: #1f1f1f; font: inherit; font-size: 13px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; }
      .tg-pg .tg-ob-opt small { font-size: 10.5px; opacity: 0.7; }
      .tg-pg .tg-ob-opt[aria-pressed="true"] { background: var(--tg-nv-acento, #1a73e8); border-color: transparent; color: #fff; }
      .tg-pg .tg-ob-nota { margin-top: 8px; font-size: 12px; color: #5f6368; }
      .tg-pg .tg-ob-pie { flex: none; padding: 10px 20px 18px; }
      .tg-pg .tg-ob-sig { width: 100%; padding: 12px; border: 0; border-radius: 999px; background: var(--tg-nv-acento, #1a73e8); color: #fff; font: inherit; font-size: 15px; font-weight: 500; cursor: pointer; }
      .tg-pg .tg-ob-grande { width: 100%; padding: 14px; margin-top: 10px; border-radius: 16px; border: 1px solid rgba(0,0,0,0.18); background: #f1f3f4; color: #1f1f1f; font: inherit; font-size: 15px; cursor: pointer; text-align: left; }
      .tg-pg .tg-ob-grande[aria-pressed="true"] { background: var(--tg-nv-acento, #1a73e8); border-color: transparent; color: #fff; }
      .tg-pg .tg-ob-grande small { display: block; margin-top: 2px; font-size: 12px; opacity: 0.8; }
    `;
    (document.head || raiz).appendChild(estiloOb);

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
      cuerpoEscalado = true;
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
      fondoBienvenidaActivo = false;
      // el body ya está en escala 1: se vuelve a medir TODO al instante (header, burbujas, multimedia, fade...)
      cuerpoEscalado = false;
      try { firmaHeader = null; Tareas.ahora(); ajustarCarruseles(document.body); } catch (e) { /* aún no está todo creado */ }
    }
    // al desbloquear: mide y coloca todo con el body en escala 1 (sin pintar), ANTES de empezar el zoom, para que los
    // elementos salgan ya bien colocados desde el primer frame de la animación
    function alinearAlInstante() {
      const b = document.body;
      if (!b) return;
      if (animBody) { animBody.cancel(); animBody = null; }
      const tAnt = b.style.getPropertyValue('transform');
      b.style.setProperty('transform', 'none');
      cuerpoEscalado = false;
      try { firmaHeader = null; Tareas.ahora(); ajustarCarruseles(document.body); } catch (e) { /* aún no está todo creado */ }
      cuerpoEscalado = true;
      if (tAnt) b.style.setProperty('transform', tAnt); else b.style.removeProperty('transform');
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

    const NOTA_PIN_1 = 'Si se te olvida el PIN, tendrás que usar tu contraseña de Google.';
    const NOTA_PIN_2 = '(Gemini Vibes no comparte información personal a terceros, todo se guarda encriptadamente en el dispositivo con fines de validación de autenticación)';
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
            h('button', { type: 'button', class: 'tg-pin-accion tg-pin-borrar' }, 'Cancelar')),
          h('div', { class: 'tg-pin-notas', hidden: true }, h('span', null, NOTA_PIN_1), h('span', null, NOTA_PIN_2))
        )
      );
      // mismo fondo que el bloqueo (queda difuminado por CSS)
      const fondoPin = pin.querySelector('.tg-pin-fondo');
      const mediaBv = fondoBienvenidaActivo ? medioFondoBienvenida() : null;
      if (fondoBienvenidaActivo) { fondoPin.classList.remove('tg-pin-fondo'); fondoPin.classList.add('tg-pin-fondo-bv'); } // igual que el fondo de la bienvenida
      if (mediaBv) {
        ponerMedio(fondoPin, mediaBv.url, mediaBv.tipo); // fondo de Gemini (imagen o video), igual que la bienvenida
      } else if (bloqueoFondoPersonalizado && bloqueoFondoTipo === 'video') {
        ponerMedio(fondoPin, bloqueoFondoPersonalizado, 'video'); // el mismo video, difuminado por el CSS de .tg-pin-fondo
      } else {
        const fondoBloqueo = document.getElementById('tg-bloqueo-fondo');
        const imagen = (fondoBloqueo && fondoBloqueo.style.backgroundImage) ||
          (bloqueoFondoPersonalizado ? 'url("' + bloqueoFondoPersonalizado + '")' : '');
        if (imagen) fondoPin.style.backgroundImage = imagen;
      }
      raiz.appendChild(pin);
      try { sincronizarVideos(); } catch (e) { /* sin videos */ }

      const elSub = pin.querySelector('.tg-pin-sub');
      const elTitulo = pin.querySelector('.tg-pin-titulo');
      const elCajas = pin.querySelector('.tg-pin-puntos');
      const cajas = [...pin.querySelectorAll('.tg-pin-punto')];
      const elMsg = pin.querySelector('.tg-pin-msg');
      const elOlvido = pin.querySelector('.tg-pin-olvido');
      const elBorrar = pin.querySelector('.tg-pin-borrar');
      const elNotas = pin.querySelector('.tg-pin-notas');

      let modo = (bloqueoPinHash && !opc.forzarCrear) ? 'ingresar' : 'crear1'; // forzarCrear: cambiar PIN sin pedir el actual
      let primero = '';
      let digitos = '';
      let ocupado = false;
      let cerrado = false;

      function pintar() {
        if (modo === 'ingresar') { elTitulo.textContent = 'Ingresa tu código PIN'; elSub.textContent = 'Se requiere para desbloquear'; }
        else if (modo === 'crear1') { elTitulo.textContent = 'Crea tu código PIN'; elSub.textContent = 'Elige ' + BLOQUEO_PIN_LARGO + ' dígitos'; }
        else { elTitulo.textContent = 'Confirma tu código PIN'; elSub.textContent = 'Un último paso'; }
        elOlvido.style.visibility = modo === 'ingresar' ? '' : 'hidden';
        elNotas.hidden = modo === 'ingresar'; // los avisos salen mientras se crea el PIN (nuevo o al cambiarlo)
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
      // Los dígitos entran en el pointerdown (al TOCAR), no en el click (que espera a soltar el dedo). El click queda solo como respaldo
      // (lector de pantalla / teclado sin eventos de puntero) y se ignora si ya lo atendió el pointerdown de ese mismo toque.
      const accionarBorrar = () => {
        if (ocupado || cerrado) return;
        if (digitos.length) borrarDigito(); else opc.alVolver();
      };
      function alTocar(b, accion) {
        let ultimoToque = -1e9;
        b.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          ultimoToque = performance.now();
          if (b.classList.contains('tg-pin-tecla')) { b.classList.add('tg-pulsada'); setTimeout(() => b.classList.remove('tg-pulsada'), 110); }
          accion();
        });
        b.addEventListener('click', (e) => {
          if (e.detail !== 0 && performance.now() - ultimoToque < 800) return; // ya lo hizo el pointerdown
          accion();
        });
      }
      pin.querySelectorAll('.tg-pin-tecla').forEach((b) => alTocar(b, () => anadirDigito(b.getAttribute('data-d'))));
      alTocar(elBorrar, accionarBorrar);
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
          setTimeout(() => { pin.remove(); try { sincronizarVideos(); } catch (e) { /* sin videos */ } }, conAnimacion ? 400 : 0); // al quitarse el PIN, los videos del bloqueo se reanudan
        }
      };
    }

    // ---- audio de la bienvenida ----
    // Los navegadores bloquean el audio sin gesto previo: se intenta sonar al instante y, si lo rechazan, empieza con el primer toque/clic/tecla.
    // En la app Flutter el audio lo reproduce Dart (handler 'audioBienvenida'): evita el CSP de la página y no hay mp3 que cargar como URL.
    function audioBienvenidaFlutter(alEmpezar) {
      let activo = true, intentos = 0;
      const llamar = (accion) => {
        try {
          const fl = window.flutter_inappwebview;
          if (!fl || !fl.callHandler) return false;
          const r = fl.callHandler('audioBienvenida', accion);
          if (r && r.catch) r.catch(() => {});
          return true;
        } catch (e) { return false; }
      };
      // el puente puede tardar en estar listo; el handler responde cuando la canción YA está sonando (Dart espera a que la app termine de cargar)
      const arrancar = () => {
        if (!activo) return;
        const fl = window.flutter_inappwebview;
        if (fl && fl.callHandler) {
          try { Promise.resolve(fl.callHandler('audioBienvenida', 'play')).then(alEmpezar, alEmpezar); } catch (e) { alEmpezar(); }
          return;
        }
        if (++intentos < 50) setTimeout(arrancar, 200); else alEmpezar();
      };
      const alVisibilidad = () => { if (activo) llamar(document.hidden ? 'pause' : 'resume'); };
      document.addEventListener('visibilitychange', alVisibilidad);
      arrancar();
      return { detener() { if (!activo) return; activo = false; document.removeEventListener('visibilitychange', alVisibilidad); llamar('stop'); } };
    }
    function audioBienvenida(alEmpezar) {
      if (ES_APP_FLUTTER) return audioBienvenidaFlutter(alEmpezar);
      // EXTENSIÓN: primero se lee si hay una canción personalizada (chrome.storage); si no, la de la carpeta de la extensión
      let interno = null, parado = false;
      prefsLeer(['geminiAudioBienvenida'], (r) => {
        if (parado) return;
        const c = (typeof r.geminiAudioBienvenida === 'string' && r.geminiAudioBienvenida) ? r.geminiAudioBienvenida : '';
        interno = audioBienvenidaExtension(c || urlAudioBienvenida(), alEmpezar);
      });
      return { detener() { parado = true; if (interno) interno.detener(); } };
    }
    function audioBienvenidaExtension(url, alEmpezar) {
      // EXTENSIÓN DE CHROME (PC): dos motores, el segundo es respaldo del primero.
      //  1) <audio> normal con la URL de la extensión (chrome.runtime.getURL).
      //  2) Web Audio API (fetch + decodeAudioData): no pasa por la regla media-src de la página, así que sirve si Gemini bloquea el <audio>.
      // Chrome bloquea el sonido hasta que el usuario toca la página: se intenta al instante y, si lo rechaza, arranca con el primer gesto.
      let avisado = false;
      const empezar = () => { if (avisado) return; avisado = true; setTimeout(alEmpezar, 0); }; // siempre asíncrono: la pantalla aún se está armando
      let activo = true;
      if (!url) { console.warn('[tg] bienvenida: no hay URL de audio (¿falta el mp3 en la raíz de la extensión?)'); empezar(); return { detener() {} }; }
      // "chrome-extension://invalid/" = la extensión se recargó/actualizó y este script quedó huérfano en la pestaña: hay que refrescar la página (F5)
      if (/^chrome-extension:\/\/invalid\//.test(url)) { console.warn('[tg] bienvenida: la extensión se recargó; refresca la pestaña de Gemini (F5) para que vuelva a sonar.'); empezar(); return { detener() {} }; }

      let motor = 'html';            // 'html' | 'webaudio'
      let sonando = false;
      const a = new Audio();
      a.loop = true; a.preload = 'auto'; a.volume = BIENVENIDA_AUDIO_VOLUMEN;
      let ctx = null, ganancia = null, fuente = null, bufer = null, cargandoBufer = false, fallosCarga = 0;

      const GESTOS = ['pointerdown', 'mousedown', 'pointerup', 'click', 'touchstart', 'touchend', 'keydown'];
      const quitarGestos = () => GESTOS.forEach((ev) => window.removeEventListener(ev, intentar, true));

      function alSonar() { sonando = true; quitarGestos(); empezar(); }

      function arrancarWebAudio() {
        if (!activo) return;
        try {
          if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) { console.warn('[tg] bienvenida: sin Web Audio'); return; }
            ctx = new AC();
            ganancia = ctx.createGain();
            ganancia.gain.value = BIENVENIDA_AUDIO_VOLUMEN;
            ganancia.connect(ctx.destination);
          }
          const reproducir = () => {
            if (!activo || !bufer || fuente) return;
            fuente = ctx.createBufferSource();
            fuente.buffer = bufer; fuente.loop = true;
            fuente.connect(ganancia);
            fuente.start(0);
            alSonar();
          };
          const listo = () => {
            if (!activo) return;
            if (ctx.state === 'suspended') { // sin gesto aún: queda esperando uno (intentar() lo reintenta)
              const pr = ctx.resume();
              if (pr && pr.then) pr.then(() => { if (ctx.state === 'running') reproducir(); }, () => {});
              return;
            }
            reproducir();
          };
          if (bufer) { listo(); return; }
          if (cargandoBufer) return;
          cargandoBufer = true;
          fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
            .then((ab) => new Promise((ok, fallo) => ctx.decodeAudioData(ab, ok, fallo)))
            .then((b) => { bufer = b; cargandoBufer = false; listo(); })
            .catch((e) => {
              cargandoBufer = false;
              if (++fallosCarga >= 2) { quitarGestos(); console.warn('[tg] bienvenida: no se pudo cargar el audio; se deja de intentar:', e); } // sin esto reintentaba en cada clic
              else console.warn('[tg] bienvenida: no se pudo cargar el audio con Web Audio:', e);
            });
        } catch (e) { console.warn('[tg] bienvenida: error en Web Audio:', e); }
      }

      function cambiarAWebAudio() {
        if (motor === 'webaudio') return;
        motor = 'webaudio';
        try { a.pause(); a.removeAttribute('src'); a.load(); } catch (e) { /* nada */ }
        arrancarWebAudio();
      }

      function intentar() {
        if (!activo || document.hidden || sonando) return;
        if (motor === 'webaudio') { arrancarWebAudio(); return; }
        try {
          if (!a.src) a.src = url;
          const pr = a.play();
          if (pr && pr.then) {
            pr.then(alSonar, (err) => {
              // NotAllowedError = solo falta un gesto del usuario; cualquier otro error = la página bloquea/no puede leer el archivo
              if (!err || err.name !== 'NotAllowedError') { console.warn('[tg] bienvenida: <audio> falló, se usa Web Audio:', err); cambiarAWebAudio(); }
            });
          } else alSonar();
        } catch (e) { cambiarAWebAudio(); }
      }
      a.addEventListener('error', () => { if (activo && !sonando) { console.warn('[tg] bienvenida: el <audio> no pudo cargar (CSP o archivo faltante), se usa Web Audio'); cambiarAWebAudio(); } });

      const alVisibilidad = () => {
        if (!activo) return;
        if (document.hidden) { if (motor === 'html') a.pause(); else if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }
        else if (motor === 'html') { if (a.paused) { sonando = false; intentar(); } }
        else if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      };
      GESTOS.forEach((ev) => window.addEventListener(ev, intentar, true)); // se registra antes que alTeclear, así la tecla Espacio también cuenta
      document.addEventListener('visibilitychange', alVisibilidad);
      intentar();
      setTimeout(empezar, 1200); // si el navegador espera un gesto para dar audio, la animación no se queda esperando
      return {
        detener() {
          if (!activo) return;
          activo = false;
          quitarGestos();
          document.removeEventListener('visibilitychange', alVisibilidad);
          const paso = 50;
          if (motor === 'webaudio' && ctx) {
            const c = ctx, g = ganancia, f = fuente;
            if (!g || !f) { try { c.close(); } catch (e) { /* nada */ } return; }
            g.gain.cancelScheduledValues(c.currentTime);
            g.gain.setValueAtTime(g.gain.value, c.currentTime);
            g.gain.linearRampToValueAtTime(0, c.currentTime + BIENVENIDA_AUDIO_FADE_MS / 1000);
            setTimeout(() => { try { f.stop(); } catch (e) { /* ya parado */ } try { c.close(); } catch (e) { /* nada */ } }, BIENVENIDA_AUDIO_FADE_MS + 100);
            return;
          }
          const bajada = a.volume / Math.max(1, BIENVENIDA_AUDIO_FADE_MS / paso);
          const id = setInterval(() => {
            a.volume = Math.max(0, a.volume - bajada);
            if (a.volume <= 0.001) { clearInterval(id); a.pause(); a.removeAttribute('src'); try { a.load(); } catch (e) { /* nada */ } }
          }, paso);
        }
      };
    }

    // La música NO empieza hasta que la página termina de cargar por completo (evento load). Como la animación del logo arranca cuando
    // suena la canción, la bienvenida también espera ese momento. Si se desliza antes de que cargue, simplemente no llega a sonar.
    function audioBienvenidaAlCargar(alEmpezar) {
      let interno = null, parado = false;
      const arrancar = () => { if (!parado && !interno) interno = audioBienvenida(alEmpezar); };
      if (document.readyState === 'complete') arrancar();
      else window.addEventListener('load', arrancar, { once: true });
      return { detener() { parado = true; window.removeEventListener('load', arrancar); if (interno) interno.detener(); } };
    }

    // logo de la bienvenida: SIEMPRE Gemini.png (la estrella dibujada solo sale si el archivo no llegó)
    function crearLogoBienvenida() {
      const url = urlLogoGemini();
      if (url) return h('img', { class: 'tg-b-bv-logo', src: url, alt: '', draggable: 'false' });
      console.warn('[tg] no llegó Gemini.png a la bienvenida: se dibuja la estrella de respaldo');
      return hs('svg', { class: 'tg-b-bv-logo', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
        hs('defs', null,
          hs('linearGradient', { id: 'tg-bv-grad', x1: '0', y1: '1', x2: '1', y2: '0' },
            hs('stop', { offset: '0%', 'stop-color': '#4285f4' }),
            hs('stop', { offset: '50%', 'stop-color': '#9b72cb' }),
            hs('stop', { offset: '100%', 'stop-color': '#d96570' }))),
        hs('path', { fill: 'url(#tg-bv-grad)', d: 'M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 17 7.1 12.7 1.5 12 7.1 11.4 11.4 7.1 12 1.5z' }));
    }

    // ---- bloquear ----
    const RETORNO_LOGIN = (() => { try { const v = localStorage.getItem('tg-login-retorno') === '1'; localStorage.removeItem('tg-login-retorno'); return v; } catch (e) { return false; } })();
    let fpsCalentamiento = null; // FPS medidos con Gemini completo corriendo (calentamiento de la primera vez); mandan sobre los de la animación de la bienvenida
    function pausarCuerpo(v) { raiz.classList.toggle('tg-bloqueo-pausa', !!v); }
    function bloquear(animado, bienvenida) { // bienvenida: false (reloj) | 'actualizacion' | 'inicio'
      if (bloqueado) return;
      const esActualizacion = bienvenida === 'actualizacion'; // solo esta lleva novedades y guarda el fix visto
      bloqueado = true;
      fondoBienvenidaActivo = !!bienvenida; // la bienvenida usa el fondo de Gemini difuminado
      aplicarFondoBloqueo(document.getElementById('tg-bloqueo-fondo'));
      // Desenfoque del fondo de la bienvenida (28→5px): se dispara EXACTAMENTE cuando la canción empieza a sonar (callback de audioBienvenida)
      function enfocarFondoBv(intento) {
        if (!bienvenida || enfocarFondoBv.hecho) return;
        const f = document.getElementById('tg-bloqueo-fondo');
        if (!f) { if ((intento || 0) < 40) setTimeout(() => enfocarFondoBv((intento || 0) + 1), 50); return; }
        enfocarFondoBv.hecho = true;
        f.style.removeProperty('filter');          // quita el 28px inicial puesto en línea; la animación parte de él
        f.classList.add('tg-bv-enfocar');          // → en Alta: animation tgBvDesenfoque (56→5px); en Media/Baja ya estaba en 5px
      }
      const audio = bienvenida ? audioBienvenidaAlCargar((ok) => {
        // app móvil: Dart devuelve false si el teléfono no cumple (página 100 % + música cargada + >= 20 FPS): sin cinemática ni música
        if (RETORNO_LOGIN && bienvenida === 'actualizacion') { saltarALogin(); return; } // vuelve de iniciar sesión: sin cinemática, directo a la tarjeta (la música sigue)
        if (ok === false && ES_APP_FLUTTER) { mostrarPin(); return; } // mostrarPin respeta PIN / novedades / entrada directa
        enfocarFondoBv(); setTimeout(iniciarMarca, BIENVENIDA_MARCA_RETRASO_MS);
      }) : null; // música de fondo solo en la bienvenida
      fijarPantallaBloqueada(true); // desde ya, nada más de la extensión trabaja
      let desbloqueado = false;
      let marcaIniciada = false;
      const pantalla = h('div', { id: 'tg-bloqueo' },
        bienvenida
          ? [h('div', { class: 'tg-b-bv-marca' },
               crearLogoBienvenida(),
               h('div', { class: 'tg-b-bv-caja' },
                 h('span', { class: 'tg-b-bv-nombre', 'aria-label': 'Gemini Vibes' },
                   // cada letra va en su propio span para animarla por separado (nacen invisibles; las anima iniciarMarca)
                   Array.from('Gemini Vibes').map((c) => h('span', { class: 'tg-b-bv-letra', 'aria-hidden': 'true', style: 'display:inline-block;opacity:0;will-change:transform,opacity;' }, c === ' ' ? ' ' : c))))),
             h('div', { class: 'tg-b-bv-sub' },
               h('span', { class: 'tg-b-bv-sub-a' }, (esActualizacion && PRIMERA_VEZ) ? '¡Hola!' : esActualizacion ? '¡Su extensión se ha actualizado!' : '¡Más hermoso que nunca!'),
               h('span', { class: 'tg-b-bv-sub-b tg-off' }, (esActualizacion && PRIMERA_VEZ) ? '¡Gemini de toda la vida ha recibido un glow up!' : esActualizacion ? 'Versión ' + TG_VERSION : '¡Bienvenido de vuelta!'))]
          : [h('div', { class: 'tg-b-hora' }), h('div', { class: 'tg-b-fecha' })],
        h('div', { class: 'tg-b-pista' },
          bienvenida
            ? h('span', null, 'Desliza hacia arriba para continuar')
            : [h('span', null, 'Presiona'),
               h('span', { class: 'tg-b-tecla' }, 'Espacio'),
               h('span', null, 'para continuar')])
      );
      if (bienvenida) pantalla.classList.add('tg-bv-pre'); // subtítulo y pista ocultos hasta que les toque en la secuencia
      if (animado) pantalla.classList.add('tg-subiendo'); // empieza arriba y baja
      raiz.appendChild(pantalla);
      raiz.classList.add('tg-bloqueado');

      const elHora = pantalla.querySelector('.tg-b-hora');
      const elFecha = pantalla.querySelector('.tg-b-fecha');
      function actualizarReloj() {
        if (!elHora || !elFecha) return; // en la bienvenida no hay reloj
        const ahora = new Date();
        elHora.textContent = ahora.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
        const fecha = ahora.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
        elFecha.textContent = fecha.charAt(0).toUpperCase() + fecha.slice(1);
      }
      actualizarReloj();
      let relojId = null; // el reloj solo muestra HH:MM: despierta una vez por minuto, no cada segundo
      const programarReloj = () => { relojId = setTimeout(() => { actualizarReloj(); programarReloj(); }, 60000 - (Date.now() % 60000) + 50); };
      if (!bienvenida) programarReloj();

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

      // ---- SECUENCIA DE LA BIENVENIDA (estilo iOS: todo con curvas de frenada larga) ----
      // 1) el logo nace enorme y casi invisible en el centro y se encoge hasta su tamaño mientras aparece
      // 2) con el logo ya quieto, el nombre se abre desde la derecha y el grupo (siempre centrado) empuja el logo hacia la izquierda
      // 3) entran la versión y la pista de deslizar
      // Arranca cuando la canción empieza a sonar (Dart espera a que termine de cargar la app).
      // FPS de la animación de la bienvenida (la usa la guía "Antes de comenzar..." para recomendar el nivel de blur)
      const fpsM = { n: 0, t0: 0, fin: 0, activo: false, oculto: false };
      function medirFpsBienvenida() {
        if (fpsM.activo) return;
        fpsM.activo = true; fpsM.t0 = fpsM.fin = performance.now();
        const paso = (t) => {
          if (document.hidden) fpsM.oculto = true;
          fpsM.n++; fpsM.fin = t;
          if (!desbloqueado && t - fpsM.t0 < 3500) requestAnimationFrame(paso); else fpsM.activo = false;
        };
        requestAnimationFrame(paso);
      }
      function fpsActual() {
        if (fpsCalentamiento !== null) return fpsCalentamiento;
        const dt = fpsM.fin - fpsM.t0;
        if (fpsM.oculto || dt < 700 || fpsM.n < 10) return null;
        return (fpsM.n - 1) / (dt / 1000);
      }
      function iniciarMarca() {
        if (marcaIniciada || desbloqueado || !bienvenida) return;
        marcaIniciada = true;
        medirFpsBienvenida();
        const logo = pantalla.querySelector('.tg-b-bv-logo'), caja = pantalla.querySelector('.tg-b-bv-caja'), nombre = pantalla.querySelector('.tg-b-bv-nombre');
        const sub = pantalla.querySelector('.tg-b-bv-sub'), pista = pantalla.querySelector('.tg-b-pista');
        if (!logo || !caja || !nombre) return;
        // el subtítulo alterna entre las dos frases cada BIENVENIDA_SUB_CAMBIO_MS (actualización: "¡Su extensión se ha actualizado!" ↔ "Versión X"; inicio: "¡Más hermoso que nunca!" ↔ "¡Bienvenido de vuelta!")
        const subA = pantalla.querySelector('.tg-b-bv-sub-a'), subB = pantalla.querySelector('.tg-b-bv-sub-b');
        function alternarSub() {
          if (desbloqueado || !pantalla.isConnected || !subA || !subB) return;
          subA.classList.toggle('tg-off');
          subB.classList.toggle('tg-off');
          setTimeout(alternarSub, BIENVENIDA_SUB_CAMBIO_MS);
        }
        if (sinMovimiento() || !logo.animate) { // sin animaciones: todo directo en su estado final
          logo.style.opacity = '1'; logo.style.transform = 'none'; caja.style.width = 'auto'; nombre.style.opacity = '1';
          nombre.querySelectorAll('.tg-b-bv-letra').forEach((l) => { l.style.opacity = '1'; });
          if (sub) sub.style.opacity = '0.85';
          if (pista) pista.style.opacity = '0.9';
          setTimeout(alternarSub, BIENVENIDA_SUB_CAMBIO_MS);
          return;
        }
        const SUAVE = 'cubic-bezier(0.22, 1, 0.36, 1)';   // frenada larga
const HOJA = 'cubic-bezier(0.32, 0.72, 0, 1)';    // la curva de las hojas y pantallas de iOS

// Animación de escala con rebote estilo iOS (simulando un spring overshoot)
// En nivel de blur Baja/Media la animación no lleva filter(blur) (solo escala)
const bvSinBlur = nivelBlur !== 'alta';
logo.animate([
    bvSinBlur ? { transform: 'scale(10)' } : { transform: 'scale(10)', filter: 'blur(10px)', }, // Nace enorme (y borroso solo en Alta)
    bvSinBlur ? { transform: 'scale(1)' } : { transform: 'scale(1)', filter: 'none' }     // Se acomoda al tamaño final
], { 
    duration: 1200, 
    easing: 'cubic-bezier(0.175, 0.885, 0.32, 1)', // Curva elástica típica de iOS
    fill: 'both' 
});

logo.animate([
    { opacity: 0 }, 
    { opacity: 1 }
], { 
    duration: 700, 
    delay: 0, 
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)', 
    fill: 'both' 
});
        setTimeout(() => {
          if (desbloqueado || !pantalla.isConnected) return;
          const ancho = caja.scrollWidth; // ancho natural del nombre (el grupo se mantiene centrado mientras crece)
          const aCaja = caja.animate([{ width: '0px' }, { width: ancho + 'px' }], { duration: 1200, easing: HOJA, fill: 'both' });
          aCaja.onfinish = () => { caja.style.width = 'auto'; aCaja.cancel(); };
          // LETRA POR LETRA: cada letra de "Gemini Vibes" sube desde abajo con rebote suave, una tras otra
          caja.style.overflow = 'visible'; // el recorte de la caja cortaría las letras mientras suben / rebotan (las letras ya nacen invisibles)
          nombre.style.opacity = '1';      // el contenedor se muestra; cada letra controla su propia opacidad
          const LETRA_ESCALONADO_MS = 75;  // retraso entre una letra y la siguiente
          const LETRA_DURACION_MS = 950;   // duración de cada letra
          nombre.querySelectorAll('.tg-b-bv-letra').forEach((letra, i) => {
            const bl = nivelBlur === 'alta'; // el blur de las letras solo existe en calidad Alta
            letra.animate([
              Object.assign({ opacity: 0, transform: 'translateY(0.9em)', easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }, bl ? { filter: 'blur(10px)' } : {}),
              Object.assign({ opacity: 1, transform: 'translateY(-0.14em)', offset: 0.55, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' }, bl ? { filter: 'blur(0px)' } : {}), // se pasa un poco
              Object.assign({ opacity: 1, transform: 'translateY(0.04em)', offset: 0.8, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' }, bl ? { filter: 'blur(0px)' } : {}),   // rebota hacia abajo
              Object.assign({ opacity: 1, transform: 'translateY(0)' }, bl ? { filter: 'blur(0px)' } : {})                                                                  // se asienta
            ], { duration: LETRA_DURACION_MS, delay: 80 + i * LETRA_ESCALONADO_MS, fill: 'both' });
          });
          // SUBIDA SUAVE (sin rebote): logo + título (.tg-b-bv-marca) y subtítulo suben juntos un poco, con ease in-out.
          // Usa la propiedad "translate" (independiente de "transform"), así no pisa las animaciones de escala del logo ni la del subtítulo.
          const marcaEl = pantalla.querySelector('.tg-b-bv-marca');
          const subida = Math.max(28, Math.min(Math.round(window.innerHeight * 0.07), 64)); // px que sube el grupo (ajusta el 0.07 si lo quieres más o menos arriba)
          const reboteSubida = [{ translate: '0 0' }, { translate: '0 ' + (-subida) + 'px' }];
          const opcionesSubida = { duration: 1400, delay: 1200, easing: 'ease-in-out', fill: 'both' }; // delay 1200 = el mismo del fade del subtítulo: sube justo cuando aparece (antes se queda abajo)
          if (marcaEl && marcaEl.animate) marcaEl.animate(reboteSubida, opcionesSubida);
          if (sub && sub.animate) sub.animate(reboteSubida, opcionesSubida);
          if (sub) sub.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 0.85, transform: 'translateY(0)' }], { duration: 800, delay: 1200, easing: SUAVE, fill: 'both' });
          if (pista) pista.animate([{ opacity: 0 }, { opacity: 0.9 }], { duration: 800, delay: 2500, easing: 'ease-out', fill: 'both' });
          setTimeout(alternarSub, 1700 + BIENVENIDA_SUB_CAMBIO_MS); // 5 s después de que el subtítulo terminó de aparecer
        }, 1000);
      }

      function saltarALogin() {
        if (!paginas.length) { mostrarPin(); return; }
        pinYaPasado = true;
        irA(0);
      }
      // 1) deslizar hacia arriba (o Espacio): la pantalla de bloqueo sube y debajo aparece la de PIN
      let enPin = false;
      let pinUI = null;
      // ============================================================================================
      // PÁGINAS DESPUÉS DE LA BIENVENIDA (subir = siguiente, bajar = volver; Espacio = siguiente)
      //   PRIMERA VEZ:  bienvenida → [PIN si aplica] → "Antes de comenzar..." → pantalla de bloqueo (pregunta) → novedades → Gemini
      //   ACTUALIZACIÓN: bienvenida → [PIN si aplica] → novedades → Gemini
      // Las páginas se crean al visitarlas y se conservan, así al volver no se pierde lo que elegiste.
      // ============================================================================================
      const itemsNotas = () => String(TG_NOTAS_VERSION || '').split(/\r?\n/).map((l) => l.replace(/^\s*[•\-*]\s*/, '').trim()).filter(Boolean);
      const paginas = [];   // fábricas: cada una devuelve el elemento de la página
      const els = [];       // páginas ya creadas
      let idx = -1;         // -1 = bienvenida; 0.. = página actual
      let navegando = false;
      let loginOk = false;  // hay sesión de Google activa (lo actualiza la página de login)
      const loginBloquea = () => idx >= 0 && !!els[idx] && els[idx]._tgLogin === true && !loginOk;
      let pinYaPasado = false;
      let arrastrePg = null;
      const hint = () => h('div', { class: 'tg-b-pista' }, h('span', null, 'Desliza hacia arriba para continuar'));
      function acentoActual() { try { return burbujaCSS(burbuja, false); } catch (e) { return '#1a73e8'; } }
      function cabecera(titulo, sub) {
        const urlLogo = urlLogoGemini();
        return h('div', { class: 'tg-b-nv-cab' },
          urlLogo ? h('img', { class: 'tg-b-nv-logo', src: urlLogo, alt: '', draggable: 'false' }) : null,
          h('h2', { class: 'tg-b-nv-titulo' }, titulo),
          sub ? h('div', { class: 'tg-b-nv-version' }, sub) : null);
      }
      // ESCALA DE LAS TARJETAS: base 440px. En pantallas grandes (PC) todo el cuadro crece con zoom (--tg-esc), hasta 1.75x, sin pasarse del alto/ancho disponible.
      // En pantallas chicas (móvil) --tg-esc no existe (=1) y el tamaño lo decide solo el CSS (--tg-cuadro), como antes.
      const TARJETA_BASE_PX = 440, TARJETA_ALTO_RATIO = 1.6, TARJETA_ALTO_MIN_PX = 600, TARJETA_ESCALA_MAX = 1.75, TARJETA_PROPORCION_VMIN = 0.58;
      function ajustarEscalaTarjetas() {
        try {
          const w = window.innerWidth, hh = window.innerHeight;
          const altoBase = Math.max(TARJETA_BASE_PX * TARJETA_ALTO_RATIO, TARJETA_ALTO_MIN_PX);          // alto de la tarjeta sin escalar
          const libreAlto = hh * 0.93 - 88;                                                                // alto máximo que cabe (igual que el CSS)
          const escMaxima = Math.min((w - 32) / TARJETA_BASE_PX, libreAlto / altoBase, TARJETA_ESCALA_MAX);
          const escDeseada = Math.max(1, Math.min(w, hh) * TARJETA_PROPORCION_VMIN / TARJETA_BASE_PX);
          const esc = Math.min(escDeseada, escMaxima);
          if (esc > 1.001) { raiz.style.setProperty('--tg-esc', esc.toFixed(3)); raiz.style.setProperty('--tg-cuadro', TARJETA_BASE_PX + 'px'); raiz.style.setProperty('--tg-alto', altoBase + 'px'); }
          else { raiz.style.removeProperty('--tg-esc'); raiz.style.removeProperty('--tg-cuadro'); raiz.style.removeProperty('--tg-alto'); }
        } catch (e) { /* sin ventana */ }
      }
      window.addEventListener('resize', ajustarEscalaTarjetas);
      // degradado inferior: se enciende (clase tg-mas) mientras la zona con scroll de la tarjeta tenga más contenido abajo
      function vigilarScrollTarjeta(tarjeta) {
        const zona = tarjeta.querySelector('.tg-ob-scroll, .tg-b-nv-lista');
        if (!zona) return;
        const medir = () => tarjeta.classList.toggle('tg-mas', zona.scrollHeight - zona.scrollTop - zona.clientHeight > 6);
        zona.addEventListener('scroll', medir, { passive: true });
        window.addEventListener('resize', medir);
        if (window.ResizeObserver) { try { const ro = new ResizeObserver(medir); ro.observe(zona); [...zona.children].forEach((c) => ro.observe(c)); } catch (e) { /* sin ResizeObserver */ } }
        setTimeout(medir, 0); setTimeout(medir, 600); setTimeout(medir, 1500); // por si las imágenes terminan de cargar después
      }
      function paginaBase(tarjeta) {
        ajustarEscalaTarjetas();
        setTimeout(() => vigilarScrollTarjeta(tarjeta), 0);
        const caja = h('div', { class: 'tg-b-nv tg-nv-visible' }, tarjeta);
        caja.style.setProperty('--tg-nv-acento', acentoActual());
        return h('div', { class: 'tg-pg' }, caja, hint());
      }
      function irA(nuevo) {
        if (desbloqueado || navegando || nuevo === idx || nuevo < -1 || nuevo >= paginas.length || loginBloquea()) return;
        const avanzar = nuevo > idx;
        const actual = idx < 0 ? pantalla : els[idx];
        let destino = nuevo < 0 ? pantalla : els[nuevo];
        if (!destino) { // primera visita: nace debajo de la pantalla y sube
          destino = paginas[nuevo]();
          destino.classList.add('tg-abajo');
          raiz.appendChild(destino);
          els[nuevo] = destino;
          activarArrastrePagina(destino);
          void destino.offsetHeight;
        }
        navegando = true; setTimeout(() => { navegando = false; }, 450);
        // sale la actual
        actual.style.pointerEvents = 'none';
        actual.classList.remove('tg-arrastrando');
        actual.style.removeProperty('transform');
        if (actual === pantalla) pantalla.style.transition = 'transform 800ms cubic-bezier(0.32, 0.72, 0, 1)';
        actual.classList.add(avanzar ? 'tg-subiendo' : 'tg-abajo');
        // entra la destino
        destino.style.removeProperty('pointer-events');
        requestAnimationFrame(() => { destino.classList.remove('tg-abajo'); destino.classList.remove('tg-subiendo'); });
        idx = nuevo;
        const f = document.getElementById('tg-bloqueo-fondo');
        if (f) f.classList.toggle('tg-nv-atenuado', idx >= 0);
        window.addEventListener('keydown', alTeclear, true);
      }
      function siguientePagina() {
        if (desbloqueado || loginBloquea()) return;
        if (idx + 1 >= paginas.length) { desbloquear(); return; }
        irA(idx + 1);
      }
      function paginaAnterior() { if (idx >= 0) irA(idx - 1); }
      // mismo gesto que la bienvenida: deslizar hacia arriba (o flick) = siguiente; hacia abajo = volver
      function activarArrastrePagina(el) {
        el.addEventListener('pointerdown', (e) => {
          if (!e.isPrimary || e.button !== 0 || desbloqueado || navegando) return;
          if (el._tgLogin && !loginOk) return; // login obligatorio: la tarjeta no se arrastra
          const t = e.target;
          if (t && t.closest) {
            if (t.closest('button, input, label, a')) return; // los controles se tocan, no arrastran
            const ls = t.closest('.tg-b-nv-lista, .tg-ob-scroll');
            if (ls && ls.scrollHeight > ls.clientHeight + 1) return; // zonas con scroll propio
          }
          arrastrePg = { pointerId: e.pointerId, inicioY: e.clientY, distancia: 0, t: performance.now(), y: e.clientY, vel: 0 };
          el.classList.add('tg-arrastrando');
          el.setPointerCapture(e.pointerId);
        });
        el.addEventListener('pointermove', (e) => {
          if (!arrastrePg || e.pointerId !== arrastrePg.pointerId) return;
          arrastrePg.distancia = arrastrePg.inicioY - e.clientY; // + = arriba (siguiente), − = abajo (volver)
          const ahora = performance.now(), dt = ahora - arrastrePg.t;
          if (dt > 0) { arrastrePg.vel = (arrastrePg.y - e.clientY) / dt; arrastrePg.t = ahora; arrastrePg.y = e.clientY; }
          el.style.transform = 'translateY(' + (-arrastrePg.distancia) + 'px)';
        });
        const terminar = (e, permitir) => {
          if (!arrastrePg || e.pointerId !== arrastrePg.pointerId) return;
          if (permitir) arrastrePg.distancia = arrastrePg.inicioY - e.clientY;
          const distancia = arrastrePg.distancia, vel = arrastrePg.vel;
          arrastrePg = null;
          if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
          el.classList.remove('tg-arrastrando');
          el.style.removeProperty('transform');
          if (!permitir) return;
          if (distancia >= BLOQUEO_UMBRAL_PX() || (vel > BLOQUEO_FLICK_PX_MS && distancia > 30)) siguientePagina();
          else if (-distancia >= BLOQUEO_UMBRAL_PX() || (vel < -BLOQUEO_FLICK_PX_MS && -distancia > 30)) paginaAnterior();
        };
        el.addEventListener('pointerup', (e) => terminar(e, true));
        el.addEventListener('pointercancel', (e) => terminar(e, false));
      }

      // ---- PÁGINA: NOVEDADES ----
      function crearPaginaNovedades() {
        const lista = h('ul', { class: 'tg-b-nv-lista' }, itemsNotas().map((t) => h('li', null, t)));
        return paginaBase(h('div', { class: 'tg-b-nv-tarjeta' }, cabecera('Novedades de la actualización', 'Versión ' + TG_VERSION), lista));
      }

      // ---- PÁGINA FINAL: "Todo listo." (título letra por letra como el logo de inicio, subtítulo con fade) ----
      function crearPaginaFinal() {
        const estiloTxt = 'color:#fff;text-shadow:0 2px 10px rgba(0,0,0,0.4);';
        const letras = Array.from('Todo listo.').map((c) => h('span', { 'aria-hidden': 'true', style: 'display:inline-block;opacity:0;will-change:transform,opacity;' }, c === ' ' ? '\u00a0' : c));
        const titulo = h('div', { 'aria-label': 'Todo listo.', style: estiloTxt + 'font-size:clamp(34px,9vw,64px);font-weight:500;line-height:1.15;letter-spacing:-0.02em;white-space:nowrap;' }, letras);
        const sub = h('div', { style: estiloTxt + 'font-size:clamp(16px,2.2vw,24px);opacity:0;padding:0 24px;margin-top:12px;' }, '¡Es hora de sumergirte en tu propia estética!');
        const pagina = h('div', { class: 'tg-pg' },
          h('div', { style: 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;' }, titulo, sub), hint());
        const bl = nivelBlur === 'alta';
        setTimeout(() => { // espera a que la página termine de subir
          if (!pagina.isConnected) return;
          letras.forEach((letra, i) => {
            if (!letra.animate) { letra.style.opacity = '1'; return; }
            letra.animate([
              Object.assign({ opacity: 0, transform: 'translateY(0.9em)', easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }, bl ? { filter: 'blur(10px)' } : {}),
              Object.assign({ opacity: 1, transform: 'translateY(-0.14em)', offset: 0.55, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' }, bl ? { filter: 'blur(0px)' } : {}),
              Object.assign({ opacity: 1, transform: 'translateY(0.04em)', offset: 0.8, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' }, bl ? { filter: 'blur(0px)' } : {}),
              Object.assign({ opacity: 1, transform: 'translateY(0)' }, bl ? { filter: 'blur(0px)' } : {})
            ], { duration: 950, delay: i * 75, fill: 'both' });
          });
          if (sub.animate) sub.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 0.85, transform: 'translateY(0)' }], { duration: 800, delay: 11 * 75 + 500, easing: 'ease-out', fill: 'both' });
          else sub.style.opacity = '0.85';
        }, 500);
        return pagina;
      }

      // ---- PÁGINA: "Antes de comenzar..." (fondos, burbuja, rendimiento) ----
      const OB_COLORES = [
        { n: 'Azul', h: 221, s: 100 }, { n: 'Violeta', h: 265, s: 85 }, { n: 'Rosa', h: 330, s: 85 }, { n: 'Rojo', h: 3, s: 85 },
        { n: 'Naranja', h: 24, s: 95 }, { n: 'Ámbar', h: 44, s: 95 }, { n: 'Verde', h: 145, s: 65 }, { n: 'Turquesa', h: 174, s: 80 },
        { n: 'Cian', h: 195, s: 90 }, { n: 'Gris', h: 215, s: 0 }
      ];
      // nivel de blur recomendado: RAM del teléfono (navigator.deviceMemory) y FPS medidos en la animación de la bienvenida; manda el más bajo
      function recomendarBlur() {
        const ram = Number(navigator.deviceMemory) || 4, nuc = navigator.hardwareConcurrency || 4, fps = fpsActual();
        let r = ram <= 2 ? 0 : (ram <= 4 && !(nuc >= 8)) ? 1 : 2;
        if (fps !== null) r = Math.min(r, fps < 30 ? 0 : fps < 48 ? 1 : 2);
        return { nivel: ['baja', 'media', 'alta'][r], fps: fps, ram: ram };
      }
      function elegirArchivoFondo(destino) {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*,video/*,.gif'; inp.style.display = 'none';
        raiz.appendChild(inp); // fuera del body: el body está inert mientras dura la bienvenida
        inp.addEventListener('change', () => {
          const f = inp.files && inp.files[0];
          inp.remove();
          if (!f) return;
          try {
            const dt = new DataTransfer(); dt.items.add(f);
            const objetivo = destino === 'gemini' ? fileInput : bloqueoFileInput; // reutiliza los mismos manejadores del panel Personalizar
            objetivo.files = dt.files;
            objetivo.dispatchEvent(new Event('change'));
          } catch (e) { console.warn('[tg] no se pudo aplicar el fondo elegido:', e); }
        });
        inp.click();
      }
      function crearPaginaOnboarding() {
        const prevG = h('button', { class: 'tg-ob-prev', type: 'button', 'aria-label': 'Cambiar el fondo de la pantalla de Gemini' },
          h('span', { class: 'tg-ob-mini-u' }), h('span', { class: 'tg-ob-mini-i' }), h('span', { class: 'tg-ob-cambiar' }, 'Cambiar'));
        const prevB = h('button', { class: 'tg-ob-prev', type: 'button', 'aria-label': 'Cambiar el fondo de la pantalla de bloqueo' },
          h('span', { class: 'tg-ob-hora' }, '9:41'), h('span', { class: 'tg-ob-cambiar' }, 'Cambiar'));
        const resetG = h('button', { class: 'tg-ob-reset', type: 'button', hidden: true }, 'Fondo por defecto');
        const resetB = h('button', { class: 'tg-ob-reset', type: 'button', hidden: true }, 'Fondo por defecto');
        const miniU = prevG.querySelector('.tg-ob-mini-u');
        const pintarFondosOb = () => {
          if (!prevG.isConnected) return;
          // Gemini: lo que hay puesto de verdad (si el usuario no cambió nada, es el fondo por defecto ADAPTATIVO: horizontal/vertical según la pantalla)
          if (!fondoGeminiActual && hayFondoDefecto()) aplicarFondoPorDefecto(false); // por si aún no había entrado
          if (fondoGeminiActual) ponerMedio(prevG, fondoGeminiActual, fondoGeminiTipo);
          else ponerMedio(prevG, urlFondoDefecto(true) || urlFondoDefecto(false), 'imagen');
          ponerMedio(prevB, bloqueoFondoPersonalizado || urlFondoBloqueoDefecto(), bloqueoFondoPersonalizado ? bloqueoFondoTipo : 'imagen');
          resetG.hidden = fondoPorDefecto || !hayFondoDefecto(); // solo se ofrece si el fondo actual es uno propio
          resetB.hidden = !bloqueoFondoPersonalizado;
        };
        resetG.addEventListener('click', () => { restablecerFondoGemini(); pintarFondosOb(); });
        resetB.addEventListener('click', () => {
          bloqueoFondoPersonalizado = ''; bloqueoFondoTipo = 'imagen';
          aplicarFondoBloqueo(document.getElementById('tg-bloqueo-fondo'));
          bdBorrar('bloqueo').catch(() => {}); liberarUrlVideo('bloqueo');
          const alm = almacenLocal();
          if (alm) alm.remove(['geminiFondoBloqueo', 'geminiFondoBloqueoTipo']);
          pintarFondosOb();
        });
        prevG.addEventListener('click', () => elegirArchivoFondo('gemini'));
        prevB.addEventListener('click', () => elegirArchivoFondo('bloqueo'));
        document.addEventListener('tg-fondos-cambiados', pintarFondosOb);

        // burbuja
        const vista = h('div', { class: 'tg-ob-burb' }, 'Así se verán tus mensajes');
        const botonesColor = OB_COLORES.map((c) => {
          const b = h('button', { class: 'tg-ob-color', type: 'button', 'aria-label': c.n, 'aria-pressed': 'false' });
          b.style.background = 'hsl(' + c.h + ', ' + c.s + '%, 50%)';
          b.addEventListener('click', () => { burbuja.h = c.h; burbuja.s = c.s; burbuja.tono = 50; aplicarBurbuja(true); pintarBurbujaOb(); });
          b._c = c; return b;
        });
        function pintarBurbujaOb() {
          vista.style.background = burbujaCSS(burbuja, true);
          vista.style.color = burbujaTexto(burbuja);
          if (miniU) miniU.style.background = burbujaCSS(burbuja, true);
          botonesColor.forEach((b) => b.setAttribute('aria-pressed', (burbujaPers && b._c.h === burbuja.h && b._c.s === burbuja.s) || (!burbujaPers && b._c.h === BURBUJA_BASE.h) ? 'true' : 'false'));
          const ac = acentoActual(); document.querySelectorAll('.tg-pg .tg-b-nv').forEach((c) => c.style.setProperty('--tg-nv-acento', ac)); // TODAS las tarjetas ya creadas (también las que no son esta)
        }

        // rendimiento (blur)
        const rec = recomendarBlur();
        const NOMBRES = { baja: ['Bajo', 'Sin blur'], media: ['Medio', 'Blur ligero'], alta: ['Alto', 'Blur completo'] };
        const botonesNivel = ['baja', 'media', 'alta'].map((n) => {
          const b = h('button', { class: 'tg-ob-opt', type: 'button', 'aria-pressed': 'false' }, NOMBRES[n][0], h('small', null, NOMBRES[n][1] + (n === rec.nivel ? ' · auto' : '')));
          b.addEventListener('click', () => { cambiarNivelBlur(n); pintarNivel(); });
          b._n = n; return b;
        });
        const pintarNivel = () => botonesNivel.forEach((b) => b.setAttribute('aria-pressed', b._n === nivelBlur ? 'true' : 'false'));
        if (!nivelBlurExplicito) cambiarNivelBlur(rec.nivel); // primera vez: se ajusta solo según el teléfono
        const nota = 'Recomendado para tu teléfono: ' + NOMBRES[rec.nivel][0] + ' · ' + (rec.fps !== null ? Math.round(rec.fps) + ' FPS en la animación' : 'FPS sin medir') + ' · ' + (navigator.deviceMemory ? '~' + navigator.deviceMemory + ' GB de RAM' : 'RAM desconocida');

        const scroll = h('div', { class: 'tg-ob-scroll' },
          h('div', { class: 'tg-ob-sec' },
            h('h3', { class: 'tg-ob-h' }, 'Fondo de pantalla'),
            h('p', { class: 'tg-ob-p' }, 'Toca una vista previa para elegir una imagen, GIF o video.'),
            h('div', { class: 'tg-ob-fondos' },
              h('div', { class: 'tg-ob-col' }, prevG, h('span', null, 'Pantalla de Gemini'), resetG),
              h('div', { class: 'tg-ob-col' }, prevB, h('span', null, 'Pantalla de bloqueo'), resetB))),
          h('div', { class: 'tg-ob-sec' },
            h('h3', { class: 'tg-ob-h' }, 'Color de tu burbuja'),
            h('p', { class: 'tg-ob-p' }, 'Así se verán tus mensajes en el chat.'),
            h('div', { class: 'tg-ob-colores' }, botonesColor), vista),
          h('div', { class: 'tg-ob-sec' },
            h('h3', { class: 'tg-ob-h' }, 'Rendimiento (blur)'),
            h('p', { class: 'tg-ob-p' }, 'Si tu teléfono va justo, un nivel más bajo se siente más fluido.'),
            h('div', { class: 'tg-ob-seg' }, botonesNivel),
            h('div', { class: 'tg-ob-nota' }, nota)));
        const pagina = paginaBase(h('div', { class: 'tg-b-nv-tarjeta tg-ob-tarjeta' },
          cabecera('Antes de comenzar...', 'Personaliza tu experiencia para tener una buena primera impresión.'),
          scroll));
        // al estar ya dentro del DOM de la página, se pinta todo
        Promise.resolve().then(() => { pintarFondosOb(); pintarBurbujaOb(); pintarNivel(); });
        setTimeout(pintarFondosOb, 700); // por si el fondo por defecto termina de cargar un instante después
        return pagina;
      }

      // ---- PÁGINA: ¿pantalla de bloqueo? ----
      function crearPaginaBloqueoPregunta() {
        const si = h('button', { class: 'tg-ob-grande', type: 'button', 'aria-pressed': 'false' }, 'Sí, activarla', h('small', null, 'Pide un PIN de 4 dígitos al abrir Gemini.'));
        const no = h('button', { class: 'tg-ob-grande', type: 'button', 'aria-pressed': 'false' }, 'Ahora no', h('small', null, 'Entras directo, sin PIN.'));
        const pintar = () => { const a = bloqueoActivoGuardado(); si.setAttribute('aria-pressed', a ? 'true' : 'false'); no.setAttribute('aria-pressed', a ? 'false' : 'true'); };
        // "Sí": si todavía no hay PIN, se superpone la pantalla de PIN para crearlo ahora (dos veces). Si lo cancelas, vuelve a "Ahora no".
        let pinCrear = null;
        const cerrarPinCrear = () => { if (pinCrear) { pinCrear.cerrar(true); pinCrear = null; } window.addEventListener('keydown', alTeclear, true); };
        si.addEventListener('click', () => {
          if (pinCrear) return;
          if (bloqueoPinHash) { guardarBloqueoActivo(true); pintar(); return; } // ya hay un PIN creado: solo se activa
          window.removeEventListener('keydown', alTeclear, true); // mientras se crea el PIN, Espacio/Esc no mueven las páginas
          pinCrear = crearPantallaPin({
            alCorrecto: () => { cerrarPinCrear(); guardarBloqueoActivo(true); pintar(); pintarPin(); },
            alVolver: () => { cerrarPinCrear(); guardarBloqueoActivo(false); pintar(); }
          });
          const el = document.getElementById('tg-pin'); if (el) el.classList.add('tg-pin-sobre'); // por encima de las tarjetas
        });
        no.addEventListener('click', () => { guardarBloqueoActivo(false); pintar(); });
        // CAMBIAR PIN: solo aparece cuando ya hay un PIN creado; repite el procedimiento de crearlo (2 veces) SIN pedir el actual.
        // Si lo cancelas, el PIN anterior se conserva (solo se guarda al confirmar los dos códigos).
        const cambiar = h('button', { class: 'tg-ob-grande', type: 'button', hidden: true }, 'Cambiar PIN', h('small', null, 'Crea un código nuevo.'));
        const notaPin1 = h('div', { class: 'tg-ob-nota' }, NOTA_PIN_1);
        const notaPin2 = h('div', { class: 'tg-ob-nota' }, NOTA_PIN_2);
        const pintarPin = () => { const hay = !!bloqueoPinHash; cambiar.hidden = !hay; };
        cambiar.addEventListener('click', () => {
          if (pinCrear) return;
          window.removeEventListener('keydown', alTeclear, true);
          pinCrear = crearPantallaPin({
            forzarCrear: true,
            alCorrecto: () => { cerrarPinCrear(); pintarPin(); },
            alVolver: () => { cerrarPinCrear(); pintarPin(); } // cancelar: se queda el PIN anterior y el estado del bloqueo no cambia
          });
          const el = document.getElementById('tg-pin'); if (el) el.classList.add('tg-pin-sobre');
        });
        pintar(); pintarPin();
        return paginaBase(h('div', { class: 'tg-b-nv-tarjeta tg-ob-tarjeta' },
          cabecera('¿Quieres pantalla de bloqueo?', 'Protege tu chat con un PIN de 4 dígitos. Si eliges «Sí», lo creas ahora. Puedes cambiarlo cuando quieras en Personalizar.'),
          h('div', { class: 'tg-ob-scroll' }, si, cambiar, no, notaPin1, notaPin2)));
      }

      // ---- PÁGINA: INICIO DE SESIÓN OBLIGATORIO (Google) ----
      // Va justo después de deslizar la bienvenida y antes de "Antes de comenzar...". No se puede saltar: irA/siguientePagina/arrastre/teclado
      // quedan bloqueados mientras NO haya una sesión de Google ACTIVA en el DOM (se vuelve a comprobar en vivo; el flag de localStorage solo evita repetirla).
      const LOGIN_LS = 'tg-login-ok';
      const RETORNO_LS = 'tg-login-retorno'; // se pone al ir a Google; al volver, la bienvenida se salta y se muestra la tarjeta de la cuenta
      const loginGuardado = () => { try { return localStorage.getItem(LOGIN_LS) === '1'; } catch (e) { return false; } };
      function leerSesionGoogle() {
        try {
          const a = document.querySelector('a[href*="accounts.google.com/SignOutOptions"], a[aria-label^="Cuenta de Google"], a[aria-label^="Google Account"]');
          if (!a) return null;
          const lbl = (a.getAttribute('aria-label') || '').replace(/\s+/g, ' ');
          const m = lbl.match(/:\s*(.*?)\s*\(([^)]+@[^)]+)\)/);
          const img = a.querySelector('.gb_me img, img');
          return { nombre: (m && m[1]) || (lbl.split(':')[1] || '').trim() || 'amigo', foto: img && img.src && !/al-icon\.png/.test(img.src) ? img.src : '' };
        } catch (e) { return null; }
      }
      function crearPaginaLogin() {
        const url = (u) => 'https://accounts.google.com/' + u + 'continue=' + encodeURIComponent(location.href);
        const estilo = h('style', null,
          '.tg-lg-centrado{justify-content:center!important}.tg-lg-centrado .tg-ob-scroll{flex:none!important;overflow:visible!important}.tg-lg{width:100%;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;padding:4px 2px}' +
          '.tg-lg-av{width:clamp(72px,22vw,104px);aspect-ratio:1;border-radius:50%;object-fit:cover;display:flex;align-items:center;justify-content:center;background:var(--tg-nv-acento,#1a73e8);color:#fff;font-size:40px;font-weight:600}' +
          '.tg-lg h3{margin:0;font-size:clamp(18px,5vw,22px)}.tg-lg p{margin:0;font-size:14px;opacity:.8}' +
          '.tg-lg input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:14px;border:1px solid rgba(0,0,0,.25);font:inherit;font-size:15px;background:#fff;color:#1f1f1f}' +
          '.tg-lg .tg-ob-grande{text-align:center}@keyframes tgLgFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.tg-lg>*{animation:tgLgFade .7s ease both}');
        const vista = h('div', { class: 'tg-lg' }, h('p', null, 'Comprobando sesión…'));
        const pagina = paginaBase(h('div', { class: 'tg-b-nv-tarjeta tg-ob-tarjeta' },
          cabecera('Inicia sesión', 'Deberás ingresar manualmente tu correo y tu contraseña debido a las políticas de seguridad de Google.'), h('div', { class: 'tg-ob-scroll', style: 'display:flex;flex-direction:column;justify-content:center' }, estilo, vista)));
        pagina._tgLogin = true;
        const pista = pagina.querySelector('.tg-b-pista'); if (pista) pista.style.display = 'none';

        const tarjeta = pagina.querySelector('.tg-b-nv-tarjeta');
        tarjeta.classList.add('tg-lg-centrado'); // también centrada mientras se comprueba la sesión
        const pintarSesion = (s) => {
          vista.textContent = ''; tarjeta.classList.remove('tg-lg-centrado');
          const av = s.foto ? h('img', { class: 'tg-lg-av', src: s.foto, alt: '', draggable: 'false', referrerpolicy: 'no-referrer' }) : h('div', { class: 'tg-lg-av' }, (s.nombre[0] || '?').toUpperCase());
          vista.append(av, h('h3', null, '¡En hora buena ' + s.nombre + '!'), h('p', null, 'Gracias por instalar la extensión, ¡te lo agradezco de verdad!'));
          if (pista) pista.style.display = '';
        };
        const pintarSinSesion = () => {
          vista.textContent = ''; tarjeta.classList.add('tg-lg-centrado'); // sin sesión: encabezado + botón centrados juntos
          const b = h('button', { class: 'tg-ob-grande', type: 'button' }, 'Iniciar sesión');
          b.addEventListener('click', () => {
            try { localStorage.setItem(RETORNO_LS, '1'); } catch (e) {}
            try { if (window.flutter_inappwebview) window.flutter_inappwebview.callHandler('audioBienvenida', 'mantener'); } catch (e) {} // la música no se pausa al salir de la página
            location.href = 'https://accounts.google.com/ServiceLogin?continue=' + encodeURIComponent(location.href); // página oficial de Google, directo
          });
          vista.append(b);
        };
        let estado = '', t0 = Date.now();
        const avisarListo = () => { try { if (RETORNO_LOGIN && window.flutter_inappwebview) window.flutter_inappwebview.callHandler('tgLoginListo'); } catch (e) {} }; // Dart quita la pantalla de carga
        const ok = (s) => { estado = 'ok'; loginOk = true; try { localStorage.setItem(LOGIN_LS, '1'); } catch (e) {} pintarSesion(s); setTimeout(avisarListo, 150); };
        const ciclo = setInterval(() => {
          if (!pagina.isConnected && Date.now() - t0 > 3000) { clearInterval(ciclo); return; }
          const s = leerSesionGoogle();
          if (s) {
            if (estado !== 'ok') ok(s);
          } else if (estado !== 'no' && Date.now() - t0 > 2500) { // el encabezado de Google tarda en pintarse: se espera antes de dar por "sin sesión"
            estado = 'no'; loginOk = false; try { localStorage.removeItem(LOGIN_LS); } catch (e) {} pintarSinSesion(); avisarListo();
          }
        }, 500);
        return pagina;
      }

      if (PRIMERA_VEZ) { paginas.push(crearPaginaOnboarding, crearPaginaBloqueoPregunta); }
      if (esActualizacion && itemsNotas().length) paginas.push(crearPaginaNovedades);
      if (esActualizacion) paginas.push(crearPaginaFinal); // última pantalla: "Todo listo."
      if (esActualizacion && (PRIMERA_VEZ || !loginGuardado())) paginas.unshift(crearPaginaLogin); // la 1.ª tras la bienvenida

      // BIENVENIDA + PIN correcto: se cierra el PIN y sube la primera página (todavía falta deslizar para entrar)
      function pinCorrectoBienvenida() {
        if (!enPin || desbloqueado) return;
        enPin = false;
        if (pinUI) { pinUI.cerrar(true); pinUI = null; }
        window.addEventListener('keydown', alTeclear, true);
        pinYaPasado = true;
        siguientePagina();
      }
      function mostrarPin() {
        if (enPin || desbloqueado) return;
        if (idx >= 0) { siguientePagina(); return; } // ya en las páginas (Espacio): siguiente
        if (bienvenida === 'inicio' && !MOSTRAR_PANTALLA_BLOQUEO) { desbloquear(); return; } // bienvenida de inicio sin bloqueo activado: sin PIN, entra a Gemini
        // bienvenida SIN pantalla de bloqueo activada: sin PIN, directo a las novedades
        if (esActualizacion && (!MOSTRAR_PANTALLA_BLOQUEO || pinYaPasado)) { siguientePagina(); return; } // (si ya pasó el PIN y volvió a la bienvenida, no se pide otra vez)
        enPin = true;
        pantalla.classList.remove('tg-arrastrando');
        pantalla.style.removeProperty('transform');
        pantalla.style.pointerEvents = 'none';
        pantalla.classList.add('tg-subiendo');
        window.removeEventListener('keydown', alTeclear, true);
        pinUI = crearPantallaPin({ alCorrecto: esActualizacion ? pinCorrectoBienvenida : desbloquear, alVolver: volverABloqueo });
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
        if (audio) audio.detener();
        if (PRIMERA_VEZ) guardarOnboardingVisto();
        if (esActualizacion) guardarFixVisto(TG_FIX); // ya la viste: se actualiza el fix visto (la bienvenida no vuelve a salir)
        pausarCuerpo(false);           // el body vuelve a pintarse para la animación de entrada
        fijarPantallaBloqueada(false);  // y todo lo demás se reanuda
        pantalla.classList.remove('tg-arrastrando');
        pantalla.style.removeProperty('transform');
        window.removeEventListener('keydown', alTeclear, true);
        window.removeEventListener('keyup', bloquearTecla, true);
        window.removeEventListener('keypress', bloquearTecla, true);
        clearTimeout(relojId);
        ponerInert(false);
        if (pinUI) { pinUI.cerrar(true); pinUI = null; }
        alinearAlInstante();
        animarBody(BLOQUEO_ESCALA_INICIAL, 1, BLOQUEO_OPACIDAD_INICIAL, 1, quitarBodyInicial);
        // (el estilo inicial sigue puesto hasta que termina la animación; la animación lo tapa sin saltos)
        pantalla.classList.add('tg-subiendo');
        els.forEach((nv, i) => {
          if (!nv) return;
          nv.classList.remove('tg-arrastrando');
          nv.style.removeProperty('transform');
          nv.classList.remove('tg-abajo');
          nv.classList.add('tg-subiendo');
          setTimeout(() => nv.remove(), 900);
        });
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
        const ls = e.target && e.target.closest ? e.target.closest('.tg-b-nv-lista') : null;
        if (ls && ls.scrollHeight > ls.clientHeight + 1) return; // la lista de novedades se desplaza sola (scroll), no arrastra la pantalla
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
        const vel = arrastre_vel;
        if (permitirDesbloqueo && (distancia >= BLOQUEO_UMBRAL_PX() || (vel > BLOQUEO_FLICK_PX_MS && distancia > 30))) mostrarPin();
      }
      pantalla.addEventListener('pointerup', (e) => terminarArrastre(e, true));
      pantalla.addEventListener('pointercancel', (e) => terminarArrastre(e, false));

      const enFormLogin = (e) => { try { const o = (e.composedPath && e.composedPath()[0]) || e.target; return !!(o && o.closest && o.closest('.tg-lg-form')); } catch (x) { return false; } }; // permite escribir el correo
      function bloquearTecla(e) { if (enFormLogin(e)) return; e.preventDefault(); e.stopImmediatePropagation(); }
      function alTeclear(e) {
        if (enFormLogin(e)) return;
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
        if (bloqueado || !vibesOn || !MOSTRAR_PANTALLA_BLOQUEO) return;
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
      if (bloqueado || !vibesOn || !MOSTRAR_PANTALLA_BLOQUEO) return; // sin bloqueo activado (solo bienvenida) no se vuelve a bloquear
      bloquear(false);
    }
    window.addEventListener('blur', (e) => {
      if (e.target !== window) return;
      if (BLOQUEO_FOCO_GRACIA_MS > 0 && performance.now() - ultimaInteraccion < BLOQUEO_FOCO_GRACIA_MS) return;
      setTimeout(() => { if (!document.hasFocus()) bloquearPorFoco(); }, 0); // si el foco fue a un iframe, el documento sigue con foco
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) bloquearPorFoco(); });

    // al cargar la página por primera vez: bienvenida de ACTUALIZACIÓN si el kernel cambió; si no, bienvenida de INICIO si "Mostrar bienvenida" está activo;
    // si no, la pantalla del reloj (solo llegamos aquí con el bloqueo activado)
    const iniciarBienvenida = () => bloquear(false, BIENVENIDA_PENDIENTE ? 'actualizacion' : (MOSTRAR_BIENVENIDA ? 'inicio' : false));
    // CALENTAMIENTO (solo app móvil, primera vez): detrás de la pantalla de carga negra corre la página de Gemini COMPLETA (calidad alta, sin bienvenida)
    // durante CALENTAMIENTO_MS y se miden los FPS reales; después se monta solo la bienvenida. Así la recomendación de calidad no sale inflada por una página vacía.
    const CALENTAMIENTO_MS = 6000, CALENTAMIENTO_DESCARTE_MS = 1500; // el arranque (primeros 1.5 s) no cuenta
    if (PRIMERA_VEZ && ES_APP_FLUTTER && !RETORNO_LOGIN && window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
      try { window.flutter_inappwebview.callHandler('audioBienvenida', 'calentando'); } catch (e) {}
      let n = 0, t0 = 0, tFin = 0, oculto = false;
      const inicio = performance.now();
      const paso = (t) => {
        if (document.hidden) oculto = true;
        if (t - inicio >= CALENTAMIENTO_DESCARTE_MS) { if (!t0) t0 = t; else n++; tFin = t; }
        if (t - inicio < CALENTAMIENTO_MS) { requestAnimationFrame(paso); return; }
        const dt = tFin - t0;
        if (!oculto && dt > 1000 && n > 10) fpsCalentamiento = n / (dt / 1000);
        iniciarBienvenida();
      };
      requestAnimationFrame(paso);
    } else iniciarBienvenida();
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
  // FONDO POR DEFECTO (adaptativo): mientras el usuario no haya puesto uno propio se usa Gemini-wallpaper-default.png (horizontal)
  // o Gemini-wallpaper-default-mobil.png (vertical), y cambia solo al girar la pantalla. No se guarda en las preferencias.
  let fondoPorDefecto = false;      // true = el fondo actual es el de por defecto
  let fondoDefectoUrl = '';         // URL pedida del fondo por defecto (para no re-aplicar lo mismo)
  let fondoDefectoVertical = false; // orientación con la que se aplicó
  function avisarCambioFondos() { document.dispatchEvent(new Event('tg-fondos-cambiados')); }
  // tono: 0 = oscuro, 50 = color puro, 100 = blanco
  function burbujaL(b) { return b.tono <= 50 ? 12 + (b.tono / 50) * 38 : 50 + ((b.tono - 50) / 50) * 46; }
  // NIVEL BAJA: la transparencia de tu burbuja queda BLOQUEADA en 10 % (opacidad 90 %); el valor elegido no se pierde: al subir de nivel vuelve
  const ALFA_BAJA = 90;
  function alfaBurbuja(b) { return nivelBlur === 'baja' ? ALFA_BAJA : b.alfa; }
  function burbujaCSS(b, conAlfa) { return 'hsla(' + b.h + ', ' + b.s + '%, ' + burbujaL(b).toFixed(1) + '%, ' + 'calc(' + (conAlfa === false ? 1 : b.alfa / 100) + (nivelBlur === 'baja' ? '' : ' + var(--tg-sb-extra, 0)') + '))'; }
  function burbujaTexto(b) { return burbujaL(b) > 68 ? '#1f1f1f' : '#ffffff'; }
  // CARGA DIFERIDA (solo app móvil y solo si sale la bienvenida): al abrir solo se dibuja la bienvenida. Las hojas de estilo del resto
  // se aplican cuando empiezas a deslizar (una por fotograma, para no trabar el gesto) y, como tope, al desbloquear.
  // En PC (extensión de Chrome) o sin bienvenida corre todo al instante, igual que antes.
  const colaDiferida = [];
  let colaPlanificada = false;
  function vaciarColaDiferida(toda) {
    colaPlanificada = false;
    while (colaDiferida.length) {
      const fn = colaDiferida.shift();
      try { fn(); } catch (e) { console.warn('[tg] carga diferida:', e); }
      if (!toda) { if (colaDiferida.length) { colaPlanificada = true; requestAnimationFrame(() => vaciarColaDiferida(false)); } return; }
    }
  }
  function despuesDeBienvenida(fn) {
    if (!(ES_APP_FLUTTER && pantallaBloqueada && (BIENVENIDA_PENDIENTE || MOSTRAR_BIENVENIDA))) { fn(); return; }
    colaDiferida.push(fn);
  }
  document.addEventListener('touchstart', () => { if (colaDiferida.length && !colaPlanificada) { colaPlanificada = true; requestAnimationFrame(() => vaciarColaDiferida(false)); } }, { once: true, capture: true, passive: true });
  document.addEventListener('tg-bloqueo-cambio', (e) => { if (e.detail && e.detail.bloqueado === false) vaciarColaDiferida(true); });
  despuesDeBienvenida(function () {
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
  });
  let burbujaPers = false; // true si el usuario personalizó la burbuja
  // pinta las variables de la burbuja: personalizada → con su color; sin personalizar pero en "baja" → azul original con 10 % de transparencia
  function pintarVarsBurbuja() {
    const raiz = document.documentElement;
    if (burbujaPers || nivelBlur === 'baja') {
      raiz.style.setProperty('--tg-burbuja-bg', burbujaCSS(Object.assign({}, burbuja, { alfa: alfaBurbuja(burbuja) })));
      raiz.style.setProperty('--tg-burbuja-texto', burbujaTexto(burbuja));
      raiz.classList.add('tg-burbuja-pers');
    } else {
      raiz.classList.remove('tg-burbuja-pers');
      raiz.style.removeProperty('--tg-burbuja-bg');
      raiz.style.removeProperty('--tg-burbuja-texto');
    }
  }
  function aplicarBurbuja(guardar) {
    burbujaPers = true;
    pintarVarsBurbuja();
    if (guardar) guardarBurbujaDebounce();
  }
  alCambiarNivelBlur = pintarVarsBurbuja; // al cambiar de nivel se re-pinta (el valor guardado de alfa nunca se toca)
  pintarVarsBurbuja();
  // los sliders disparan decenas de eventos por segundo: se guarda solo al soltar/pausar
  const guardarBurbujaDebounce = (function () {
    let t = null;
    return function () { clearTimeout(t); t = setTimeout(() => prefsGuardar({ geminiBurbuja: Object.assign({}, burbuja) }), 300); };
  })();
  function restablecerBurbuja() {
    burbuja = Object.assign({}, BURBUJA_BASE);
    burbujaPers = false;
    pintarVarsBurbuja();
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
  function aplicarFondo(base64Data, tipo, sinBlob, esDefecto) {
    tipo = tipo === 'video' ? 'video' : 'imagen';
    let urlImg = base64Data;
    if (tipo === 'imagen' && !sinBlob && typeof base64Data === 'string' && base64Data.indexOf('data:') === 0) {
      const b = dataUrlABlobUrl(base64Data);
      if (b) { urlImg = b; const sonda = new Image(); sonda.onerror = () => aplicarFondo(base64Data, 'imagen', true, esDefecto); sonda.src = b; } // si la página bloquea blob:, vuelve al data URL
    }
    fondoGeminiActual = urlImg;
    fondoGeminiTipo = tipo;
    fondoPorDefecto = !!esDefecto; // cualquier fondo elegido por el usuario (imagen o video) deja de ser el de por defecto
    bvFondoGemini = { url: urlImg, tipo: tipo };
    aplicarFondoBloqueo(document.getElementById('tg-bloqueo-fondo')); // si la bienvenida está en pantalla, toma el fondo nuevo
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
        --tg-sidebar-bg: rgba(0, 0, 0, calc(0.2 + var(--tg-sb-extra-nb, 0)));
        --tg-resp-bg: rgba(0, 0, 0, calc(0.8 + var(--tg-sb-extra, 0)));
        --tg-input-bg: rgba(0, 0, 0, calc(0.55 + var(--tg-sb-extra-ctl, var(--tg-sb-extra, 0))));
        --tg-texto: #ffffff;
        --tg-texto-suave: rgba(255, 255, 255, 0.7);
      }
      html[data-tema="claro"] {
        --tg-sidebar-bg: rgba(255, 255, 255, calc(0.35 + var(--tg-sb-extra-nb, 0)));
        --tg-resp-bg: rgba(255, 255, 255, calc(0.78 + var(--tg-sb-extra, 0)));
        --tg-input-bg: rgba(255, 255, 255, calc(0.65 + var(--tg-sb-extra-ctl, var(--tg-sb-extra, 0))));
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

      /* BLUR DE BURBUJAS SOLO EN PANTALLA: nacen SIN blur; el observador de visibilidad les pone data-tg-blur al aparecer en pantalla y se lo quita al salir.
         (:not([data-tg-blur]) suma especificidad: gana al backdrop-filter !important de la burbuja sin tocar nada más) */
      .user-query-bubble-with-background:not([data-tg-blur]),
      .response-container:not([data-tg-blur]) {
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
        backdrop-filter: blur(var(--tg-bf14, 14px)) !important;
        -webkit-backdrop-filter: blur(var(--tg-bf14, 14px)) !important;
      }

      .user-query-bubble-with-background {
        background-color: rgba(0, 89, 255, calc(0.7 + var(--tg-sb-extra, 0))) !important;
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

      html.tg-blur-baja input-area-v2 .text-input-field:focus-within {
  background: rgba(0, 0, 0, 0.95) !important;
  background-color: rgba(0, 0, 0, 0.95) !important;
}

html[data-tema="claro"].tg-blur-baja input-area-v2 .text-input-field:focus-within {
  background: rgba(255, 255, 255, 0.95) !important;
  background-color: rgba(255, 255, 255, 0.95) !important;
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
@media (hover: hover) {
top-bar-actions bard-mode-switcher button:hover,
top-bar-actions [data-test-id="bard-mode-menu-button"]:hover {
  transform: scale(1.04) !important;
}
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
@media (hover: hover) {
bard-mode-switcher:not(:is(input-area-v2 *)) button:hover {
  transform: scale(1.04) !important;
}
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
  -webkit-backdrop-filter: blur(var(--tg-bf14, 14px)) !important;
  backdrop-filter: blur(var(--tg-bf14, 14px)) !important;
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
@media (hover: hover) {
gem-icon-button[data-test-id="prompt-copy-button"]:hover,
gem-icon-button[data-test-id="prompt-edit-button"]:hover {
  transform: scale(1.08) !important;
}
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

  const VIBES_ESTILOS = ['tg-bloqueo-style', 'gemini-custom-bg-style', 'tg-burbuja-style', 'tg-vp-style',
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
    const bvAct = result.geminiBienvenidaActiva;
    if (bvAct === true || bvAct === false || bvAct === 'true' || bvAct === 'false') {
      try { localStorage.setItem(BIENVENIDA_CLAVE_LS, (bvAct === true || bvAct === 'true') ? '1' : '0'); } catch (e) { /* sin localStorage */ }
    }
    const activo = result.geminiBloqueoActivo;
    if (activo === true || activo === false || activo === 'true' || activo === 'false') {
      try { localStorage.setItem(BLOQUEO_CLAVE_LS, (activo === true || activo === 'true') ? '1' : '0'); } catch (e) { /* sin localStorage */ }
    }
    if (result.geminiTema === 'claro' || result.geminiTema === 'oscuro') {
      aplicarTema(result.geminiTema);
    }
    {
      let n = null;
      if (NIVELES_BLUR.indexOf(result.geminiBlurNivel) >= 0) n = result.geminiBlurNivel;
      else if (!nivelBlurExplicito) { // ajustes antiguos: "Desactivar desenfoque" → baja; perfil "Ligero" → media
        if (result.geminiSinBlur === true || result.geminiSinBlur === 'true') n = 'baja';
        else if (result.geminiPerfil === 'ligero') n = 'media';
      }
      if (n && n !== nivelBlur) {
        nivelBlur = n;
        try { localStorage.setItem(BLUR_NIVEL_LS, n); } catch (e) { /* sin localStorage */ }
        aplicarNivelBlur();
        try { Tareas.marcar('layout'); Tareas.marcar('menuLateral'); } catch (e) { /* aún no está todo creado */ }
      }
      if (NIVELES_BLUR.indexOf(result.geminiBlurNivel) >= 0) nivelBlurExplicito = true;
    }
    if (result.geminiSinFade === true || result.geminiSinFade === false || result.geminiSinFade === 'true' || result.geminiSinFade === 'false') {
      sinFadeScroll = result.geminiSinFade === true || result.geminiSinFade === 'true';
      try { localStorage.setItem(SINFADE_CLAVE_LS, sinFadeScroll ? '1' : '0'); } catch (e) { /* sin localStorage */ }
      try { Tareas.marcar('layout'); } catch (e) { /* aún no está todo creado */ }
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
        else asegurarFondoPorDefecto(); // el video ya no está en IndexedDB: vuelve el fondo por defecto
      }).catch((err) => { console.error('No se pudo leer el video de fondo de Gemini:', err); asegurarFondoPorDefecto(); });
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

  // ---- FONDO POR DEFECTO ADAPTATIVO ----
  //  - extensión de Chrome: Gemini-wallpaper-default.png y Gemini-wallpaper-default-mobil.png en la RAÍZ de la extensión (como Gemini.png;
  //    cubiertos por "*.png" en web_accessible_resources)
  //  - app Flutter: Dart los inyecta (data URL o URL) en window.TG_FONDO_DEFECTO (horizontal) y window.TG_FONDO_DEFECTO_MOVIL (vertical),
  //    igual que TG_LOGO_GEMINI. Si Dart no los manda, simplemente no hay fondo por defecto (todo sigue como antes).
  const FONDO_DEFECTO_H = 'Gemini-wallpaper-default.png';
  const FONDO_DEFECTO_V = 'Gemini-wallpaper-default-mobil.png';
  function esPantallaVertical() {
    try { return window.matchMedia ? window.matchMedia('(orientation: portrait)').matches : window.innerHeight > window.innerWidth; } catch (e) { return false; }
  }
  function urlFondoDefecto(vertical) {
    try {
      const v = vertical ? window.TG_FONDO_DEFECTO_MOVIL : window.TG_FONDO_DEFECTO;
      if (typeof v === 'string' && v) return v;
      const p = vertical ? PREFS_INICIALES.geminiFondoDefectoMovil : PREFS_INICIALES.geminiFondoDefecto;
      if (typeof p === 'string' && p) return p;
    } catch (e) { /* sin window */ }
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        const u = chrome.runtime.getURL(vertical ? FONDO_DEFECTO_V : FONDO_DEFECTO_H);
        return /^chrome-extension:\/\/invalid\//.test(u) ? '' : u; // extensión recargada: hay que refrescar la pestaña
      }
    } catch (e) { /* no es una extensión */ }
    return '';
  }
  function hayFondoDefecto() { return !!(urlFondoDefecto(false) || urlFondoDefecto(true)); }
  // forzar = true: aplica aunque ya hubiera un fondo (botón "Fondo por defecto"). Sin forzar solo actúa si no hay ningún fondo del usuario.
  function aplicarFondoPorDefecto(forzar) {
    if (!forzar && fondoGeminiActual && !fondoPorDefecto) return; // hay un fondo del usuario: no se toca
    const vertical = esPantallaVertical();
    const url = urlFondoDefecto(vertical) || urlFondoDefecto(!vertical); // si falta la de esta orientación, se usa la otra
    if (!url) return;
    if (fondoPorDefecto && fondoDefectoUrl === url) return;           // ya está puesto
    fondoDefectoUrl = url; fondoDefectoVertical = vertical;
    aplicarFondo(url, 'imagen', false, true);
    if (url.indexOf('data:') !== 0) { // si la página no deja cargar la URL de la extensión como fondo, se intenta por fetch -> blob
      const sonda = new Image();
      sonda.onerror = () => {
        fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
          .then((b) => { if (fondoPorDefecto && fondoDefectoUrl === url) aplicarFondo(URL.createObjectURL(b), 'imagen', true, true); })
          .catch((e) => console.warn('[tg] no se pudo cargar el fondo por defecto:', e));
      };
      sonda.src = url;
    }
  }
  function restablecerFondoGemini() { // botón "Fondo por defecto": borra el fondo propio (imagen o video) y vuelve al adaptativo
    bdBorrar('gemini').catch(() => {});
    liberarUrlVideo('gemini');
    const alm = almacenLocal();
    if (alm) alm.remove(['geminiFondo', 'geminiFondoTipo']);
    aplicarFondoPorDefecto(true);
  }
  // al girar la pantalla, el fondo por defecto cambia a la otra versión
  window.addEventListener('resize', () => {
    if (fondoPorDefecto && esPantallaVertical() !== fondoDefectoVertical) aplicarFondoPorDefecto(true);
  }, { passive: true });
  // tras leer las preferencias: si el usuario no tiene fondo propio, entra el de por defecto (el video llega asíncrono: ahí se decide después)
  function asegurarFondoPorDefecto(r) {
    if (fondoGeminiActual) return;
    if (r && (r.geminiFondo || r.geminiFondoTipo === 'video')) return;
    aplicarFondoPorDefecto(false);
  }

  // Cargar preferencias guardadas / inyectadas
  prefsLeer(['geminiFondo', 'geminiFondoBloqueo', 'geminiTema', 'geminiPinBloqueo', 'geminiBurbuja', 'geminiBloqueoActivo', 'geminiBienvenidaActiva', 'geminiFondoTipo', 'geminiFondoBloqueoTipo', 'geminiBlurNivel', 'geminiPerfil', 'geminiSinBlur', 'geminiSinFade', 'geminiLenis', 'geminiVibesActivo'], function (r) { aplicarPreferencias(r); asegurarFondoPorDefecto(r); });

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
        const paso = ES_APP_FLUTTER ? 4 : 1; // en el móvil el blur del fondo cambia en saltos de 4px: muchos menos re-pintados
        backdropFilterVal = `blur(${Math.round(bfBlur / paso) * paso}px)${extra ? ' ' + extra : ''}`;
      }
    }

    return {
      x: L(pa.x, pb.x),
      y: L(pa.y, pb.y),
      scaleX: sX,
      scaleY: sY,
      escalaX: sX,
      escalaY: sY,
      blur: nivelBlur !== 'alta' ? 0 : Math.max(0, L(a.blur ?? 0, b.blur ?? 0)), // media y baja: sin filter(blur) en el vuelo
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

  // contenedor que hace scroll del chat (se usa para seguir el destino sin medir el layout en cada fotograma)
  function contenedorScroll(el) {
    let p = el.parentElement, primero = null;
    while (p && p !== document.body && p !== document.documentElement) {
      const oy = getComputedStyle(p).overflowY;
      if (oy === 'auto' || oy === 'scroll') { if (p.scrollHeight > p.clientHeight + 1) return p; if (!primero) primero = p; }
      p = p.parentElement;
    }
    return primero || document.scrollingElement || document.documentElement;
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
    const movil = !!ES_APP_FLUTTER;
    // !important inline: vence a los !important de la hoja (margin, max-width, transform-origin, transition...)
    const fijar = (k, v) => g.style.setProperty(k, v, 'important');
    fijar('position', 'fixed'); fijar('left', '0'); fijar('top', '0'); fijar('right', 'auto'); fijar('bottom', 'auto');
    fijar('margin', '0'); fijar('box-sizing', 'border-box'); fijar('max-width', 'none'); fijar('max-height', 'none');
    fijar('width', r0.width + 'px'); fijar('height', r0.height + 'px');
    fijar('z-index', VUELO_Z); fijar('pointer-events', 'none');
    fijar('transform-origin', 'center center'); fijar('transition', 'none'); fijar('animation', 'none');
    // móvil: solo transform y filter van a la GPU (backdrop-filter en will-change obligaba a recomponer el fondo en cada fotograma)
    fijar('will-change', movil ? 'transform, filter' : 'transform, filter, backdrop-filter'); fijar('contain', 'layout paint');
    // fuera de user-query el clon ya no hereda la tipografía/color: se copian tal cual los tiene la real
    ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color'].forEach((p) => fijar(p, cs.getPropertyValue(p)));

    let w = r0.width, h = r0.height;
    let destino = { left: r0.left, top: r0.top };
    // móvil: el destino se calcula con el scroll (barato) y solo se mide el layout de verdad cada 8 fotogramas
    const scroller = movil ? contenedorScroll(el) : null;
    let stBase = scroller ? scroller.scrollTop : 0;
    let frame = 0;
    function medir() {
      const rt = el.getBoundingClientRect(); // Gemini hace scroll y mueve el layout mientras vuela
      if (rt.width < 1 || rt.height < 1) return;
      destino = { left: rt.left, top: rt.top };
      stBase = scroller ? scroller.scrollTop : 0;
      if (Math.abs(rt.width - w) > 0.5 || Math.abs(rt.height - h) > 0.5) {
        w = rt.width; h = rt.height;
        fijar('width', w + 'px'); fijar('height', h + 'px');
      }
    }
    // pinta el clon para el instante p (0-1) de la animación
    function pintar(p) {
      if (!movil || frame % 8 === 0) medir();
      frame++;
      const top = scroller ? destino.top - (scroller.scrollTop - stBase) : destino.top;
      const st = vueloEstado(p, origen.x - (destino.left + w / 2), origen.y - (top + h / 2), w, h, origBF);
      // solo se escribe lo que cambió respecto al fotograma anterior
      const tr = `translate(${(destino.left + st.x).toFixed(2)}px, ${(top + st.y).toFixed(2)}px) scaleX(${st.scaleX.toFixed(4)}) scaleY(${st.scaleY.toFixed(4)})`;
      if (tr !== g._tgTr) { g._tgTr = tr; fijar('transform', tr); }
      // móvil: el blur cambia de 2 en 2 px (el ojo no lo nota y el navegador no repinta el filtro en cada fotograma)
      const fl = nivelBlur !== 'alta' ? 'none' : (movil ? `blur(${Math.round(st.blur / 2) * 2}px)` : `blur(${st.blur.toFixed(1)}px)`); // media y baja: ningún filter en la animación de vuelo
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
    vueloHasta = t0 + VUELO_MS + 300; // el planificador (layout, header, fade, menú) espera mientras el clon vuela

    function fin() {
      vueloHasta = 0;
      try { Tareas.marcar('layout'); Tareas.marcar('menuLateral'); } catch (e) { /* aún no está todo creado */ }
    }
    function aterrizar() {
      if (el._vuelo !== g) { fin(); return; }
      el._vuelo = null;
      el._aterrizoEn = performance.now(); // las fotos del mismo mensaje esperan a este momento (ver retrasoPorBurbuja)
      g.remove();
      fin();
      if (!el.isConnected) return;
      el._animado = true;
      el.setAttribute('data-sin-anim', ''); // aparece tal cual, sin repetir animación (el clon ya hizo el trabajo)
      el.setAttribute('data-anim', 'in');
    }
    function cuadro(ahora) {
      if (el._vuelo !== g) { g.remove(); fin(); return; }
      if (!el.isConnected) { el._vuelo = null; g.remove(); fin(); return; }
      const p = Math.min(1, Math.max(0, (ahora - t0) / VUELO_MS));
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
        el.setAttribute('data-tg-blur', ''); // apareció en pantalla: se le pone el blur
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
        el.removeAttribute('data-tg-blur'); // salió de la pantalla: se le quita el blur
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
        background: rgba(0, 0, 0, calc(0.35 + var(--tg-sb-extra-nb, 0))) !important;
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
      @media (hover: hover) { ${SEL_PANEL} .arrow-back-container .arrow-back-button:hover { transform: scale(1.08) !important; } }
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
      -webkit-backdrop-filter: blur(var(--tg-bf14, 14px)) !important;
      backdrop-filter: blur(var(--tg-bf14, 14px)) !important;
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
      --p-card: var(--tg-input-bg, rgba(0, 0, 0, 0.75));
      --p-texto: var(--tg-texto, #ffffff);
      --p-suave: var(--tg-texto-suave, rgba(255, 255, 255, 0.7));
      --p-borde: rgba(255, 255, 255, 0.14);
      --p-hover: rgba(255, 255, 255, 0.1);
      --p-sombra: rgba(0, 0, 0, 0.45);
      position: fixed; inset: 0; z-index: 2147483646;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, calc(0.35 + var(--tg-sb-extra-nb, 0)));
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
      backdrop-filter: blur(var(--tg-bf14, 14px)); -webkit-backdrop-filter: blur(var(--tg-bf14, 14px));
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
    @media (hover: hover) { .tg-p-cerrar:hover { transform: scale(1.08); } }
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
    @media (hover: hover) { .tg-p-color:hover { transform: scale(1.12); } }
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
    .tg-p-rango:disabled { opacity: 0.45; cursor: not-allowed; }
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
      background: rgba(0, 0, 0, calc(0.45 + var(--tg-sb-extra-nb, 0))); color: #fff !important; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
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
    @media (hover: hover) { .tg-p-btn:hover { transform: scale(1.04); background: var(--p-hover); } }
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
      background: rgba(0, 0, 0, calc(0.45 + var(--tg-sb-extra-nb, 0))); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
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
    @media (hover: hover) { .tg-p-switch:hover .tg-p-sw-handle { filter: brightness(1.12); } }
    .tg-p-switch:focus-visible .tg-p-sw-track { box-shadow: 0 0 0 3px var(--p-hover); }
    /* mini pantalla de Gemini */
    .tg-m-lateral {
      position: absolute; top: 0; bottom: 0; left: 0; width: 20%; background: rgba(0, 0, 0, calc(0.3 + var(--tg-sb-extra-nb, 0)));
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); padding: 10px 8px; display: flex; flex-direction: column; gap: 6px;
    }
    .tg-m-lateral i { display: block; height: 7px; border-radius: 99px; background: rgba(255, 255, 255, 0.35); }
    .tg-m-lateral i:first-child { width: 60%; background: rgba(255, 255, 255, 0.6); }
    .tg-m-chat { position: absolute; top: 0; bottom: 0; left: 20%; right: 0; padding: 12px; display: flex; flex-direction: column; gap: 7px; justify-content: flex-end; }
    .tg-m-usuario { align-self: flex-end; width: 42%; height: 18px; border-radius: 10px 10px 3px 10px; background: var(--tg-pers-bg, rgba(0, 89, 255, 0.7)); transition: background-color 0.15s ease; }
    .tg-m-ia { align-self: flex-start; width: 66%; height: 34px; border-radius: 10px 10px 10px 3px; background: rgba(0, 0, 0, 0.72); }
    .tg-m-input { height: 20px; border-radius: 99px; background: rgba(0, 0, 0, calc(0.55 + var(--tg-sb-extra, 0))); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); margin-top: 3px; }
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
      /* TECLADO EN LA APP MÓVIL: el WebView no cambia de tamaño; Flutter manda la altura (window.tgSetTeclado) y se sube la caja
         de escribir con "translate" (no pisa ningún transform de Gemini). Con Vibes encendido o apagado. */
      /* sin transición CSS: el JS anima --tg-teclado fotograma a fotograma (así el fade de abajo sigue a la caja sin desfase) */
      html[data-tg-teclado] input-container { translate: 0 calc(-1 * var(--tg-teclado, 0px)) !important; will-change: translate; }
      html[data-tg-teclado] infinite-scroller { padding-bottom: calc(120px + var(--tg-teclado, 0px)) !important; }
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
      hs('rect', { x: 5, y: 11, width: 14, height: 9, rx: 2.5 }), hs('path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }), hs('circle', { cx: 12, cy: 15.5, r: 1 })),
    actualizar: () => hs('svg', { viewBox: '0 0 24 24' },
      hs('path', { d: 'M12 4v11M7.5 11 12 15.5 16.5 11' }), hs('path', { d: 'M5 19h14' }))
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

  // ===== DEBUG: BORRAR TODOS LOS DATOS =====
  // Solo existe el botón si la app corre en modo debug (Dart pone window.TG_DEBUG = true). Borra localStorage "tg-*", IndexedDB de fondos y todas las
  // preferencias, y pide a Dart (handler 'tgBorrarDatos') limpiar su almacén y reiniciar la app. Si Dart no tiene el handler, solo recarga la página.
  const TG_CLAVES_PREFS = ['geminiAudioBienvenida', 'geminiAudioBienvenidaEdicion', 'geminiAudioBienvenidaNombre', 'geminiAudioBienvenidaOriginal', 'geminiAudioBienvenidaOriginalNombre',
    'geminiBienvenidaActiva', 'geminiBloqueoActivo', 'geminiBlurNivel', 'geminiBurbuja', 'geminiFondo', 'geminiFondoBloqueo', 'geminiFondoBloqueoTipo', 'geminiFondoTipo',
    'geminiLenis', 'geminiPerfil', 'geminiPinBloqueo', 'geminiSinBlur', 'geminiSinFade', 'geminiTema', 'geminiVibesActivo', 'geminiFixVisto', 'geminiOnboardingVisto'];
  function tgModoDebug() { try { return ES_APP_FLUTTER && (window.TG_DEBUG === true || window.TG_DEBUG === 'true'); } catch (e) { return false; } }
  function borrarTodosLosDatos() {
    try { Object.keys(localStorage).filter((k) => k.indexOf('tg-') === 0).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* sin localStorage */ }
    try { ['tg-fondos-extension', typeof BD_NOMBRE === 'string' ? BD_NOMBRE : null].filter(Boolean).forEach((n) => indexedDB.deleteDatabase(n)); } catch (e) { /* sin indexedDB */ }
    try { prefsBorrar(TG_CLAVES_PREFS); } catch (e) { /* sin almacén */ }
    const recargar = () => setTimeout(() => { try { location.reload(); } catch (e) { /* nada */ } }, 400);
    try {
      const fl = window.flutter_inappwebview;
      if (fl && typeof fl.callHandler === 'function') { const r = fl.callHandler('tgBorrarDatos'); if (r && r.catch) r.catch(recargar); return; } // Dart limpia y reinicia
    } catch (e) { /* sin puente */ }
    recargar();
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
          ),
          h('div', { class: 'tg-p-toggle', style: 'margin-top:12px' },
            h('span', { class: 'tg-p-toggle-txt' },
              h('span', { class: 'tg-p-toggle-tit' }, 'Mostrar bienvenida'),
              h('span', { class: 'tg-p-toggle-sub' }, 'Al entrar a la página (sin depender del bloqueo)')
            ),
            h('button', { class: 'tg-p-switch', type: 'button', role: 'switch', 'aria-checked': 'true', 'aria-label': 'Mostrar la pantalla de bienvenida al entrar a la página', 'data-r': 'sw-bienvenida' },
              h('span', { class: 'tg-p-sw-track' }),
              h('span', { class: 'tg-p-sw-handle' },
                hs('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
                  hs('path', { d: 'M19.69 5.23 8.96 15.96l-4.23-4.23L2.96 13.5l6 6L21.46 7z' }))
              )
            )
          ),
          crearFilaMusica()
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
              h('span', { class: 'tg-p-fondo-nombre' }, 'Pantalla de Gemini'),
              h('button', { class: 'tg-p-btn', type: 'button', 'data-r': 'reset-gemini', hidden: true }, SVG_RESET(), 'Fondo por defecto')
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

    // ---- rendimiento: nivel de blur (Baja / Media / Alta) ----
    (function () {
      const OPC = [
        { v: 'baja', t: 'Baja', d: 'Sin ningún desenfoque: ni cristal, ni filtros en las animaciones. Fade lite (el fondo en degradé) y transparencia de tu burbuja fija en 10 %. La más ligera.' },
        { v: 'media', t: 'Media', d: 'Desenfoque en burbujas, caja de escribir, botones de arriba, barra lateral y menús. Fade lite (fondo en degradé). En el bloqueo, solo el fondo del PIN.' },
        { v: 'alta', t: 'Alta', d: 'Todos los efectos de desenfoque al máximo, tal como están diseñados.' }
      ];
      const fila = h('div', { class: 'tg-p-colores' });
      const desc = h('p', { class: 'tg-p-sub', style: 'margin-top:10px' }, '');
      const botones = OPC.map((o) => {
        const b = h('button', { class: 'tg-p-btn', type: 'button', 'data-nivel': o.v }, o.t);
        b.addEventListener('click', () => { cambiarNivelBlur(o.v); pintarNivel(); try { pintarBurbuja(); } catch (e) { /* el panel aún se está creando */ } });
        fila.appendChild(b);
        return b;
      });
      function pintarNivel() {
        botones.forEach((b) => { const on = b.getAttribute('data-nivel') === nivelBlur; b.style.background = on ? 'var(--p-hover)' : ''; b.style.outline = on ? '2px solid var(--p-texto)' : ''; });
        const o = OPC.filter((x) => x.v === nivelBlur)[0];
        desc.textContent = o ? o.d : '';
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
      const swF = h('button', { class: 'tg-p-switch', type: 'button', role: 'switch', 'aria-checked': sinFadeScroll ? 'true' : 'false', 'aria-label': 'Quitar difuminado del scroll' },
        h('span', { class: 'tg-p-sw-track' }),
        h('span', { class: 'tg-p-sw-handle' },
          hs('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, hs('path', { d: 'M19.69 5.23 8.96 15.96l-4.23-4.23L2.96 13.5l6 6L21.46 7z' }))));
      swF.addEventListener('click', () => { cambiarSinFade(!sinFadeScroll); swF.setAttribute('aria-checked', sinFadeScroll ? 'true' : 'false'); });
      const filaFade = h('div', { class: 'tg-p-toggle', style: 'margin-top:12px' },
        h('span', { class: 'tg-p-toggle-txt' },
          h('span', { class: 'tg-p-toggle-tit' }, 'Quitar difuminado del scroll'),
          h('span', { class: 'tg-p-toggle-sub' }, 'Sin degradado arriba ni abajo del chat, en todos los niveles.')),
        swF);
      panel.appendChild(h('section', { class: 'tg-p-seccion tg-p-seccion-vibes' },
        h('h3', { class: 'tg-p-titulo' }, 'Rendimiento'),
        h('p', { class: 'tg-p-sub' }, 'Elige cuánto desenfoque (blur) usa la interfaz. Si va lento, baja el nivel.'),
        fila,
        desc,
        filaFade,
        filaLenis));
      pintarNivel();
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
      backdrop.style.setProperty('--tg-pers-bg', burbujaCSS(Object.assign({}, burbuja, { alfa: alfaBurbuja(burbuja) })));
      backdrop.style.setProperty('--tg-pers-texto', burbujaTexto(burbuja));
      backdrop.style.setProperty('--tg-pers-solido', solido);
      const h = burbuja.h, s = burbuja.s;
      sliderTono.style.setProperty('--ramp', 'linear-gradient(to right, hsl(' + h + ',' + s + '%,12%), hsl(' + h + ',' + s + '%,50%), hsl(' + h + ',' + s + '%,96%))');
      sliderAlfa.style.setProperty('--ramp', 'linear-gradient(to right, ' + burbujaCSS({ h: h, s: s, tono: burbuja.tono, alfa: 15 }) + ', ' + solido + '), repeating-conic-gradient(rgba(128,128,128,0.45) 0 25%, transparent 0 50%) 0 0 / 10px 10px');
      sliderTono.value = burbuja.tono;
      const alfaFija = nivelBlur === 'baja';
      sliderAlfa.value = alfaBurbuja(burbuja);
      sliderAlfa.disabled = alfaFija;
      sliderAlfa.setAttribute('aria-disabled', alfaFija ? 'true' : 'false');
      sliderAlfa.title = alfaFija ? 'Bloqueado en 10 % con el nivel de desenfoque Baja' : '';
      q('tono-valor').textContent = burbuja.tono < 25 ? 'Oscuro' : burbuja.tono > 75 ? 'Blanco' : 'Color';
      q('alfa-valor').textContent = (100 - alfaBurbuja(burbuja)) + '% transparente' + (alfaFija ? ' (bloqueado en Baja)' : '');
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
      q('reset-gemini').hidden = fondoPorDefecto || !hayFondoDefecto(); // solo se ofrece si el fondo actual es uno propio
    }
    function pintarReloj() {
      const ahora = new Date();
      q('hora').textContent = ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      q('fecha').textContent = ahora.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    q('fondo-gemini').addEventListener('click', () => fileInput.click());
    q('fondo-bloqueo').addEventListener('click', () => bloqueoFileInput.click());
    q('reset-gemini').addEventListener('click', () => { restablecerFondoGemini(); pintarFondos(); });
    const sw = q('sw-bloqueo');
    const pintarSwitch = () => sw.setAttribute('aria-checked', bloqueoActivoGuardado() ? 'true' : 'false');
    sw.addEventListener('click', () => { guardarBloqueoActivo(!bloqueoActivoGuardado()); pintarSwitch(); });
    pintarSwitch();
    const swBv = q('sw-bienvenida');
    const pintarSwitchBv = () => swBv.setAttribute('aria-checked', bienvenidaActivaGuardada() ? 'true' : 'false');
    swBv.addEventListener('click', () => { guardarBienvenidaActiva(!bienvenidaActivaGuardada()); pintarSwitchBv(); });
    pintarSwitchBv();
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

    // ---- DEBUG: borrar todos los datos y reiniciar (SOLO app en modo debug; hasta abajo del todo) ----
    // Dart (content.dart) debe inyectar window.TG_DEBUG = kDebugMode ANTES de este script. En release, o en la extensión de Chrome, el botón no existe.
    if (tgModoDebug()) {
      panel.appendChild(h('section', { class: 'tg-p-seccion' },
        h('h3', { class: 'tg-p-titulo' }, 'Debug'),
        h('p', { class: 'tg-p-sub' }, 'Solo visible en modo debug. Borra TODOS los datos guardados (ajustes, fondos, PIN, música, bienvenida vista) y reinicia la app como si fuera la primera vez.'),
        (() => {
          const bd = h('button', { class: 'tg-p-btn', type: 'button', style: 'color:#ff6b6b;border-color:rgba(255,107,107,0.55);' }, SVG_RESET(), 'Borrar todos los datos y reiniciar');
          bd.addEventListener('click', () => {
            if (!window.confirm('⚠️ ADVERTENCIA\n\nSe borrarán TODOS los datos de Gemini Vibes: ajustes, fondos, música, PIN y la bienvenida vista.\nLa app se reiniciará como si fuera la primera vez.\n\nEsta acción no se puede deshacer. ¿Continuar?')) return;
            borrarTodosLosDatos();
          });
          return bd;
        })()));
    }

    pintarBurbuja();
    pintarFondos();
    pintarReloj();
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => { backdrop.classList.add('tg-visible'); backdrop.querySelector('.tg-p-cerrar').focus({ preventScroll: true }); });
  }

  // ===== PANEL "ACTUALIZACIONES GEMINI VIBES" (SOLO app móvil) =====
  // Habla con content.dart por el handler 'tgActualizaciones' ('estado' | 'verificar' | 'actualizar').
  // Reutiliza los mismos ids y clases del panel Personalizar (mismo cristal, mismas píldoras).
  function llamarActualizaciones(accion, ...extra) {
    if (!esAppMovil()) return Promise.reject(new Error('Solo disponible en la app móvil.'));
    return Promise.resolve(window.flutter_inappwebview.callHandler('tgActualizaciones', accion, ...extra));
  }
  function fechaLarga(iso) {
    if (!iso) return 'Sin datos';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'Sin datos';
    const dia = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const hora = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    return dia.charAt(0).toUpperCase() + dia.slice(1) + ' · ' + hora;
  }

  // Estilos del panel de actualizaciones (se crean una vez). Reutiliza el contenedor y las variables del panel Personalizar
  // (#tg-personalizar-backdrop / #tg-personalizar-panel), así hereda el cristal, el tema claro/oscuro y las reglas de nivel de blur:
  //   ALTA  → cabecera con fondo de pantalla desenfocado en dos capas (blur progresivo: más fuerte hacia abajo) + degradé hacia el panel.
  //   MEDIA y BAJA → fade LITE: el fondo SIN desenfoque, solo oscurecido y con el mismo degradé (sin filter ni backdrop-filter).
  //   BAJA además deja el panel con fondo opaco (lo hace la hoja tg-blur).
  despuesDeBienvenida(function () {
    const est = document.createElement('style');
    est.id = 'tg-actualizaciones-style';
    est.textContent = `
      #tg-personalizar-panel.tg-u-panel {
        width: min(420px, calc(100vw - 28px)); max-height: min(90vh, 760px); padding: 0;
        display: flex; flex-direction: column; overflow: hidden; position: relative;
      }
      .tg-u-x {
        position: absolute; top: 12px; left: 12px; z-index: 3; width: 40px; height: 40px; padding: 0; border-radius: 50%; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.28); background: rgba(0, 0, 0, calc(0.45 + var(--tg-sb-extra-nb, 0)));
        -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); transition: transform 0.2s ease;
        -webkit-tap-highlight-color: transparent; outline: 0;
      }
      .tg-u-x:hover, .tg-u-x:active { transform: scale(1.08); }
      .tg-u-x svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

      .tg-u-cab {
        position: relative; isolation: isolate; flex: none; color: #fff; text-align: center;
        display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px 20px 26px;
        text-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
      }
      .tg-u-fondos {
        position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none;
        
        -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 52%, rgba(0, 0, 0, 0.55) 80%, transparent 100%);
        mask-image: linear-gradient(to bottom, #000 0%, #000 52%, rgba(0, 0, 0, 0.55) 80%, transparent 100%);
      }
      .tg-u-fondo { position: absolute; inset: -24px; background-size: cover; background-position: center; filter: blur(7px) brightness(0.62) saturate(1.2); }
      .tg-u-fondo-b {
        filter: blur(20px) brightness(1) saturate(1.2);
        -webkit-mask-image: linear-gradient(to bottom, transparent 15%, #000 85%); mask-image: linear-gradient(to bottom, transparent 15%, #000 85%);
      }
      
      

      .tg-u-titulo { margin-top: 6px; font-size: 15px; font-weight: 600; letter-spacing: 0.01em; padding: 0 44px; }
      .tg-u-marca { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 4px; }
      .tg-u-logo-caja { display: block; width: 72px; height: 72px; }
      .tg-u-logo { display: block; width: 72px; height: 72px; object-fit: contain; }
      .tg-u-nombre { font-size: clamp(26px, 8vw, 32px); font-weight: 500; line-height: 1.1; letter-spacing: -0.01em; }
      .tg-u-sub { min-height: 20px; font-size: 14px; opacity: 0.92; }

      .tg-u-cuerpo { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 4px 18px 20px; }
      .tg-u-eti { font-size: 13px; font-weight: 600; color: var(--tg-u-acento, #4a8cff); filter: brightness(1.25); }
      .tg-u-notas {
        width: 100%; max-height: 180px; min-height: 84px; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
        padding: 12px 14px; border-radius: 16px; background: var(--p-card); border: 1px solid var(--p-borde); color: var(--p-texto);
        font-size: 13.5px; line-height: 1.45; text-align: left; white-space: pre-wrap; overflow-wrap: anywhere;
        scrollbar-width: thin; scrollbar-color: var(--p-borde) transparent; outline: 0;
      }
      .tg-u-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-width: 220px; height: 46px; padding: 0 26px; margin-top: 4px;
        border: 0; border-radius: 9999px; cursor: pointer; font: inherit; font-size: 15px; font-weight: 500;
        background: var(--tg-u-acento, #0059ff); color: var(--tg-u-acento-texto, #fff);
        transition: transform 0.2s ease, opacity 0.2s ease; -webkit-tap-highlight-color: transparent; outline: 0;
      }
      @media (hover: hover) { .tg-u-btn:hover { transform: scale(1.04); } }
      .tg-u-btn:active { transform: scale(0.97); }
      .tg-u-btn:disabled { opacity: 0.65; cursor: default; transform: none; }
      .tg-u-btn:focus-visible, .tg-u-x:focus-visible { box-shadow: 0 0 0 3px var(--p-hover); }
      .tg-u-spin { display: none; width: 20px; height: 20px; }
      .tg-u-btn[data-ocupado] .tg-u-spin { display: inline-block; }
      @keyframes tgUSpin { to { transform: rotate(360deg); } }
      .tg-u-ok { display: flex; align-items: center; gap: 10px; margin-top: 6px; font-size: 18px; font-weight: 500; color: var(--p-texto); text-align: center; }
      .tg-u-ok svg { width: 26px; height: 26px; flex: none; fill: none; stroke: var(--tg-u-acento, #4a8cff); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; filter: brightness(1.25); }
      .tg-u-err { font-size: 13px; color: #ff9b9b; text-align: center; }
      .tg-u-pie { font-size: 11.5px; color: var(--p-suave); text-align: center; line-height: 1.35; }
      .tg-u-btn[hidden], .tg-u-ok[hidden], .tg-u-err[hidden] { display: none !important; }
      @media (prefers-reduced-motion: reduce) { .tg-u-spin { animation: none; } .tg-u-btn, .tg-u-x { transition: none; } }
    `;
    (document.head || document.documentElement).appendChild(est);
  });

  function abrirPanelActualizaciones() {
    if (!esAppMovil()) return;
    actualizarFondoMenuLateral();
    const previo = document.getElementById('tg-personalizar-backdrop');
    if (previo) { if (previo._limpiar) previo._limpiar(); previo.remove(); }

    const SVG_CERRAR = () => hs('svg', { viewBox: '0 0 24 24' }, hs('path', { d: 'M6 6l12 12M18 6L6 18' }));
    const SVG_OK = () => hs('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, hs('circle', { cx: 12, cy: 12, r: 9 }), hs('path', { d: 'M8 12.5l2.7 2.7L16 9.5' }));
    // si por algo no llega Gemini.png desde Flutter, se dibuja la estrella de Gemini
    const ESTRELLA = () => hs('svg', { class: 'tg-u-logo', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
      hs('defs', null, hs('linearGradient', { id: 'tg-u-grad', x1: 0, y1: 1, x2: 1, y2: 0 },
        hs('stop', { offset: '0%', 'stop-color': '#4285f4' }), hs('stop', { offset: '50%', 'stop-color': '#9b72cb' }), hs('stop', { offset: '100%', 'stop-color': '#d96570' }))),
      hs('path', { fill: 'url(#tg-u-grad)', d: 'M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 17 7.1 12.7 1.5 12 7.1 11.4 11.4 7.1 12 1.5z' }));

    const backdrop = h('div', { id: 'tg-personalizar-backdrop' },
      h('div', { id: 'tg-personalizar-panel', class: 'tg-u-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': ETIQUETA_ACTUALIZAR },
        h('button', { class: 'tg-u-x', type: 'button', 'aria-label': 'Cerrar' }, SVG_CERRAR()),
        h('div', { class: 'tg-u-cab' },
          h('div', { class: 'tg-u-fondos', 'aria-hidden': 'true' }, h('div', { class: 'tg-u-fondo' }), h('div', { class: 'tg-u-fondo tg-u-fondo-b' })),
          h('div', { class: 'tg-u-titulo', 'data-r': 'titulo' }),
          h('div', { class: 'tg-u-marca' },
            h('span', { class: 'tg-u-logo-caja', 'data-r': 'logo' }),
            h('span', { class: 'tg-u-nombre', 'data-r': 'nombre' })),
          h('div', { class: 'tg-u-sub', 'data-r': 'sub' })
        ),
        h('div', { class: 'tg-u-cuerpo' },
          h('div', { class: 'tg-u-eti' }, 'Notas de versión:'),
          h('div', { class: 'tg-u-notas', 'data-r': 'notas', 'data-lenis-prevent': '', tabindex: 0 }),
          h('div', { class: 'tg-u-ok', 'data-r': 'ok', hidden: true }, SVG_OK(), h('span', null, 'La extensión está actualizada')),
          crearFilaMusica(),
          h('button', { class: 'tg-u-btn', type: 'button', 'data-r': 'btn' }, h('span', { class: 'tg-u-spin', 'aria-hidden': 'true' }), h('span', { 'data-r': 'btn-txt' }, 'Buscar actualizaciones')),
          h('div', { class: 'tg-u-err', 'data-r': 'err', role: 'status', hidden: true }),
          h('div', { class: 'tg-u-pie', 'data-r': 'pie' })
        )
      )
    );
    const q = (r) => backdrop.querySelector('[data-r="' + r + '"]');

    // colores: el botón toma el color de TU burbuja (así combina con la personalización)
    backdrop.style.setProperty('--tg-u-acento', burbujaCSS(burbuja, false));
    backdrop.style.setProperty('--tg-u-acento-texto', burbujaTexto(burbuja));
    // fondo de la cabecera: tu fondo de pantalla de Gemini (imagen/GIF). Con video o sin fondo queda el degradé (un video aquí costaría fps)
    if (fondoGeminiTipo === 'imagen' && fondoGeminiActual) {
      const bg = 'url("' + String(fondoGeminiActual).replace(/"/g, '%22') + '")';
      backdrop.querySelectorAll('.tg-u-fondo').forEach((f) => { f.style.backgroundImage = bg; });
    }

    // icono Gemini.png (llega de Flutter como data URL y se guarda en memoria)
    function ponerLogo() {
      const caja = q('logo');
      caja.textContent = '';
      const srcLogo = window.__tgIconoCache || urlLogoGemini(); // Gemini.png (el que manda Dart por TG_LOGO_GEMINI o, en la extensión, el de la carpeta)
      caja.appendChild(srcLogo ? h('img', { class: 'tg-u-logo', src: srcLogo, alt: '' }) : ESTRELLA());
    }
    ponerLogo();

    // ---- estado de la pantalla: 'inicio' | 'buscando' | 'nueva' | 'alDia' | 'actualizando' ----
    const S = { fase: 'inicio', d: null, error: '', notas: null };
    function render() {
      const d = S.d;
      const nueva = S.fase === 'nueva' || S.fase === 'actualizando';
      const alDia = S.fase === 'alDia';
      const kern = S.fase === 'kernel'; // hay versión nueva, pero necesita instalar una app nueva (kernel distinto)
      const ocupado = S.fase === 'buscando' || S.fase === 'actualizando';
      q('titulo').textContent = kern ? 'Actualización de la app' : nueva ? 'Nueva actualización' : 'Actualizaciones';
      q('nombre').textContent = 'Gemini Vibes ' + ((nueva || kern) ? ((d && d.remotaVersion) || 'nueva versión') : TG_VERSION);
      q('sub').textContent = kern ? 'Requiere instalar la nueva versión de la app'
        : nueva ? '¡Más hermoso que nunca!'
        : !d ? '' : (d.origen === 'asset' || !d.instaladaIso) ? 'Versión incluida en la app' : 'Actualizado el ' + fechaLarga(d.instaladaIso);
      const textoNotas = kern ? 'Esta actualización cambia partes internas de la app, por eso no se puede instalar desde aquí. Para seguir actualizando, busca la nueva versión de la app en GitHub, descárgala e instálala.'
        : nueva ? (((d && d.remotaNotas) || '').trim() || 'Esta versión no incluye notas.') : (TG_NOTAS_VERSION.trim() || 'Sin notas de versión.');
      if (S.notas !== textoNotas) { S.notas = textoNotas; q('notas').textContent = textoNotas; q('notas').scrollTop = 0; }
      q('ok').hidden = !alDia;
      const btn = q('btn');
      btn.hidden = alDia;
      btn.disabled = ocupado;
      btn.toggleAttribute('data-ocupado', ocupado);
      try { const sp = btn.querySelector('.tg-u-spin'); if (sp && tgForma) { if (ocupado) tgForma.montar(sp); else tgForma.parar(sp); } } catch (e) { /* sin figura: el botón sigue funcionando */ }
      q('btn-txt').textContent = S.fase === 'buscando' ? 'Buscando…' : S.fase === 'actualizando' ? 'Actualizando…' : kern ? 'Ir a GitHub' : nueva ? 'Actualizar' : 'Buscar actualizaciones';
      q('err').textContent = S.error;
      q('err').hidden = !S.error;
      q('pie').textContent = S.fase === 'actualizando' ? 'Aplicando… la página de Gemini se recargará en un momento.'
        : kern ? 'Tu versión actual seguirá funcionando hasta que instales la nueva app.'
        : nueva ? 'Esta actualización reiniciará la página de Gemini para incluir los nuevos cambios'
        : !d ? '' : 'Última comprobación de actualizaciones: ' + (d.verificadaIso ? fechaLarga(d.verificadaIso) : 'Nunca');
    }
    const msj = (e) => String((e && e.message) || e);

    q('btn').addEventListener('click', () => {
      if (S.fase === 'buscando' || S.fase === 'actualizando') return;
      if (S.fase === 'kernel') { abrirGithubApp(); return; }
      if (S.fase === 'nueva') { // ACTUALIZAR: Dart guarda el script y recarga la página
        S.fase = 'actualizando'; S.error = ''; render();
        llamarActualizaciones('actualizar').then((r) => {
          if (r && r.ok !== false) {
            S.d = Object.assign(S.d || {}, r);
            if (!r.recargando) S.fase = r.hayNueva ? 'nueva' : 'alDia'; // con recargando se queda en "Actualizando…" hasta que la página se reinicia
          } else { S.fase = 'nueva'; S.error = (r && r.error) || 'No se pudo actualizar.'; }
        }).catch((e) => { S.fase = 'nueva'; S.error = msj(e); }).then(render);
      } else { // BUSCAR
        S.fase = 'buscando'; S.error = ''; render();
        llamarActualizaciones('verificar').then((r) => {
          if (r && r.ok !== false) { S.d = Object.assign(S.d || {}, r); S.fase = kernelRemotoDistinto(r) ? 'kernel' : r.hayNueva ? 'nueva' : 'alDia'; }
          else { S.fase = 'inicio'; S.error = (r && r.error) || 'No se pudo comprobar.'; }
        }).catch((e) => { S.fase = 'inicio'; S.error = msj(e); }).then(render);
      }
    });

    function onTecla(e) { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } }
    function limpiar() { document.removeEventListener('keydown', onTecla, true); }
    function cerrar() { limpiar(); backdrop.classList.remove('tg-visible'); setTimeout(() => backdrop.remove(), 200); }
    backdrop._limpiar = limpiar;
    document.addEventListener('keydown', onTecla, true);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) cerrar(); });
    backdrop.querySelector('.tg-u-x').addEventListener('click', cerrar);
    backdrop.querySelector('#tg-personalizar-panel').addEventListener('click', (e) => e.stopPropagation());

    render();
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('tg-visible'));
    // estado inicial: si ya se había encontrado una versión nueva, se abre directo en la pantalla "Nueva actualización"
    llamarActualizaciones('estado', !window.__tgIconoCache).then((r) => {
      if (r && r.icono) { window.__tgIconoCache = r.icono; ponerLogo(); }
      if (r && r.ok !== false) { S.d = r; S.fase = kernelRemotoDistinto(r) ? 'kernel' : r.hayNueva ? 'nueva' : 'inicio'; }
      else S.error = (r && r.error) || 'No se pudo consultar.';
    }).catch((e) => { S.error = msj(e); }).then(render);
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
  const ID_ITEM_ACTUALIZAR_MOVIL = 'tg-item-actualizar-movil'; // solo en la app móvil (ver esAppMovil)
  const ETIQUETA_ACTUALIZAR = 'Actualizaciones Gemini Vibes';
  despuesDeBienvenida(function () {
    const est = document.createElement('style');
    est.id = 'tg-personalizar-movil-style';
    est.textContent = ['#' + ID_ITEM_PERSONALIZAR_MOVIL, '#' + ID_ITEM_ACTUALIZAR_MOVIL].map((s) => `
      ${s} .tg-menu-ico-m { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; color: inherit; }
      ${s} .tg-menu-ico-m svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      ${s} mat-icon { display: none !important; }
    `).join('');
    (document.head || document.documentElement).appendChild(est);
  });

  // ¿estamos dentro de la app móvil (WebView de Flutter)? Dart pone window.TG_ES_MOVIL = true y registra el handler 'tgActualizaciones'.
  // En la extensión de Chrome (escritorio) esto es false y el menú de actualizaciones NO existe.
  function esAppMovil() {
    return window.TG_ES_MOVIL === true && !!(window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function');
  }

  function crearItemPersonalizarMovil(lista, cfg) {
    cfg = cfg || { id: ID_ITEM_PERSONALIZAR_MOVIL, etiqueta: ETIQUETA_PERSONALIZAR, icono: SVG_MENU.personalizar, accion: abrirPanelPersonalizar };
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
    item.id = cfg.id;
    item.setAttribute('type', 'button');
    item.setAttribute('role', 'button');
    item.removeAttribute('disabled');
    item.setAttribute('aria-disabled', 'false');
    ponerTexto(item, cfg.etiqueta);
    // icono: se reemplaza el glifo de Gemini por el mismo icono SVG que usa el menú de escritorio
    const contIcono = item.querySelector('gem-icon') || item.querySelector('mat-icon');
    if (contIcono) {
      contIcono.querySelectorAll('mat-icon').forEach((m) => m.remove());
      const span = h('span', { class: 'tg-menu-ico-m', 'aria-hidden': 'true' }, cfg.icono());
      contIcono.appendChild(span);
    }
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cfg.accion();
      cerrarMenuAjustes();
    });
    return item;
  }

  function agregarItemMovil() {
    document.querySelectorAll('.mobile-settings-and-help-menu').forEach((lista) => {
      // "Actualizaciones Gemini Vibes": SOLO en la app móvil, justo debajo de "Personalizar" (también si Personalizar ya estaba puesto)
      const colocarActualizaciones = () => {
        if (!esAppMovil() || lista.querySelector('#' + ID_ITEM_ACTUALIZAR_MOVIL)) return;
        const base = lista.querySelector('#' + ID_ITEM_PERSONALIZAR_MOVIL);
        if (!base) return;
        const it = crearItemPersonalizarMovil(lista, { id: ID_ITEM_ACTUALIZAR_MOVIL, etiqueta: ETIQUETA_ACTUALIZAR, icono: SVG_MENU.actualizar, accion: abrirPanelActualizaciones });
        if (it) lista.insertBefore(it, base.nextSibling);
      };
      if (lista.querySelector('#' + ID_ITEM_PERSONALIZAR_MOVIL)) { colocarActualizaciones(); return; }
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
      colocarActualizaciones();
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
    let programado = false, espera = null, forzar = false;
    function correr() {
      programado = false;
      if (document.hidden || pantallaBloqueada || cuerpoEscalado) return; // se retoma en visibilitychange / al desbloquear / al terminar el zoom
      if (!forzar) { // carga de conversación (todas las plataformas) / vuelo del mensaje y tecleo (móvil): el layout espera y corre una sola vez
        const t = performance.now();
        if (cargandoConv || (ES_APP_FLUTTER && (t < vueloHasta || t < escribiendoHasta))) {
          if (!espera) espera = setTimeout(() => { espera = null; if (sucias.size) pedir(); }, 120);
          return;
        }
      }
      const lista = Array.from(sucias); sucias.clear();
      lista.forEach((n) => { try { reg.get(n)(); } catch (e) { console.warn('[tg] error en tarea ' + n + ':', e); } });
    }
    function pedir() { if (!programado && !pantallaBloqueada && !cuerpoEscalado) { programado = true; requestAnimationFrame(correr); } }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && sucias.size) pedir(); });
    // al desbloquear se ponen al día TODAS las tareas (durante el bloqueo no corrió ninguna)
    function reanudar() { reg.forEach((f, n) => sucias.add(n)); if (!document.hidden) pedir(); }
    document.addEventListener('tg-bloqueo-cambio', () => { if (!pantallaBloqueada) reanudar(); });
    // ahora(): corre TODAS las tareas de inmediato y de forma síncrona (sin esperar al siguiente frame)
    function ahora() { reg.forEach((f, n) => sucias.add(n)); programado = false; forzar = true; try { correr(); } finally { forzar = false; } }
    return {
      registrar(n, f) { reg.set(n, f); },
      marcar(n) { sucias.add(n); if (!document.hidden && !pantallaBloqueada && !cuerpoEscalado) pedir(); },
      ahora
    };
  })();
  if (ES_APP_FLUTTER) document.addEventListener('input', () => { escribiendoHasta = performance.now() + 250; }, { capture: true, passive: true });
  // setInterval que no trabaja con la pestaña oculta
  const cada = (fn, ms) => setInterval(() => { if (!document.hidden && !pantallaBloqueada) { try { fn(); } catch (e) { console.warn('[tg] ' + fn.name + ':', e); } } }, ms);

  Tareas.registrar('layout', () => { if (tecladoAplicado > 0 || tecladoKbEf > 0) { try { aplicarTeclado(); } catch (e) { /* aún no definido */ } } actualizarVarSafeTop(); limpiarCapasEtiqueta(); alinearHeaderAngosto(); alinearMultimedia(); asegurarFadeChat(); });
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
  despuesDeBienvenida(function () {
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
      @media (hover: hover) { .tg-colapso-btn:hover { transform: scale(1.04); } }
      .tg-colapso-txt::before { content: 'Mostrar mensaje completo'; }
      .response-container[data-tg-colapso="expandida"] .tg-colapso-txt::before { content: 'Mostrar menos'; }
      .tg-colapso-btn svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.3s ease; }
      .response-container[data-tg-colapso="expandida"] .tg-colapso-btn svg { transform: rotate(180deg); }
      @media (prefers-reduced-motion: reduce) { .tg-colapso-btn, .tg-colapso-btn svg, .tg-colapso-toggle { transition: none; } }
    `;
    (document.head || document.documentElement).appendChild(est);
  });

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
    if (cargandoConv) return; // conversación cargando: los nodos se quedan en cola y se procesan al quitarse la barrita
    const nodos = loteNodos.splice(0);
    const quito = loteQuitaron; loteQuitaron = false;
    let hizoAlgo = quito;
    const buscandoCreando = envioParaScroll && performance.now() - envioParaScroll < 10 * 60 * 1000;
    let tocoEstructura = quito;
    const t0Lote = performance.now();
    for (let k = 0; k < nodos.length; k++) {
      const n = nodos[k];
      if (ES_APP_FLUTTER && k > 0 && performance.now() - t0Lote > 8) { // se acabó el presupuesto del fotograma: el resto va en el siguiente
        loteNodos.unshift(...nodos.slice(k));
        if (!lotePendiente) { lotePendiente = true; requestAnimationFrame(procesarLote); }
        break;
      }
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
  despuesDeBienvenida(function () {
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
  });
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
  const FADE_LITE_ALTO_EXTRA_ABAJO = 70; // px extra hacia ARRIBA del fade lite de abajo (para que llegue a la altura del blur fade)
  // fade lite de Media y Baja: cuánto del fondo se ve en el borde de la pantalla (1 = el mensaje desaparece del todo)
  const FADE_LITE_ALFA = 0.92;        // fade de ARRIBA
  const FADE_LITE_ALFA_ABAJO = 1;     // fade de ABAJO (más opaco)
  // curva del degradado (de adentro hacia el borde): números más altos = el fondo aparece antes / más fuerte
  const FADE_LITE_CURVA = [0, 0.04, 0.12, 0.26, 0.46, 0.7, 1];             // arriba
  const FADE_LITE_CURVA_ABAJO = [0, 0.1, 0.26, 0.46, 0.68, 0.88, 1];       // abajo (sube antes: se nota más opaco)
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
      /* FADE LITE (niveles Media y Baja): SIN backdrop-filter. Es tu propio fondo de pantalla pintado encima de los mensajes con una
         máscara en degradé: los mensajes se disuelven en el fondo hacia el borde. Cada caja lleva una copia del fondo del tamaño de
         la ventana, desplazada para que coincida con el fondo real (el JS pone left/top/width/height). */
      #tg-fade-chat .tg-fade-caja > i.tg-fade-fondo { inset: auto; background: rgb(var(--tg-fade-rgb)); }
      #tg-fade-chat.tg-fade-imagen .tg-fade-caja > i.tg-fade-fondo { background: var(--tg-fade-fondo) center / cover no-repeat; }
      html[data-tema="claro"] #tg-fade-chat.tg-fade-lite { --tg-fade-rgb: 255, 255, 255; }
      /* fondo de VIDEO: cada caja copia su trozo del cuadro actual del video en un <canvas> (sin decodificar el video otra vez) */
      #tg-fade-chat .tg-fade-canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: none; pointer-events: none; }
      #tg-fade-chat.tg-fade-video .tg-fade-canvas { display: block; }
      #tg-fade-chat.tg-fade-video .tg-fade-caja > i.tg-fade-fondo { display: none; }
      /* VISTA ANGOSTA (media query de Gemini): tinte suave y chat escalado hasta topar arriba */
      @media (max-width: 959.98px) {
        #tg-fade-chat { --tg-fade-tinte: 0; }
      }
      @media print { #tg-fade-chat { display: none !important; } }
    `;
    (document.head || document.documentElement).appendChild(est);
  })();

  function crearCajaFade(clase, dir, lite) {
    const caja = document.createElement('div');
    caja.className = 'tg-fade-caja tg-fade-' + clase;
    if (lite) { // versión lite: el FONDO de pantalla con máscara en degradé (curva ease-in), sin ningún blur
      const paso = clase === 'abajo' ? FADE_LITE_CURVA_ABAJO : FADE_LITE_CURVA;
      const alfaMax = clase === 'abajo' ? FADE_LITE_ALFA_ABAJO : FADE_LITE_ALFA;
      const mascara = 'linear-gradient(to ' + dir + ', ' + paso.map((a, i) =>
        'rgba(0,0,0,' + (a * alfaMax).toFixed(3) + ') ' + Math.round(i / (paso.length - 1) * 100) + '%').join(', ') + ')';
      caja.style.cssText = 'overflow:hidden;-webkit-mask-image:' + mascara + ';mask-image:' + mascara + ';';
      const capa = document.createElement('i');
      capa.className = 'tg-fade-fondo';
      caja.appendChild(capa);
      const lienzo = document.createElement('canvas');
      lienzo.className = 'tg-fade-canvas';
      caja.appendChild(lienzo);
      return caja;
    }
    const n = FADE_CAPAS, s = 100 / (n + 1);
    const blurs = FADE_BLURS;
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

  // fade lite: coloca la copia del fondo de cada caja para que coincida con el fondo real de la ventana
  function ajustarFondoLite(raiz) {
    raiz.querySelectorAll('.tg-fade-caja').forEach((caja) => {
      const f = caja.querySelector('.tg-fade-fondo'); if (!f) return;
      const r = caja.getBoundingClientRect();
      f.style.left = (-r.left) + 'px'; f.style.top = (-r.top) + 'px';
      f.style.width = window.innerWidth + 'px'; f.style.height = window.innerHeight + 'px';
      const lz = caja.querySelector('.tg-fade-canvas'); // video: el canvas mide lo que la caja; se guarda dónde está para recortar el cuadro
      if (lz) {
        const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
        if (lz.width !== w) lz.width = w;
        if (lz.height !== h) lz.height = h;
        lz._r = { left: r.left, top: r.top, width: w, height: h };
      }
    });
  }
  // FADE LITE con fondo de VIDEO: copia en cada caja el trozo que le toca del cuadro actual del video (object-fit: cover, como el video real).
  // Se redibuja solo cuando el video tiene un cuadro nuevo (requestVideoFrameCallback) y se detiene solo si el fade o el video dejan de existir.
  function videoFondoGemini() { return document.querySelector('#tg-fondo-video video.tg-medio-video'); }
  function pintarVideoFade(raiz, v) {
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh || v.readyState < 2) return;
    const W = window.innerWidth, H = window.innerHeight;
    const esc = Math.max(W / vw, H / vh);
    const ox = (W - vw * esc) / 2, oy = (H - vh * esc) / 2;
    raiz.querySelectorAll('.tg-fade-canvas').forEach((lz) => {
      const r = lz._r; if (!r) return;
      const ctx = lz.getContext('2d'); if (!ctx) return;
      try { ctx.drawImage(v, (r.left - ox) / esc, (r.top - oy) / esc, r.width / esc, r.height / esc, 0, 0, r.width, r.height); } catch (e) { /* cuadro no disponible */ }
    });
  }
  function iniciarVideoFade(raiz) {
    if (raiz._tgVideoFade) return;
    raiz._tgVideoFade = true;
    const paso = () => {
      const v = videoFondoGemini();
      if (!raiz.isConnected || !raiz.classList.contains('tg-fade-video') || !v) { raiz._tgVideoFade = false; return; }
      if (!document.hidden) pintarVideoFade(raiz, v);
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(paso); else requestAnimationFrame(paso);
    };
    paso();
  }
  // si cambia el fondo de pantalla, el fade lite se actualiza
  document.addEventListener('tg-fondos-cambiados', () => { try { Tareas.marcar('layout'); } catch (e) { /* aún no está todo creado */ } });
  let fadeModo = null; // 'completo' (alta) | 'lite' (media y baja) | 'nada' (quitar difuminado del scroll)
  function asegurarFadeChat() {
    if (!FADE_CHAT) return;
    if (!vibesOn) { const apagado = document.getElementById('tg-fade-chat'); if (apagado) apagado.style.display = 'none'; return; }
    // alta: blur fade completo · media y baja: fade lite (degradado sin blur) · "quitar difuminado del scroll": ninguno
    const modoFade = sinFadeScroll ? 'nada' : (nivelBlur === 'alta' ? 'completo' : 'lite');
    const conFade = modoFade !== 'nada';
    if (fadeModo !== modoFade) { // cambió el modo: se reconstruyen (o se quitan) las capas del fade
      fadeModo = modoFade;
      const viejo = document.getElementById('tg-fade-chat'); if (viejo) viejo.remove();
    }
    const hist = document.querySelector('#chat-history');
    const contenido = hist && hist.closest('chat-window-content');
    let raiz = document.getElementById('tg-fade-chat');
    if (!hist || !contenido) { if (raiz) raiz.style.display = 'none'; return; }
    if (!raiz && conFade) {
      raiz = document.createElement('div');
      raiz.id = 'tg-fade-chat';
      raiz.setAttribute('aria-hidden', 'true');
      if (modoFade === 'lite') raiz.classList.add('tg-fade-lite');
      raiz.appendChild(crearCajaFade('arriba', 'top', modoFade === 'lite'));
      raiz.appendChild(crearCajaFade('abajo', 'bottom', modoFade === 'lite'));
    }
    // dentro de chat-window-content y DESPUÉS de #chat-history (encima de los mensajes, debajo de lo que va después)
    if (raiz && (raiz.parentElement !== contenido || raiz.previousElementSibling !== hist)) contenido.insertBefore(raiz, hist.nextSibling);

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

    if (!raiz) return; // "quitar difuminado del scroll": sin capas de fade
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
    // con el teclado abierto el fade termina donde EMPIEZA el teclado (lo que queda debajo no se ve) y sigue a la caja de escribir
    const kbEf = tecladoKbEf;
    const vhVis = vh - kbEf;
    let topAbajo = vhVis - (angosta ? 150 : 170);
    if (pildora) {
      const r = pildora.getBoundingClientRect();
      if (r.height > 0) topAbajo = r.top - (angosta ? 28 : 40) - (modoFade === 'lite' ? FADE_LITE_ALTO_EXTRA_ABAJO : 0);
      if (!pildora._tgFadeRO && window.ResizeObserver) { pildora._tgFadeRO = new ResizeObserver(() => Tareas.marcar('layout')); pildora._tgFadeRO.observe(pildora); }
    }
    topAbajo = Math.min(Math.max(topAbajo, topBase + 120), vhVis - 40);
    const hAbajo = Math.max(vhVis - topAbajo, 60);
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
    if (modoFade === 'lite') { // el fondo de pantalla actual (imágenes/GIF por CSS; video por <canvas>; sin fondo se usa el color del tema)
      const img = fondoGeminiTipo === 'imagen' && fondoGeminiActual ? fondoGeminiActual : '';
      const esVideo = fondoGeminiTipo === 'video' && !!videoFondoGemini();
      if (raiz.classList.contains('tg-fade-video') !== esVideo) {
        raiz.classList.toggle('tg-fade-video', esVideo);
        if (esVideo) { ajustarFondoLite(raiz); }
      }
      if (esVideo) iniciarVideoFade(raiz);
      if (raiz._tgFondo !== img) {
        raiz._tgFondo = img;
        if (img) raiz.style.setProperty('--tg-fade-fondo', 'url("' + String(img).replace(/"/g, '%22') + '")'); else raiz.style.removeProperty('--tg-fade-fondo');
        raiz.classList.toggle('tg-fade-imagen', !!img);
      }
    }
    const clave = [cr.left, topBase, cr.width, altoBase, hArriba, hAbajo, desdeAbajo, kbEf].concat(modoFade === 'lite' ? [window.innerWidth, window.innerHeight] : []).map((v) => Math.round(v * 10) / 10).join('|');
    if (raiz._tgClave === clave) return;
    raiz._tgClave = clave;
    raiz.style.setProperty('--tg-fade-h-a', hArriba + 'px');
    raiz.querySelector('.tg-fade-arriba').style.setProperty('--tg-fade-h', hArriba + 'px');
    const cajaAbajo = raiz.querySelector('.tg-fade-abajo');
    cajaAbajo.style.setProperty('--tg-fade-h', hAbajo + 'px');
    cajaAbajo.style.bottom = (desdeAbajo + kbEf) + 'px';
    raiz.style.left = cr.left + 'px'; raiz.style.top = topBase + 'px';
    raiz.style.width = cr.width + 'px'; raiz.style.height = altoBase + 'px';
    // calibración: si algún ancestro tiene transform/filter, "fixed" se mide contra él y quedaría corrido; se corrige con lo que se mide
    const rr = raiz.getBoundingClientRect();
    const dx = rr.left - cr.left, dy = rr.top - topBase;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) { raiz.style.left = (cr.left - dx) + 'px'; raiz.style.top = (topBase - dy) + 'px'; }
    if (modoFade === 'lite') ajustarFondoLite(raiz);
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
  // TECLADO (app móvil): Flutter llama window.tgSetTeclado(px) con la altura del teclado en px CSS (0 = cerrado).
  // OJO: a veces Android YA encoge el WebView por su cuenta (windowSoftInputMode adjustResize) y a veces no. Si aquí se sumara la
  // altura completa del teclado, la caja de escribir se desplazaría dos veces (quedaba pegada arriba de la pantalla). Por eso se mide
  // cuánto se encogió realmente la ventana (alturaBase - innerHeight) y solo se compensa lo que falta.
  let tecladoDart = 0;                     // altura que informa Flutter (px CSS; 0 = cerrado)
  let alturaBase = window.innerHeight;     // alto de la ventana con el teclado cerrado (solo crece; se reinicia al girar)
  let anchoBase = window.innerWidth;
  function aplicarTeclado() {
    if (window.innerWidth !== anchoBase) { anchoBase = window.innerWidth; alturaBase = window.innerHeight; } // giro de pantalla
    else if (window.innerHeight > alturaBase) alturaBase = window.innerHeight;
    const encogido = Math.max(0, alturaBase - window.innerHeight);   // lo que Android ya redujo la página
    let efectivo = Math.max(0, tecladoDart - encogido);
    if (encogido > 0 && efectivo < 40) efectivo = 0;                  // ya se ajustó sola: no se toca (el resto es barra de navegación)
    const r = document.documentElement;
    if (efectivo > 0) {
      const v = Math.round(efectivo) + 'px';
      if (r.style.getPropertyValue('--tg-teclado') !== v) r.style.setProperty('--tg-teclado', v);
      if (!r.hasAttribute('data-tg-teclado')) r.setAttribute('data-tg-teclado', '');
    } else if (r.hasAttribute('data-tg-teclado')) {
      r.removeAttribute('data-tg-teclado'); r.style.removeProperty('--tg-teclado');
    }
    try { Tareas.marcar('layout'); } catch (e) { /* aún no está todo creado */ }
  }
  window.tgSetTeclado = (px) => {
    tecladoDart = Math.max(0, Number(px) || 0);
    aplicarTeclado();
  };
  // si Android redimensiona la página (antes o después de que llegue el aviso de Flutter), se recalcula al instante
  window.addEventListener('resize', aplicarTeclado, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', aplicarTeclado, { passive: true });
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
  despuesDeBienvenida(function () {
    const est = document.createElement('style');
    est.id = 'tg-fondo-cero-style';
    est.textContent = `
      
      /* El fondo se difumina con una capa ::before DETRÁS del contenido en vez de poner el backdrop-filter en <chat-window>:
         un elemento con backdrop-filter hace que los blur de sus hijos no vean la imagen de fondo, y así la caja de escribir
         no se difuminaba en esta pantalla. isolation mantiene la capa (z-index -1) justo encima del fondo y debajo del contenido. */
      html.tg-cero chat-window { isolation: isolate !important; }
      html.tg-cero chat-window::before {
        content: '' !important; position: absolute !important; inset: 0 !important; z-index: -1 !important; pointer-events: none !important;
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
  });
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
        document.querySelectorAll('[data-tg-cero-pos]').forEach((e) => { e.removeAttribute('data-tg-cero-pos'); e.style.removeProperty('position'); });
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
    // la capa ::before es absolute: si <chat-window> está sin posicionar se pone relative (y se devuelve al salir del estado cero)
    const cw = document.querySelector('chat-window');
    if (cw && !cw.hasAttribute('data-tg-cero-pos') && getComputedStyle(cw).position === 'static') {
      cw.setAttribute('data-tg-cero-pos', '');
      cw.style.setProperty('position', 'relative');
    }
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
  despuesDeBienvenida(function () {
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
  });
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
      try { if (!cuerpoEscalado) ajustarCarruseles(document.body); } catch (e) { /* sin carruseles */ }
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

  // ============================================================================================
  // INDICADOR DE CARGA (Material 3 Expressive): una figura que rota y se transforma en el CENTRO de la pantalla
  // Aparece cuando Gemini está "cargando": barrita de progreso de arriba (mat-progress-bar / role=progressbar), puntitos de
  // "pensando" o respuesta que aún no tiene texto. Se va solo (con un fade) cuando termina. Funciona con Vibes encendido o apagado.
  // Formas, en orden (como el de Material): estallido suave > galleta de 9 > pentágono > píldora > sol > trébol de 4 > óvalo
  // ============================================================================================
  (function () {
    const TAM_PX = 64;            // tamaño del indicador
    const PASO_MS = 450;          // cuánto dura cada figura (pausa + transformación)
    const PAUSA = 0.35;           // parte del paso que se queda quieta antes de transformarse (0-1)
    const GIRO_GRADOS_S = 150;     // giro continuo (grados por segundo)
    const COLOR_CLARO = '#6750A4', COLOR_OSCURO = '#D0BCFF';
    const SELECTORES = [
      'mat-progress-bar', '[role="progressbar"]',
      '.response-container[data-tg-cargando]',
      'thinking-dots-animation:not(.response-container-header *)'
    ].join(',');
    const N = 96, TAU = Math.PI * 2;
    const norm = (f) => { const a = []; let m = 0; for (let i = 0; i < N; i++) { const r = f(i / N * TAU); a.push(r); if (r > m) m = r; } return a.map((r) => r / m); };
    const lobulos = (n, base, amp, filo) => (th) => base + amp * Math.pow((1 + Math.cos(n * th)) / 2, filo);
    const poligono = (n, red) => (th) => { const seg = TAU / n; const d = ((th % seg) + seg) % seg - seg / 2; const rp = Math.cos(Math.PI / n) / Math.cos(d); const med = (1 + Math.cos(Math.PI / n)) / 2; return rp + (med - rp) * red; };
    const elipse = (a, b, p, rot) => (th) => { const ph = th - rot; return Math.pow(Math.pow(Math.abs(Math.cos(ph) / a), p) + Math.pow(Math.abs(Math.sin(ph) / b), p), -1 / p); };
    const FORMAS = [
      lobulos(10, 0.76, 0.24, 1.8),                       // estallido suave
      (th) => 0.88 + 0.12 * Math.cos(9 * th),             // galleta de 9 lados
      poligono(5, 0.6),                                   // pentágono redondeado
      elipse(1, 0.62, 2.8, -Math.PI / 4),                 // píldora
      lobulos(8, 0.84, 0.16, 0.8),                        // sol
      (th) => 0.82 - 0.18 * Math.cos(4 * th),             // trébol de 4
      elipse(1, 0.7, 2, -0.6)                             // óvalo
    ].map(norm);
    const R = 44; // radio máximo dentro del viewBox de 100 (el resto lo suaviza el borde redondeado)
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

    const st = document.createElement('style');
    st.id = 'tg-cargando-style';
    st.textContent = `
      #tg-cargando { position: fixed; left: 50%; top: 50%; width: ${TAM_PX}px; height: ${TAM_PX}px; margin: -${TAM_PX / 2}px 0 0 -${TAM_PX / 2}px;
        z-index: 2147481000; pointer-events: none; color: ${COLOR_OSCURO}; opacity: 0; visibility: hidden; transform: scale(0.6);
        transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.2, 0, 0, 1), visibility 0s linear 0.25s; }
      html[data-tema="claro"] #tg-cargando { color: ${COLOR_CLARO}; }
      #tg-cargando.tg-on { opacity: 1; visibility: visible; transform: scale(1); transition-delay: 0s; }
      html.tg-cargando-conv .conversation-container, html.tg-cargando-conv user-query, html.tg-cargando-conv model-response { visibility: hidden !important; }
      @keyframes tgCargaGiro { to { transform: rotate(360deg); } }
      .tg-giro { animation: tgCargaGiro ${(360 / GIRO_GRADOS_S).toFixed(2)}s linear infinite; }
      @media (prefers-reduced-motion: reduce) { .tg-giro { animation: none; } }
      #tg-cargando svg { display: block; width: 100%; height: 100%; overflow: visible; will-change: transform; }
      #tg-cargando svg { filter: drop-shadow(0 4px 18px rgba(0, 0, 0, 0.55)) drop-shadow(0 0 8px rgba(0, 0, 0, 0.35)); } /* sombra en todos los niveles de blur */
    `;
    (document.head || document.documentElement).appendChild(st);

    const NS_SVG = 'http://www.w3.org/2000/svg';
    function nuevoSvg() { // sin innerHTML: Gemini usa Trusted Types y en el WebView de la app lo bloquearía
      const sv = document.createElementNS(NS_SVG, 'svg');
      sv.setAttribute('class', 'tg-giro'); sv.setAttribute('viewBox', '-50 -50 100 100'); sv.setAttribute('aria-hidden', 'true');
      const tr = document.createElementNS(NS_SVG, 'path');
      tr.setAttribute('fill', 'currentColor'); tr.setAttribute('stroke', 'currentColor'); tr.setAttribute('stroke-width', '5'); tr.setAttribute('stroke-linejoin', 'round');
      sv.appendChild(tr);
      return { sv, tr };
    }
    let raiz = null, svg = null, trazo = null;
    let visible = false, desde = 0, sinCargaDesde = 0, raf = 0, ultimoD = '', ocultoEn = 0;
    function crear() {
      raiz = document.createElement('div');
      raiz.id = 'tg-cargando';
      raiz.setAttribute('role', 'status');
      raiz.setAttribute('aria-label', 'Cargando');
      const o = nuevoSvg(); svg = o.sv; trazo = o.tr; raiz.appendChild(svg);
      document.documentElement.appendChild(raiz);
    }
    const PASOS = 12, cache = {};
    function camino(i, k) { // trazo entre la forma i y la siguiente en el paso k: se calcula UNA vez y luego sale de la caché
      const key = i * (PASOS + 1) + k;
      let d = cache[key];
      if (d) return d;
      const a = FORMAS[i], b = FORMAS[(i + 1) % FORMAS.length], e = ease(k / PASOS);
      d = '';
      for (let j = 0; j < N; j++) { const rr = (a[j] + (b[j] - a[j]) * e) * R, th = j / N * TAU; d += (j ? 'L' : 'M') + (rr * Math.cos(th)).toFixed(1) + ' ' + (rr * Math.sin(th)).toFixed(1); }
      return (cache[key] = d + 'Z');
    }
    function poner(d) { if (d !== ultimoD) { ultimoD = d; trazo.setAttribute('d', d); } }
    function cuadro(ahora) {
      raf = 0;
      if (!visible && ahora - ocultoEn > 320) return; // ya terminó el fade de salida
      const paso = (ahora - desde) / PASO_MS, idx = Math.floor(paso);
      const m = Math.min(1, Math.max(0, (paso - idx - PAUSA) / (1 - PAUSA)));
      poner(camino(idx % FORMAS.length, Math.round(m * PASOS))); // solo toca el DOM cuando la forma cambió de verdad
      raf = requestAnimationFrame(cuadro);
    }
    function mostrar() {
      if (!raiz) crear();
      try { raiz.style.setProperty('color', burbujaCSS(burbuja, false), 'important'); } catch (e) { /* sin burbuja: queda el violeta por defecto */ }
      visible = true; desde = performance.now(); sinCargaDesde = 0;
      if (sinMovimiento()) { poner(camino(2, 0)); } else if (!raf) raf = requestAnimationFrame(cuadro);
      raiz.classList.add('tg-on');
    }
    function ocultar() {
      visible = false; ocultoEn = performance.now();
      if (raiz) raiz.classList.remove('tg-on'); // la animación sigue durante el fade de salida y luego se detiene sola
    }
    function hayCarga() {
      const lista = document.querySelectorAll(SELECTORES);
      for (let i = 0; i < lista.length; i++) {
        const el = lista[i];
        if (el.closest('#tg-bloqueo, #tg-pin, #tg-personalizar-panel, #tg-cargando')) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return true;
      }
      return false;
    }
    const SEL_BARRA_CONV = 'mat-progress-bar[aria-label*="onversaci"], mat-progress-bar[aria-label*="onversation"]';
    let cargaConvDesde = 0;
    function terminarConv() {
      cargandoConv = false;
      document.documentElement.classList.remove('tg-cargando-conv');
      try { Tareas.marcar('layout'); } catch (e) { /* aún no está listo */ }
      if (loteNodos.length && !lotePendiente) { lotePendiente = true; requestAnimationFrame(procesarLote); } // ahora sí: las burbujas que llegaron mientras cargaba
    }
    function revisarConv() {
      const barra = !pantallaBloqueada && document.querySelector(SEL_BARRA_CONV);
      const hay = !!barra && barra.getBoundingClientRect().height > 0;
      const t = performance.now();
      if (hay) {
        if (!cargaConvDesde) cargaConvDesde = t;
        const vencido = t - cargaConvDesde >= 8000; // seguro: si la barra se queda pegada, a los 8 s se muestra todo igual
        if (!vencido && !cargandoConv) { cargandoConv = true; document.documentElement.classList.add('tg-cargando-conv'); }
        else if (vencido && cargandoConv) terminarConv();
      } else if (cargaConvDesde) { cargaConvDesde = 0; if (cargandoConv) terminarConv(); }
    }
    function revisar() {
      // no depende del lote de mutaciones (en el móvil llega tarde): se marca aquí mismo la respuesta que aún no tiene texto
      try { if (!cargandoConv) marcarCargandoRespuesta(); } catch (e) { /* sin respuestas todavía */ }
      const hay = !pantallaBloqueada && hayCarga();
      const t = performance.now();
      if (hay) { sinCargaDesde = 0; if (!visible) mostrar(); }
      else if (visible) {
        if (!sinCargaDesde) sinCargaDesde = t;
        if (pantallaBloqueada || (t - sinCargaDesde >= 300 && t - desde >= 700)) ocultar(); // nunca parpadea: mínimo 0,7 s visible
      }
    }
    // misma figura animada pero dentro de cualquier contenedor (botón de actualizaciones): usa el color del texto (currentColor)
    function montar(cont) {
      if (cont._tgSpin) return;
      const o = nuevoSvg(); o.sv.style.cssText = 'width:100%;height:100%;display:block;overflow:visible'; cont.appendChild(o.sv);
      const sv = o.sv, tr = o.tr, t0 = performance.now(), quieto = sinMovimiento();
      const pintar = (ahora) => {
        const paso = (ahora - t0) / PASO_MS, idx = Math.floor(paso);
        const m = Math.min(1, Math.max(0, (paso - idx - PAUSA) / (1 - PAUSA)));
        const d = camino(idx % FORMAS.length, Math.round(m * PASOS));
        if (tr._d !== d) { tr._d = d; tr.setAttribute('d', d); }
      };
      const bucle = (ahora) => { if (!cont._tgSpin) return; pintar(ahora); cont._tgSpin = requestAnimationFrame(bucle); };
      if (quieto) { pintar(t0 + PASO_MS * 2.2); cont._tgSpin = -1; } else cont._tgSpin = requestAnimationFrame(bucle);
    }
    function parar(cont) { if (!cont._tgSpin) return; if (cont._tgSpin > 0) cancelAnimationFrame(cont._tgSpin); cont._tgSpin = 0; cont.textContent = ''; }
    tgForma = { montar, parar };
    cada(revisar, 200);
    cada(revisarConv, 100);
  })();

  // ============================================================================================
  // PANEL INMERSIVO (cuestionarios, etc.) EN EL MÓVIL
  // Arranca debajo de la zona segura (barra de estado + botones de arriba de Gemini) y todo lo de arriba se rellena con el gris SÓLIDO del propio panel
  // ============================================================================================
  (function () {
    const raiz = document.documentElement;
    // lo que queda DETRÁS del panel y se ve a través del blur: se vuelve transparente (quita de la lista lo que quieras que se siga viendo)
    const OCULTAR_DETRAS = ['chat-window input-container', '#tg-fade-chat', 'chat-window .lm-glow', 'chat-window .autosuggest-scrim'];
    const OCULTAR_CSS = OCULTAR_DETRAS.map((x) => 'html.tg-panel-seguro ' + x).join(', ') + ' { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.2s ease !important; }';
    const st = document.createElement('style');
    st.id = 'tg-panel-seguro-style';
    st.textContent = `
      html.tg-panel-seguro immersive-panel,
      html.tg-panel-seguro immersive-panel learning-immersive-panel { background-color: var(--tg-panel-gris) !important; }
      html.tg-panel-seguro immersive-panel .outer-container {
        padding-top: var(--tg-panel-top, 120px) !important; box-sizing: border-box !important; background-color: var(--tg-panel-gris) !important;
      }
      ${OCULTAR_CSS}
      /* el brillo de fondo (.lm-glow) no se ve: se quita del todo con el panel abierto */
      html.tg-panel-seguro chat-window .lm-glow, html.tg-panel-seguro chat-window .lm-glow *, chat-window.immersives-mode .lm-glow, chat-window.immersives-mode .lm-glow * {
        display: none !important; background: transparent !important; box-shadow: none !important; filter: none !important; opacity: 0 !important;
      }
      /* la barra de arriba del panel: sin fondo ni sombra ni blur (los iconos siguen visibles) */
      html.tg-panel-seguro immersive-panel toolbar, html.tg-panel-seguro immersive-panel toolbar .toolbar,
      html.tg-panel-seguro immersive-panel toolbar .left-panel, html.tg-panel-seguro immersive-panel toolbar .action-buttons {
        background: transparent !important; box-shadow: none !important; border: 0 !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
      }
      /* iconos de la barra del panel (cerrar, compartir): fondo redondeado suave, del color del propio icono */
      html.tg-panel-seguro immersive-panel .toolbar .mdc-icon-button {
        background-color: color-mix(in srgb, currentColor 14%, transparent) !important; border-radius: 9999px !important;
      }
      /* tooltips mientras el panel está abierto: cristal translúcido con blur (no puede ser 100 % transparente o no se leería) */
      html.tg-panel-seguro .mdc-tooltip__surface, html.tg-panel-seguro .mat-mdc-tooltip .mdc-tooltip__surface,
      html.tg-panel-seguro gem-tooltip, html.tg-panel-seguro .gem-tooltip, html.tg-panel-seguro [role="tooltip"] {
        background-color: rgba(30, 30, 32, 0.35) !important; -webkit-backdrop-filter: blur(8px) !important; backdrop-filter: blur(8px) !important; box-shadow: none !important;
      }
      /* el propio <chat-window> en modo inmersivo trae background-color: var(--gem-sys-color--surface): en nivel ALTA queda transparente */
      html.tg-panel-seguro:not(.tg-blur-baja):not(.tg-blur-media) chat-window.immersives-mode, html.tg-panel-seguro:not(.tg-blur-baja):not(.tg-blur-media) chat-window.lm-canvas-styling {
        background: transparent !important; background-color: transparent !important; box-shadow: none !important;
      }
      /* nivel de blur ALTA: fondo transparente con blur de 12px y brillo 0.85 (en media y baja se queda el gris sólido) */
      html.tg-panel-seguro:not(.tg-blur-baja):not(.tg-blur-media) immersive-panel,
      html.tg-panel-seguro:not(.tg-blur-baja):not(.tg-blur-media) immersive-panel learning-immersive-panel,
      html.tg-panel-seguro:not(.tg-blur-baja):not(.tg-blur-media) immersive-panel .outer-container { background-color: transparent !important; }
      /* fondos que Gemini pone en capas internas (los detecta ajustar()): también transparentes; el blur va en UNA sola capa que cubre el panel */
      html.tg-panel-seguro:not(.tg-blur-baja):not(.tg-blur-media) [data-tg-panel-fondo] { background: transparent !important; }
      /* el blur (12px + brightness 0.85) va en una capa APARTE (::before) y no en el propio panel: un backdrop-filter en el panel impide que los botones de dentro difuminen el fondo */
      html.tg-panel-seguro:not(.tg-blur-baja):not(.tg-blur-media) [data-tg-panel-blur] { isolation: isolate !important; }
      html.tg-panel-seguro:not(.tg-blur-baja):not(.tg-blur-media) [data-tg-panel-blur]::before {
        content: '' !important; position: fixed !important; inset: 0 0 0 calc(var(--tg-panel-l, 0px) - var(--tg-fade-out, 0px)) !important; z-index: -1 !important; pointer-events: none !important;
        -webkit-backdrop-filter: blur(12px) brightness(0.85) !important; backdrop-filter: blur(24px) brightness(0.7) !important;
      }
      html.tg-panel-seguro.tg-ancho:not(.tg-blur-baja):not(.tg-blur-media) [data-tg-panel-blur]::before {
        -webkit-mask-image: linear-gradient(to right, transparent 0, #000 var(--tg-fade, 0px)) !important; mask-image: linear-gradient(to right, transparent 0, #000 var(--tg-fade, 0px)) !important;
      }
      /* botones del panel (opciones, Pista, Atrás, Siguiente, iconos): fondo con blur, solo en nivel ALTA */
      html.tg-panel-seguro:not(.tg-blur-baja):not(.tg-blur-media) immersive-panel button { -webkit-backdrop-filter: blur(10px) !important; backdrop-filter: blur(10px) !important; }
      /* sombra en TODOS los textos del panel (todos los niveles) para que se lean sobre cualquier fondo */
      /* ===== REDISEÑO DE LOS MENÚS INTERACTIVOS (cuestionarios) ===== */
      /* textos: sin halo ni "tarjetita"; solo una sombra fina para leerse sobre el fondo */
      html.tg-panel-seguro immersive-panel * { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6); }
      html[data-tema="claro"].tg-panel-seguro immersive-panel * { text-shadow: 0 1px 2px rgba(255, 255, 255, 0.7); }
      html.tg-panel-seguro immersive-panel button * { text-shadow: none; }
      html.tg-panel-seguro immersive-panel :is(.question, .question-container, .question-text-container, structured-content-container, message-content, .markdown, activity-set, .scroll-container) {
        background: transparent !important; background-color: transparent !important; box-shadow: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
      }
      /* entrada: desde la izquierda con opacidad, uno por uno (solo transform + opacity) */
      @keyframes tgQEntra { from { opacity: 0; transform: translate3d(48px, 0, 0); } to { opacity: 1; transform: none; } }
      html.tg-panel-seguro immersive-panel .option-container,
      html.tg-panel-seguro immersive-panel .hint-button-container gem-button,
      html.tg-panel-seguro immersive-panel .navigation-buttons-container gem-button { animation: tgQEntra 560ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }
      html.tg-panel-seguro immersive-panel .option-container:nth-child(2) { animation-delay: 70ms; }
      html.tg-panel-seguro immersive-panel .option-container:nth-child(3) { animation-delay: 140ms; }
      html.tg-panel-seguro immersive-panel .option-container:nth-child(4) { animation-delay: 210ms; }
      html.tg-panel-seguro immersive-panel .option-container:nth-child(n+5) { animation-delay: 280ms; }
      html.tg-panel-seguro immersive-panel .hint-button-container gem-button { animation-delay: 280ms; }
      html.tg-panel-seguro immersive-panel .navigation-buttons-container gem-button:nth-child(1) { animation-delay: 350ms; }
      html.tg-panel-seguro immersive-panel .navigation-buttons-container gem-button:nth-child(2) { animation-delay: 420ms; }
      @media (prefers-reduced-motion: reduce) { html.tg-panel-seguro immersive-panel :is(.option-container, gem-button) { animation: none !important; } }
      /* botones: mismo fondo que las burbujas de Gemini */
      html.tg-panel-seguro immersive-panel button.option,
      html.tg-panel-seguro immersive-panel .hint-button-container button,
      html.tg-panel-seguro immersive-panel .navigation-buttons-container button.mat-tonal-button {
        background: var(--tg-resp-bg, rgba(0, 0, 0, 0.8)) !important; background-color: var(--tg-resp-bg, rgba(0, 0, 0, 0.8)) !important;
        color: var(--tg-texto, #fff) !important; border: 0 !important; border-radius: 18px !important; box-shadow: none !important;
        -webkit-backdrop-filter: blur(8px) !important; backdrop-filter: blur(8px) !important;
        transition: background-color 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease !important;
      }
      html.tg-panel-seguro immersive-panel button.option * { color: inherit !important; }
      html.tg-panel-seguro immersive-panel .hint-button-container button, html.tg-panel-seguro immersive-panel .navigation-buttons-container button { border-radius: 9999px !important; }
      html.tg-panel-seguro immersive-panel .navigation-buttons-container button:disabled { opacity: 0.45 !important; }
      html.tg-panel-seguro immersive-panel .navigation-buttons-container button.mdc-button--unelevated:not(.mat-tonal-button) {
        background: var(--tg-q-acento, #0059ff) !important; background-color: var(--tg-q-acento, #0059ff) !important;
        color: var(--tg-q-acento-texto, #fff) !important; border-radius: 9999px !important; box-shadow: none !important;
      }
      html.tg-panel-seguro immersive-panel .navigation-buttons-container button.mdc-button--unelevated:not(.mat-tonal-button) * { color: inherit !important; text-shadow: none; }
      /* opción correcta: se ilumina con el color de TU burbuja */
      html.tg-panel-seguro immersive-panel button.option[data-tg-q="ok"] {
        background: var(--tg-q-acento, #0059ff) !important; background-color: var(--tg-q-acento, #0059ff) !important;
        color: var(--tg-q-acento-texto, #fff) !important;
        box-shadow: 0 0 22px color-mix(in srgb, var(--tg-q-acento, #0059ff) 60%, transparent), inset 0 0 0 1px rgba(255, 255, 255, 0.25) !important;
      }
      html.tg-panel-seguro immersive-panel button.option[data-tg-q="no"] { box-shadow: inset 0 0 0 1.5px rgba(255, 107, 107, 0.6) !important; }
      html.tg-panel-seguro immersive-panel button.option [data-tg-q-badge] { border-radius: 9999px !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
      html.tg-panel-seguro immersive-panel button.option[data-tg-q="ok"] [data-tg-q-badge] { background: rgba(255, 255, 255, 0.25) !important; color: inherit !important; }
      html.tg-panel-seguro immersive-panel button.option[data-tg-q="ok"] [data-tg-q-badge] * { color: inherit !important; }
      /* toolbar: botones redondos como los de arriba, pero más pequeños */
      html.tg-panel-seguro immersive-panel .toolbar .mdc-icon-button {
        width: 36px !important; height: 36px !important; padding: 0 !important; border-radius: 50% !important;
        display: inline-flex !important; align-items: center !important; justify-content: center !important; overflow: hidden !important;
        background: var(--tg-input-bg, rgba(0, 0, 0, 0.55)) !important; background-color: var(--tg-input-bg, rgba(0, 0, 0, 0.55)) !important;
        -webkit-backdrop-filter: blur(10px) !important; backdrop-filter: blur(10px) !important; box-shadow: none !important;
      }
      html.tg-panel-seguro immersive-panel .toolbar .mdc-icon-button :is(mat-icon, gem-icon) { width: 20px !important; height: 20px !important; font-size: 20px !important; color: var(--tg-texto, #fff) !important; }
      /* barra de progreso: segmentos translúcidos; los hechos y el actual toman el color de tu burbuja */
      html.tg-panel-seguro immersive-panel .progress-bar-step-container { display: flex !important; flex-wrap: wrap !important; align-items: center !important; gap: 10px 8px !important; }
      html.tg-panel-seguro immersive-panel .progress-bar-step-list { display: flex !important; flex: 1 1 100% !important; gap: 4px !important; margin: 0 !important; padding: 0 !important; list-style: none !important; }
      html.tg-panel-seguro immersive-panel .progress-bar-step-list-item { flex: 1 1 0 !important; min-width: 0 !important; }
      html.tg-panel-seguro immersive-panel .progress-bar-step-unit-container { width: 100% !important; padding: 6px 0 !important; background: transparent !important; border: 0 !important; }
      html.tg-panel-seguro immersive-panel .progress-bar-step-unit {
        height: 6px !important; width: 100% !important; border-radius: 9999px !important; background: rgba(255, 255, 255, 0.22) !important; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12) !important;
        transition: background-color 0.3s ease, box-shadow 0.3s ease !important;
      }
      html[data-tema="claro"].tg-panel-seguro immersive-panel .progress-bar-step-unit { background: rgba(0, 0, 0, 0.18) !important; }
      html.tg-panel-seguro immersive-panel .progress-bar-step-list-item:has(~ .progress-bar-step-list-item .progress-bar-step-unit.current) .progress-bar-step-unit {
        background: color-mix(in srgb, var(--tg-q-acento, #0059ff) 60%, transparent) !important;
      }
      html.tg-panel-seguro immersive-panel .progress-bar-step-unit.current {
        background: var(--tg-q-acento, #0059ff) !important; box-shadow: 0 0 10px color-mix(in srgb, var(--tg-q-acento, #0059ff) 70%, transparent) !important;
      }
      html.tg-panel-seguro immersive-panel .progress-bar-step-indicator-container { margin-right: auto !important; }
      html.tg-panel-seguro immersive-panel .progress-bar-step-indicator-container, html.tg-panel-seguro immersive-panel .progress-steps-container { background: transparent !important; position: static !important; }
      html.tg-panel-seguro immersive-panel .score-container { display: flex !important; gap: 8px !important; margin: 0 !important; position: static !important; }
      html.tg-panel-seguro immersive-panel .score-item-container {
        display: inline-flex !important; align-items: center !important; gap: 4px !important; padding: 4px 12px !important; border-radius: 9999px !important;
        -webkit-backdrop-filter: blur(8px) !important; backdrop-filter: blur(8px) !important;
      }
      html.tg-panel-seguro immersive-panel .score-item-incorrect { background: rgba(255, 107, 107, 0.45) !important; }
      html.tg-panel-seguro immersive-panel .score-item-correct { background: rgba(120, 220, 140, 0.45) !important; }
      /* ===== OPTIMIZACIÓN + NUEVO LAYOUT ===== */
      html.tg-panel-seguro.tg-panel-seguro immersive-panel :is(button, .score-item-container, .toolbar .mdc-icon-button) {
        -webkit-backdrop-filter: none !important; backdrop-filter: none !important; will-change: auto !important;
        touch-action: manipulation !important; -webkit-tap-highlight-color: transparent !important;
      }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel button.option,
      html.tg-panel-seguro.tg-panel-seguro immersive-panel .hint-button-container button,
      html.tg-panel-seguro.tg-panel-seguro immersive-panel .navigation-buttons-container button.mat-tonal-button {
        background: rgba(0, 0, 0, 0.82) !important; background-color: rgba(0, 0, 0, 0.82) !important; transition: transform 0.1s ease !important;
      }
      html[data-tema="claro"].tg-panel-seguro.tg-panel-seguro immersive-panel button.option { background: rgba(255, 255, 255, 0.85) !important; background-color: rgba(255, 255, 255, 0.85) !important; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel button.option[data-tg-q="ok"] { background: var(--tg-q-acento, #0059ff) !important; background-color: var(--tg-q-acento, #0059ff) !important; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel button:active { transform: scale(0.97) !important; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel * { text-shadow: none; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel :is(.question-text-container, .question-number, .progress-status) { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6); }
      html[data-tema="claro"].tg-panel-seguro.tg-panel-seguro immersive-panel :is(.question-text-container, .question-number, .progress-status) { text-shadow: 0 1px 2px rgba(255, 255, 255, 0.7); }
      @keyframes tgQEntraA { from { opacity: 0; transform: translate3d(48px, 0, 0); } to { opacity: 1; transform: none; } }
      @keyframes tgQEntraB { from { opacity: 0; transform: translate3d(48px, 0, 0); } to { opacity: 1; transform: none; } }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel[data-tg-q-run="a"] :is(.option-container, .hint-button-container gem-button, .navigation-buttons-container gem-button) { animation-name: tgQEntraA !important; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel[data-tg-q-run="b"] :is(.option-container, .hint-button-container gem-button, .navigation-buttons-container gem-button) { animation-name: tgQEntraB !important; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel .outer-container { position: relative !important; padding-top: calc(var(--tg-panel-top, 64px) + 110px) !important; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel toolbar [data-tg-tit] { visibility: hidden !important; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel toolbar {
        position: absolute !important; top: calc(var(--tg-panel-top, 64px) + 14px) !important; left: 0 !important; right: 0 !important; height: 44px !important;
        display: block !important; z-index: 6 !important; visibility: visible !important; opacity: 1 !important; pointer-events: none !important;
      }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel toolbar .toolbar { display: flex !important; justify-content: space-between !important; align-items: center !important; height: 44px !important; padding: 0 10px !important; box-sizing: border-box !important; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel toolbar :is(.left-panel, .action-buttons) { display: flex !important; align-items: center !important; pointer-events: auto !important; visibility: visible !important; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel progress-bar {
        position: fixed !important; top: calc(var(--tg-bar-t, 64px) + 14px) !important; left: var(--tg-bar-l, 60px) !important; right: var(--tg-bar-r, 60px) !important; width: auto !important; height: 44px !important;
        display: flex !important; align-items: center !important; z-index: 5 !important; margin: 0 !important; padding: 0 !important; box-sizing: border-box !important;
      }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel .progress-bar-step-container { display: flex !important; flex-wrap: nowrap !important; align-items: center !important; gap: 8px !important; width: 100% !important; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel .progress-bar-step-list { flex: 1 1 0 !important; min-width: 0 !important; order: 1 !important; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel .progress-bar-step-indicator-container { order: 0 !important; flex: none !important; margin: 0 !important; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel .progress-status { font-size: 12px !important; white-space: nowrap !important; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel .score-container {
        position: fixed !important; left: var(--tg-panel-l, 0px) !important; right: 0 !important; top: calc(var(--tg-bar-t, 64px) + 60px) !important;
        justify-content: center !important; z-index: 3 !important; pointer-events: none !important;
      }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel .question-number { text-align: center !important; display: block !important; width: 100% !important; }
      html.tg-panel-seguro.tg-panel-seguro immersive-panel .action-buttons-container { padding-bottom: calc(44px + env(safe-area-inset-bottom, 0px)) !important; box-sizing: border-box !important; }
      /* ===== BAJA y MEDIA: fondo del menú negro semitransparente 0.5, SIN blur ===== */
      html.tg-panel-seguro:is(.tg-blur-baja, .tg-blur-media) chat-window.immersives-mode, html.tg-panel-seguro:is(.tg-blur-baja, .tg-blur-media) chat-window.lm-canvas-styling { background: transparent !important; background-color: transparent !important; }
      html.tg-panel-seguro.tg-panel-seguro:is(.tg-blur-baja, .tg-blur-media) :is(learning-immersive-panel, .outer-container, [data-tg-panel-fondo]) { background: transparent !important; background-color: transparent !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
      html.tg-panel-seguro.tg-panel-seguro:is(.tg-blur-baja, .tg-blur-media) immersive-panel { background: transparent !important; background-color: transparent !important; isolation: isolate !important; }
      html.tg-panel-seguro.tg-panel-seguro:is(.tg-blur-baja, .tg-blur-media) immersive-panel::before {
        content: '' !important; position: fixed !important; inset: 0 0 0 var(--tg-panel-l, 0px) !important; z-index: -1 !important; pointer-events: none !important;
        background: rgba(0, 0, 0, 0.5) !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
      }
      /* MEDIA: blur SOLO en las opciones de respuesta (capa propia, sin transición de blur, toque inmediato) */
      html.tg-panel-seguro.tg-panel-seguro.tg-blur-media immersive-panel button.option {
        -webkit-backdrop-filter: blur(8px) !important; backdrop-filter: blur(8px) !important; background: rgba(0, 0, 0, 0.55) !important; background-color: rgba(0, 0, 0, 0.55) !important;
        transform: translateZ(0); contain: layout paint style !important; touch-action: manipulation !important; transition: transform 0.1s ease !important;
      }
      html.tg-panel-seguro.tg-panel-seguro.tg-blur-media immersive-panel button.option[data-tg-q=\"ok\"] { background: var(--tg-q-acento, #0059ff) !important; background-color: var(--tg-q-acento, #0059ff) !important; }
    `;
    (document.head || document.documentElement).appendChild(st);
    let activo = false, ultTop = -1, ultMarcado = 0;
    let ultAcento = '';
    // marca cada opción como correcta ('ok') o incorrecta ('no') según la etiqueta que Gemini le pone, y marca esa etiqueta
    function marcarOpciones(panel) {
      panel.querySelectorAll('button.option').forEach((b) => {
        const c = b.classList, s = (c.contains('revealed-correct') || c.contains('answered-correct')) ? 'ok' : c.contains('answered-incorrect') ? 'no' : '';
        if ((b.getAttribute('data-tg-q') || '') !== s) { if (s) b.setAttribute('data-tg-q', s); else b.removeAttribute('data-tg-q'); }
        if (s) { const bd = b.querySelector('.option-badge'); if (bd && !bd.hasAttribute('data-tg-q-badge')) bd.setAttribute('data-tg-q-badge', ''); }
      });
      const nq = panel.querySelector('.question-number'), tq = nq ? nq.textContent : '';
      if (tq !== panel._tgQN) {
        panel._tgQN = tq;
      }
      // entrada: desde la derecha, uno por uno, con fade (Web Animations; se repite en cada pregunta)
      const ops = panel.querySelectorAll('.option-container');
      const clave = tq + '|' + ops.length;
      if (ops.length && clave !== panel._tgQK) {
        panel._tgQK = clave;
        const els = Array.prototype.slice.call(ops).concat(Array.prototype.slice.call(panel.querySelectorAll('.hint-button-container gem-button, .navigation-buttons-container gem-button')));
        els.forEach((el, i) => {
          try { el.animate([{ opacity: 0, transform: 'translate3d(70px,0,0)' }, { opacity: 1, transform: 'translate3d(0,0,0)' }], { duration: 520, delay: i * 90, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' }); } catch (e) { /* sin WAAPI */ }
        });
      }
    }
    function marcarOpcionesViejo(panel) {
      panel.querySelectorAll('button.option').forEach((b) => {
        let badge = null, s = '';
        const hijos = b.querySelectorAll('*');
        for (let i = 0; i < hijos.length; i++) {
          const t = hijos[i].textContent || '';
          if (t.length < 32 && /^\s*(Respuesta correcta|Correct answer|Incorrectas?|Incorrect)\s*$/i.test(t)) { badge = hijos[i]; s = /^\s*(Respuesta correcta|Correct)/i.test(t) ? 'ok' : 'no'; break; }
        }
        if (badge && !badge.hasAttribute('data-tg-q-badge')) badge.setAttribute('data-tg-q-badge', '');
        if (b.getAttribute('data-tg-q') !== s) { if (s) b.setAttribute('data-tg-q', s); else b.removeAttribute('data-tg-q'); }
      });
    }
    // marca las capas grandes con fondo propio (el gris sólido puede venir de cualquiera) y elige UNA que cubra el panel para el blur
    function marcar(panel) {
      const pr = panel.getBoundingClientRect(), area = Math.max(1, pr.width * pr.height);
      const lista = [panel].concat(Array.prototype.slice.call(panel.querySelectorAll('*'), 0, 400));
      for (let i = 0; i < lista.length; i++) {
        const e = lista[i];
        if (e.hasAttribute('data-tg-panel-fondo')) continue;
        const r = e.getBoundingClientRect();
        if (r.width * r.height < area * 0.35) continue;
        const cs = getComputedStyle(e), c = (cs.backgroundColor || '').match(/[\d.]+/g) || [];
        if ((c.length >= 3 && (c.length < 4 || parseFloat(c[3]) > 0.05)) || (cs.backgroundImage && cs.backgroundImage !== 'none')) e.setAttribute('data-tg-panel-fondo', '');
      }
      const cand = [panel, panel.querySelector('learning-immersive-panel'), panel.querySelector('.outer-container')].filter(Boolean);
      const cubre = (e) => { const r = e.getBoundingClientRect(); return r.height >= innerHeight * 0.7 && r.width >= innerWidth * 0.9; };
      const objetivo = cand.find(cubre) || panel;
      cand.forEach((e) => { if (e === objetivo) e.setAttribute('data-tg-panel-blur', ''); else e.removeAttribute('data-tg-panel-blur'); });
    }
    // primer fondo casi opaco hacia arriba desde el elemento, forzado a sólido (sin transparencia)
    function colorSolido(el) {
      for (let e = el; e; e = e.parentElement) {
        const n = (getComputedStyle(e).backgroundColor || '').match(/[\d.]+/g);
        if (n && n.length >= 3 && (n.length < 4 || parseFloat(n[3]) > 0.6)) return 'rgb(' + n[0] + ', ' + n[1] + ', ' + n[2] + ')';
      }
      return raiz.getAttribute('data-tema') === 'claro' ? '#f4f4f6' : '#1c1b1d';
    }
    // borde de abajo de los botones de Gemini (menú, selector de modelo...) + un respiro; nunca menos que la zona segura + 56px
    function techo() {
      if (!ES_APP_FLUTTER) return window.innerWidth / Math.max(1, window.innerHeight) > 1.3 ? 16 : 64;
      let b = 0;
      document.querySelectorAll('top-bar-actions button').forEach((x) => { const r = x.getBoundingClientRect(); if (r.height > 0 && r.top < 260 && r.bottom > b) b = r.bottom; });
      const seg = (parseFloat(raiz.style.getPropertyValue('--tg-safe-top')) || 0) + 56;
      const AJUSTE_PX = -14; // respiro bajo los botones de Gemini: negativo = más arriba, positivo = más abajo
      return Math.round(Math.max(b, seg) + AJUSTE_PX);
    }
    function ajustar() {
      const panel = document.querySelector('immersive-panel');
      if (!panel) { if (activo) { activo = false; raiz.classList.remove('tg-panel-seguro'); } return; }
      const t = techo();
      if (t !== ultTop) { ultTop = t; raiz.style.setProperty('--tg-panel-top', t + 'px'); }
      if (!activo) {
        activo = true;
        raiz.classList.remove('tg-panel-seguro'); // se mide el gris ORIGINAL del panel antes de aplicar nuestras reglas
        raiz.style.setProperty('--tg-panel-gris', colorSolido(panel.querySelector('.outer-container') || panel));
        raiz.classList.add('tg-panel-seguro');
      }
      try {
        const pr = panel.getBoundingClientRect(), ancho = window.innerWidth / Math.max(1, window.innerHeight) > 1.3 && pr.left > 100;
        const pl = ancho ? Math.round(pr.left) : 0, fd = ancho ? '220px' : '0px';
        raiz.classList.toggle('tg-ancho', !!ancho);
        if (panel._tgPL !== pl) { panel._tgPL = pl; raiz.style.setProperty('--tg-panel-l', pl + 'px'); raiz.style.setProperty('--tg-fade', fd); raiz.style.setProperty('--tg-fade-out', ancho ? '110px' : '0px'); }
        const T = panel.querySelector('toolbar');
        const bs = Array.from(panel.querySelectorAll('toolbar button')).map((x) => x.getBoundingClientRect()).filter((r) => r.width > 0);
        if (T && bs.length) {
          const mid = pr.left + pr.width / 2;
          const L = bs.filter((r) => r.left + r.width / 2 < mid), R = bs.filter((r) => r.left + r.width / 2 >= mid);
          const a = L.length ? L.reduce((m, r) => Math.max(m, r.right), 0) + 10 : pr.left + 24;
          const c = R.length ? R.reduce((m, r) => Math.min(m, r.left), 1e9) : pr.right - 24;
          const v = [Math.round(bs[0].top + bs[0].height / 2 - 22) + 'px', Math.round(a) + 'px', Math.round(window.innerWidth - c + 10) + 'px'];
          if (v.join() !== panel._tgBar) { panel._tgBar = v.join(); raiz.style.setProperty('--tg-bar-t', v[0]); raiz.style.setProperty('--tg-bar-l', v[1]); raiz.style.setProperty('--tg-bar-r', v[2]); }
          T.querySelectorAll('*').forEach((e) => { if (!e.children.length && !e.closest('button') && !e.hasAttribute('data-tg-tit') && (e.textContent || '').trim().length > 3) { e.setAttribute('data-tg-tit', ''); } });
        }
      } catch (e) {}
      try {
        const ac = burbujaCSS(burbuja, false);
        if (ac !== ultAcento) { ultAcento = ac; raiz.style.setProperty('--tg-q-acento', ac); raiz.style.setProperty('--tg-q-acento-texto', burbujaTexto(burbuja)); }
        marcarOpciones(panel);
      } catch (e) { /* sin burbuja aún */ }
      const ahora = performance.now();
      if (ahora - ultMarcado > 3000) { ultMarcado = ahora; marcar(panel); } // el contenido cambia (siguiente pregunta, respuestas): se revisa cada segundo
    }
    cada(ajustar, 250);
  })();

  revisarTemaBody();
  try { actualizarVarSafeTop(); } catch (e) { /* sin área segura */ }
  aplicarVibes(); // deja todo en el estado guardado (encendido/apagado) una vez creadas todas las hojas de estilo
})();