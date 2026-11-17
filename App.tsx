import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoginSession, RdoSummary } from './src/types';
import { loginAsync } from './src/services/apiClient';
import { getClientDevice, getStoredSession, setStoredSession } from './src/services/storage';
import { LoginScreen } from './src/screens/LoginScreen';
import { RdoListScreen } from './src/screens/RdoListScreen';
import { RdoDetailScreen } from './src/screens/RdoDetailScreen';
import { NativeRdoDetailScreen } from './src/screens/NativeRdoDetailScreen';
import { CreateRdoScreen } from './src/screens/CreateRdoScreen';
import { BaixarAtividadeScreen } from './src/screens/BaixarAtividadeScreen';
import { AttachmentsScreen } from './src/screens/AttachmentsScreen';

type Screen =
  | 'login'
  | 'rdoList'
  | 'rdoDetail'
  | 'nativeRdoDetail'
  | 'createRdo'
  | 'baixarAtividade'
  | 'attachments';

export default function App() {
  const [session, setSession] = useState<LoginSession | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>('login');
  const [selectedRdo, setSelectedRdo] = useState<RdoSummary | null>(null);
  const [initializing, setInitializing] = useState(true);



  async function checkActiveSession() {
    try {
      const stored = await getStoredSession();
      if (stored) {
        setSession(await loginAsync(stored.login,stored.password,await getClientDevice()));
        setCurrentScreen('rdoList');
      }
    } catch {
      setSession(null);
      setCurrentScreen('login');
    } finally {
      setInitializing(false);
    }
  }

  useEffect(() => {
    checkActiveSession();
  }, []);

  function handleLoginSuccess(newSession: LoginSession) {
    setSession(newSession);
    setCurrentScreen('rdoList');
  }

  async function handleLogout() {
    await setStoredSession(null);
    setSession(null);
    setSelectedRdo(null);
    setCurrentScreen('login');
  }

  function handleSelectRdo(rdo: RdoSummary) {
    setSelectedRdo(rdo);
    setCurrentScreen('rdoDetail');
  }

  if (initializing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#08776F" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {currentScreen === 'login' && (
          <LoginScreen onLoginSuccess={handleLoginSuccess} />
        )}

        {currentScreen === 'rdoList' && session && (
          <RdoListScreen
            session={session}
            onSelectRdo={handleSelectRdo}
            onCreateRdo={() => setCurrentScreen('createRdo')}
            onLogout={handleLogout}
          />
        )}

        {currentScreen === 'rdoDetail' && session && selectedRdo && (
          <RdoDetailScreen
            session={session}
            rdo={selectedRdo}
            onBack={() => setCurrentScreen('rdoList')}
            onOpenQuizDetail={() => setCurrentScreen('nativeRdoDetail')}
            onOpenBaixar={() => setCurrentScreen('baixarAtividade')}
            onOpenAttachments={() => setCurrentScreen('attachments')}
          />
        )}

        {currentScreen === 'nativeRdoDetail' && session && selectedRdo && (
          <NativeRdoDetailScreen
            session={session}
            rdo={selectedRdo}
            closed={
              selectedRdo.status === 'FechadaProdutiva' ||
              selectedRdo.status === 'FechadaImprodutiva'
            }
            onBack={() => setCurrentScreen('rdoDetail')}
          />
        )}

        {currentScreen === 'createRdo' && session && (
          <CreateRdoScreen
            session={session}
            onBack={() => setCurrentScreen('rdoList')}
            onCreated={() => setCurrentScreen('rdoList')}
          />
        )}

        {currentScreen === 'baixarAtividade' && session && selectedRdo && (
          <BaixarAtividadeScreen
            session={session}
            rdo={selectedRdo}
            onBack={() => setCurrentScreen('rdoDetail')}
            onSuccess={() => setCurrentScreen('rdoList')}
          />
        )}

        {currentScreen === 'attachments' && session && selectedRdo && (
          <AttachmentsScreen
            session={session}
            rdo={selectedRdo}
            onBack={() => setCurrentScreen('rdoDetail')}
          />
        )}
      </View>
    </SafeAreaProvider>
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
