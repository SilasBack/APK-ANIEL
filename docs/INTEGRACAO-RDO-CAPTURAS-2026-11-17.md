# Integração Android — capturas reais e correções de RDO

Atualizado em 17/11/2026. Proprietário: Silas Duarte.
Este documento transfere descobertas recentes do Windows para o projeto Android Expo/React Native. Não exige reescrever o projeto Android em MAUI. A fonte Windows local está na versão 0.10.32, não publicada nesta etapa.

## Ler primeiro

- Fonte de referência: `C:/Users/silas/Documents/ChatGPT/Aniel touch/src/AnielNext/Services/`.
- Plano funcional histórico: `C:/Users/silas/Documents/ChatGPT/Aniel touch/PLANO-ANDROID-CONTINUIDADE.md`. Contém histórico e versões antigas; este documento prevalece quanto às descobertas recentes.
- APK original: `C:/Users/silas/Documents/ChatGPT/Aniel touch/original/AnielTouch_29_2_0.apk`.
- Descompilação: `analysis/decompiled/sources` na raiz Windows, especialmente `touchrepo/server/Remote.java`, controllers `CriarRDOController.java`, `CancelarRDOController.java`, enums e conversores Room.
- Não copiar arquivos de `private`, senhas, tokens, dados de sessões, hashes de credenciais ou chaves ADB para este projeto ou para o APK.
- Preservar código Android existente. Para alterar APIs Expo/React Native, seguir o AGENTS.md local e consultar documentação da versão instalada.

## Protocolo comum

Base descoberta da empresa, com sufixo `v397/`. Não concatenar portas alternativas ou usar a URL de relatório como API.
POST JSON com `Content-Type: application/json; charset=utf-8`, cabeçalho `culture` correspondente ao dispositivo.
Envelope das mutações nativas:

```json
{
  "usuario": "MATRICULA_AUTENTICADA",
  "senha": "OBTIDA_EM_TEMPO_DE_EXECUCAO",
  "token": "CONFIGURACAO_PRIVADA",
  "objeto": {}
}
```

O funcionário do envelope e o login/equipe internos devem vir da sessão correta. Não usar outra conta conectada por engano. Capturas nunca devem exibir ou registrar credenciais em claro.
Respostas normalmente têm `result`, `valor`, `message`, `exception`. HTTP 200 sozinho não confirma sucesso.

## 1. Criação de RDO: captura comprovada

Rota: `AnielTV.Touch.WebApi/api/Obra/CriarRDO`.
Captura executada pelo usuário no APK original: contrato 0003, projeto/INEP 52101894, conta 001224.
Resposta real: `result=true`, `valor` contém um objeto RDO completo. Criou `RDO-00000000004`, contrato interno 187404, `idSaldoAuto=131992`, `statusExecucao=0`.
NÃO reenviar essa criação como teste; o registro já existe.

Campos observados no objeto de criação:

- Strings: `contratoAniel`, `projetoAniel`, `evento`, `tipoServico`, `tipoProduto`, `usuario`, `senha`, `equipe`, `unidadecusto`.
- `isEditingRDO`: booleano false.
- Numeração sequencial: `obra` é string vazia. O servidor gera o número. Não calcular contador local.
- `contInicial`, `contFinal`, `tipoposte`, `tipokit`: strings `"0"` neste exemplo.
- Strings opcionais vazias presentes: `armario`, `cabo`, `cirex`, `contagens`, `de`, `folha`, `gad`, `lateral`, `localidade`, `para`, `sgpam`, `uf`.
- `endereco`: rua, numero, complemento, bairro, cidade, estado, cep, latitude, longitude, altitude, direcao, velocidade. Coordenadas são números.
- O APK incluiu `localAtual` com endereço e posição reais e `localizacao` com telemetria real. Não copiar GPS, IMEI, bateria, dispositivo ou dados pessoais da captura para novos pedidos. Respeitar permissões e configuração Android.
- `dtInicial` e `dtFinal` NÃO foram enviados nessa criação. Não inventar datas ocultas. Se uma data for informada, o Windows agora serializa em formato `MMM d, yyyy HH:mm:ss`, cultura en-US, por exemplo `Nov 17, 2026 00:00:00`.

