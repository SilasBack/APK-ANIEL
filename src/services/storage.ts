import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { CONFIG } from '../constants/config';
import { ClientDevice, LoginSession, SavedLogin } from '../types';

const DEVICE_ID_KEY='@aniel_device_id';
const SAVED_LOGINS_KEY='@aniel_saved_logins';
const ACTIVE_SESSION_KEY='@aniel_active_session';
const ACTIVE_SESSIONS_KEY='@aniel_active_sessions';
const secretKey=(login: string) => 'aniel.login.' + Array.from(login.toLowerCase()).map(c => c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
export async function getOrCreateDeviceId(): Promise<string> {
  let id=await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) { id='anielnext-'+'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c => { const r=Math.floor(Math.random()*16); return (c==='x'?r:(r&3)|8).toString(16); }); await AsyncStorage.setItem(DEVICE_ID_KEY,id); }
  return id;
}
export async function getClientDevice(): Promise<ClientDevice> {
  return { id:await getOrCreateDeviceId(), model:Platform.OS, platform:`${Platform.OS} ${Platform.Version}`, version:CONFIG.APP_VERSION };
}
export async function getSavedLogins(): Promise<SavedLogin[]> {
  const raw=await AsyncStorage.getItem(SAVED_LOGINS_KEY);
  if (!raw) return [];
  let values: SavedLogin[];
  try { values=JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(values)) return [];
  const valid=values.filter(v => v && typeof v.login==='string');
  // Move old plaintext passwords to the platform vault before replacing metadata.
  for (const item of valid) if (item.password) await SecureStore.setItemAsync(secretKey(item.login),item.password);
  const metadata=valid.map(({password: _password,...item}) => item);
  await AsyncStorage.setItem(SAVED_LOGINS_KEY,JSON.stringify(metadata));
  return Promise.all(metadata.map(async item => ({...item,password:(await SecureStore.getItemAsync(secretKey(item.login))) ?? undefined})));
}
export async function saveLogin(login: string,password?: string,employeeName?: string): Promise<void> {
  const logins=await getSavedLogins();
  if (password) await SecureStore.setItemAsync(secretKey(login),password);
  const metadata=logins.filter(x => x.login.toLowerCase()!==login.toLowerCase()).map(({password: _password,...item}) => item);
  metadata.unshift({login,employeeName,lastUsed:new Date().toISOString()});
  await AsyncStorage.setItem(SAVED_LOGINS_KEY,JSON.stringify(metadata));
}
export async function removeSavedLogin(login: string): Promise<void> {
  const entries=await getSavedLogins();
  await SecureStore.deleteItemAsync(secretKey(login));
  await AsyncStorage.setItem(SAVED_LOGINS_KEY,JSON.stringify(entries.filter(x => x.login.toLowerCase()!==login.toLowerCase()).map(({password: _password,...item}) => item)));
}
export async function getStoredSession(): Promise<LoginSession|null> {
  const raw=await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
  if (!raw) return null;
  let data: any;
  try { data=JSON.parse(raw); } catch { return null; }
  if (typeof data?.login!=='string') return null;
  if (data.password) await SecureStore.setItemAsync(secretKey(data.login),data.password);
  const metadata={login:data.login,employee:data.employee,name:data.name,team:data.team,usesRouting:data.usesRouting};
  await AsyncStorage.setItem(ACTIVE_SESSION_KEY,JSON.stringify(metadata));
  const password=await SecureStore.getItemAsync(secretKey(data.login));
  return password ? {...metadata,password} : null;
}
export async function setStoredSession(session: LoginSession|null): Promise<void> {
  if (!session) { await AsyncStorage.removeItem(ACTIVE_SESSION_KEY); return; }
  await SecureStore.setItemAsync(secretKey(session.login),session.password);
  await AsyncStorage.setItem(ACTIVE_SESSION_KEY,JSON.stringify({login:session.login,employee:session.employee,name:session.name,team:session.team,usesRouting:session.usesRouting}));
}

export async function getStoredSessions(): Promise<LoginSession[]> {
  const raw = await AsyncStorage.getItem(ACTIVE_SESSIONS_KEY);
  if (!raw) {
    const single = await getStoredSession();
    return single ? [single] : [];
  }
  let list: any;
  try { list = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(list)) return [];
  const valid = list.filter((d: any) => d && typeof d.login === 'string');
  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const d of valid) {
    const k = d.login.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    if (d.password) await SecureStore.setItemAsync(secretKey(d.login), d.password);
    deduped.push({ login: d.login, employee: d.employee, name: d.name, team: d.team, usesRouting: d.usesRouting });
  }
  await AsyncStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(deduped));
  const restored: LoginSession[] = [];
  for (const meta of deduped) {
    const password = await SecureStore.getItemAsync(secretKey(meta.login));
    if (password) restored.push({ ...meta, password });
  }
  return restored;
}

export async function setStoredSessions(sessions: LoginSession[]): Promise<void> {
  if (!sessions || sessions.length === 0) {
    await AsyncStorage.removeItem(ACTIVE_SESSIONS_KEY);
    await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
    return;
  }
  const seen = new Set<string>();
  const metadata: any[] = [];
  for (const s of sessions) {
    const k = s.login.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    await SecureStore.setItemAsync(secretKey(s.login), s.password);
    metadata.push({ login: s.login, employee: s.employee, name: s.name, team: s.team, usesRouting: s.usesRouting });
  }
  await AsyncStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(metadata));
  await AsyncStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(metadata[0]));
}

export async function hasPendingDetail(rdo: import('../types').RdoSummary,session: LoginSession): Promise<boolean> {
  const key=`@aniel_detail_draft_${session.login}_${rdo.contract}_${rdo.project}_${rdo.number}_${rdo.raw?.contrato ?? ''}`;
  const raw=await AsyncStorage.getItem(key);
  if (!raw) return false;
  try { const data=JSON.parse(raw); return Object.values(data.draftsByQuizId ?? {}).some((d: any) => d.state!=='sent'); }
  catch { throw new Error('Não foi possível conferir os preenchimentos locais. Resolva o detalhamento antes da baixa.'); }
}
