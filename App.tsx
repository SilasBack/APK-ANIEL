import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoginSession, RdoSummary } from './src/types';
import { loginAsync } from './src/services/apiClient';
import {
  getClientDevice,
  getStoredSessions,
  setStoredSessions,
} from './src/services/storage';
import { LoginScreen } from './src/screens/LoginScreen';
import { clearRdoListCache, RdoListScreen } from './src/screens/RdoListScreen';
import { RdoDetailScreen } from './src/screens/RdoDetailScreen';
import { NativeRdoDetailScreen } from './src/screens/NativeRdoDetailScreen';
import { CreateRdoScreen } from './src/screens/CreateRdoScreen';
import { BaixarAtividadeScreen } from './src/screens/BaixarAtividadeScreen';
import { AttachmentsScreen } from './src/screens/AttachmentsScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

type Screen =
  | 'login'
  | 'addAccount'
  | 'rdoList'
  | 'rdoDetail'
  | 'nativeRdoDetail'
  | 'createRdo'
  | 'baixarAtividade'
  | 'attachments';

export default function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  const { isDark, colors } = useTheme();
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('ALL');
  const [currentScreen, setCurrentScreen] = useState<Screen>('login');
  const [selectedRdo, setSelectedRdo] = useState<RdoSummary | null>(null);
  const [selectedRdoLogin, setSelectedRdoLogin] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await getStoredSessions();
        if (stored.length > 0) {
          const device = await getClientDevice();
          const results = await Promise.allSettled(
            stored.map((s) => loginAsync(s.login, s.password, device))
          );
          if (!active) return;
          const valid = results
            .filter((r): r is PromiseFulfilledResult<LoginSession> => r.status === 'fulfilled')
            .map((r) => r.value);
          if (valid.length > 0) {
            setSessions(valid);
            setSelectedAccount(valid.length > 1 ? 'ALL' : valid[0].login);
            setCurrentScreen('rdoList');
            await setStoredSessions(valid);
          } else {
            setSessions([]);
            setCurrentScreen('login');
          }
        }
      } catch {
        if (active) {
          setSessions([]);
          setCurrentScreen('login');
        }
      } finally {
        if (active) setInitializing(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Android hardware / gesture back button handler — navigates back instead of exiting the app
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (
        currentScreen === 'nativeRdoDetail' ||
        currentScreen === 'baixarAtividade' ||
        currentScreen === 'attachments'
      ) {
        setCurrentScreen('rdoDetail');
        return true;
      }
      if (
        currentScreen === 'rdoDetail' ||
        currentScreen === 'createRdo' ||
        currentScreen === 'addAccount'
      ) {
        setCurrentScreen('rdoList');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [currentScreen]);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let active = true;
    void (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!active || !result.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (!active || !fetched.isNew) return;
        Alert.alert(
          'Atualização disponível',
          'Uma nova versão do Aniel Next foi baixada. Deseja reiniciar o app agora para aplicar?',
          [
            { text: 'Depois', style: 'cancel' },
            {
              text: 'Atualizar agora',
              onPress: () => {
                void Updates.reloadAsync();
              },
            },
          ]
        );
      } catch {
        // Silent failure when offline or update server unreachable
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleAccountConnected(newSession: LoginSession) {
    const updated = [
      ...sessions.filter((s) => s.login.toLowerCase() !== newSession.login.toLowerCase()),
      newSession,
    ];
    setSessions(updated);
    setSelectedAccount(updated.length > 1 ? 'ALL' : newSession.login);
    await setStoredSessions(updated);
    setCurrentScreen('rdoList');
  }

  async function handleDisconnectAccount(login: string) {
    clearRdoListCache();
    const remaining = sessions.filter((s) => s.login.toLowerCase() !== login.toLowerCase());
    setSessions(remaining);
    await setStoredSessions(remaining);
    if (remaining.length === 0) {
      setSelectedRdo(null);
      setSelectedRdoLogin(null);
      setSelectedAccount('ALL');
      setCurrentScreen('login');
      return;
    }
    if (selectedAccount.toLowerCase() === login.toLowerCase()) {
      setSelectedAccount(remaining.length > 1 ? 'ALL' : remaining[0].login);
    }
    if (selectedRdoLogin && selectedRdoLogin.toLowerCase() === login.toLowerCase()) {
      setSelectedRdo(null);
      setSelectedRdoLogin(null);
      setCurrentScreen('rdoList');
    }
  }

  async function handleLogoutAll() {
    clearRdoListCache();
    await setStoredSessions([]);
    setSessions([]);
    setSelectedRdo(null);
    setSelectedRdoLogin(null);
    setSelectedAccount('ALL');
    setCurrentScreen('login');
  }

  function handleSelectRdo(rdo: RdoSummary) {
    const ownerLogin = rdo.accountLogin || (sessions.length === 1 ? sessions[0].login : null);
    const owner = ownerLogin
      ? sessions.find((s) => s.login.toLowerCase() === ownerLogin.toLowerCase())
      : null;
    if (!owner) {
      Alert.alert(
        'Conta não identificada',
        'Não foi possível identificar a conta vinculada a este RDO. Atualize a lista.'
      );
      return;
    }
    setSelectedRdo(rdo);
    setSelectedRdoLogin(owner.login);
    setCurrentScreen('rdoDetail');
  }

  // Strictly bind RDO screens to the exact account that queried that RDO
  const selectedRdoSession = selectedRdoLogin
    ? sessions.find((s) => s.login.toLowerCase() === selectedRdoLogin.toLowerCase()) || null
    : null;

  // Default account for CreateRdoScreen: currently filtered account, or first connected account
  const createDefaultSession =
    sessions.find((s) => s.login.toLowerCase() === selectedAccount.toLowerCase()) ||
    sessions[0] ||
    null;

  if (initializing) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {currentScreen === 'login' && (
          <LoginScreen onLoginSuccess={handleAccountConnected} />
        )}

        {currentScreen === 'addAccount' && (
          <LoginScreen
            isAddingAccount
            connectedLogins={sessions.map((s) => s.login)}
            onLoginSuccess={handleAccountConnected}
            onCancel={() => setCurrentScreen('rdoList')}
          />
        )}

        {currentScreen === 'rdoList' && sessions.length > 0 && (
          <RdoListScreen
            sessions={sessions}
            selectedAccount={selectedAccount}
            onSelectAccount={setSelectedAccount}
            onAddAccount={() => setCurrentScreen('addAccount')}
            onDisconnectAccount={handleDisconnectAccount}
            onSelectRdo={handleSelectRdo}
            onCreateRdo={() => setCurrentScreen('createRdo')}
            onLogoutAll={handleLogoutAll}
          />
        )}

        {currentScreen === 'rdoDetail' && selectedRdoSession && selectedRdo && (
          <RdoDetailScreen
            session={selectedRdoSession}
            rdo={selectedRdo}
            onBack={() => setCurrentScreen('rdoList')}
            onOpenQuizDetail={() => setCurrentScreen('nativeRdoDetail')}
            onOpenBaixar={() => setCurrentScreen('baixarAtividade')}
            onOpenAttachments={() => setCurrentScreen('attachments')}
          />
        )}

        {currentScreen === 'nativeRdoDetail' && selectedRdoSession && selectedRdo && (
          <NativeRdoDetailScreen
            session={selectedRdoSession}
            rdo={selectedRdo}
            closed={
              selectedRdo.status === 'FechadaProdutiva' ||
              selectedRdo.status === 'FechadaImprodutiva'
            }
            onBack={() => setCurrentScreen('rdoDetail')}
          />
        )}

        {currentScreen === 'createRdo' && createDefaultSession && (
          <CreateRdoScreen
            session={createDefaultSession}
            sessions={sessions}
            onBack={() => setCurrentScreen('rdoList')}
            onCreated={() => {
              clearRdoListCache();
              setCurrentScreen('rdoList');
            }}
          />
        )}

        {currentScreen === 'baixarAtividade' && selectedRdoSession && selectedRdo && (
          <BaixarAtividadeScreen
            session={selectedRdoSession}
            rdo={selectedRdo}
            onBack={() => setCurrentScreen('rdoDetail')}
            onSuccess={() => {
              clearRdoListCache();
              setCurrentScreen('rdoList');
            }}
          />
        )}

        {currentScreen === 'attachments' && selectedRdoSession && selectedRdo && (
          <AttachmentsScreen
            session={selectedRdoSession}
            rdo={selectedRdo}
            onBack={() => setCurrentScreen('rdoDetail')}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
  },
});
