import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

const apiBase = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://syntra-ia-three.vercel.app/api',
);
const purple = Color(0xFF8067E8);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SyntraApp());
}

class SyntraApp extends StatefulWidget {
  const SyntraApp({super.key});
  @override
  State<SyntraApp> createState() => _SyntraAppState();
}

class _SyntraAppState extends State<SyntraApp> {
  bool _isDark = true;

  @override
  void initState() {
    super.initState();
    _restoreTheme();
  }

  Future<void> _restoreTheme() async {
    final prefs = await SharedPreferences.getInstance();
    if (mounted) setState(() => _isDark = prefs.getBool('syntra_theme_dark') ?? true);
  }

  Future<void> _toggleTheme() async {
    setState(() => _isDark = !_isDark);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('syntra_theme_dark', _isDark);
  }

  ThemeData _buildTheme(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final scheme = ColorScheme.fromSeed(seedColor: purple, brightness: brightness);
    final background = dark ? const Color(0xFF111116) : const Color(0xFFF7F7FA);
    final surface = dark ? const Color(0xFF19191F) : Colors.white;
    final border = dark ? const Color(0xFF303039) : const Color(0xFFE5E3EC);
    return ThemeData(
      brightness: brightness,
      scaffoldBackgroundColor: background,
      colorScheme: scheme.copyWith(primary: purple, surface: surface),
      useMaterial3: true,
      appBarTheme: AppBarTheme(backgroundColor: background, foregroundColor: dark ? const Color(0xFFF4F4F7) : const Color(0xFF24232D), elevation: 0, surfaceTintColor: Colors.transparent),
      drawerTheme: DrawerThemeData(backgroundColor: surface),
      cardTheme: CardThemeData(color: surface, elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: border))),
      inputDecorationTheme: InputDecorationTheme(
        filled: true, fillColor: surface,
        hintStyle: TextStyle(color: dark ? const Color(0xFF9696A5) : const Color(0xFF777787)),
        labelStyle: TextStyle(color: dark ? const Color(0xFFC7C7D1) : const Color(0xFF555463)),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: BorderSide(color: border)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: BorderSide(color: border)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: const BorderSide(color: purple, width: 1.5)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Syntra',
    debugShowCheckedModeBanner: false,
    theme: _buildTheme(Brightness.light),
    darkTheme: _buildTheme(Brightness.dark),
    themeMode: _isDark ? ThemeMode.dark : ThemeMode.light,
    home: ChatPage(isDark: _isDark, onToggleTheme: _toggleTheme),
  );
}

