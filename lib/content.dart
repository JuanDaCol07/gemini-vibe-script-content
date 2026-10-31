import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ContentScreen extends StatefulWidget {
  const ContentScreen({super.key});

  @override
  State<ContentScreen> createState() => _ContentScreenState();
}

class _ContentScreenState extends State<ContentScreen> {
  InAppWebViewController? webViewController;
  String _scriptACargar = "";
  bool _fueActualizado = false;

  @override
  void initState() {
    super.initState();
    _inicializarScriptRemoto();
  }

  Future<void> _inicializarScriptRemoto() async {
    final prefs = await SharedPreferences.getInstance();

    // Ruta directa a tu archivo dentro de la carpeta Gemini/ en GitHub
    const String urlScript =
        'https://raw.githubusercontent.com/JuanDaCol07/gemini-vibe-script-content/refs/heads/main/Gemini/content.js';

    String scriptFinal = "";
    bool actualizado = false;

    try {
      final response = await http
          .get(Uri.parse(urlScript))
          .timeout(const Duration(seconds: 5));

      if (response.statusCode == 200) {
        String nuevoScript = response.body;
        String? scriptViejo = prefs.getString('cached_content_script');

        if (scriptViejo != nuevoScript) {
          bool guardadoExitoso = await prefs.setString(
            'cached_content_script',
            nuevoScript,
          );
          print(
            "¿Se guardó en SharedPreferences exitosamente?: $guardadoExitoso",
          );
          scriptFinal = nuevoScript;
          actualizado = true;
        } else {
          scriptFinal = nuevoScript;
        }
      }
    } catch (e) {
      print(
        "No se pudo conectar a internet, buscando caché local... Error: $e",
      );
    }

    if (scriptFinal.isEmpty) {
      String? scriptGuardado = prefs.getString('cached_content_script');
      if (scriptGuardado != null && scriptGuardado.isNotEmpty) {
        scriptFinal = scriptGuardado;
      }
    }

    if (scriptFinal.isEmpty) {
      try {
        scriptFinal = await rootBundle.loadString('Gemini/content.js');
      } catch (e) {
        print("Error cargando respaldo local: $e");
      }
    }

    setState(() {
      _scriptACargar = scriptFinal;
      _fueActualizado = actualizado;
    });
  }

  @override
  Widget build(BuildContext context) {
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        systemNavigationBarColor: Color(0xFF0F172A),
        systemNavigationBarIconBrightness: Brightness.light,
      ),
    );

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: InAppWebView(
          initialUrlRequest: URLRequest(
            url: WebUri("https://gemini.google.com"),
          ),
          initialSettings: InAppWebViewSettings(
            isInspectable: true,
            mediaPlaybackRequiresUserGesture: false,
            transparentBackground: false,
            preferredContentMode: UserPreferredContentMode.MOBILE,
          ),
          onWebViewCreated: (controller) {
            webViewController = controller;
          },
          onLoadStop: (controller, url) async {
            try {
              String lenisCode = await rootBundle.loadString(
                'Gemini/lenis.min.js',
              );
              if (lenisCode.isNotEmpty) {
                await controller.evaluateJavascript(source: lenisCode);
              }
            } catch (e) {
              print("Error cargando Lenis: $e");
            }

            if (_scriptACargar.isNotEmpty) {
              try {
                await controller.evaluateJavascript(source: _scriptACargar);
              } catch (e) {
                print("Error evaluando script remoto: $e");
              }
            }

            if (_fueActualizado && mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: const Row(
                    children: [
                      Icon(Icons.system_update, color: Colors.cyanAccent),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          "Gemini Vibes se actualizó desde la nube",
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
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                  duration: const Duration(seconds: 4),
                ),
              );
            }
          },
        ),
      ),
    );
  }
}
