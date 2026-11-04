import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' show FrameTiming;

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

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
    // bienvenida: interruptor "Mostrar bienvenida" y el TG_FIX con el que se vio la última bienvenida de actualización
    'geminiBienvenidaActiva',
    'geminiFixVisto',
    // guía "Antes de comenzar..." (primera vez) y música de bienvenida personalizada (data URL + nombre del archivo)
    'geminiOnboardingVisto',
    'geminiAudioBienvenida',
    'geminiAudioBienvenidaNombre',
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

  /// Lee UNA preferencia (espera a que terminen las escrituras pendientes). null si no existe.
  Future<dynamic> leerClave(String clave) async {
    try {
      await _cola;
      String? json = _sp.getString('$_prefijo$clave');
      if (json == null) {
        final f = _archivo(clave);
        if (await f.exists()) json = await f.readAsString();
      }
      if (json != null && json.isNotEmpty) return jsonDecode(json);
    } catch (e) {
      debugPrint('[tg] no se pudo leer "$clave": $e');
    }
    return null;
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

  /// DEBUG: borra TODAS las preferencias de Gemini Vibes (SharedPreferences + archivos grandes de tg_prefs).
  /// No toca la caché del script (content_cache.js). Nunca lanza excepciones.
  Future<void> borrarTodo() async {
    try {
      await _cola; // que terminen las escrituras pendientes
      for (final clave in clavesValidas) {
        await _borrarSeguro(clave);
      }
      // por si quedó algún archivo de una clave que ya no es válida
      if (await _dir.exists()) {
        await for (final e in _dir.list()) {
          final nombre = e.path.split(RegExp(r'[\\/]')).last;
          if (e is File && nombre.startsWith(_prefijo)) {
            try {
              await e.delete();
            } catch (_) {}
          }
        }
      }
    } catch (e) {
      debugPrint('[tg] borrarTodo falló: $e');
    }
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

  /// Guarda el script en caché. Devuelve false si no se pudo escribir (o si lo escrito no coincide al releerlo).
  Future<bool> guardarScriptCache(String script) async {
    try {
      if (!_listo) await init();
      final destino = _archivoScript;
      final tmp = File('${destino.path}.tmp');
      await tmp.writeAsString(script, flush: true);
      try {
        await tmp.rename(destino.path);
      } catch (e) {
        // algunos dispositivos no reemplazan un archivo existente con rename: se borra el viejo y se reintenta
        debugPrint('[tg] rename falló ($e), reintentando');
        if (await destino.exists()) await destino.delete();
        try {
          await tmp.rename(destino.path);
        } catch (_) {
          await destino.writeAsString(
            script,
            flush: true,
          ); // último recurso: escritura directa
          if (await tmp.exists()) await tmp.delete();
        }
      }
      // verificación: lo que quedó en disco debe ser exactamente lo descargado
      final leido = await destino.readAsString();
      if (leido != script) {
        debugPrint(
          '[tg] el caché del script no coincide tras guardarlo (${leido.length} vs ${script.length})',
        );
        return false;
      }
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

  // ---- AUDIO DE LA BIENVENIDA ----
  // content.js pide por el handler 'audioBienvenida' (play / pause / resume / stop). Se reproduce con audioplayers desde los assets:
  // así no depende del CSP de la página ni de cargar el mp3 como URL dentro del WebView.
  static const String _audioBienvenidaAsset =
      'Gemini/Yume 2kki OST Lotus Waters.mp3';
  static const double _audioBienvenidaVolumen = 1;
  static const int _audioBienvenidaFadeMs = 2000;
  AudioPlayer? _audioBienvenida;
  Future<void>?
  _audioPreparado; // carga anticipada del mp3 (se lanza al abrir la app)
  bool _audioSolicitado =
      false; // content.js ya pidió la música de la bienvenida
  bool _audioIniciado =
      false; // la canción ya arrancó (al cargar la página): antes de eso NINGÚN resume puede hacerla sonar
  DateTime?
  _paginaCargadaEn; // instante en que la página terminó de cargar (solo para el log)
  Timer? _audioFade;
  bool _audioPausadoPorApp = false;

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

  // ---- LOGIN DE GOOGLE ----
  // Al volver de accounts.google.com a Gemini se vuelve a mostrar la pantalla de carga hasta que content.js avise ('tgLoginListo').
  // La música NO se corta ni reinicia (_retornoLogin evita el seek(0) del 'play').
  bool _enLogin = false;
  bool _esperandoLogin = false;
  bool _retornoLogin = false;
  bool _mantenerAudio = false;

  // ---- SPLASH (capa negra + logo por encima del WebView) ----
  // se completa cuando la página termina de cargar (onLoadStop); la canción arranca con él, antes del fade del splash
  final Completer<void> _splashListo = Completer<void>();
  bool _splashVisible =
      true; // objetivo del fade (true = opaco, false = se desvanece)
  bool _splashQuitado = false; // cuando termina el fade se saca del árbol
  Timer? _splashSeguro;

  // ---- BIENVENIDA FLUIDA (solo móvil) ----
  // La cinemática + música solo arrancan si: 1) la página llegó al 100 %, 2) la música cargó bien, 3) hay >= 20 FPS
  // (se miden cada 2 s). Si no se cumple en _esperaMaxBienvenidaMs, el handler 'audioBienvenida'/'play' devuelve false
  // y content.js se salta la cinemática (va directo al PIN / novedades / Gemini). En PC (extensión) nada de esto aplica.
  static const double _fpsMinimo = 20;
  static const int _esperaMaxBienvenidaMs = 8000;
  int _fotogramas = 0;
  double _fps = 0; // 0 = aún sin medir
  Timer? _fpsTimer;
  bool? _audioOk; // null = cargando | true = cargó bien | false = falló
  int _progresoPagina = 0;

  void _contarFotogramas(List<FrameTiming> t) => _fotogramas += t.length;

  void _iniciarMonitorFps() {
    SchedulerBinding.instance.addTimingsCallback(_contarFotogramas);
    _fpsTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      // sin fotogramas (pantalla quieta) no se actualiza: se conserva la última medida válida
      if (_fotogramas > 0) _fps = _fotogramas / 2.0;
      _fotogramas = 0;
    });
  }

  Future<bool> _bienvenidaFluida() async {
    final limite = DateTime.now().add(
      const Duration(milliseconds: _esperaMaxBienvenidaMs),
    );
    while (mounted && DateTime.now().isBefore(limite)) {
      if (_audioOk == false) break;
      if (_progresoPagina >= 100 &&
          _splashListo.isCompleted &&
          _audioOk == true &&
          _fps >= _fpsMinimo) {
        return true;
      }
      await Future.delayed(const Duration(milliseconds: 250));
    }
    debugPrint(
      '[tg] bienvenida omitida: página=$_progresoPagina% audio=$_audioOk fps=${_fps.toStringAsFixed(0)}',
    );
    return false;
  }

  // La página terminó de cargar (onLoadStop): desde este instante la música de la bienvenida puede sonar.
  // Ya NO se espera al fade del splash (que llega ~850 ms después). Es idempotente.
  void _marcarPaginaCargada() {
    _paginaCargadaEn ??= DateTime.now();
    if (!_splashListo.isCompleted)
      _splashListo
          .complete(); // <- aquí arranca la música (si la bienvenida la pidió)
  }

  // Desvanece el splash (1 s). Es idempotente.
  void _ocultarSplash() {
    if (!mounted || !_splashVisible) return;
    _splashSeguro?.cancel();
    setState(() => _splashVisible = false);
    // respaldo: si por alguna razón onLoadStop nunca llegó, el fade también libera la música
    _marcarPaginaCargada();
    // la precarga del mp3 se hace en TODOS los arranques; si la bienvenida no la pidió (no hay bienvenida), se libera
    Timer(const Duration(seconds: 5), () {
      if (!_audioSolicitado) _liberarAudioBienvenida();
    });
  }

  // ---- AJUSTES DE DESARROLLO ----
  // true  = usa SIEMPRE el content.js de los assets (Gemini/content.js) y NO el de GitHub.
  //         Úsalo mientras pruebas cambios locales: si no, el script de GitHub (y su caché) GANA sobre tu archivo local.
  // false = flujo normal: GitHub -> caché -> assets.
  static const bool _soloAssetLocal =
      false; // true SOLO mientras pruebas un content.js local (ignora GitHub y el caché)

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
  static const int _kernel =
      6; // OJO: si cambias esto, también cambia TG_KERNEL en content.js

  // Lee TG_KERNEL del texto de un script (null si no existe)
  static int? _kernelDeScript(String? script) {
    if (script == null) return null;
    final m = RegExp(r'const\s+TG_KERNEL\s*=\s*(\d+)\s*;').firstMatch(script);
    return m == null ? null : int.tryParse(m.group(1)!);
  }

  // Lee TG_VERSION del texto de un script. Acepta un texto fijo ('1.0') o la fórmula actual de content.js
  // ('0.' + TG_KERNEL + (TG_FIX > 0 ? '.' + TG_FIX : '')), que se calcula aquí con TG_KERNEL y TG_FIX. Si cambias la fórmula en content.js, cámbiala también aquí.
  static String? _versionDeScript(String? script) {
    if (script == null) return null;
    final fija = RegExp(
      r"const\s+TG_VERSION\s*=\s*'([^']*)'\s*;",
    ).firstMatch(script);
    if (fija != null) return fija.group(1);
    final k = _kernelDeScript(script);
    if (k == null) return null;
    final f = RegExp(r'const\s+TG_FIX\s*=\s*(\d+)\s*;').firstMatch(script);
    final fix = f == null ? 0 : (int.tryParse(f.group(1)!) ?? 0);
    return fix > 0 ? '0.$k.$fix' : '0.$k';
  }

  // Lee TG_NOTAS_VERSION (texto entre comillas invertidas) del texto de un script
  static String? _notasDeScript(String? script) {
    if (script == null) return null;
    final m = RegExp(
      r'const\s+TG_NOTAS_VERSION\s*=\s*`([\s\S]*?)`\s*;',
    ).firstMatch(script);
    return m?.group(1)?.trim();
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
    _iniciarMonitorFps();
    _precargarAudioBienvenida(); // la canción se carga mientras la app arranca
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

  Future<bool> _audioBienvenidaAccion(String accion) async {
    try {
      switch (accion) {
        case 'play':
          _audioSolicitado = true;
          // si quedaba un reproductor desvaneciéndose (stop anterior), se descarta y se arma uno nuevo
          if (_audioFade != null) await _liberarAudioBienvenida();
          if (_audioBienvenida == null) _precargarAudioBienvenida();
          final p = _audioBienvenida!;
          await _audioPreparado; // normalmente ya está listo desde que abrió la app
          // La canción arranca en cuanto la página terminó de cargar (onLoadStop), sin esperar al fade del splash.
          // Si la página ya cargó, _splashListo ya está completo y esto no espera nada.
          // Bienvenida fluida: página al 100 % + música cargada + >= 20 FPS. Si no, se omite (content.js recibe false).
          if (!await _bienvenidaFluida()) {
            _audioSolicitado = false;
            if (identical(_audioBienvenida, p)) await _liberarAudioBienvenida();
            return false;
          }
          if (!identical(_audioBienvenida, p))
            break; // mientras esperaba llegó un stop (o otro play)
          if (p.state == PlayerState.playing && !_retornoLogin)
            await p.seek(
              Duration.zero,
            ); // recarga de la página: vuelve a empezar
          _audioIniciado = true;
          _retornoLogin = false;
          await p.resume();
          final desde = _paginaCargadaEn;
          if (desde != null) {
            debugPrint(
              '[tg] audioBienvenida: la canción suena ${DateTime.now().difference(desde).inMilliseconds} ms después de cargar la página',
            );
          }
          break;
        case 'mantener':
          _mantenerAudio =
              true; // se va a Google: el pause por visibilitychange de la página se ignora
          break;
        case 'pause':
          if (_mantenerAudio) break;
          await _audioBienvenida?.pause();
          break;
        case 'resume':
          if (!_audioPausadoPorApp && _audioIniciado)
            await _audioBienvenida?.resume();
          break;
        case 'recargar':
          // la música personalizada cambió (o se quitó): se descarta el reproductor y se prepara otra vez con la fuente nueva
          await _liberarAudioBienvenida();
          _precargarAudioBienvenida();
          break;
        case 'stop':
          _audioSolicitado = false;
          _audioIniciado = false;
          _mantenerAudio = false;
          _desvanecerAudioBienvenida();
          break;
      }
    } catch (e) {
      debugPrint('[tg] audioBienvenida("$accion") falló: $e');
    }
    return true;
  }

  // Crea el reproductor y carga el mp3 YA (al abrir la app), para que cuando empiece el fade del splash solo falte darle play.
  void _precargarAudioBienvenida() {
    if (_audioBienvenida != null) return;
    AudioCache.instance = AudioCache(
      prefix: '',
    ); // los assets de esta app están en Gemini/..., sin el prefijo "assets/"
    final p = AudioPlayer();
    _audioBienvenida = p;
    _audioOk = null;
    _audioPreparado =
        () async {
          await p.setReleaseMode(ReleaseMode.loop);
          await p.setVolume(_audioBienvenidaVolumen);
          // música personalizada (data URL guardada por content.js); si no hay o falla, la canción original de los assets
          Source fuente = AssetSource(_audioBienvenidaAsset);
          try {
            final custom = await AlmacenPrefs.instancia.leerClave(
              'geminiAudioBienvenida',
            );
            if (custom is String && custom.startsWith('data:')) {
              final coma = custom.indexOf(',');
              if (coma > 0) {
                fuente = BytesSource(base64Decode(custom.substring(coma + 1)));
              }
            }
          } catch (e) {
            debugPrint(
              '[tg] música personalizada ilegible, se usa la original: $e',
            );
          }
          try {
            await p.setSource(fuente);
          } catch (e) {
            if (fuente is AssetSource) rethrow;
            debugPrint(
              '[tg] la música personalizada no se pudo cargar, se usa la original: $e',
            );
            await p.setSource(AssetSource(_audioBienvenidaAsset));
          }
          _audioOk = true;
        }().catchError((Object e) {
          debugPrint(
            '[tg] no se pudo precargar la música de la bienvenida: $e',
          );
          _audioOk = false;
        });
  }

  Future<void> _liberarAudioBienvenida() async {
    _audioFade?.cancel();
    _audioFade = null;
    final p = _audioBienvenida;
    _audioBienvenida = null;
    _audioPreparado = null;
    _audioOk = null;
    _audioIniciado = false;
    if (p == null) return;
    try {
      await p.stop();
      await p.dispose();
    } catch (_) {}
  }

  // baja el volumen poco a poco y libera el reproductor
  void _desvanecerAudioBienvenida() {
    final p = _audioBienvenida;
    if (p == null) return;
    _audioFade?.cancel();
    var vol = _audioBienvenidaVolumen;
    const pasoMs = 15;
    final bajada = vol / (_audioBienvenidaFadeMs / pasoMs);
    _audioFade = Timer.periodic(const Duration(milliseconds: pasoMs), (
      t,
    ) async {
      vol -= bajada;
      if (vol <= 0) {
        t.cancel();
        _audioFade = null;
        if (identical(_audioBienvenida, p)) _audioBienvenida = null;
        try {
          await p.stop();
          await p.dispose();
        } catch (_) {}
        return;
      }
      try {
        await p.setVolume(vol);
      } catch (_) {}
    });
  }

  // la música no debe seguir sonando con la app en segundo plano
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      _audioPausadoPorApp = true;
      _audioBienvenida?.pause();
    } else if (state == AppLifecycleState.resumed) {
      _audioPausadoPorApp = false;
      if (_audioIniciado)
        _audioBienvenida
            ?.resume(); // antes de que arranque la canción, volver a la app NO debe hacerla sonar
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _audioFade?.cancel();
    _audioBienvenida?.dispose();
    _tecladoTimer?.cancel();
    _splashSeguro?.cancel();
    _fpsTimer?.cancel();
    SchedulerBinding.instance.removeTimingsCallback(_contarFotogramas);
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

  // Gemini/Gemini.png -> data URL (se lee una sola vez y se guarda en memoria)
  String? _logoGeminiCache;
  Future<String> _cargarLogoGemini() async {
    if (_logoGeminiCache != null) return _logoGeminiCache!;
    try {
      final datos = await rootBundle.load('Gemini/Gemini.png');
      _logoGeminiCache =
          'data:image/png;base64,${base64Encode(datos.buffer.asUint8List(datos.offsetInBytes, datos.lengthInBytes))}';
    } catch (e) {
      debugPrint('[tg] no se pudo leer Gemini/Gemini.png: $e');
      return '';
    }
    return _logoGeminiCache!;
  }

  // Fondos por defecto (adaptativos): Gemini/Gemini-wallpaper-default.png (horizontal) y Gemini/Gemini-wallpaper-default-mobil.png (vertical).
  // Se leen una sola vez y se guardan en memoria; deben estar declarados en los assets del pubspec.yaml.
  final Map<String, String> _fondosDefectoCache = {};
  Future<String> _cargarFondoDefecto(String ruta) async {
    final guardado = _fondosDefectoCache[ruta];
    if (guardado != null) return guardado;
    try {
      final datos = await rootBundle.load(ruta);
      final url =
          'data:image/png;base64,${base64Encode(datos.buffer.asUint8List(datos.offsetInBytes, datos.lengthInBytes))}';
      _fondosDefectoCache[ruta] = url;
      return url;
    } catch (e) {
      debugPrint('[tg] no se pudo leer $ruta: $e');
      return '';
    }
  }

  Future<String> _leerPrefsComoJs() async {
    // TG_ES_MOVIL: content.js lo usa para mostrar el menú "Actualizaciones Gemini Vibes" SOLO en la app móvil
    // TG_KERNEL_DART: content.js lo compara con su propio TG_KERNEL (si no coinciden, no activa la extensión)
    // TG_LOGO_GEMINI: Gemini/Gemini.png como data URL; TODO lo que dibuja el logo en content.js (bienvenida, panel de actualizaciones) usa ESTE archivo
    // TG_FONDO_DEFECTO / TG_FONDO_DEFECTO_MOVIL: fondos por defecto (horizontal / vertical) como data URL; content.js los usa si el usuario no puso uno propio
    final logo = await _cargarLogoGemini();
    final fondoH = await _cargarFondoDefecto(
      'Gemini/Gemini-wallpaper-default.png',
    );
    final fondoV = await _cargarFondoDefecto(
      'Gemini/Gemini-wallpaper-default-mobil.png',
    );
    final movil =
        // TG_DEBUG: true solo si la app corre en modo debug; content.js lo usa para mostrar el botón "Borrar todos los datos y reiniciar" en Personalizar
        'window.TG_ES_MOVIL = $_esMovil; window.TG_DEBUG = $kDebugMode; window.TG_KERNEL_DART = $_kernel; window.TG_LOGO_GEMINI = ${jsonEncode(logo)}; '
        'window.TG_FONDO_DEFECTO = ${jsonEncode(fondoH)}; window.TG_FONDO_DEFECTO_MOVIL = ${jsonEncode(fondoV)};';
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
      // OJO: response.body decodifica en latin1 si el servidor no manda charset (acentos, "¿", "•" quedaban rotos al guardarlos).
      // Se decodifica SIEMPRE como UTF-8 y se normalizan los saltos de línea, así lo descargado, lo guardado y lo comparado es idéntico.
      final cuerpo = utf8
          .decode(response.bodyBytes, allowMalformed: false)
          .replaceAll('\r\n', '\n');
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
      // versión y notas del script nuevo (las muestra el panel "Actualizaciones Gemini Vibes" antes de instalar)
      'remotaVersion': _versionDeScript(_pendienteScript),
      'remotaNotas': _notasDeScript(_pendienteScript),
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
      allowedOriginRules: {
        'https://gemini.google.com',
      }, // solo en Gemini (no en accounts.google.com)
    ),
    if (_lenis.isNotEmpty)
      UserScript(
        source: _lenis,
        injectionTime: UserScriptInjectionTime.AT_DOCUMENT_END,
        forMainFrameOnly: true,
        allowedOriginRules: {
          'https://gemini.google.com',
        }, // solo en Gemini (no en accounts.google.com)
      ),
    if (_contentJs.isNotEmpty)
      UserScript(
        source: _contentJs,
        injectionTime: UserScriptInjectionTime.AT_DOCUMENT_END,
        forMainFrameOnly: true,
        allowedOriginRules: {
          'https://gemini.google.com',
        }, // solo en Gemini (no en accounts.google.com)
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

  // DEBUG (solo kDebugMode): borra TODOS los datos guardados y reinicia la app "de cero".
  // content.js ya borró su localStorage ("tg-*") y su IndexedDB antes de llamar a este handler ('tgBorrarDatos').
  // Aquí: se para la música, se vacían las preferencias de Flutter y se recargan los scripts (con prefs vacías) para que arranque como la primera vez.
  Future<bool> _borrarTodoYReiniciar(InAppWebViewController controller) async {
    if (!kDebugMode) return false; // en release no hace nada
    try {
      await _audioBienvenidaAccion('stop');
      _audioSolicitado = false;
      _audioIniciado = false;
      await AlmacenPrefs.instancia.borrarTodo();
      _prefsInicialesJs =
          await _leerPrefsComoJs(); // ahora vacío: TG_PREFS_INICIALES = {}
      await controller.removeAllUserScripts();
      await controller.addUserScripts(userScripts: _construirUserScripts());
      await controller.reload();
      return true;
    } catch (e) {
      debugPrint('[tg] no se pudo borrar todo y reiniciar: $e');
      return false;
    }
  }

  // Confirma que content.js realmente corrió; si no, lo inyecta a mano (respaldo)
  Future<void> _verificarInyeccion(
    InAppWebViewController controller,
    WebUri? url,
  ) async {
    try {
      // da un momento a que los UserScripts AT_DOCUMENT_END terminen
      await Future.delayed(
        Duration(milliseconds: _esperandoLogin ? 1200 : 600),
      );
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
    if (_esperandoLogin)
      return; // regreso del login: el splash lo quita 'tgLoginListo' (content.js ya está inyectado)
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
        // Login de Google: rechaza WebViews ("disallowed_useragent"), así que se identifica como Chrome móvil (sin "wv")
        userAgent:
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        thirdPartyCookiesEnabled: true,
        domStorageEnabled: true,
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

        // content.js -> Flutter: música de fondo de la bienvenida ('play' | 'pause' | 'resume' | 'stop')
        controller.addJavaScriptHandler(
          handlerName: 'audioBienvenida',
          callback: (args) async {
            if (args.isEmpty) return false;
            return await _audioBienvenidaAccion('${args[0]}');
          },
        );

        // content.js -> Flutter: tras volver del login de Google, la tarjeta ya mostró la cuenta: se quita la pantalla de carga
        controller.addJavaScriptHandler(
          handlerName: 'tgLoginListo',
          callback: (args) {
            _esperandoLogin = false;
            _mantenerAudio = false;
            _ocultarSplash();
            return true;
          },
        );

        // content.js -> Flutter: abrir un enlace de GitHub en el navegador del teléfono (solo https y github.com)
        controller.addJavaScriptHandler(
          handlerName: 'abrirExterno',
          callback: (args) async {
            try {
              if (args.isEmpty) return false;
              final u = Uri.parse('${args[0]}');
              final host = u.host.toLowerCase();
              if (u.scheme != 'https' ||
                  !(host == 'github.com' || host.endsWith('.github.com'))) {
                return false;
              }
              return await launchUrl(u, mode: LaunchMode.externalApplication);
            } catch (e) {
              debugPrint('[tg] abrirExterno falló: $e');
              return false;
            }
          },
        );

        // content.js -> Flutter: botón DEBUG de Personalizar "Borrar todos los datos y reiniciar" (SOLO modo debug)
        if (kDebugMode) {
          controller.addJavaScriptHandler(
            handlerName: 'tgBorrarDatos',
            callback: (args) async => await _borrarTodoYReiniciar(controller),
          );
        }

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
      onLoadStart: (controller, url) {
        final host = url?.host ?? '';
        if (host.contains('accounts.google.com')) {
          _enLogin = true;
          if (_audioIniciado && !_audioPausadoPorApp)
            _audioBienvenida?.resume(); // por si el pause llegó antes
        } else if (_enLogin && host.contains('gemini.google.com') && mounted) {
          _enLogin = false;
          _esperandoLogin = true;
          _retornoLogin = true;
          _splashSeguro?.cancel();
          _splashSeguro = Timer(const Duration(seconds: 15), () {
            _esperandoLogin = false;
            _mantenerAudio = false;
            _ocultarSplash();
          });
          setState(() {
            _splashVisible = true;
            _splashQuitado = false;
          });
        }
      },
      onProgressChanged: (controller, progreso) => _progresoPagina = progreso,
      onLoadStop: (controller, url) async {
        _progresoPagina = 100;
        _marcarPaginaCargada(); // <- la música de bienvenida puede arrancar YA (sin esperar al fade)
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
