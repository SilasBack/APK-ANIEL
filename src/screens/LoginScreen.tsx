import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CONFIG } from '../constants/config';
import { loginAsync } from '../services/apiClient';
import { getClientDevice, getSavedLogins, saveLogin, removeSavedLogin, setStoredSession } from '../services/storage';
import { LoginSession, SavedLogin } from '../types';

interface Props {
  onLoginSuccess: (session: LoginSession) => void;
}

export function LoginScreen({ onLoginSuccess }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedLogins, setSavedLogins] = useState<SavedLogin[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    loadSavedLogins();
  }, []);

  async function loadSavedLogins() {
    let list: SavedLogin[];
    try { list = await getSavedLogins(); } catch { Alert.alert('Acessos salvos', 'Não foi possível abrir os acessos protegidos. Digite seu login.'); return; }
    setSavedLogins(list);
    if (list.length > 0 && !username) {
      setUsername(list[0].login);
      if (list[0].password) setPassword(list[0].password);
    }
  }

  async function handleLogin() {
    if (!username.trim() || !password) {
      Alert.alert('Atenção', 'Informe o usuário e a senha do Aniel.');
      return;
    }

    setLoading(true);
    try {
      const device = await getClientDevice();
      const session = await loginAsync(username, password, device);
      await saveLogin(username.trim(), password, session.name);
      await setStoredSession(session);
      onLoginSuccess(session);
    } catch (err: any) {
      Alert.alert('Erro ao entrar', err?.message || 'Falha na autenticação.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectSaved(saved: SavedLogin) {
    setUsername(saved.login);
    setPassword(saved.password || '');
  }

  async function handleRemoveSaved(login: string) {
    Alert.alert('Remover acesso', `Deseja remover ${login} dos acessos salvos?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await removeSavedLogin(login);
          loadSavedLogins();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="engineering" size={40} color="#08776F" />
          </View>
          <Text style={styles.title}>Aniel Next</Text>
          <Text style={styles.subtitle}>Gestão de Obras & RDO</Text>
          
          <View style={styles.companyBadge}>
            <MaterialIcons name="business" size={16} color="#08776F" />
            <Text style={styles.companyText}>
              Empresa {CONFIG.COMPANY_CODE} • {CONFIG.COMPANY_NAME}
            </Text>
          </View>
        </View>

        {/* Saved Logins Chips */}
        {savedLogins.length > 0 && (
          <View style={styles.savedSection}>
            <Text style={styles.savedTitle}>Acessos recentes</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {savedLogins.map((item) => (
                <View key={item.login} style={styles.chipContainer}>
                  <TouchableOpacity
                    style={[
                      styles.chip,
                      username.toLowerCase() === item.login.toLowerCase() && styles.chipActive,
                    ]}
                    onPress={() => handleSelectSaved(item)}
                  >
                    <MaterialIcons
                      name="person"
                      size={16}
                      color={username.toLowerCase() === item.login.toLowerCase() ? '#FFF' : '#333'}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        username.toLowerCase() === item.login.toLowerCase() && styles.chipTextActive,
                      ]}
                    >
                      {item.login}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleRemoveSaved(item.login)}
                    style={styles.chipDelete}
                  >
                    <MaterialIcons name="close" size={12} color="#888" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Form */}
        <View style={styles.card}>
          <Text style={styles.label}>Usuário</Text>
          <View style={styles.inputContainer}>
            <MaterialIcons name="account-circle" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Digite seu usuário ou matrícula"
              placeholderTextColor="#999"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={styles.label}>Senha</Text>
          <View style={styles.inputContainer}>
            <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Digite sua senha"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}
            >
              <MaterialIcons
                name={showPassword ? 'visibility-off' : 'visibility'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Entrar no Aniel</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerAuthor}>Desenvolvido por {CONFIG.AUTHOR_NAME}</Text>
          <Text style={styles.footerVersion}>{CONFIG.APP_VERSION}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E6F4F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  subtitle: {
    fontSize: 14,
    color: '#718096',
    marginTop: 2,
  },
  companyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4F1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 12,
  },
  companyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#08776F',
    marginLeft: 6,
  },
  savedSection: {
    marginBottom: 16,
  },
  savedTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  chipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF2F7',
    borderRadius: 20,
    marginRight: 8,
    paddingRight: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  chipActive: {
    backgroundColor: '#08776F',
  },
  chipText: {
    fontSize: 13,
    color: '#2D3748',
    marginLeft: 4,
  },
  chipTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  chipDelete: {
    padding: 4,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: '#1A202C',
  },
  eyeIcon: {
    padding: 6,
  },
  button: {
    backgroundColor: '#08776F',
    height: 50,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
  },
  footerAuthor: {
    fontSize: 12,
    fontWeight: '500',
    color: '#A0AEC0',
  },
  footerVersion: {
    fontSize: 11,
    color: '#CBD5E0',
    marginTop: 2,
  },
});
