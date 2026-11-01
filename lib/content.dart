import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

// =============================================================================
// ALMACÉN DE PREFERENCIAS (puente con content.js)
//
// Por qué se crasheaba:
//  - SharedPreferences en Android es UN solo XML que se carga ENTERO en memoria al hacer getInstance().
//    Ahí se estaba guardando el script (~240 KB) y, con el puente de content.js, también las imágenes de fondo
//    (data URL de varios MB). Con eso el XML crece, cada escritura lo reescribe completo y el arranque termina
//    en OOM / ANR / crash.
//  - Aquí: lo pequeño (burbuja, tema, PIN, interruptor del bloqueo...) va a SharedPreferences y lo GRANDE
//    (fondos en data URL y el script en caché) va a archivos en el directorio de la app.
// =============================================================================
class AlmacenPrefs {
  AlmacenPrefs._();
  static final AlmacenPrefs instancia = AlmacenPrefs._();

  // Claves que content.js puede mandar (el resto se ignora)
  static const Set<String> clavesValidas = {
    'geminiFondo',
    'geminiFondoTipo',
    'geminiFondoBloqueo',
    'geminiFondoBloqueoTipo',
    'geminiTema',
    'geminiPinBloqueo',
    'geminiBurbuja',
    'geminiBloqueoActivo',
    // ajustes que content.js ya enviaba y aquí se descartaban (se perdían al reiniciar la app)
    'geminiVibesActivo',
    'geminiBlurNivel',
    'geminiSinFade',
    'geminiLenis',
  };

  static const String _prefijo = 'tg_';
  static const int _umbralArchivo =
      64 * 1024; // más de 64 KB -> archivo, no SharedPreferences

  late SharedPreferences _sp;
  late Directory _dir;
  bool _listo = false;

  // Cola: las escrituras se hacen una tras otra (evita carreras y archivos a medio escribir)
  Future<void> _cola = Future.value();

  Future<void> init() async {
    if (_listo) return;
    _sp = await SharedPreferences.getInstance();
    final base = await getApplicationSupportDirectory();
    _dir = Directory('${base.path}/tg_prefs');
    if (!await _dir.exists()) await _dir.create(recursive: true);
    // limpieza: el script ya no se guarda en SharedPreferences (esa clave vieja pesaba ~240 KB en el XML)
    if (_sp.containsKey('cached_content_script')) {
      await _sp.remove('cached_content_script');
    }
    _listo = true;
  }

  File _archivo(String clave) => File('${_dir.path}/$_prefijo$clave.json');

  /// Espera a que terminen todas las escrituras pendientes.
  Future<void> vaciar() => _cola;

  /// Lee todo lo guardado -> Map listo para `window.TG_PREFS_INICIALES`
  Future<Map<String, dynamic>> leerTodo() async {
    final out = <String, dynamic>{};
    for (final clave in clavesValidas) {
      try {
        String? json = _sp.getString('$_prefijo$clave');
        if (json == null) {
          final f = _archivo(clave);
          if (await f.exists()) json = await f.readAsString();
        }
        if (json != null && json.isNotEmpty) out[clave] = jsonDecode(json);
      } catch (e) {
        // un valor corrupto no debe tumbar la app: se descarta
        debugPrint('[tg] pref "$clave" ilegible, se descarta: $e');
        await _borrarSeguro(clave);
      }
    }
    return out;
  }

