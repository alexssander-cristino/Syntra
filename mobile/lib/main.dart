
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const apiBase = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://192.168.0.106:3000/api',
);

const purple = Color(0xFF8067E8);
const requestTimeout = Duration(seconds: 130);

String get normalizedApiBase => apiBase.replaceAll(RegExp(r'/+$'), '');

void main() {
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
  }

  void _toggleTheme() {
    setState(() => _isDark = !_isDark);
  }

  ThemeData _buildTheme(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final scheme = ColorScheme.fromSeed(
      seedColor: purple,
      brightness: brightness,
    );

    final background =
        dark ? const Color(0xFF111116) : const Color(0xFFF7F7FA);
    final surface = dark ? const Color(0xFF19191F) : Colors.white;
    final border = dark ? const Color(0xFF303039) : const Color(0xFFE5E3EC);

    return ThemeData(
      brightness: brightness,
      scaffoldBackgroundColor: background,
      colorScheme: scheme.copyWith(
        primary: purple,
        surface: surface,
      ),
      useMaterial3: true,
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        foregroundColor:
            dark ? const Color(0xFFF4F4F7) : const Color(0xFF24232D),
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      drawerTheme: DrawerThemeData(backgroundColor: surface),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        hintStyle: TextStyle(
          color: dark ? const Color(0xFF9696A5) : const Color(0xFF777787),
        ),
        labelStyle: TextStyle(
          color: dark ? const Color(0xFFC7C7D1) : const Color(0xFF555463),
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: const BorderSide(color: purple, width: 1.5),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Syntra',
      debugShowCheckedModeBanner: false,
      theme: _buildTheme(Brightness.light),
      darkTheme: _buildTheme(Brightness.dark),
      themeMode: _isDark ? ThemeMode.dark : ThemeMode.light,
      home: ChatPage(
        isDark: _isDark,
        onToggleTheme: _toggleTheme,
      ),
    );
  }
}

class ChatPage extends StatefulWidget {
  final bool isDark;
  final VoidCallback onToggleTheme;

  const ChatPage({
    super.key,
    required this.isDark,
    required this.onToggleTheme,
  });

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  String? token;
  Map<String, dynamic>? user;

  List<Map<String, dynamic>> conversations = [];
  List<Map<String, dynamic>> messages = [];
  List<String> models = [];

  String? conversationId;
  String model = 'qwen3:4b';

  final input = TextEditingController();
  final nameInput = TextEditingController();
  final emailInput = TextEditingController();
  final passwordInput = TextEditingController();
  final scroll = ScrollController();

  bool busy = false;
  bool loading = true;
  bool registering = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  @override
  void dispose() {
    input.dispose();
    nameInput.dispose();
    emailInput.dispose();
    passwordInput.dispose();
    scroll.dispose();
    super.dispose();
  }

  String _errorMessage(Object e) {
    if (e is TimeoutException) {
      return 'O servidor demorou demais para responder. Tente novamente.';
    }

    if (e is SocketException) {
      return 'Não foi possível conectar ao servidor. Verifique sua internet e a URL da API.';
    }

    if (e is http.ClientException) {
      return 'Falha de comunicação com o servidor. Verifique sua conexão.';
    }

    if (e is FormatException) {
      return 'O servidor retornou uma resposta inválida.';
    }

    return e.toString().replaceFirst('Exception: ', '');
  }

  Map<String, dynamic> _decodeObject(String body) {
    if (body.trim().isEmpty) return <String, dynamic>{};

    final decoded = jsonDecode(body);

    if (decoded is Map<String, dynamic>) {
      return decoded;
    }

    throw const FormatException('Resposta JSON inesperada.');
  }

  Future<Map<String, dynamic>> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final base = normalizedApiBase;

    if (!base.startsWith('https://') && !base.startsWith('http://')) {
      throw Exception('A URL da API está configurada incorretamente.');
    }

    final uri = Uri.parse('$base$path');

    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    final currentToken = token;
    if (currentToken != null && currentToken.isNotEmpty) {
      headers['Authorization'] = 'Bearer $currentToken';
    }

