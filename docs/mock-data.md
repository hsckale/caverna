# Dados de demonstração do Firestore

O arquivo `scripts/mock-firestore.json` contém uma academia fictícia em São Paulo, perfis demonstrativos, faixas, aulas para amanhã, comunicado e produtos. O importador cria ou reutiliza quatro contas de demonstração no Firebase Authentication e grava os documentos relacionados no Firestore, vinculando cada perfil ao UID correspondente.

## Importar

O importador usa Firebase Admin SDK para Firebase Authentication e Firestore. Antes de executar:

1. Use credenciais de uma conta de serviço com permissões para administrar Firebase Authentication e Firestore, ou configure Application Default Credentials. Nunca adicione a chave de serviço ao repositório.
2. No terminal, defina `GOOGLE_APPLICATION_CREDENTIALS` para o caminho local da chave (se usar chave) e `FIREBASE_PROJECT_ID=caverna-jiujitsu`.
3. Faça primeiro a validação sem gravação:

   ```sh
   npm run seed:mock -- --dry-run --confirm-project=caverna-jiujitsu
   ```

4. Para gravar de fato, execute:

   ```sh
   npm run seed:mock -- --confirm-project=caverna-jiujitsu
   ```

O importador só aceita o ID de projeto esperado e exige a confirmação explícita; ele não apaga coleções. O documento da academia tem um marcador próprio, permitindo repetir a carga apenas nessa academia mock. As contas usam a senha padrão `12345678a`; em execuções repetidas, o seed redefine essa senha nas contas mock configuradas.

Credenciais de demonstração:

| Perfil | E-mail |
| --- | --- |
| Administrador | `admin.demo@example.test` |
| Aluna | `marina.demo@example.test` |
| Aluno | `rafael.demo@example.test` |
| Aluno | `joao.demo@example.test` |

Use essas contas somente em um ambiente de demonstração. A senha é compartilhada e previsível; não use esse seed em produção nem exponha essas credenciais em um app público.
