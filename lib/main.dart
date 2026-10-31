import 'package:flutter/material.dart';
import 'content.dart'; // Tu archivo que ahora gestionará la lógica remota

void main() {
  runApp(const MainApp());
}

class MainApp extends StatelessWidget {
  const MainApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: ContentScreen(),
    );
  }
}
