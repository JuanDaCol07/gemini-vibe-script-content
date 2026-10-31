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

  // Función para descargar o cargar el script de content.js
  Future<Map<String, dynamic>> _loadContentScript() async {
    final prefs = await SharedPreferences.getInstance();

    const String urlScript =
        'https://raw.githubusercontent.com/JuanDaCol07/gemini-vibe-script-content/refs/heads/main/Gemini/content.js';

    try {
      final response = await http
          .get(Uri.parse(urlScript))
          .timeout(const Duration(seconds: 5));

      if (response.statusCode == 200) {
        String nuevoScript = response.body;

        String? scriptViejo = prefs.getString('cached_content_js');
        bool esNuevaActualizacion = (scriptViejo != nuevoScript);

        if (esNuevaActualizacion) {
          await prefs.setString('cached_content_js', nuevoScript);
          print("¡Script actualizado desde internet exitosamente!");
          return {'script': nuevoScript, 'actualizado': true};
        } else {
          return {'script': nuevoScript, 'actualizado': false};
        }
      }
    } catch (e) {
      print("No se pudo conectar a internet para actualizar el script: $e");
    }

    String? scriptGuardado = prefs.getString('cached_content_js');
    if (scriptGuardado != null && scriptGuardado.isNotEmpty) {
      print("Cargando script desde el caché local...");
      return {'script': scriptGuardado, 'actualizado': false};
    }

    try {
      print("Cargando script de emergencia desde assets locales...");
      String assetScript = await rootBundle.loadString('Gemini/content.js');
      return {'script': assetScript, 'actualizado': false};
    } catch (e) {
      print("Error cargando el script local de emergencia: $e");
      return {'script': "", 'actualizado': false};
    }
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
            transparentBackground: true,
          ),
          onWebViewCreated: (controller) {
            webViewController = controller;

            controller.addJavaScriptHandler(
              handlerName: 'guardarPreferencia',
              callback: (args) async {
                if (args.isEmpty) return {"status": "error"};
                String clave = args[0];
                dynamic valor = args[1];

                final prefs = await SharedPreferences.getInstance();
                if (valor is bool) {
                  await prefs.setBool(clave, valor);
                } else if (valor is String) {
                  await prefs.setString(clave, valor);
                } else if (valor is int) {
                  await prefs.setInt(clave, valor);
                } else if (valor is double) {
                  await prefs.setDouble(clave, valor);
                }

                print("Preferencia guardada desde JS -> $clave: $valor");
                return {"status": "ok"};
              },
            );
          },
          onLoadStop: (controller, url) async {
            final prefs = await SharedPreferences.getInstance();
            int burbujaHue = prefs.getInt('burbuja_h') ?? 221;
            bool bloqueoActivo = prefs.getBool('tg-bloqueo-activo') ?? false;

            double safeTop = MediaQuery.of(context).padding.top;

            await controller.evaluateJavascript(
              source:
                  """
                if (window.tgSetSafeArea) {
                  window.tgSetSafeArea($safeTop);
                }
              """,
            );

            // 1. Cargamos e inyectamos Lenis primero desde los assets locales
            try {
              String lenisCode = await rootBundle.loadString(
                'Gemini/lenis.min.js',
              );
              if (lenisCode.isNotEmpty) {
                await controller.evaluateJavascript(source: lenisCode);
                print("Lenis inyectado correctamente desde assets.");
              }
            } catch (e) {
              print("No se pudo cargar lenis.min.js desde assets: $e");
            }

            // 2. Cargamos e inyectamos el content.js (de internet o caché)
            Map<String, dynamic> resultado = await _loadContentScript();
            String jsCode = resultado['script'];
            bool fueActualizado = resultado['actualizado'];

            if (jsCode.isNotEmpty) {
              await controller.evaluateJavascript(source: jsCode);
            }

            // 3. Mostramos aviso si se actualizó automáticamente
            if (fueActualizado && mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: const Row(
                    children: [
                      Icon(Icons.system_update, color: Colors.cyanAccent),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          "Se ha actualizado Gemini Vibes de forma automática",
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