  /// Guarda (o borra si valor == null) una preferencia. Nunca lanza excepciones.
  Future<void> guardar(String clave, dynamic valor) {
    if (!clavesValidas.contains(clave)) return Future.value();
    _cola = _cola.then((_) async {
      try {
        if (valor == null) {
          await _borrarSeguro(clave);
          return;
        }
        final json = jsonEncode(valor); // bool, String, Map, num -> JSON
        if (json.length > _umbralArchivo) {
          // grande: archivo (escritura atómica: temporal + rename)
          final destino = _archivo(clave);
          final tmp = File('${destino.path}.tmp');
          await tmp.writeAsString(json, flush: true);
          await tmp.rename(destino.path);
          await _sp.remove('$_prefijo$clave');
        } else {
          await _sp.setString('$_prefijo$clave', json);
          final f = _archivo(clave);
          if (await f.exists()) await f.delete();
        }
      } catch (e) {
        debugPrint('[tg] no se pudo guardar "$clave": $e');
      }
    });
    return _cola;
  }

  Future<void> _borrarSeguro(String clave) async {
    try {
      await _sp.remove('$_prefijo$clave');
      final f = _archivo(clave);
      if (await f.exists()) await f.delete();
    } catch (_) {}
  }

  // ---- caché del script OTA (archivo, no SharedPreferences) ----
  File get _archivoScript => File('${_dir.path}/content_cache.js');

  Future<String?> leerScriptCache() async {
    try {
      final f = _archivoScript;
      if (await f.exists()) {
        final s = await f.readAsString();
        return s.isEmpty ? null : s;
      }
    } catch (e) {
      debugPrint('[tg] caché de script ilegible: $e');
    }
    return null;
  }

  /// Guarda el script en caché. Devuelve false si no se pudo escribir.
  Future<bool> guardarScriptCache(String script) async {
    try {
      final destino = _archivoScript;
      final tmp = File('${destino.path}.tmp');
      await tmp.writeAsString(script, flush: true);
      await tmp.rename(destino.path);
      return true;
    } catch (e) {
      debugPrint('[tg] no se pudo guardar el caché del script: $e');
      return false;
    }
  }

  /// Fecha en que se guardó por última vez una versión NUEVA del script
  /// (el caché solo se reescribe cuando el contenido cambia, así que equivale a "última actualización").
  Future<DateTime?> fechaScriptCache() async {
    try {
      final f = _archivoScript;
      if (await f.exists()) return await f.lastModified();
    } catch (_) {}
    return null;
  }
}

// =============================================================================
// PANTALLA
// =============================================================================
class ContentScreen extends StatefulWidget {
  const ContentScreen({super.key});

  @override
  State<ContentScreen> createState() => _ContentScreenState();
}