    final request = http.Request(method, uri)
      ..headers.addAll(headers);

    if (body != null) {
      request.body = jsonEncode(body);
    }

    try {
      final streamed = await request.send().timeout(
        const Duration(seconds: 30),
      );

      final response = await http.Response.fromStream(streamed).timeout(
        requestTimeout,
      );

      final data = _decodeObject(response.body);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final message = data['error']?.toString();

        throw Exception(
          message != null && message.isNotEmpty
              ? message
              : 'Erro HTTP ${response.statusCode}.',
        );
      }

      return data;
    } on TimeoutException {
      rethrow;
    } on SocketException {
      rethrow;
    } on http.ClientException {
      rethrow;
    } on FormatException {
      rethrow;
    }
  }

  Future<void> _restore() async {
    if (mounted) setState(() => loading = false);
  }

  Future<void> _authenticate() async {
    if (busy) return;

    final email = emailInput.text.trim().toLowerCase();
    final password = passwordInput.text;
    final name = nameInput.text.trim();

    if (registering && name.length < 2) {
      setState(() => error = 'Informe um nome com pelo menos 2 caracteres.');
      return;
    }

    if (email.isEmpty || !email.contains('@')) {
      setState(() => error = 'Informe um e-mail válido.');
      return;
    }

    if (password.isEmpty) {
      setState(() => error = 'Informe sua senha.');
      return;
    }

    if (registering && password.length < 8) {
      setState(() => error = 'A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    setState(() {
      busy = true;
      error = null;
    });

    try {
      final result = await _request(
        '/auth/${registering ? 'register' : 'login'}',
        method: 'POST',
        body: {
          if (registering) 'name': name,
          'email': email,
          'password': password,
        },
      );

      final receivedToken = result['token'];
      final receivedUser = result['user'];

      if (receivedToken is! String ||
          receivedToken.isEmpty ||
          receivedUser is! Map) {
        throw Exception('A API não retornou os dados esperados de autenticação.');
      }

      final parsedUser = Map<String, dynamic>.from(receivedUser);

      token = receivedToken;
      user = parsedUser;
      conversationId = null;
      conversations = [];
      messages = [];
      models = [];

      if (!mounted) return;

      setState(() {});

      await _loadModels();
      await _loadConversations();
    } catch (e) {
      if (!mounted) return;
      setState(() => error = _errorMessage(e));
    } finally {
      if (mounted) {
        setState(() => busy = false);
      }
    }
  }

  Future<void> _loadModels() async {
    try {
      final data = await _request('/chat/models');
      final rawModels = data['models'];

      final loadedModels = <String>[];

      if (rawModels is List) {
        for (final item in rawModels) {
          String? name;

          if (item is Map) {
            name = item['name']?.toString();
          } else if (item is String) {
            name = item;
          }

          if (name != null && name.trim().isNotEmpty) {
            loadedModels.add(name.trim());
          }
        }
      }

      if (!mounted) return;

      setState(() {
        models = loadedModels;

        if (models.isNotEmpty && !models.contains(model)) {
          model = models.first;
        }
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        error = 'Não foi possível carregar os modelos: ${_errorMessage(e)}';
      });
    }
  }

  Future<void> _loadConversations() async {
    try {
      final data = await _request('/conversations');
      final raw = data['conversations'];

      final loaded = raw is List
          ? raw
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList()
          : <Map<String, dynamic>>[];

      if (!mounted) return;

      String? nextId = conversationId;

      final exists = nextId != null &&
          loaded.any((c) => c['id'].toString() == nextId);

      if (!exists) {
        nextId = loaded.isNotEmpty ? loaded.first['id'].toString() : null;
      }

      setState(() {
        conversations = loaded;
        conversationId = nextId;
      });

      if (nextId != null) {
        await _loadMessages();
      } else {
        setState(() => messages = []);
      }
    } catch (e) {
      if (!mounted) return;

      setState(() {
        error = 'Erro ao carregar conversas: ${_errorMessage(e)}';
      });
    }
  }

  Future<void> _loadMessages() async {
    final id = conversationId;

    if (id == null) {
      if (mounted) setState(() => messages = []);
      return;
    }

    try {
      final encodedId = Uri.encodeComponent(id);
      final data = await _request('/conversations/$encodedId/messages');
      final raw = data['messages'];

      final loaded = raw is List
          ? raw
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList()
          : <Map<String, dynamic>>[];

      if (!mounted || conversationId != id) return;

      setState(() => messages = loaded);
      _scrollToBottom();
    } catch (e) {
      if (!mounted) return;

      setState(() => error = _errorMessage(e));
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !scroll.hasClients) return;

      scroll.animateTo(
        scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _newConversation() async {
    if (busy) return;

    setState(() {
      busy = true;
      error = null;
    });

    try {
      final data = await _request(
        '/conversations',
        method: 'POST',
        body: {
          'title': 'Nova conversa',
          'model': model,
        },
      );

      final raw = data['conversation'];

      if (raw is! Map) {
        throw Exception('A API não retornou a nova conversa.');
      }

      final conv = Map<String, dynamic>.from(raw);

      if (conv['id'] == null) {
        throw Exception('A conversa retornada não possui um ID.');
      }

      if (!mounted) return;

      setState(() {
        conversations.removeWhere(
          (c) => c['id'].toString() == conv['id'].toString(),
        );
        conversations.insert(0, conv);
        conversationId = conv['id'].toString();
        messages = [];
        error = null;
      });
    } catch (e) {
      if (mounted) {
        setState(() => error = _errorMessage(e));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _send([String? prompt]) async {
    final text = (prompt ?? input.text).trim();

    if (text.isEmpty || busy) return;

    setState(() {
      busy = true;
      error = null;
    });

    input.clear();

    try {
      if (conversationId == null) {
        final created = await _request(
          '/conversations',
          method: 'POST',
          body: {
            'title': text.length > 60 ? text.substring(0, 60) : text,
            'model': model,
          },
        );

        final raw = created['conversation'];

        if (raw is! Map) {
          throw Exception('Não foi possível criar uma conversa.');
        }

        final conv = Map<String, dynamic>.from(raw);

        if (conv['id'] == null) {
          throw Exception('A conversa criada não possui um ID.');
        }

        conversationId = conv['id'].toString();

        if (mounted) {
          setState(() {
            conversations.insert(0, conv);
          });
        }
      }

      final activeId = conversationId;

      if (activeId == null) {
        throw Exception('Nenhuma conversa selecionada.');
      }

      if (mounted) {
        setState(() {
          messages.add({
            'role': 'user',
            'content': text,
          });
        });
      }

      _scrollToBottom();

      final result = await _request(
        '/chat',
        method: 'POST',
        body: {
          'conversationId': activeId,
          'message': text,
          'model': model,
        },
      );

      final rawMessage = result['message'];

      if (rawMessage is! Map) {
        throw Exception('A API não retornou a resposta da IA.');
      }

      if (!mounted) return;

      setState(() {
        messages.add(Map<String, dynamic>.from(rawMessage));
      });

      _scrollToBottom();
      await _loadConversations();
    } catch (e) {
      if (mounted) {
        setState(() => error = _errorMessage(e));
      }
    } finally {
      if (mounted) {
        setState(() => busy = false);
      }
    }
  }

  Future<void> _logout() async {
    if (!mounted) return;

    setState(() {
      token = null;
      user = null;
      messages = [];
      conversations = [];
      conversationId = null;
      models = [];
      error = null;
      busy = false;
      passwordInput.clear();
    });
  }

  Future<void> _openSettings() async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Theme.of(context).colorScheme.surface,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Configurações',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 18),
              const Text('Modelo de IA'),
              const SizedBox(height: 8),
              if (models.isEmpty)
                const Text('Nenhum modelo disponível no momento.')
              else
                DropdownButtonFormField<String>(
                  value: models.contains(model) ? model : models.first,
                  decoration: const InputDecoration(),
                  items: models
                      .map(
                        (m) => DropdownMenuItem(
                          value: m,
                          child: Text(m),
                        ),
                      )
                      .toList(),
                  onChanged: busy
                      ? null
                      : (value) async {
                          if (value == null) return;

                          final oldModel = model;

                          setState(() => model = value);

                          final id = conversationId;

                          if (id != null) {
                            try {
                              await _request(
                                '/conversations/${Uri.encodeComponent(id)}',
                                method: 'PATCH',
                                body: {'model': value},
                              );
                            } catch (e) {
                              if (mounted) {
                                setState(() => model = oldModel);
                                setState(() => error = _errorMessage(e));
                              }
                            }
                          }

                          if (ctx.mounted) Navigator.pop(ctx);
                        },
                ),
              const SizedBox(height: 20),
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('Sair da conta'),
                onTap: () {
                  Navigator.pop(ctx);
                  _logout();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (token == null || user == null) {
      return _authView();
    }

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.auto_awesome, color: purple),
            SizedBox(width: 8),
            Text(
              'syntra',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                letterSpacing: -1,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: widget.onToggleTheme,
            icon: Icon(
              widget.isDark
                  ? Icons.light_mode_outlined
                  : Icons.dark_mode_outlined,
            ),
            tooltip: widget.isDark
                ? 'Ativar tema claro'
                : 'Ativar tema escuro',
          ),
          IconButton(
            onPressed: busy ? null : _newConversation,
            icon: const Icon(Icons.add_comment_outlined),
            tooltip: 'Nova conversa',
          ),
          IconButton(
            onPressed: _openSettings,
            icon: const Icon(Icons.tune),
            tooltip: 'Configurações',
          ),
        ],
      ),
      drawer: Drawer(
        backgroundColor: Theme.of(context).colorScheme.surface,
        child: SafeArea(
          child: Column(
            children: [
              const Padding(
                padding: EdgeInsets.all(20),
                child: Row(
                  children: [
                    Icon(Icons.auto_awesome, color: purple),
                    SizedBox(width: 8),
                    Text(
                      'Conversas',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  children: conversations.map((c) {
                    final id = c['id'].toString();

                    return ListTile(
                      leading: const Icon(Icons.chat_bubble_outline),
                      title: Text(
                        c['title']?.toString() ?? 'Nova conversa',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      selected: id == conversationId,
                      onTap: () {
                        setState(() {
                          conversationId = id;
                          messages = [];
                          error = null;
                        });

                        Navigator.pop(context);
                        _loadMessages();
                      },
                    );
                  }).toList(),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.person_outline),
                title: Text(user?['name']?.toString() ?? ''),
                subtitle: Text(user?['email']?.toString() ?? ''),
                onTap: _openSettings,
              ),
            ],
          ),
        ),
      ),
      body: Column(
        children: [
          if (error != null)
            Material(
              color: Theme.of(context).brightness == Brightness.dark
                  ? const Color(0xFF3B242B)
                  : const Color(0xFFFFF0F1),
              child: ListTile(
                dense: true,
                leading: const Icon(
                  Icons.error_outline,
                  color: Colors.pinkAccent,
                ),
                title: Text(
                  error!,
                  style: const TextStyle(fontSize: 12),
                ),
                trailing: IconButton(
                  onPressed: () => setState(() => error = null),
                  icon: const Icon(Icons.close),
                ),
              ),
            ),
          Expanded(
            child: messages.isEmpty
                ? _welcome()
                : ListView.builder(
                    controller: scroll,
                    padding: const EdgeInsets.fromLTRB(14, 20, 14, 20),
                    itemCount: messages.length + (busy ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index == messages.length) {
                        return const Padding(
                          padding: EdgeInsets.all(12),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        );
                      }

                      final message = messages[index];
                      final isUser = message['role'] == 'user';

                      return Align(
                        alignment: isUser
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          constraints: BoxConstraints(
                            maxWidth: MediaQuery.sizeOf(context).width * .84,
                          ),
                          margin: const EdgeInsets.only(bottom: 12),
                          padding: const EdgeInsets.all(13),
                          decoration: BoxDecoration(
                            color: isUser
                                ? Theme.of(context).colorScheme.primaryContainer
                                : Theme.of(context).colorScheme.surface,
                            border: Border.all(
                              color: Theme.of(context).brightness ==
                                      Brightness.dark
                                  ? const Color(0xFF303039)
                                  : const Color(0xFFE5E3EC),
                            ),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: SelectableText(
                            message['content']?.toString() ?? '',
                            style: const TextStyle(
                              fontSize: 14,
                              height: 1.5,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Column(
                children: [
                  if (messages.isEmpty)
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        ActionChip(
                          label: const Text('Me ajude a programar'),
                          onPressed:
                              busy ? null : () => _send('Me ajude a programar'),
                        ),
                        ActionChip(
                          label: const Text('Explique um assunto'),
                          onPressed: busy
                              ? null
                              : () => _send(
                                    'Explique um assunto de forma simples',
                                  ),
                        ),
                      ],
                    ),
                  const SizedBox(height: 8),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: input,
                          minLines: 1,
                          maxLines: 5,
                          enabled: !busy,
                          onSubmitted: (_) => _send(),
                          decoration: const InputDecoration(
                            hintText: 'Mensagem para o Syntra...',
                            contentPadding: EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 12,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        onPressed: busy ? null : _send,
                        icon: busy
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.send),
                        style: IconButton.styleFrom(
                          backgroundColor: purple,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _welcome() {
    return Center(
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 62,
                height: 62,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(19),
                ),
                child: const Icon(
                  Icons.auto_awesome,
                  color: purple,
                  size: 30,
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'O que vamos criar hoje?',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 25,
                  fontWeight: FontWeight.bold,
                  letterSpacing: -.8,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Pergunte, explore ideias ou resolva algo complexo.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _authView() {
    return Scaffold(
      body: Stack(
        children: [
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(
                      Icons.auto_awesome,
                      size: 48,
                      color: purple,
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'syntra.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 34,
                        fontWeight: FontWeight.bold,
                        letterSpacing: -1.5,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      registering ? 'Crie sua conta' : 'Entre na sua conta',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 28),
                    if (registering) ...[
                      TextField(
                        controller: nameInput,
                        textCapitalization: TextCapitalization.words,
                        enabled: !busy,
                        decoration: const InputDecoration(
                          labelText: 'Nome',
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    TextField(
                      controller: emailInput,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      enabled: !busy,
                      decoration: const InputDecoration(
                        labelText: 'E-mail',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: passwordInput,
                      obscureText: true,
                      enableSuggestions: false,
                      autocorrect: false,
                      enabled: !busy,
                      onSubmitted: (_) {
                        if (!busy) _authenticate();
                      },
                      decoration: const InputDecoration(
                        labelText: 'Senha',
                      ),
                    ),
                    if (error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(
                          error!,
                          style: const TextStyle(
                            color: Colors.pinkAccent,
                          ),
                        ),
                      ),
                    const SizedBox(height: 18),
                    FilledButton(
                      onPressed: busy ? null : _authenticate,
                      child: busy
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                              ),
                            )
                          : Text(registering ? 'Criar conta' : 'Entrar'),
                    ),
                    TextButton(
                      onPressed: busy
                          ? null
                          : () {
                              setState(() {
                                registering = !registering;
                                error = null;
                              });
                            },
                      child: Text(
                        registering ? 'Já tenho uma conta' : 'Criar uma conta',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            top: 8,
            right: 8,
            child: SafeArea(
              child: IconButton(
                onPressed: widget.onToggleTheme,
                tooltip: widget.isDark
                    ? 'Ativar tema claro'
                    : 'Ativar tema escuro',
                icon: Icon(
                  widget.isDark
                      ? Icons.light_mode_outlined
                      : Icons.dark_mode_outlined,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
