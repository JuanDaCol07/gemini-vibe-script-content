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

  Future<void> guardarScriptCache(String script) async {
    try {
      final destino = _archivoScript;
      final tmp = File('${destino.path}.tmp');
      await tmp.writeAsString(script, flush: true);
      await tmp.rename(destino.path);
    } catch (e) {
      debugPrint('[tg] no se pudo guardar el caché del script: $e');
    }
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

class _ContentScreenState extends State<ContentScreen> {
  InAppWebViewController? webViewController;

  String _lenis = '';
  String _contentJs = '';
  String _prefsInicialesJs = '';
  bool _fueActualizado = false;
  bool _listo =
      false; // el WebView NO se crea hasta tener scripts y preferencias listos
  bool _avisoMostrado = false;

  static const String _urlScript =
      'https://raw.githubusercontent.com/JuanDaCol07/gemini-vibe-script-content/refs/heads/main/Gemini/content.js';

  @override
  void initState() {
    super.initState();
    // una sola vez (antes se llamaba en cada build)
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        systemNavigationBarColor: Color(0xFF0F172A),
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
  }

  Future<String> _leerPrefsComoJs() async {
    try {
      final mapa = await AlmacenPrefs.instancia.leerTodo();
      // jsonEncode produce JS válido; content.js lo lee al arrancar (window.TG_PREFS_INICIALES)
      return 'window.TG_PREFS_INICIALES = ${jsonEncode(mapa)};';
    } catch (e) {
      debugPrint('[tg] no se pudieron leer las prefs: $e');
      return 'window.TG_PREFS_INICIALES = {};';
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

  // Descarga el script de GitHub; si falla usa el caché (archivo) y por último los assets
  Future<_ResultadoScript> _sincronizarScriptRemoto() async {
    String scriptFinal = '';
    bool actualizado = false;
    final almacen = AlmacenPrefs.instancia;

    try {
      final response = await http
          .get(Uri.parse(_urlScript))
          .timeout(const Duration(seconds: 6));

      // validación básica: que no sea una página de error / HTML
      final cuerpo = response.body;
      final pareceJs = cuerpo.length > 1000 && cuerpo.contains('(function');
      if (response.statusCode == 200 && pareceJs) {
        final viejo = await almacen.leerScriptCache();
        scriptFinal = cuerpo;
        if (viejo != cuerpo) {
          await almacen.guardarScriptCache(cuerpo);
          actualizado = true;
        }
      }
    } catch (e) {
      debugPrint('[tg] Sin conexión a GitHub, se usa el caché local: $e');
    }

    if (scriptFinal.isEmpty) {
      scriptFinal = await almacen.leerScriptCache() ?? '';
    }

    if (scriptFinal.isEmpty) {
      try {
        scriptFinal = await rootBundle.loadString('Gemini/content.js');
      } catch (e) {
        debugPrint('[tg] Error crítico cargando respaldo local: $e');
      }
    }
    return _ResultadoScript(scriptFinal, actualizado);
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
        backgroundColor: const Color(0xFF1E293B),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: const Duration(seconds: 4),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_listo) {
      return const Scaffold(
        backgroundColor: Color(0xFF0F172A),
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: InAppWebView(
          initialUrlRequest: URLRequest(
            url: WebUri('https://gemini.google.com'),
          ),
          // Los scripts se inyectan UNA vez por carga de página, en orden:
          //  1) preferencias (antes de todo, para que el bloqueo/tema/fondos salgan bien al primer frame)
          //  2) Lenis  3) content.js (necesita document.body, por eso AT_DOCUMENT_END)
          // Antes se hacía en onLoadStop, que se dispara varias veces (cada navegación) y duplicaba observers,
          // intervalos y la pantalla de bloqueo; además podía llegar antes de que el script estuviera descargado.
          initialUserScripts: UnmodifiableListView<UserScript>([
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
          ]),
          initialSettings: InAppWebViewSettings(
            isInspectable: kDebugMode, // solo depuración
            mediaPlaybackRequiresUserGesture: false,
            transparentBackground: false,
            preferredContentMode: UserPreferredContentMode.MOBILE,
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
          },
          onLoadStop: (controller, url) async {
            _mostrarAvisoOta();
          },
          // si el proceso del WebView muere, no se cierra la app: se recarga
          onRenderProcessGone: (controller, detail) async {
            debugPrint(
              '[tg] el proceso del WebView terminó (didCrash=${detail.didCrash}); recargando',
            );
            await controller.reload();
          },
        ),
      ),
    );
  }
}

class _ResultadoScript {
  final String script;
  final bool actualizado;
  const _ResultadoScript(this.script, this.actualizado);
}
