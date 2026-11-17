const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const assert=require('node:assert/strict');
const root=process.env.ANIEL_ANDROID_ROOT||path.resolve(__dirname,'..');
const ts=require(path.join(root,'node_modules/typescript'));
const memory=new Map();const vault=new Map();
const cache=new Map();const config={BASE_URL:'https://example.invalid/mobile/',API_VERSION:'v397/',TOUCH_TOKEN:'test-token',SECURITY_TOKEN:'test-security',COMPANY_CODE:'0000',APP_VERSION:'test'};
function load(relative){const filename=path.resolve(root,relative);if(cache.has(filename))return cache.get(filename).exports;const module={exports:{}};cache.set(filename,module);const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const req=id=>{
 if(id.endsWith('/constants/config'))return {CONFIG:config};
 if(id==='@react-native-async-storage/async-storage')return {__esModule:true,default:{getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>memory.set(k,v),removeItem:async k=>memory.delete(k)}};
 if(id==='expo-secure-store')return {getItemAsync:async k=>vault.get(k)??null,setItemAsync:async(k,v)=>vault.set(k,v),deleteItemAsync:async k=>vault.delete(k)};
 if(id==='expo-file-system')return {File:class MockFile{constructor(uri){this.uri=uri;}async bytes(){return new Uint8Array([1,2,3]);}}};
 if(id==='expo-file-system/legacy')return {readAsStringAsync:async()=>'AQID',EncodingType:{Base64:'base64'}};
 if(id==='react-native')return {Platform:{OS:'android',Version:36}};
 if(id.startsWith('.'))return load(path.relative(root,path.resolve(path.dirname(filename),id))+'.ts');
 return require(id);
};vm.runInThisContext('(function(require,module,exports){'+source+'\n})',{filename})(req,module,module.exports);return module.exports;}
const api=load('src/services/apiClient.ts'),protocol=load('src/services/rdoProtocol.ts'),storage=load('src/services/storage.ts');
const actor={login:'test-user',employee:'test-user',password:'test-password',team:'test-team',name:'Test',usesRouting:false};
const raw={obra:'RDO002',contrato:8,statusExecucao:0,projetoAniel:{codCt:'CT',projeto:'P',tipoLimiteAplic:0},statusFtth:0,tipoServicoExigeDetalhamento:0,portaFtth:0,endereco:{latitude:'0',longitude:'0'},dia:'/Date(0-0300)/',usuario:{funcionario:{empresa:{}}}};
const rdo={number:'RDO002',contract:'CT',project:'P',status:'Aberta',raw};
let calls=[],replies=[];
global.fetch=async(url,options)=>{calls.push({url,options,body:options?.body?JSON.parse(options.body):null});if(!replies.length)throw new Error('Unexpected network request');const reply=replies.shift();return {ok:true,status:200,json:async()=>reply};};
const ok=valor=>({result:true,valor});
async function run(){
 const cancel=protocol.buildCancelBody(rdo,'aberto errado');assert.equal(cancel.rdo.statusExecucao,'0');assert.equal(cancel.rdo.statusFtth,'0');assert.equal(cancel.rdo.projetoAniel.tipoLimiteAplic,'3');assert.equal(cancel.rdo.codCt,'CT');assert.equal(cancel.rdo.endereco.latitude,0);assert.ok(!cancel.rdo.dia.includes('/Date'));assert.deepEqual(cancel.rdo.logs,[]);
 assert.equal(protocol.uniqueRdos([rdo,{...rdo}, {...rdo,raw:{...raw,idSaldoAuto:999}}]).length,2);
 replies=[ok([raw,raw]),{result:true}];calls=[];await api.cancelRdoAsync(actor,rdo,'aberto errado');assert.equal(calls.filter(x=>x.url.endsWith('/cancelarRDO')).length,1);
 replies=[ok([raw,{...raw,idSaldoAuto:999}])];calls=[];await assert.rejects(()=>api.cancelRdoAsync(actor,rdo,'aberto errado'));assert.equal(calls.length,1);
 replies=[{result:false,message:'test-password foi recusada'}];await assert.rejects(()=>api.sendAuthenticatedAsync('test',{},actor),e=>e.rejected && !e.message.includes('test-password'));
 const contract={codCt:'CT',isRDOSequencial:true,unidCusto:'cost',projetos:[{projeto:'P',eventos:[{evento:'E',unidadeCusto:'event-cost'}]}]};
 const input={contract:'CT',project:'P',event:'E',serviceName:'ESCOLA CONECTADA',subtypeName:'ACEITAÇÃO FINAL',address:{rua:'Rua de teste',numero:'1',bairro:'B',cidade:'C',estado:'SP',cep:'00000000',complemento:''}};
 const setup=[ok([contract]),ok([{id:106,descricao:'ESCOLA CONECTADA'}]),ok([{id:1,descricao:'ACEITACAO FINAL'}]),ok([])];
 replies=[...setup,ok(raw)];calls=[];const created=await api.createRdoAsync(actor,input);assert.equal(created.number,'RDO002');let body=calls.at(-1).body.objeto;assert.equal(body.tipoServico,'106');assert.equal(body.tipoProduto,'1');assert.equal(body.unidadecusto,'event-cost');assert.equal(body.obra,'');assert.ok(!('dtInicial' in body));
 replies=[...setup,{result:false},ok([raw,raw])];calls=[];assert.equal((await api.createRdoAsync(actor,input)).number,'RDO002');assert.equal(calls.filter(x=>x.url.endsWith('/CriarRDO')).length,1);
 let located=0;
 const gpsContract={...contract,isObrigaGPS:true};
 replies=[ok([gpsContract]),...setup.slice(1),ok(raw)];calls=[];
 await api.createRdoAsync(actor,{...input,getPosition:async()=>{located++;return {latitude:-1,longitude:-2,altitude:null};}});
 assert.equal(located,1);assert.equal(calls.at(-1).body.objeto.localAtual.latitude,-1);
 replies=[...setup,ok(raw)];await api.createRdoAsync(actor,{...input,getPosition:async()=>{located++;throw new Error('GPS não deve ser chamado');}});assert.equal(located,1);
 replies=[ok([gpsContract])];calls=[];await assert.rejects(()=>api.createRdoAsync(actor,{...input,getPosition:async()=>{throw new Error('Permissão negada');}}));assert.equal(calls.filter(x=>x.url.endsWith('/CriarRDO')).length,0);
 replies=[ok({})];await assert.rejects(()=>api.getOpenRdosAsync(actor));
 memory.set('@aniel_saved_logins',JSON.stringify([{login:'test-user',password:'test-password',lastUsed:'test'}]));let logins=await storage.getSavedLogins();assert.equal(logins[0].password,'test-password');assert.ok(!memory.get('@aniel_saved_logins').includes('test-password'));assert.ok(vault.size>0);
 await storage.setStoredSession({...actor,data:{senha:'nested-password',anything:'value'}});assert.ok(!memory.get('@aniel_active_session').includes('password'));assert.ok(!memory.get('@aniel_active_session').includes('data'));assert.equal((await storage.getStoredSession()).password,'test-password');
 await storage.removeSavedLogin(actor.login);assert.equal((await storage.getSavedLogins()).length,0);
 const detail=load('src/services/detailWorkflow.ts');
 const fileUpload=load('src/services/fileUpload.ts');
 const testBytes=fileUpload.base64ToUint8Array('AQIDBAU=');
 assert.equal(testBytes.length, 5);
 assert.equal(testBytes[0], 1);
 const part=await fileUpload.createFormDataFilePart({ name:'foto.jpg', uri:'file:///dummy.jpg', type:'image/jpeg' });
 assert.equal(part.name,'foto.jpg');
 assert.equal(typeof part.bytes,'function');
 const readBytes=await part.bytes();
 assert.ok(readBytes instanceof Uint8Array);
 const built=detail.buildNewDetailAnswer(rdo,actor,{id:'test-device'},{template:{id:1,titulo:'Test'},protocol:'Test',questions:[{question:{id:2,tipo:'Foto',obrigatoria:'S'},value:'',choices:[],images:[{id:'image1',uri:'file:///sample.jpg',mimeType:'image/jpeg'}]}],state:'pending'});
 assert.equal(built.uploadFiles[0].type,'image/jpeg');assert.equal(built.uploadFiles[0].name,'image1.jpg');assert.equal(built.answerPayload.respostas[0].multi[0].urlfoto,'image1.jpg');
 assert.throws(()=>detail.buildSavedSignatureAnswer(rdo,{respostas:[]},{id:99},'data:image/png;base64,abc',actor,{id:'test-device'}));

 // Scanner and Single Choice verification
 assert.ok(detail.isScannerOrSerialQuestion('Scanner do serial da controladora Instalada', 'CodBarra'));
 assert.ok(detail.isScannerOrSerialQuestion('Scanner do serial dos switches instalados', 7));
 assert.ok(detail.isScannerOrSerialQuestion('Scanner do serial dos APs instalados', 7));
 assert.ok(detail.isScannerOrSerialQuestion('Scanner do serial do Nobreak instalado', 7));
 assert.ok(!detail.isScannerOrSerialQuestion('Nome do cliente', 'Texto'));

 assert.ok(detail.canEditSavedAnswer({ id: 101, tipoQuestao: 0 })); // Texto
 assert.ok(detail.canEditSavedAnswer({ id: 102, tipoQuestao: 1 })); // Valor
 assert.ok(detail.canEditSavedAnswer({ id: 103, tipoQuestao: 4 })); // UnicaEscolha
 assert.ok(detail.canEditSavedAnswer({ id: 104, tipoQuestao: 7 })); // CodBarra
 assert.ok(!detail.canEditSavedAnswer({ id: 105, tipoQuestao: 2 })); // Foto (fluxo separado)
 assert.ok(!detail.canEditSavedAnswer({ tipoQuestao: 0 })); // Sem id não pode editar no servidor

 const fabOptions = detail.getStandardOptionsForQuestion('Fabricante do Equipamento:');
 assert.ok(fabOptions.length > 0 && fabOptions.some(o => o.resposta === 'UBIQUITI'));
 const fornOptions = detail.getStandardOptionsForQuestion('Fornecedor Responsável');
 assert.ok(fornOptions.length > 0 && fornOptions.some(o => o.resposta === 'BRISANET'));
 const connOptions = detail.getStandardOptionsForQuestion('Tipo de Conectividade');
 assert.ok(connOptions.length > 0 && connOptions.some(o => o.resposta === 'Fibra'));
 const docOptions = detail.getStandardOptionsForQuestion('Tipo do documento');
 assert.ok(docOptions.length > 0 && docOptions.some(o => o.resposta === 'CPF'));
 const energyOptions = detail.getStandardOptionsForQuestion('Fonte de Energia');
 assert.ok(energyOptions.length > 0 && energyOptions.some(o => o.resposta === 'COMERCIAL'));

 // Attachment/Video URL resolution
 assert.equal(detail.detailImageSource('https://example.invalid/files/v.mp4', 'https://example.invalid/mobile/'), 'https://example.invalid/files/v.mp4');
 assert.equal(detail.detailImageSource('http://example.invalid/files/v.mp4', 'https://example.invalid/mobile/'), 'https://example.invalid/files/v.mp4');
 assert.equal(detail.detailImageSource('/Anexos/v.mp4', 'https://example.invalid/mobile/'), 'https://example.invalid/Anexos/v.mp4');
 assert.equal(detail.detailImageSource('Anexos/v.mp4', 'https://example.invalid/mobile/'), 'https://example.invalid/mobile/Anexos/v.mp4');
 assert.equal(detail.detailImageSource('https://user:pass@example.invalid/v.mp4', 'https://example.invalid/mobile/'), null);

 console.log('PASS: cancelamento e duplicatas; códigos e reconciliação de criação; recusa sem exposição de senha; listas inválidas; migração das credenciais para o cofre; compatibilidade de multipart upload; scanner de seriais, edição de campos únicos e URLs de vídeo. Nenhuma conexão real.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
