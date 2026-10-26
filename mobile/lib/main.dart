
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:file_picker/file_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
  final searchConversationsInput = TextEditingController();
  Timer? _searchDebounce;
  bool showArchived = false;
  List<String> models = [];

  String? conversationId;
  String model = 'qwen3:4b';

  final input = TextEditingController();
  final nameInput = TextEditingController();
  final emailInput = TextEditingController();
  final passwordInput = TextEditingController();
  final scroll = ScrollController();

  bool busy = false;
  http.Client? activeChatClient;
  bool cancelRequested = false;
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
    activeChatClient?.close();
    _searchDebounce?.cancel();
    searchConversationsInput.dispose();
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
    http.Client? client,
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
      final streamed = await (client != null ? client.send(request) : request.send()).timeout(
        const Duration(seconds: 30),
      );

      final response = await http.Response.fromStream(streamed).timeout(
        requestTimeout,
      );

      final data = _decodeObject(response.body);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final message = data['error']?.toString();

        if (response.statusCode == 401 && token != null) {
          await _clearStoredSession();
        }

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

  static const String _tokenStorageKey = 'syntra_mobile_token';
  static const String _userStorageKey = 'syntra_mobile_user';

  Future<void> _clearStoredSession() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_tokenStorageKey);
    await preferences.remove(_userStorageKey);

    token = null;
    user = null;
    conversationId = null;
    _searchDebounce?.cancel();
    searchConversationsInput.clear();
    showArchived = false;
    conversations = [];
    messages = [];
    models = [];

    if (mounted) setState(() {});
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final savedToken = preferences.getString(_tokenStorageKey);
      final savedUserJson = preferences.getString(_userStorageKey);

      if (savedToken == null ||
          savedToken.isEmpty ||
          savedUserJson == null ||
          savedUserJson.isEmpty) {
        await _clearStoredSession();
        return;
      }

      final decodedUser = jsonDecode(savedUserJson);
      if (decodedUser is! Map) {
        await _clearStoredSession();
        return;
      }

      token = savedToken;
      user = Map<String, dynamic>.from(decodedUser);

      if (mounted) setState(() {});

      // Validate the saved token. A network failure should not erase it;
      // only an HTTP 401 from the API clears the saved session.
      final account = await _request('/auth/me');
      final accountData = account['user'];
      if (accountData is Map) {
        user = Map<String, dynamic>.from(accountData);
        await preferences.setString(_userStorageKey, jsonEncode(user));
        if (mounted) setState(() {});
      }

      await _loadModels();
      await _loadConversations();
    } catch (e) {
      // Do not log the user out for temporary network/server failures.
      if (mounted && token != null) {
        setState(() => error = _errorMessage(e));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
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
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(_tokenStorageKey, receivedToken);
      await preferences.setString(_userStorageKey, jsonEncode(parsedUser));

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
      final query = searchConversationsInput.text.trim();
      final uri = Uri.parse('$normalizedApiBase/conversations').replace(
        queryParameters: {
          if (query.isNotEmpty) 'q': query,
          if (showArchived) 'archived': 'true',
        },
      );
      final data = await _request(
        uri.toString().replaceFirst(normalizedApiBase, ''),
      );
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

      // Pesquisa e arquivo só filtram a lista; não trocam a conversa aberta.
      if (nextId == null && query.isEmpty && !showArchived && loaded.isNotEmpty) {
        nextId = loaded.first['id'].toString();
      }

      setState(() {
        conversations = loaded;
        conversationId = nextId;
      });

      if (nextId != null && exists) {
        await _loadMessages();
      } else if (nextId == null) {
        setState(() => messages = []);
      }
    } catch (e) {
      if (!mounted) return;

      setState(() {
        error = 'Erro ao carregar conversas: ${_errorMessage(e)}';
      });
    }
  }

  void _onConversationSearchChanged(String _) {
    setState(() {});
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), () {
      if (mounted) _loadConversations();
    });
  }

  Future<void> _updateConversation(String id, Map<String, dynamic> changes) async {
    try {
      final data = await _request(
        '/conversations/${Uri.encodeComponent(id)}',
        method: 'PATCH',
        body: changes,
      );
      final updated = data['conversation'];
      if (updated is! Map) throw Exception('A API não retornou a conversa atualizada.');
      if (!mounted) return;
      setState(() {
        conversations = conversations.map((c) =>
          c['id'].toString() == id ? {...c, ...Map<String, dynamic>.from(updated)} : c
        ).toList();
      });
      if (changes['archived'] == true && conversationId == id) {
        final fallbackCandidates = conversations.where((c) => c['id'].toString() != id && c['archived_at'] == null).toList();
        final fallback = fallbackCandidates.isNotEmpty ? fallbackCandidates.first : null;
        setState(() {
          conversationId = fallback?['id']?.toString();
          messages = [];
        });
        if (conversationId != null) await _loadMessages();
      }
      await _loadConversations();
    } catch (e) {
      if (mounted) setState(() => error = _errorMessage(e));
    }
  }

  Future<void> _renameConversation(Map<String, dynamic> conversation) async {
    final controller = TextEditingController(text: conversation['title']?.toString() ?? 'Nova conversa');
    final title = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Renomear conversa'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 120,
          decoration: const InputDecoration(labelText: 'Título da conversa'),
          onSubmitted: (value) => Navigator.pop(dialogContext, value),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, controller.text), child: const Text('Salvar')),
        ],
      ),
    );
    controller.dispose();
    if (title == null) return;
    if (title.trim().isEmpty) {
      if (mounted) setState(() => error = 'O título não pode ficar vazio.');
      return;
    }
    await _updateConversation(conversation['id'].toString(), {'title': title.trim()});
  }

  Future<void> _deleteConversation(Map<String, dynamic> conversation) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Excluir conversa?'),
        content: const Text('Esta ação exclui permanentemente a conversa e suas mensagens.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final id = conversation['id'].toString();
    try {
      await _request('/conversations/${Uri.encodeComponent(id)}', method: 'DELETE');
      if (!mounted) return;
      setState(() {
        conversations.removeWhere((c) => c['id'].toString() == id);
        if (conversationId == id) {
          conversationId = conversations.isNotEmpty ? conversations.first['id'].toString() : null;
          messages = [];
        }
      });
      await _loadConversations();
      if (conversationId != null) await _loadMessages();
    } catch (e) {
      if (mounted) setState(() => error = _errorMessage(e));
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

  Future<void> _streamChat({
    required String conversation,
    required String text,
    required String selectedModel,
    required http.Client client,
  }) async {
    final uri = Uri.parse('$normalizedApiBase/chat/stream');
    final headers = <String, String>{
      'Accept': 'text/event-stream',
      'Content-Type': 'application/json',
    };
    final currentToken = token;
    if (currentToken != null && currentToken.isNotEmpty) {
      headers['Authorization'] = 'Bearer $currentToken';
    }
    final request = http.Request('POST', uri)
      ..headers.addAll(headers)
      ..body = jsonEncode({
        'conversationId': conversation,
        'message': text,
        'model': selectedModel,
      });
    final response = await client.send(request).timeout(const Duration(seconds: 30));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final body = await response.stream.bytesToString();
      final data = _decodeObject(body);
      throw Exception(data['error']?.toString() ?? 'Erro HTTP ${response.statusCode}.');
    }

    String eventName = 'message';
    final dataLines = <String>[];
    await for (final line in response.stream
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .timeout(requestTimeout)) {
      if (line.isEmpty) {
        if (dataLines.isNotEmpty) {
          final payload = _decodeObject(dataLines.join('\n'));
          if (eventName == 'token' && payload['token'] is String) {
            final current = payload['token'] as String;
            if (mounted) {
              setState(() {
                final index = messages.lastIndexWhere((item) => item['role'] == 'assistant' && item['streaming'] == true);
                if (index >= 0) {
                  messages[index] = {
                    ...messages[index],
                    'content': '${messages[index]['content'] ?? ''}$current',
                  };
                }
              });
            }
            _scrollToBottom();
          } else if (eventName == 'error') {
            throw Exception(payload['error']?.toString() ?? 'A geração falhou.');
          }
        }
        eventName = 'message';
        dataLines.clear();
        continue;
      }
      if (line.startsWith('event:')) {
        eventName = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.add(line.substring(5).trim());
      }
    }
  }

  Future<void> _send([String? prompt]) async {
    final text = (prompt ?? input.text).trim();

    if (text.isEmpty || busy) return;

    cancelRequested = false;
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
      if (cancelRequested) throw Exception('Geração interrompida.');

      if (mounted) {
        setState(() {
          messages.add({
            'role': 'user',
            'content': text,
          });
        });
      }

      _scrollToBottom();

      final requestClient = http.Client();
      activeChatClient = requestClient;
      if (mounted) {
        setState(() {
          messages.add({
            'role': 'assistant',
            'content': '',
            'streaming': true,
          });
        });
      }
      await _streamChat(
        conversation: activeId,
        text: text,
        selectedModel: model,
        client: requestClient,
      );

      await _loadMessages();
      _scrollToBottom();
      await _loadConversations();
    } catch (e) {
      if (mounted) {
        setState(() => error = cancelRequested ? 'Geração interrompida.' : _errorMessage(e));
        await _loadMessages();
      }
    } finally {
      activeChatClient?.close();
      activeChatClient = null;
      cancelRequested = false;
      if (mounted) {
        setState(() => busy = false);
      }
    }
  }

  void _stopGeneration() {
    cancelRequested = true;
    activeChatClient?.close();
  }

  Future<void> _editMessage(Map<String, dynamic> message) async {
    if (busy || message['id'] == null || conversationId == null) return;
    final controller = TextEditingController(text: message['content']?.toString() ?? '');
    final edited = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Editar mensagem'),
        content: TextField(
          controller: controller,
          autofocus: true,
          minLines: 2,
          maxLines: 7,
          maxLength: 12000,
          decoration: const InputDecoration(hintText: 'Ajuste seu pedido'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, controller.text), child: const Text('Salvar e regenerar')),
        ],
      ),
    );
    controller.dispose();
    if (edited == null || edited.trim().isEmpty) return;

    final id = conversationId!;
    final client = http.Client();
    cancelRequested = false;
    setState(() { busy = true; error = null; });
    activeChatClient = client;
    try {
      await _request('/chat/conversations/${Uri.encodeComponent(id)}/edit',
        method: 'POST',
        body: {'messageId': message['id'].toString(), 'content': edited.trim()},
        client: client,
      );
      await _loadMessages();
      await _loadConversations();
    } catch (e) {
      if (mounted) setState(() => error = cancelRequested ? 'Geração interrompida.' : _errorMessage(e));
      await _loadMessages();
    } finally {
      client.close();
      activeChatClient = null;
      cancelRequested = false;
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _regenerate() async {
    final id = conversationId;
    if (id == null || busy || messages.isEmpty) return;
    final client = http.Client();
    cancelRequested = false;
    activeChatClient = client;
    setState(() { busy = true; error = null; });
    try {
      await _request('/chat/conversations/${Uri.encodeComponent(id)}/regenerate', method: 'POST', body: const {}, client: client);
      await _loadMessages();
      await _loadConversations();
    } catch (e) {
      if (mounted) setState(() => error = cancelRequested ? 'Geração interrompida.' : _errorMessage(e));
      await _loadMessages();
    } finally {
      client.close();
      activeChatClient = null;
      cancelRequested = false;
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _rateMessage(Map<String, dynamic> message, int rating) async {
    final id = conversationId;
    if (id == null || message['id'] == null || busy) return;
    try {
      await _request('/conversations/${Uri.encodeComponent(id)}/messages/${Uri.encodeComponent(message['id'].toString())}/feedback',
        method: 'POST', body: {'rating': rating});
      if (!mounted) return;
      setState(() {
        messages = messages.map((item) => item['id'].toString() == message['id'].toString()
          ? {...item, 'rating': rating} : item).toList();
      });
    } catch (e) {
      if (mounted) setState(() => error = _errorMessage(e));
    }
  }

  Future<void> _logout() async {
    await _clearStoredSession();
    if (!mounted) return;

    setState(() {
      error = null;
      busy = false;
      passwordInput.clear();
    });
  }

  Future<void> _openMemorySettings() async {
    final memoryInput = TextEditingController();
    var memories = <Map<String, dynamic>>[];
    var loadingMemories = true;
    var savingMemory = false;
    String? memoryError;

    try {
      final data = await _request('/memory');
      final raw = data['memories'];
      if (raw is List) {
        memories = raw
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
      }
      loadingMemories = false;
    } catch (e) {
      memoryError = _errorMessage(e);
      loadingMemories = false;
    }

    if (!mounted) {
      memoryInput.dispose();
      return;
    }

    if (!mounted) return;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) {
          Future<void> addMemory() async {
            final content = memoryInput.text.trim();
            if (content.length < 2 || savingMemory) return;
            setDialogState(() {
              savingMemory = true;
              memoryError = null;
            });
            try {
              final result = await _request(
                '/memory',
                method: 'POST',
                body: {'content': content},
              );
              final raw = result['memory'];
              if (raw is Map) {
                final saved = Map<String, dynamic>.from(raw);
                setDialogState(() {
                  memories.removeWhere((item) => item['id'].toString() == saved['id'].toString());
                  memories.insert(0, saved);
                  memoryInput.clear();
                });
              }
            } catch (e) {
              setDialogState(() => memoryError = _errorMessage(e));
            } finally {
              setDialogState(() => savingMemory = false);
            }
          }

          Future<void> removeMemory(String id) async {
            setDialogState(() {
              savingMemory = true;
              memoryError = null;
            });
            try {
              await _request('/memory/${Uri.encodeComponent(id)}', method: 'DELETE');
              setDialogState(() => memories.removeWhere((item) => item['id'].toString() == id));
            } catch (e) {
              setDialogState(() => memoryError = _errorMessage(e));
            } finally {
              setDialogState(() => savingMemory = false);
            }
          }

          Future<void> clearAll() async {
            if (memories.isEmpty || savingMemory) return;
            final confirmed = await showDialog<bool>(
              context: dialogContext,
              builder: (confirmContext) => AlertDialog(
                title: const Text('Apagar todas as memórias?'),
                content: const Text('Essa ação não pode ser desfeita.'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(confirmContext, false), child: const Text('Cancelar')),
                  FilledButton(onPressed: () => Navigator.pop(confirmContext, true), child: const Text('Apagar')),
                ],
              ),
            );
            if (confirmed != true) return;
            setDialogState(() {
              savingMemory = true;
              memoryError = null;
            });
            try {
              await _request('/memory', method: 'DELETE');
              setDialogState(() => memories.clear());
            } catch (e) {
              setDialogState(() => memoryError = _errorMessage(e));
            } finally {
              setDialogState(() => savingMemory = false);
            }
          }

          return AlertDialog(
            title: const Text('Memória contextual'),
            content: SizedBox(
              width: double.maxFinite,
              height: 440,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('O Syntra pode usar estas informações em conversas futuras.'),
                  const SizedBox(height: 12),
                  TextField(
                    controller: memoryInput,
                    maxLength: 500,
                    minLines: 1,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Nova memória',
                      hintText: 'Ex.: Prefiro respostas objetivas.',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  FilledButton.icon(
                    onPressed: savingMemory ? null : addMemory,
                    icon: const Icon(Icons.add),
                    label: const Text('Salvar memória'),
                  ),
                  if (memoryError != null) ...[
                    const SizedBox(height: 8),
                    Text(memoryError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ],
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(child: Text('Memórias salvas (${memories.length})', style: const TextStyle(fontWeight: FontWeight.bold))),
                      if (memories.isNotEmpty)
                        TextButton(onPressed: savingMemory ? null : clearAll, child: const Text('Apagar todas')),
                    ],
                  ),
                  Expanded(
                    child: loadingMemories
                        ? const Center(child: CircularProgressIndicator())
                        : memories.isEmpty
                            ? const Center(child: Text('Nenhuma memória salva.'))
                            : ListView.builder(
                                itemCount: memories.length,
                                itemBuilder: (context, index) {
                                  final memory = memories[index];
                                  final id = memory['id'].toString();
                                  return ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    title: Text(memory['content']?.toString() ?? ''),
                                    subtitle: Text(memory['source'] == 'auto' ? 'Salva automaticamente' : 'Adicionada por você'),
                                    trailing: IconButton(
                                      tooltip: 'Excluir memória',
                                      onPressed: savingMemory ? null : () => removeMemory(id),
                                      icon: const Icon(Icons.delete_outline),
                                    ),
                                  );
                                },
                              ),
                  ),
                  const SizedBox(height: 6),
                  Text('Não salve senhas, tokens ou dados sensíveis.', style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Concluído')),
            ],
          );
        },
      ),
    );
    memoryInput.dispose();
  }

  Future<void> _openDocumentsSettings() async {
    var documents = <Map<String, dynamic>>[];
    Map<String, dynamic>? metrics;
    var busyDocuments = true;
    String? documentsError;

    try {
      final results = await Future.wait([_request('/documents'), _request('/metrics')]);
      final raw = results[0]['documents'];
      documents = raw is List
          ? raw.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList()
          : <Map<String, dynamic>>[];
      final rawMetrics = results[1]['metrics'];
      metrics = rawMetrics is Map ? Map<String, dynamic>.from(rawMetrics) : null;
      busyDocuments = false;
    } catch (e) {
      documentsError = _errorMessage(e);
      busyDocuments = false;
    }

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (ctx, update) {
          Future<void> refresh() async {
            update(() { busyDocuments = true; });
            try {
              final results = await Future.wait([_request('/documents'), _request('/metrics')]);
              final raw = results[0]['documents'];
              documents = raw is List
                  ? raw.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList()
                  : <Map<String, dynamic>>[];
              final rawMetrics = results[1]['metrics'];
              metrics = rawMetrics is Map ? Map<String, dynamic>.from(rawMetrics) : null;
              documentsError = null;
            } catch (e) {
              documentsError = _errorMessage(e);
            } finally {
              update(() { busyDocuments = false; });
            }
          }

          Future<void> importDocument() async {
            try {
              final picked = await FilePicker.platform.pickFiles(
                type: FileType.custom,
                allowedExtensions: const ['txt', 'md', 'csv', 'json', 'log'],
                withData: true,
              );
              if (picked == null || picked.files.isEmpty) return;
              final file = picked.files.first;
              final bytes = file.bytes;
              if (bytes == null) throw Exception('Não foi possível ler o arquivo selecionado.');
              if (bytes.length > 100 * 1024) throw Exception('O arquivo deve ter no máximo 100 KB.');
              final content = utf8.decode(bytes, allowMalformed: false).trim();
              if (content.isEmpty) throw Exception('O documento está vazio.');
              update(() { busyDocuments = true; documentsError = null; });
              await _request('/documents', method: 'POST', body: {'filename': file.name, 'content': content});
              await refresh();
            } catch (e) {
              update(() { busyDocuments = false; documentsError = _errorMessage(e); });
            }
          }

          Future<void> deleteDocument(String id) async {
            update(() { busyDocuments = true; documentsError = null; });
            try {
              await _request('/documents/${Uri.encodeComponent(id)}', method: 'DELETE');
              await refresh();
            } catch (e) {
              update(() { busyDocuments = false; documentsError = _errorMessage(e); });
            }
          }

          return AlertDialog(
            title: const Text('Documentos e contexto'),
            content: SizedBox(
              width: 460,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Importe documentos de texto para o Syntra buscar trechos relevantes ao responder.'),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: busyDocuments ? null : importDocument,
                      icon: const Icon(Icons.upload_file),
                      label: const Text('Importar arquivo'),
                    ),
                    const SizedBox(height: 8),
                    Text('TXT, MD, CSV, JSON ou LOG · até 100 KB por arquivo · até 50 documentos', style: Theme.of(context).textTheme.bodySmall),
                    if (documentsError != null) ...[
                      const SizedBox(height: 8),
                      Text(documentsError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ],
                    if (busyDocuments) const Padding(
                      padding: EdgeInsets.all(12),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                    if (metrics != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text('Conversas: ${metrics!['conversations']} · Mensagens: ${metrics!['messages']} · Documentos: ${metrics!['documents']}\nTempo médio: ${metrics!['average_generation_ms'] == null ? 'sem dados' : (int.parse(metrics!['average_generation_ms'].toString()) / 1000).toStringAsFixed(1) + ' s'} · Tokens estimados: ${metrics!['estimated_output_tokens']}'),
                      ),
                    if (documents.isEmpty && !busyDocuments)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 12),
                        child: Text('Nenhum documento importado.'),
                      ),
                    ...documents.map((doc) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.description_outlined),
                      title: Text(doc['filename']?.toString() ?? 'Documento', maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text('${doc['characters'] ?? 0} caracteres'),
                      trailing: IconButton(
                        tooltip: 'Excluir documento',
                        onPressed: busyDocuments ? null : () => deleteDocument(doc['id'].toString()),
                        icon: const Icon(Icons.delete_outline),
                      ),
                    )),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Concluído')),
            ],
          );
        },
      ),
    );
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
                  initialValue: models.contains(model) ? model : models.first,
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
                leading: const Icon(Icons.description_outlined),
                title: const Text('Documentos e métricas'),
                subtitle: const Text('Importar arquivos e ver uso da conta'),
                onTap: () {
                  Navigator.pop(ctx);
                  _openDocumentsSettings();
                },
              ),
              ListTile(
                leading: const Icon(Icons.psychology_outlined),
                title: const Text('Memória contextual'),
                subtitle: const Text('Ver, adicionar ou apagar informações lembradas'),
                onTap: () {
                  Navigator.pop(ctx);
                  _openMemorySettings();
                },
              ),
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
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                child: TextField(
                  controller: searchConversationsInput,
                  onChanged: _onConversationSearchChanged,
                  decoration: InputDecoration(
                    hintText: 'Pesquisar histórico',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: searchConversationsInput.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Limpar pesquisa',
                            onPressed: () {
                              searchConversationsInput.clear();
                              _loadConversations();
                              setState(() {});
                            },
                            icon: const Icon(Icons.close),
                          ),
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(value: false, label: Text('Recentes'), icon: Icon(Icons.chat_bubble_outline)),
                    ButtonSegment(value: true, label: Text('Arquivadas'), icon: Icon(Icons.archive_outlined)),
                  ],
                  selected: {showArchived},
                  onSelectionChanged: (selection) {
                    setState(() => showArchived = selection.first);
                    _loadConversations();
                  },
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: ListView(
                  children: conversations.map((c) {
                    final id = c['id'].toString();
                    final pinned = c['is_pinned'] == true;

                    return ListTile(
                      leading: Icon(pinned ? Icons.push_pin : Icons.chat_bubble_outline, color: pinned ? purple : null),
                      title: Text(
                        c['title']?.toString() ?? 'Nova conversa',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      selected: id == conversationId,
                      trailing: PopupMenuButton<String>(
                        tooltip: 'Organizar conversa',
                        onSelected: (action) {
                          if (action == 'rename') _renameConversation(c);
                          if (action == 'pin') _updateConversation(id, {'is_pinned': !pinned});
                          if (action == 'archive') _updateConversation(id, {'archived': !showArchived});
                          if (action == 'delete') _deleteConversation(c);
                        },
                        itemBuilder: (context) => [
                          PopupMenuItem(value: 'rename', child: const ListTile(leading: Icon(Icons.edit_outlined), title: Text('Renomear'), contentPadding: EdgeInsets.zero)),
                          PopupMenuItem(value: 'pin', child: ListTile(leading: Icon(pinned ? Icons.push_pin_outlined : Icons.push_pin), title: Text(pinned ? 'Desafixar' : 'Fixar'), contentPadding: EdgeInsets.zero)),
                          PopupMenuItem(value: 'archive', child: ListTile(leading: Icon(showArchived ? Icons.unarchive_outlined : Icons.archive_outlined), title: Text(showArchived ? 'Restaurar' : 'Arquivar'), contentPadding: EdgeInsets.zero)),
                          const PopupMenuItem(value: 'delete', child: ListTile(leading: Icon(Icons.delete_outline), title: Text('Excluir'), contentPadding: EdgeInsets.zero)),
                        ],
                      ),
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
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (message['streaming'] == true && (message['content']?.toString() ?? '').isEmpty)
                                const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                                    SizedBox(width: 8),
                                    Text('Syntra está pensando...'),
                                  ],
                                )
                              else
                                SelectableText(
                                  message['content']?.toString() ?? '',
                                  style: const TextStyle(fontSize: 14, height: 1.5),
                                ),
                              const SizedBox(height: 4),
                              Wrap(
                                spacing: 0,
                                children: isUser
                                  ? [
                                      IconButton(
                                        tooltip: 'Editar mensagem',
                                        visualDensity: VisualDensity.compact,
                                        onPressed: busy ? null : () => _editMessage(message),
                                        icon: const Icon(Icons.edit_outlined, size: 18),
                                      ),
                                    ]
                                  : [
                                      IconButton(
                                        tooltip: 'Copiar resposta',
                                        visualDensity: VisualDensity.compact,
                                        onPressed: () => Clipboard.setData(ClipboardData(text: message['content']?.toString() ?? '')),
                                        icon: const Icon(Icons.copy_outlined, size: 18),
                                      ),
                                      IconButton(
                                        tooltip: 'Resposta útil',
                                        visualDensity: VisualDensity.compact,
                                        onPressed: busy ? null : () => _rateMessage(message, 1),
                                        color: message['rating'] == 1 ? purple : null,
                                        icon: const Icon(Icons.thumb_up_alt_outlined, size: 18),
                                      ),
                                      IconButton(
                                        tooltip: 'Resposta não útil',
                                        visualDensity: VisualDensity.compact,
                                        onPressed: busy ? null : () => _rateMessage(message, -1),
                                        color: message['rating'] == -1 ? purple : null,
                                        icon: const Icon(Icons.thumb_down_alt_outlined, size: 18),
                                      ),
                                      if (index == messages.length - 1)
                                        IconButton(
                                          tooltip: 'Regenerar resposta',
                                          visualDensity: VisualDensity.compact,
                                          onPressed: busy ? null : _regenerate,
                                          icon: const Icon(Icons.refresh, size: 18),
                                        ),
                                    ],
                              ),
                            ],
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
                  if (busy)
                    const Padding(
                      padding: EdgeInsets.only(bottom: 6),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text('Syntra está respondendo...', style: TextStyle(fontSize: 12)),
                      ),
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
                        onPressed: busy ? _stopGeneration : _send,
                        tooltip: busy ? 'Interromper geração' : 'Enviar mensagem',
                        icon: busy
                            ? const Icon(Icons.stop_rounded)
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

  Future<void> _openLegalDocument({required bool privacy}) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LegalDocumentPage(privacy: privacy),
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
                    const SizedBox(height: 8),
                    Text(
                      'Ao utilizar o Syntra, consulte nossos documentos:',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 4,
                      runSpacing: 0,
                      children: [
                        TextButton(
                          onPressed: busy
                              ? null
                              : () => _openLegalDocument(privacy: false),
                          child: const Text(
                            'Termos de Uso',
                            style: TextStyle(fontSize: 12),
                          ),
                        ),
                        Text(
                          '·',
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                        ),
                        TextButton(
                          onPressed: busy
                              ? null
                              : () => _openLegalDocument(privacy: true),
                          child: const Text(
                            'Política de Privacidade',
                            style: TextStyle(fontSize: 12),
                          ),
                        ),
                      ],
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

class LegalDocumentPage extends StatelessWidget {
  final bool privacy;

  const LegalDocumentPage({super.key, required this.privacy});

  static const Color _legalAccent = Color(0xFFB5A7FF);

  List<({String title, String body})> get _sections {
    if (privacy) {
      return const [
        (
          title: '1. Responsável pelos dados',
          body: 'O responsável pelo tratamento dos dados do Syntra deve ser identificado pelo operador do serviço. Os dados de identificação e o e-mail de privacidade precisam ser informados pelo responsável antes da publicação definitiva desta política.',
        ),
        (
          title: '2. Dados tratados',
          body: 'Podem ser tratados nome, endereço de e-mail, dados de autenticação, mensagens e conversas, modelo de IA selecionado, horários e registros técnicos necessários à segurança, ao diagnóstico e ao funcionamento do serviço.',
        ),
        (
          title: '3. Finalidades',
          body: 'Os dados são utilizados para criar e proteger contas, autenticar usuários, manter o histórico de conversas, processar solicitações enviadas ao assistente, corrigir falhas, prevenir abusos e cumprir obrigações legais aplicáveis.',
        ),
        (
          title: '4. Inteligência artificial e armazenamento',
          body: 'As mensagens são processadas pelo modelo de IA configurado para o Syntra. A infraestrutura pode utilizar Ollama e o modelo configurado no servidor. As conversas podem ser armazenadas no banco de dados PostgreSQL utilizado pelo serviço, hospedado no Supabase. Os dados não ficam necessariamente apenas no dispositivo.',
        ),
        (
          title: '5. Compartilhamento',
          body: 'Fornecedores de infraestrutura podem tratar dados na medida necessária para hospedar e operar o serviço. O operador deve manter identificados os fornecedores efetivamente utilizados, suas funções e eventuais transferências internacionais. O Syntra não deve ser entendido como um serviço que nunca compartilha dados com fornecedores técnicos.',
        ),
        (
          title: '6. Cookies e armazenamento local',
          body: 'A versão web utiliza cookie de sessão para manter a autenticação e pode armazenar preferências no navegador. O aplicativo móvel utiliza a comunicação com a API para autenticar e acessar os recursos da conta.',
        ),
        (
          title: '7. Segurança e retenção',
          body: 'São adotadas medidas técnicas e administrativas compatíveis com os riscos, mas nenhum sistema é absolutamente livre de riscos. Os dados são mantidos pelo período necessário às finalidades informadas e às obrigações legais. Backups e registros de segurança podem ter prazos próprios.',
        ),
        (
          title: '8. Direitos do titular',
          body: 'Nos termos da Lei Geral de Proteção de Dados (LGPD), o titular pode solicitar, conforme aplicável, confirmação do tratamento, acesso, correção, informações sobre compartilhamento, eliminação e outras providências previstas em lei. O responsável pelo serviço deve disponibilizar um canal de contato para esses pedidos.',
        ),
        (
          title: '9. Crianças e adolescentes',
          body: 'A faixa etária atendida e os procedimentos específicos para crianças e adolescentes devem ser definidos pelo responsável antes da disponibilização do serviço a esse público.',
        ),
        (
          title: '10. Atualizações e contato',
          body: 'Esta política pode ser atualizada para refletir mudanças no serviço, nos fornecedores ou na legislação. Antes da publicação definitiva, o responsável deve preencher seus dados de identificação e o canal de contato para privacidade.',
        ),
      ];
    }

    return const [
      (
        title: '1. Utilização do serviço',
        body: 'O Syntra oferece uma interface conversacional com inteligência artificial. Ao utilizar o serviço, você deve fornecer informações verdadeiras no cadastro e proteger suas credenciais de acesso.',
      ),
      (
        title: '2. Uso responsável',
        body: 'Não utilize o serviço para atividades ilícitas, tentar acessar contas de terceiros, explorar vulnerabilidades, prejudicar a infraestrutura ou enviar conteúdo que viole direitos de outras pessoas.',
      ),
      (
        title: '3. Respostas geradas por IA',
        body: 'As respostas podem conter erros, omissões ou informações desatualizadas. O conteúdo não substitui avaliação profissional quando necessária. Verifique informações relevantes antes de agir com base nelas.',
      ),
      (
        title: '4. Disponibilidade',
        body: 'O funcionamento depende da disponibilidade da aplicação, do banco de dados e do modelo de IA configurado. Interrupções podem ocorrer para manutenção, segurança ou correção de falhas.',
      ),
      (
        title: '5. Dados pessoais',
        body: 'O tratamento de dados é descrito na Política de Privacidade. Evite inserir senhas de outros serviços, dados financeiros sensíveis, segredos empresariais ou dados pessoais de terceiros sem necessidade e autorização apropriada.',
      ),
      (
        title: '6. Conta e encerramento',
        body: 'Você é responsável pela atividade realizada por meio da sua conta e deve proteger suas credenciais. Você pode deixar de utilizar o serviço e, quando o recurso estiver disponível, solicitar a exclusão da conta. A retenção de dados após o encerramento observará a política de privacidade e as obrigações legais aplicáveis.',
      ),
      (
        title: '7. Alterações dos termos',
        body: 'Os termos podem ser atualizados para refletir mudanças no serviço ou nas exigências legais. A versão atualizada deve ser disponibilizada aos usuários.',
      ),
      (
        title: '8. Responsável e contato',
        body: 'O responsável pelo serviço e seu canal de contato devem ser informados pelo operador do Syntra antes da publicação definitiva destes termos.',
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final title = privacy ? 'Política de Privacidade' : 'Termos de Uso';
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
      ),
      body: SelectionArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            Center(
              child: Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Icon(
                  privacy ? Icons.shield_outlined : Icons.description_outlined,
                  color: _legalAccent,
                  size: 28,
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Syntra.',
              textAlign: TextAlign.center,
              style: theme.textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              title,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(
                color: _legalAccent,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Última atualização: 24 de outubro de 2026',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            if (privacy) ...[
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text(
                  'Aviso: os dados do responsável pelo serviço e o contato de privacidade ainda precisam ser confirmados e preenchidos pelo operador antes da publicação definitiva.',
                ),
              ),
            ],
            const SizedBox(height: 22),
            for (final section in _sections) ...[
              Text(
                section.title,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: _legalAccent,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                section.body,
                style: theme.textTheme.bodyMedium?.copyWith(height: 1.55),
              ),
              const SizedBox(height: 20),
            ],
          ],
        ),
      ),
    );
  }
}
