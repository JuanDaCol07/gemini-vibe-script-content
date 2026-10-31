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

  // Función para descargar o cargar la lógica/script de forma remota con persistencia segura
  Future<Map<String, dynamic>> _loadRemoteScript() async {
    final prefs = await SharedPreferences.getInstance();

    // URL directa al archivo en tu repositorio dentro de la carpeta Gemini/
    const String urlScript =
        'https://raw.githubusercontent.com/JuanDaCol07/gemini-vibe-script-content/refs/heads/main/Gemini/content.js';

    try {
      final response = await http
          .get(Uri.parse(urlScript))
          .timeout(const Duration(seconds: 5));

      if (response.statusCode == 200) {
        String nuevoScript = response.body;

        // Verificamos qué había guardado antes
        String? scriptViejo = prefs.getString('cached_content_script');
        bool esNuevaActualizacion = (scriptViejo != nuevoScript);

        if (esNuevaActualizacion) {
          // FORZAMOS el guardado correcto con await
          bool guardadoExitoso = await prefs.setString(
            'cached_content_script',
            nuevoScript,
          );
          print(
            "¿Se guardó en SharedPreferences exitosamente?: $guardadoExitoso",
          );

          return {'script': nuevoScript, 'actualizado': true};
        } else {
          return {'script': nuevoScript, 'actualizado': false};
        }
      }
    } catch (e) {
      print("No se pudo conectar a internet para actualizar: $e");
    }

    // Respaldo local si no hay conexión a internet
    String? scriptGuardado = prefs.getString('cached_content_script');
    if (scriptGuardado != null && scriptGuardado.isNotEmpty) {
      print("Cargando script desde el caché local de SharedPreferences...");
      return {'script': scriptGuardado, 'actualizado': false};
    }

    try {
      print("Cargando de emergencia desde assets locales...");
      String assetScript = await rootBundle.loadString('Gemini/content.js');
      return {'script': assetScript, 'actualizado': false};
    } catch (e) {
      print("Error cargando respaldo local: $e");
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
        child: Stack(
          children: [
            // Fondo personalizado con gradiente oscuro / Glassmorphism base
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFF0F172A), Color(0xFF1E293B)],
                ),
              ),
            ),
            // WebView principal con inyección de Lenis y Script Remoto de GitHub
            InAppWebView(
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
              },
              onLoadStop: (controller, url) async {
                // 1. Inyectar Lenis local para un scroll ultra suave
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

                // 2. Cargar e inyectar el script remoto (GitHub o Caché local)
                Map<String, dynamic> resultado = await _loadRemoteScript();
                String jsCode = resultado['script'];
                bool fueActualizado = resultado['actualizado'];

                if (jsCode.isNotEmpty) {
                  await controller.evaluateJavascript(source: jsCode);
                }

                // 3. Notificar de forma elegante si hubo actualización automática OTA
                if (fueActualizado && mounted) {
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
          ],
        ),
      ),
    );
  }
}