class ChatPage extends StatefulWidget {
  final bool isDark;
  final VoidCallback onToggleTheme;
  const ChatPage({super.key, required this.isDark, required this.onToggleTheme});
  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  String? token;
  Map<String, dynamic>? user;
  List<Map<String, dynamic>> conversations = [];
  List<Map<String, dynamic>> messages = [];
  String? conversationId;
  String model = 'qwen3:4b';
  List<String> models = [];
  final input = TextEditingController();
  bool busy = false;
  bool loading = true;
  String? error;
  bool registering = false;
  final nameInput = TextEditingController();
  final emailInput = TextEditingController();
  final passwordInput = TextEditingController();
  final scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _restore();
  }

  @override
  void dispose() {
    input.dispose(); nameInput.dispose(); emailInput.dispose(); passwordInput.dispose(); scroll.dispose();
    super.dispose();
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    token = prefs.getString('token');
    final savedUser = prefs.getString('user');
    if (savedUser != null) {
      try { user = Map<String, dynamic>.from(jsonDecode(savedUser)); } catch (_) {}
    }
    if (token != null && user != null) {
      await _loadConversations();
      await _loadModels();
    }
    if (mounted) setState(() { loading = false; });
  }

  Future<Map<String, dynamic>> _request(String path, {String method = 'GET', Map<String, dynamic>? body}) async {
    final uri = Uri.parse('$apiBase$path');
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (token != null) headers['Authorization'] = 'Bearer $token';
    final request = http.Request(method, uri)..headers.addAll(headers);
    if (body != null) request.body = jsonEncode(body);
    final streamed = await request.send().timeout(const Duration(seconds: 130));
    final response = await http.Response.fromStream(streamed);
    final data = response.body.isEmpty ? <String, dynamic>{} : Map<String, dynamic>.from(jsonDecode(response.body));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(data['error'] ?? 'Erro HTTP ${response.statusCode}');
    }
    return data;
  }

  Future<void> _authenticate() async {
    setState(() { busy = true; error = null; });
    try {
      final result = await _request('/auth/${registering ? 'register' : 'login'}', method: 'POST', body: {
        if (registering) 'name': nameInput.text.trim(),
        'email': emailInput.text.trim(),
        'password': passwordInput.text,
      });
      token = result['token'] as String;
      user = Map<String, dynamic>.from(result['user']);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('token', token!);
      await prefs.setString('user', jsonEncode(user));
      await _loadModels();
      await _loadConversations();
    } catch (e) {
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> _loadModels() async {
    try {
      final data = await _request('/chat/models');
      models = (data['models'] as List? ?? []).map((m) => m['name'].toString()).toList();
      if (models.isNotEmpty && !models.contains(model)) model = models.first;
    } catch (_) {}
  }

  Future<void> _loadConversations() async {
    try {
      final data = await _request('/conversations');
      conversations = (data['conversations'] as List? ?? []).map((v) => Map<String, dynamic>.from(v)).toList();
      if (conversationId == null && conversations.isNotEmpty) {
        conversationId = conversations.first['id'].toString();
        await _loadMessages();
      }
    } catch (e) { error = e.toString().replaceFirst('Exception: ', ''); }
  }

  Future<void> _loadMessages() async {
    if (conversationId == null) { setState(() => messages = []); return; }
    try {
      final data = await _request('/conversations/$conversationId/messages');
      setState(() => messages = (data['messages'] as List? ?? []).map((v) => Map<String, dynamic>.from(v)).toList());
    } catch (e) { setState(() => error = e.toString().replaceFirst('Exception: ', '')); }
  }

  Future<void> _newConversation() async {
    try {
      final data = await _request('/conversations', method: 'POST', body: {'title': 'Nova conversa', 'model': model});
      final conv = Map<String, dynamic>.from(data['conversation']);
      setState(() { conversations.insert(0, conv); conversationId = conv['id'].toString(); messages = []; error = null; });
    } catch (e) { setState(() => error = e.toString().replaceFirst('Exception: ', '')); }
  }

  Future<void> _send([String? prompt]) async {
    final text = (prompt ?? input.text).trim();
    if (text.isEmpty || busy) return;
    setState(() { busy = true; error = null; });
    input.clear();
    try {
      if (conversationId == null) {
        final created = await _request('/conversations', method: 'POST', body: {'title': text.substring(0, text.length > 60 ? 60 : text.length), 'model': model});
        final conv = Map<String, dynamic>.from(created['conversation']);
        conversationId = conv['id'].toString();
        conversations.insert(0, conv);
      }
      setState(() => messages.add({'role': 'user', 'content': text}));
      final result = await _request('/chat', method: 'POST', body: {'conversationId': conversationId, 'message': text, 'model': model});
      setState(() => messages.add(Map<String, dynamic>.from(result['message'])));
      await _loadConversations();
    } catch (e) {
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token'); await prefs.remove('user');
    setState(() { token = null; user = null; messages = []; conversations = []; conversationId = null; });
  }

  Future<void> _openSettings() async {
    await showModalBottomSheet<void>(
      context: context, backgroundColor: Theme.of(context).colorScheme.surface, showDragHandle: true,
      builder: (ctx) => SafeArea(child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Configurações', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 18),
          const Text('Modelo de IA'),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            value: models.contains(model) ? model : null,
            decoration: const InputDecoration(),
            items: models.map((m) => DropdownMenuItem(value: m, child: Text(m))).toList(),
            onChanged: (v) async {
              if (v == null) return;
              setState(() => model = v);
              if (conversationId != null) {
                try { await _request('/conversations/$conversationId', method: 'PATCH', body: {'model': v}); } catch (_) {}
              }
              if (ctx.mounted) Navigator.pop(ctx);
            },
          ),
          const SizedBox(height: 20),
          ListTile(leading: const Icon(Icons.logout), title: const Text('Sair da conta'), onTap: () { Navigator.pop(ctx); _logout(); }),
        ]),
      )),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (token == null || user == null) return _authView();
    return Scaffold(
      appBar: AppBar(
        title: const Row(children: [Icon(Icons.auto_awesome, color: purple), SizedBox(width: 8), Text('syntra', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: -1))]),
        actions: [
          IconButton(onPressed: widget.onToggleTheme, icon: Icon(widget.isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined), tooltip: widget.isDark ? 'Ativar tema claro' : 'Ativar tema escuro'),
          IconButton(onPressed: _newConversation, icon: const Icon(Icons.add_comment_outlined), tooltip: 'Nova conversa'),
          IconButton(onPressed: _openSettings, icon: const Icon(Icons.tune), tooltip: 'Configurações'),
        ],
      ),
      drawer: Drawer(
        backgroundColor: Theme.of(context).colorScheme.surface,
        child: SafeArea(child: Column(children: [
          const Padding(padding: EdgeInsets.all(20), child: Row(children: [Icon(Icons.auto_awesome, color: purple), SizedBox(width: 8), Text('Conversas', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold))])),
          Expanded(child: ListView(children: conversations.map((c) => ListTile(
            leading: const Icon(Icons.chat_bubble_outline),
            title: Text(c['title']?.toString() ?? 'Nova conversa', maxLines: 1, overflow: TextOverflow.ellipsis),
            selected: c['id'].toString() == conversationId,
            onTap: () { setState(() => conversationId = c['id'].toString()); Navigator.pop(context); _loadMessages(); },
          )).toList())),
          ListTile(leading: const Icon(Icons.person_outline), title: Text(user?['name']?.toString() ?? ''), subtitle: Text(user?['email']?.toString() ?? ''), onTap: _openSettings),
        ])),
      ),
      body: Column(children: [
        if (error != null) Material(color: Theme.of(context).brightness == Brightness.dark ? const Color(0xFF3B242B) : const Color(0xFFFFF0F1), child: ListTile(dense: true, leading: const Icon(Icons.error_outline, color: Colors.pinkAccent), title: Text(error!, style: const TextStyle(fontSize: 12)), trailing: IconButton(onPressed: () => setState(() => error = null), icon: const Icon(Icons.close)))),
        Expanded(child: messages.isEmpty ? _welcome() : ListView.builder(
          controller: scroll, padding: const EdgeInsets.fromLTRB(14, 20, 14, 20),
          itemCount: messages.length + (busy ? 1 : 0),
          itemBuilder: (context, index) {
            if (index == messages.length) return const Padding(padding: EdgeInsets.all(12), child: Align(alignment: Alignment.centerLeft, child: CircularProgressIndicator(strokeWidth: 2)));
            final m = messages[index];
            final isUser = m['role'] == 'user';
            return Align(
              alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
              child: Container(
                constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * .84),
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(13),
                decoration: BoxDecoration(
                  color: isUser ? Theme.of(context).colorScheme.primaryContainer : Theme.of(context).colorScheme.surface,
                  border: Border.all(color: Theme.of(context).brightness == Brightness.dark ? const Color(0xFF303039) : const Color(0xFFE5E3EC)),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: SelectableText(m['content']?.toString() ?? '', style: const TextStyle(fontSize: 14, height: 1.5)),
              ),
            );
          },
        )),
        SafeArea(top: false, child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          child: Column(children: [
            if (messages.isEmpty) Wrap(spacing: 8, runSpacing: 8, children: [
              ActionChip(label: const Text('Me ajude a programar'), onPressed: busy ? null : () => _send('Me ajude a programar')),
              ActionChip(label: const Text('Explique um assunto'), onPressed: busy ? null : () => _send('Explique um assunto de forma simples')),
            ]),
            const SizedBox(height: 8),
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(child: TextField(
                controller: input, minLines: 1, maxLines: 5, enabled: !busy,
                onSubmitted: (_) => _send(),
                decoration: const InputDecoration(hintText: 'Mensagem para o Syntra...', contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12)),
              )),
              const SizedBox(width: 8),
              IconButton.filled(onPressed: busy ? null : _send, icon: busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send), style: IconButton.styleFrom(backgroundColor: purple, foregroundColor: Colors.white)),
            ]),
          ]),
        )),
      ]),
    );
  }

  Widget _welcome() => Center(child: SingleChildScrollView(child: Padding(
    padding: const EdgeInsets.all(28),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 62, height: 62, decoration: BoxDecoration(color: Theme.of(context).colorScheme.primaryContainer, borderRadius: BorderRadius.circular(19)), child: const Icon(Icons.auto_awesome, color: purple, size: 30)),
      const SizedBox(height: 20),
      const Text('O que vamos criar hoje?', textAlign: TextAlign.center, style: TextStyle(fontSize: 25, fontWeight: FontWeight.bold, letterSpacing: -.8)),
      const SizedBox(height: 8),
      Text('Pergunte, explore ideias ou resolva algo complexo.', textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
    ]),
  )));

  Widget _authView() => Scaffold(
    body: Stack(
      children: [
        Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Icon(Icons.auto_awesome, size: 48, color: purple),
            const SizedBox(height: 12),
            const Text('syntra.', textAlign: TextAlign.center, style: TextStyle(fontSize: 34, fontWeight: FontWeight.bold, letterSpacing: -1.5)),
            const SizedBox(height: 8),
            Text(registering ? 'Crie sua conta' : 'Entre na sua conta', textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
            const SizedBox(height: 28),
            if (registering) ...[
              TextField(controller: nameInput, decoration: const InputDecoration(labelText: 'Nome')),
              const SizedBox(height: 12),
            ],
            TextField(controller: emailInput, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'E-mail')),
            const SizedBox(height: 12),
            TextField(controller: passwordInput, obscureText: true, decoration: const InputDecoration(labelText: 'Senha (mínimo 8 caracteres)')),
            if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: Colors.pinkAccent))),
            const SizedBox(height: 18),
            FilledButton(onPressed: busy ? null : _authenticate, child: busy ? const CircularProgressIndicator() : Text(registering ? 'Criar conta' : 'Entrar')),
            TextButton(onPressed: () => setState(() { registering = !registering; error = null; }), child: Text(registering ? 'Já tenho uma conta' : 'Criar uma conta')),
          ]),
        ))),
        Positioned(top: 8, right: 8, child: SafeArea(child: IconButton(
          onPressed: widget.onToggleTheme,
          tooltip: widget.isDark ? 'Ativar tema claro' : 'Ativar tema escuro',
          icon: Icon(widget.isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
        ))),
      ],
    ),
  );
}