Fluxo de confirmação implementado no Windows:

1. Consultar a lista atual e registrar identidades já existentes.
2. Enviar CriarRDO uma única vez.
3. Se `valor` trouxer RDO do contrato/projeto esperado e número válido, reconhecer a criação.
4. Se a confirmação falhar, consultar novamente. Aceitar apenas uma nova identidade correspondente, removendo somente cópias idênticas da resposta.
5. Se não for possível confirmar, informar resultado incerto. Nunca reenviar automaticamente o POST: o servidor pode ter criado apesar do erro de confirmação.

Correções 0.10.32: retiradas datas automáticas ocultas e corrigida reconciliação com duplicatas idênticas. Testes locais passaram; não houve nova criação Windows real após essas correções.

Fontes: `WorksWorkflow.cs`, métodos `BuildRdoBody`, `CreateRdoAsync`, `ParseRdo`; testes `tests/ProtocolChecks/Program.cs` na raiz Windows.

## 2. Adicionar lista / questionário

Sequência observada no APK:

1. Abrir Detalhamento do RDO.
2. Tocar em +.
3. Selecionar `1 - TERMO DE ESCOLA CONECTADA`.
4. Informar Nome do Questionário.
5. Tocar em Responder, abrindo o formulário.

Rota de consulta capturada: `AnielTV.Touch.WebApi/api/Quiz/Quiz`.
Objeto da consulta contém: `codSubTipoServ`, `codTipoServ`, `codct`, `login`, `numObra`, `projeto`, `senha`, `siglaModulo`, `tarefa`.
Resposta real: `result=true`, `valor.questionarios` com 1 modelo, `valor.questionariosFeitos` vazio.
Nesta captura NÃO apareceu `Quiz/SetQuiz` ao nomear e tocar em Responder. Portanto, abrir o formulário não comprova persistência no servidor. Manter um rascunho local nomeado nessa etapa, separado por RDO e instância de questionário.

Envio posterior existente no Windows:

- Rota: `AnielTV.Touch.WebApi/api/Quiz/SetQuiz`.
- Multipart com campo `json` contendo envelope autenticado; objeto interno tem `login`, `senha`, `isRepeticao`, `resposta`, com arquivos associados.
- Consultar `NativeRdoFlow.cs`, `SaveRdoDetailAsync`, `BuildDetailQuery` e os builders de respostas; não inferir o payload inteiro a partir dos nomes dos campos.
- Campo de assinatura, fotos e respostas devem manter IDs originais ao editar; não criar outra instância acidentalmente.
- Falta capturar um formulário real preenchido e salvo no APK para comparar a persistência completa. Solicitar ao usuário antes de enviar dados reais; não usar respostas fictícias.
- O endpoint `DeleteQuizFeito` existe, mas o usuário pediu retirar da interface o botão de excluir o checklist inteiro. Não reintroduzir por causa da existência da rota.

## 3. Cancelamento de RDO: funcionamento comprovado

Rota: `AnielTV.Touch.WebApi/api/Obra/cancelarRDO`.
Objeto interno: `{ "rdo": OBJETO_RDO_NATIVO_COMPLETO, "observacao": MOTIVO_DIGITADO }`.
Não confundir Cancelar RDO com Baixar Atividade, finalizar atendimento, reprovar qualidade ou reabrir RDO.

Há serialização tipada no APK (Gson + objetos carregados pelo Room). Não encaminhar cegamente o JSON bruto recebido nas consultas:

