# Syntra Mobile

Aplicativo Flutter Android que usa a API do backend.

```powershell
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api
```

`10.0.2.2` é o endereço especial para emulador Android acessar o computador host. Em aparelho físico, use o IPv4 local do computador; em produção, configure HTTPS.

A versão inicial inclui autenticação, lista de conversas, envio de mensagens e seleção de modelo. Respostas no app aparecem como texto selecionável; renderização rica de Markdown/código e ação de regenerar podem ser adicionadas na próxima iteração.
