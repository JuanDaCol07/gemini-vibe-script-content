import 'package:flutter/material.dart';
import 'content.dart'; // Aquí jalamos tu archivo de contenido

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