class _ContentScreenState extends State<ContentScreen>
    with WidgetsBindingObserver {
  InAppWebViewController? webViewController;

  String _lenis = '';
  String _contentJs = '';
  String _prefsInicialesJs = '';
  bool _fueActualizado = false;
  bool _listo =
      false; // el WebView NO se crea hasta tener scripts y preferencias listos
  bool _avisoMostrado = false;

  // El widget del WebView se crea UNA sola vez y se reutiliza en cada build
  // (así los rebuilds del Scaffold / MediaQuery no lo tocan).
  Widget? _webView;

  // ---- TECLADO ----
  // El WebView NUNCA cambia de tamaño cuando aparece el teclado (redimensionarlo lagueaba y, además, Android
  // perdía el foco del input y cerraba el teclado). En su lugar Flutter le avisa a la página la altura del teclado
  // (window.tgSetTeclado) y content.js sube la caja de escribir con una transición.
  double _tecladoObjetivo = 0;
  double _tecladoEnviado = 0;
  DateTime _tecladoUltimoEnvio = DateTime.fromMillisecondsSinceEpoch(0);
  Timer? _tecladoTimer;

  // ---- SPLASH (capa negra + logo por encima del WebView) ----
  bool _splashVisible =
      true; // objetivo del fade (true = opaco, false = se desvanece)
  bool _splashQuitado = false; // cuando termina el fade se saca del árbol
  Timer? _splashSeguro;

  // Desvanece el splash (1 s). Es idempotente.
  void _ocultarSplash() {
    if (!mounted || !_splashVisible) return;
    _splashSeguro?.cancel();
    setState(() => _splashVisible = false);
  }

  // ---- AJUSTES DE DESARROLLO ----
  // true  = usa SIEMPRE el content.js de los assets (Gemini/content.js) y NO el de GitHub.
  //         Úsalo mientras pruebas cambios locales: si no, el script de GitHub (y su caché) GANA sobre tu archivo local.
  // false = flujo normal: GitHub -> caché -> assets.
  static const bool _soloAssetLocal = true; // <-- CAMBIAR A FALSE PARA PUBLICAR

  String _origenScript = 'ninguno'; // 'github' | 'cache' | 'asset' | 'ninguno'

  static const String _urlScript =
      'https://raw.githubusercontent.com/JuanDaCol07/gemini-vibe-script-content/refs/heads/main/Gemini/content.js';

  // fecha del último commit que tocó content.js (GitHub API, sin token: 60 consultas/hora)
  static const String _urlUltimoCommit =
      'https://api.github.com/repos/JuanDaCol07/gemini-vibe-script-content/commits?sha=main&path=Gemini/content.js&per_page=1';

  // ---- ACTUALIZACIONES (solo móvil) ----
  // El menú "Actualizaciones Gemini Vibes" de content.js habla con estos métodos por el handler 'tgActualizaciones'.
  static const bool _esMovil = !kIsWeb;

  // KERNEL de la app: súbelo (1, 2, 3...) cuando cambies este Dart o agregues algo que el script necesite.
  // Debe coincidir con TG_KERNEL de content.js; si no coinciden, content.js no activa nada y pide instalar la app nueva.
  static const int _kernel = 1;

  // Lee TG_KERNEL del texto de un script (null si no existe)
  static int? _kernelDeScript(String? script) {
    if (script == null) return null;
    final m = RegExp(r'const\s+TG_KERNEL\s*=\s*(\d+)\s*;').firstMatch(script);
    return m == null ? null : int.tryParse(m.group(1)!);
  }

  String?
  _pendienteScript; // versión nueva ya descargada (se aplica con "Actualizar")
  bool _hayNueva = false;
  DateTime? _verificadoEn; // última vez que se consultó GitHub con éxito
  String? _remotaFechaIso; // fecha del último commit en GitHub
  bool _ocupado = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // una sola vez (antes se llamaba en cada build)
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        systemNavigationBarColor: Color.fromARGB(255, 0, 0, 0),
        systemNavigationBarIconBrightness: Brightness.light,
      ),
    );
    _preparar();
  }

  Future<void> _preparar() async {
    try {
      await AlmacenPrefs.instancia.init();
    } catch (e) {
      // si SharedPreferences/path_provider fallan (p. ej. MissingPluginException por no hacer rebuild completo),
      // la app sigue funcionando sin guardar preferencias
      debugPrint('[tg] AlmacenPrefs.init falló: $e');
    }

    // en paralelo: preferencias guardadas, Lenis y script (red con respaldo)
    final resultados = await Future.wait<dynamic>([
      _leerPrefsComoJs(),
      _cargarLenis(),
      _sincronizarScriptRemoto(),
      Future.delayed(
        const Duration(seconds: 1),
      ), // <-- Garantiza los 2 segundos mínimos
    ]);

    if (!mounted) return;
    setState(() {
      _prefsInicialesJs = resultados[0] as String;
      _lenis = resultados[1] as String;
      final r = resultados[2] as _ResultadoScript;
      _contentJs = r.script;
      _fueActualizado = r.actualizado;
      _listo = true;
    });
    // red de seguridad: si la página nunca confirma la carga, el splash no se queda para siempre
    _splashSeguro = Timer(const Duration(seconds: 15), _ocultarSplash);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _tecladoTimer?.cancel();
    _splashSeguro?.cancel();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // TECLADO: se le avisa a la página (como mucho cada ~60 ms); el WebView no se redimensiona
  // ---------------------------------------------------------------------------
  @override
  void didChangeMetrics() {
    if (!mounted) return;
    final vista = View.of(context);
    _tecladoObjetivo = (vista.viewInsets.bottom / vista.devicePixelRatio)
        .roundToDouble();
    if (_tecladoTimer?.isActive ?? false)
      return; // el envío pendiente lleva el último valor
    const intervalo = Duration(milliseconds: 60);
    final desde = DateTime.now().difference(_tecladoUltimoEnvio);
    _tecladoTimer = Timer(
      desde >= intervalo ? Duration.zero : intervalo - desde,
      _enviarTeclado,
    );
  }

  void _enviarTeclado() {
    _tecladoUltimoEnvio = DateTime.now();
    if (_tecladoObjetivo == _tecladoEnviado) return;
    _tecladoEnviado = _tecladoObjetivo;
    webViewController?.evaluateJavascript(
      source:
          'window.tgSetTeclado && window.tgSetTeclado(${_tecladoEnviado.toStringAsFixed(0)});',
    );
  }

  Future<String> _leerPrefsComoJs() async {
    // TG_ES_MOVIL: content.js lo usa para mostrar el menú "Actualizaciones Gemini Vibes" SOLO en la app móvil
    // TG_KERNEL_DART: content.js lo compara con su propio TG_KERNEL (si no coinciden, no activa la extensión)
    final movil =
        'window.TG_ES_MOVIL = $_esMovil; window.TG_KERNEL_DART = $_kernel;';
    try {
      final mapa = await AlmacenPrefs.instancia.leerTodo();
      // jsonEncode produce JS válido; content.js lo lee al arrancar (window.TG_PREFS_INICIALES)
      return '$movil window.TG_PREFS_INICIALES = ${jsonEncode(mapa)};';
    } catch (e) {
      debugPrint('[tg] no se pudieron leer las prefs: $e');
      return '$movil window.TG_PREFS_INICIALES = {};';
    }
  }

  Future<String> _cargarLenis() async {
    try {
      return await rootBundle.loadString('Gemini/lenis.min.js');
    } catch (e) {
      debugPrint('[tg] Error cargando Lenis: $e');
      return '';
    }
  }

  // Descarga el script de GitHub. Devuelve null si no hay conexión / la respuesta no parece JS.
  Future<String?> _descargarScript({
    Duration timeout = const Duration(seconds: 6),
  }) async {
    try {
      // el parámetro t evita que la CDN de GitHub (≈5 min de caché) te devuelva una versión vieja
      final uri = Uri.parse(
        '$_urlScript?t=${DateTime.now().millisecondsSinceEpoch}',
      );
      final response = await http
          .get(uri, headers: const {'Cache-Control': 'no-cache'})
          .timeout(timeout);

      // validación básica: que no sea una página de error / HTML
      final cuerpo = response.body;
      final pareceJs = cuerpo.length > 1000 && cuerpo.contains('(function');
      if (response.statusCode == 200 && pareceJs) return cuerpo;
    } catch (e) {
      debugPrint('[tg] no se pudo descargar el script de GitHub: $e');
    }
    return null;
  }

  // Fecha (ISO, UTC) del último commit que modificó content.js. Es solo informativa: si falla devuelve null.
  Future<String?> _fechaUltimoCommit() async {
    try {
      final r = await http
          .get(
            Uri.parse(_urlUltimoCommit),
            headers: const {'Accept': 'application/vnd.github+json'},
          )
          .timeout(const Duration(seconds: 6));
      if (r.statusCode != 200) return null;
      final lista = jsonDecode(r.body);
      if (lista is List && lista.isNotEmpty) {
        final fecha = lista[0]['commit']?['committer']?['date'];
        if (fecha is String && fecha.isNotEmpty) return fecha;
      }
    } catch (e) {
      debugPrint('[tg] no se pudo leer la fecha del último commit: $e');
    }
    return null;
  }

  // Descarga el script de GitHub; si falla usa el caché (archivo) y por último los assets
  Future<_ResultadoScript> _sincronizarScriptRemoto() async {
    String scriptFinal = '';
    bool actualizado = false;
    final almacen = AlmacenPrefs.instancia;

    if (_soloAssetLocal) {
      try {
        final local = await rootBundle.loadString('Gemini/content.js');
        _origenScript = 'asset';
        return _ResultadoScript(local, false);
      } catch (e) {
        debugPrint('[tg] _soloAssetLocal: no se pudo leer el asset: $e');
      }
    }

    final cuerpo = await _descargarScript();
    if (cuerpo != null) {
      _verificadoEn = DateTime.now();
      final viejo = await almacen.leerScriptCache();
      scriptFinal = cuerpo;
      _origenScript = 'github';
      if (viejo != cuerpo) {
        await almacen.guardarScriptCache(cuerpo);
        actualizado = true;
      }
    } else {
      debugPrint('[tg] Sin conexión a GitHub, se usa el caché local');
    }

    if (scriptFinal.isEmpty) {
      scriptFinal = await almacen.leerScriptCache() ?? '';
      if (scriptFinal.isNotEmpty) _origenScript = 'cache';
    }

    if (scriptFinal.isEmpty) {
      try {
        scriptFinal = await rootBundle.loadString('Gemini/content.js');
        _origenScript = 'asset';
      } catch (e) {
        debugPrint('[tg] Error crítico cargando respaldo local: $e');
      }
    }
    return _ResultadoScript(scriptFinal, actualizado);
  }

  // ---------------------------------------------------------------------------
  // ACTUALIZACIONES DESDE EL MENÚ DE content.js (solo móvil)
  // Handler JS: callHandler('tgActualizaciones', 'estado' | 'verificar' | 'actualizar')
  // ---------------------------------------------------------------------------
  Future<Map<String, dynamic>> _estadoActualizacion() async {
    DateTime? instalada;
    try {
      instalada = await AlmacenPrefs.instancia.fechaScriptCache();
    } catch (_) {}
    return {
      'ok': true,
      'origen': _origenScript,
      'instaladaIso': instalada?.toUtc().toIso8601String(),
      'verificadaIso': _verificadoEn?.toUtc().toIso8601String(),
      'remotaIso': _remotaFechaIso,
      'hayNueva': _hayNueva,
      'kernelDart': _kernel,
      // kernel del script nuevo ya descargado (null si no hay nuevo o no declara kernel); content.js decide qué hacer
      'remotaKernel': _kernelDeScript(_pendienteScript),
    };
  }

  Future<Map<String, dynamic>> _verificarActualizacion() async {
    if (_ocupado) return {'ok': false, 'error': 'Hay otra operación en curso.'};
    _ocupado = true;
    try {
      final resultados = await Future.wait<dynamic>([
        _descargarScript(timeout: const Duration(seconds: 10)),
        _fechaUltimoCommit(),
      ]);
      final cuerpo = resultados[0] as String?;
      if (cuerpo == null) {
        return {
          'ok': false,
          'error': 'No se pudo conectar con GitHub. Revisa tu conexión.',
        };
      }
      _verificadoEn = DateTime.now();
      _remotaFechaIso = (resultados[1] as String?) ?? _remotaFechaIso;
      _hayNueva = cuerpo != _contentJs;
      _pendienteScript = _hayNueva ? cuerpo : null;
      return await _estadoActualizacion();
    } finally {
      _ocupado = false;
    }
  }

  Future<Map<String, dynamic>> _aplicarActualizacion() async {
    if (_ocupado) return {'ok': false, 'error': 'Hay otra operación en curso.'};
    _ocupado = true;
    try {
      var nuevo = _pendienteScript;
      if (nuevo == null) {
        // no se había verificado: se descarga ahora
        nuevo = await _descargarScript(timeout: const Duration(seconds: 10));
        if (nuevo == null) {
          return {
            'ok': false,
            'error': 'No se pudo descargar la actualización.',
          };
        }
        if (nuevo == _contentJs) {
          _hayNueva = false;
          return {...await _estadoActualizacion(), 'yaActualizado': true};
        }
      }
      final guardado = await AlmacenPrefs.instancia.guardarScriptCache(nuevo);
      if (!guardado) {
        return {
          'ok': false,
          'error': 'No se pudo guardar la actualización en el dispositivo.',
        };
      }
      _contentJs = nuevo;
      _pendienteScript = null;
      _hayNueva = false;
      _origenScript = 'github';
      _verificadoEn = DateTime.now();
      final estado = await _estadoActualizacion();
      // la respuesta llega primero a content.js (que muestra "Aplicando...") y después se recarga la página
      final c = webViewController;
      if (c != null) unawaited(_recargarConScriptsNuevos(c));
      return {...estado, 'recargando': c != null};
    } finally {
      _ocupado = false;
    }
  }

  List<UserScript> _construirUserScripts() => [
    UserScript(
      source: _prefsInicialesJs,
      injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
      forMainFrameOnly: true,
    ),
    if (_lenis.isNotEmpty)
      UserScript(
        source: _lenis,
        injectionTime: UserScriptInjectionTime.AT_DOCUMENT_END,
        forMainFrameOnly: true,
      ),
    if (_contentJs.isNotEmpty)
      UserScript(
        source: _contentJs,
        injectionTime: UserScriptInjectionTime.AT_DOCUMENT_END,
        forMainFrameOnly: true,
      ),
  ];

  // Cambia los UserScripts del WebView que ya existe y recarga la página.
  // IMPORTANTE: antes se relee el almacén de preferencias; si no, TG_PREFS_INICIALES (que manda sobre lo guardado)
  // traería los valores de cuando arrancó la app y se perderían los ajustes hechos en esta sesión.
  Future<void> _recargarConScriptsNuevos(
    InAppWebViewController controller,
  ) async {
    try {
      // content.js agrupa sus envíos 250 ms: se espera a que lleguen antes de leer
      await Future.delayed(const Duration(milliseconds: 700));
      await AlmacenPrefs.instancia.vaciar();
      _prefsInicialesJs = await _leerPrefsComoJs();
      await controller.removeAllUserScripts();
      await controller.addUserScripts(userScripts: _construirUserScripts());
      await controller.reload();
    } catch (e) {
      debugPrint('[tg] no se pudo recargar con el script nuevo: $e');
    }
  }

  // Confirma que content.js realmente corrió; si no, lo inyecta a mano (respaldo)
  Future<void> _verificarInyeccion(
    InAppWebViewController controller,
    WebUri? url,
  ) async {
    try {
      // da un momento a que los UserScripts AT_DOCUMENT_END terminen
      await Future.delayed(const Duration(milliseconds: 600));
      final host = url?.host ?? '';
      if (!host.contains('gemini.google.com')) {
        // p. ej. pantalla de login de Google: no hay content.js que esperar, se muestra la página
        _ocultarSplash();
        return;
      }

      Future<Map<String, dynamic>> estado() async {
        final r = await controller.evaluateJavascript(
          source:
              "JSON.stringify({marca: window.__tgCargado || null, lenis: typeof Lenis, bridge: !!(window.flutter_inappwebview && window.flutter_inappwebview.callHandler)})",
        );
        return r is String ? (jsonDecode(r) as Map<String, dynamic>) : {};
      }

      var e = await estado();
      debugPrint(
        '[tg] origen del script=$_origenScript (${_contentJs.length} caracteres) | estado en la página: $e',
      );

      if (e['marca'] == null && _contentJs.isNotEmpty) {
        debugPrint(
          '[tg] content.js NO se inyectó como UserScript: inyectando a mano',
        );
        if (e['lenis'] == 'undefined' && _lenis.isNotEmpty) {
          await controller.evaluateJavascript(source: _lenis);
        }
        await controller.evaluateJavascript(source: _prefsInicialesJs);
        await controller.evaluateJavascript(source: _contentJs);
        e = await estado();
        debugPrint('[tg] tras inyección manual: $e');
      }
    } catch (err) {
      debugPrint('[tg] _verificarInyeccion falló: $err');
    }
    // página cargada y content.js corrido (o intento de respaldo hecho): se quita el splash
    // pequeña pausa para que content.js pinte tema/fondo/bloqueo antes de revelar
    await Future.delayed(const Duration(milliseconds: 250));
    _ocultarSplash();
  }

  void _mostrarAvisoOta() {
    if (!_fueActualizado || _avisoMostrado || !mounted) return;
    _avisoMostrado = true;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Row(
          children: [
            Icon(Icons.system_update, color: Colors.cyanAccent),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'Gemini Vibes se actualizó desde la nube',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
        backgroundColor: const Color.fromARGB(255, 0, 0, 0),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: const Duration(seconds: 4),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // se crea una sola vez, cuando todo está listo
    if (_listo && _webView == null) {
      _webView = RepaintBoundary(child: _construirWebView());
    }
    return Scaffold(
      backgroundColor: const Color.fromARGB(255, 0, 0, 0),
      // el teclado NO redimensiona el Scaffold ni el WebView (ver didChangeMetrics)
      resizeToAvoidBottomInset: false,
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // capa 1: el WebView (tamaño fijo, el teclado no lo redimensiona)
            if (_webView != null) Positioned.fill(child: _webView!),

            // capa 2: fondo negro + logo por encima, con fade out
            if (!_splashQuitado)
              IgnorePointer(
                ignoring: !_splashVisible,
                child: AnimatedOpacity(
                  opacity: _splashVisible ? 1.0 : 0.0,
                  duration: const Duration(milliseconds: 500),
                  curve: Curves.easeOut,
                  onEnd: () {
                    if (!_splashVisible && mounted) {
                      setState(() => _splashQuitado = true);
                    }
                  },
                  child: Container(
                    color: const Color.fromARGB(255, 0, 0, 0),
                    alignment: Alignment.center,
                    child: _FadingGeminiLogo(cargando: _listo),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _construirWebView() {
    return InAppWebView(
      initialUrlRequest: URLRequest(url: WebUri('https://gemini.google.com')),

      onPermissionRequest: (controller, request) async {
        return PermissionResponse(
          resources: request.resources,
          action: PermissionResponseAction.GRANT,
        );
      },

      // Los scripts se inyectan UNA vez por carga de página, en orden:
      //  1) preferencias (antes de todo, para que el bloqueo/tema/fondos salgan bien al primer frame)
      //  2) Lenis  3) content.js (necesita document.body, por eso AT_DOCUMENT_END)
      // Antes se hacía en onLoadStop, que se dispara varias veces (cada navegación) y duplicaba observers,
      // intervalos y la pantalla de bloqueo; además podía llegar antes de que el script estuviera descargado.
      initialUserScripts: UnmodifiableListView<UserScript>(
        _construirUserScripts(),
      ),
      initialSettings: InAppWebViewSettings(
        isInspectable: kDebugMode, // solo depuración
        mediaPlaybackRequiresUserGesture: false,
        transparentBackground: true,
        preferredContentMode: UserPreferredContentMode.MOBILE,
        hardwareAcceleration: true,
        supportZoom: false,
      ),

      onWebViewCreated: (controller) {
        webViewController = controller;

        // content.js -> Flutter: window.flutter_inappwebview.callHandler('guardarPreferencia', clave, valor)
        controller.addJavaScriptHandler(
          handlerName: 'guardarPreferencia',
          callback: (args) {
            if (args.length < 2 || args[0] is! String) return false;
            // sin await: no se bloquea el canal; guardar() nunca lanza
            unawaited(
              AlmacenPrefs.instancia.guardar(args[0] as String, args[1]),
            );
            return true;
          },
        );

        // content.js -> Flutter: menú "Actualizaciones Gemini Vibes" (SOLO móvil)
        if (_esMovil) {
          controller.addJavaScriptHandler(
            handlerName: 'tgActualizaciones',
            callback: (args) async {
              final accion = args.isNotEmpty ? '${args[0]}' : 'estado';
              try {
                switch (accion) {
                  case 'verificar':
                    return await _verificarActualizacion();
                  case 'actualizar':
                    return await _aplicarActualizacion();
                  default:
                    return await _estadoActualizacion();
                }
              } catch (e) {
                debugPrint('[tg] tgActualizaciones("$accion") falló: $e');
                return {'ok': false, 'error': '$e'};
              }
            },
          );
        }
      },
      // todo lo que content.js escriba en la consola ([tg]...) o cualquier error de JS aparece en la consola de Flutter
      onConsoleMessage: (controller, msg) {
        final t = msg.message;
        if (t.contains('[tg]') ||
            msg.messageLevel == ConsoleMessageLevel.ERROR) {
          debugPrint('[web:${msg.messageLevel}] $t');
        }
      },
      onLoadStop: (controller, url) async {
        _mostrarAvisoOta();
        await _verificarInyeccion(controller, url);
      },
      // si el proceso del WebView muere, no se cierra la app: se recarga
      // (con las preferencias releídas, para no volver a los valores del arranque)
      onRenderProcessGone: (controller, detail) async {
        debugPrint(
          '[tg] el proceso del WebView terminó (didCrash=${detail.didCrash}); recargando',
        );
        await _recargarConScriptsNuevos(controller);
      },
    );
  }
}

class _ResultadoScript {
  final String script;
  final bool actualizado;
  const _ResultadoScript(this.script, this.actualizado);
}

class _FadingGeminiLogo extends StatefulWidget {
  // false = silueta (preparando scripts/prefs) | true = logo Gemini.png (cargando la página)
  final bool cargando;
  const _FadingGeminiLogo({required this.cargando});

  @override
  State<_FadingGeminiLogo> createState() => _FadingGeminiLogoState();
}

class _FadingGeminiLogoState extends State<_FadingGeminiLogo>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    duration: const Duration(milliseconds: 700),
    vsync: this,
  )..repeat(reverse: true);

  // pulso puro de 0 a 1 (el rango de opacidad se calcula en build)
  late final Animation<double> _pulso = CurvedAnimation(
    parent: _controller,
    curve: Curves.easeInOut,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      // t: 0 = preparando (silueta), 1 = cargando (logo). Cambia suave en 500 ms
      tween: Tween<double>(end: widget.cargando ? 1.0 : 0.0),
      duration: const Duration(milliseconds: 500),
      builder: (context, t, child) {
        return AnimatedBuilder(
          animation: _pulso,
          builder: (context, child) {
            final minimo = 0.05 + (0.03 - 0.03) * t; // 0.05 -> 0.3
            final maximo = 0.7 + (1.0 - 0.7) * t; // 0.7  -> 1.0
            final opacidad = minimo + (maximo - minimo) * _pulso.value;
            return Opacity(opacity: opacidad, child: child);
          },
          child: child,
        );
      },
      child: SizedBox(
        width: 90,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 500),
          switchInCurve: Curves.easeIn,
          switchOutCurve: Curves.easeOut,
          child: widget.cargando
              ? Image.asset('Gemini/Gemini.png', key: const ValueKey('logo'))
              : Image.asset(
                  'Gemini/Gemini silueta.png',
                  key: const ValueKey('silueta'),
                ),
        ),
      ),
    );
  }
}