- `statusExecucao`, `statusFtth`, `tipoServicoExigeDetalhamento` e `portaFtth` aparecem como strings no pedido nativo.
- Status relevantes: 0 Aberta, 1 FechadaImprodutiva, 2 FechadaProdutiva, 3 Atendendo, 6 Deslocando, 8 Atendido, 9 Cancelado.
- Datas no pedido capturado: formato en-US com relógio 24h.
- Coordenadas numéricas, omissão de propriedades null, defaults de listas/objetos conforme modelo nativo.
- Há campos de DTO de leitura que o APK não reenvia. A lista exata e os defaults estão em `WorksWorkflow.BuildCancelRdo`, versão 0.10.32. Não criar uma versão simplificada que descarte a identificação.
- Preservar motivo digitado; não substituir por texto de diagnóstico.
- Windows 0.10.30 passou a enviar corpo UTF-8 com tamanho conhecido, como OkHttp. Isso isoladamente não foi comprovado como causa dos erros anteriores.

Capturas reais do APK: RDOs finais 003 e 004 do INEP 52033457 foram canceladas pelo usuário; na captura 004 houve `result=true` e consulta posterior confirmou Cancelado.

### Defeito de duplicação comprovado e correção validada

A API devolveu duas linhas byte a byte iguais para a RDO final 002, contrato 0002, INEP 35236913, conta 001189, contrato interno 185822, idSaldoAuto 131990.
A validação Windows exigia exatamente uma linha e emitia: "Este RDO mudou ou não está mais na lista de abertos". O POST nem era enviado.
Correção 0.10.31: filtrar a identidade e remover somente cópias de payload idêntico antes de exigir alvo único. Identidade inclui contrato, projeto, número e contrato interno. Registros conflitantes continuam bloqueados. Não deduplicar só pelo número da RDO, pois ele se repete entre projetos.
Após autorização do usuário, uma única chamada de cancelamento pelo fluxo Windows corrigido, motivo "aberto errado", retornou HTTP 200 e `result=true`. Consulta posterior confirmou Cancelado.
NÃO repetir essa operação: esse alvo já foi cancelado.

## 4. Regras para a implementação Android

- Manter vínculo de cada RDO à conta que a consultou. Leituras simultâneas não autorizam mutações pela conta errada.
- Remover somente duplicatas idênticas ao confirmar criação/cancelamento; conflitos exigem nova consulta, não escolha arbitrária.
- Exibir estado confirmado, recusado ou desconhecido. Não transformar erro de confirmação em novo POST automático.
- Rascunhos locais devem ser preservados e separados por empresa/conta/RDO/questionário; abrir um questionário não deve substituir outro rascunho nomeado.
- Não testar APIs que criam, cancelam ou alteram registros de produção sem alvo e autorização do usuário.
- Não publicar o APK nem as mudanças Windows com base apenas nesta transferência de documentação.

## 5. Evidências e próximos passos

Arquivos de evidência na raiz Windows:

- `analysis/CANCEL-004-FINDINGS.md`: histórico e limites do diagnóstico de transporte.
- `analysis/CANCEL-35236913-FINDINGS.md`: cancelamento confirmado pela API, correção de duplicatas.
- `analysis/CAPTURE-CREATE-QUIZ-52101894.md`: criação e consulta de questionário; seção final atualiza correções 0.10.32.
- `analysis/ProtocolChecks-create-capture.log`: testes de criação.
- `analysis/ProtocolChecks-cancel-duplicates.log`: testes de duplicatas em cancelamento.

Capturas completas permanecem na pasta privada do projeto Windows; não foram copiadas para o Android, pois contêm dados de negócio e dispositivo, mesmo com credenciais mascaradas.

Prioridades de desenvolvimento: adaptar as correções acima ao código Android existente; validar montagem e reconhecimento de respostas com testes simulados; capturar o salvamento real de questionário com autorização; depois validar criação Android em alvo especificamente autorizado. O teste real Windows de cancelamento está confirmado para o alvo descrito. A criação Windows 0.10.32 ainda aguarda validação real após as últimas mudanças.
