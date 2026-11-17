import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { getOpenRdosAsync, getClosedRdosAsync } from '../services/apiClient';
import { LoginSession, RdoSummary } from '../types';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { StorageCleanupModal } from '../components/StorageCleanupModal';
import {
  cleanupAppStorageAsync,
  formatBytes,
  getAutoCleanupEnabledAsync,
  inspectAppStorageAsync,
  StorageStats,
} from '../services/storageCleanup';

interface Props {
  sessions: LoginSession[];
  selectedAccount: string; // 'ALL' or login
  onSelectAccount: (login: string) => void;
  onAddAccount: () => void;
  onDisconnectAccount: (login: string) => void;
  onSelectRdo: (rdo: RdoSummary) => void;
  onCreateRdo: () => void;
  onLogoutAll: () => void;
}

export function RdoListScreen({
  sessions,
  selectedAccount,
  onSelectAccount,
  onAddAccount,
  onDisconnectAccount,
  onSelectRdo,
  onCreateRdo,
  onLogoutAll,
}: Props) {
  const { isDark, colors, toggleTheme } = useTheme();
  const styles = useThemedStyles(baseStyles);
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'abertos' | 'fechados'>('abertos');
  const [loading, setLoading] = useState(false);
  const [rdos, setRdos] = useState<RdoSummary[]>([]);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [cleanupVisible, setCleanupVisible] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const notifiedLimitRef = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [stats, autoEnabled] = await Promise.all([
          inspectAppStorageAsync(),
          getAutoCleanupEnabledAsync(),
        ]);
        if (!active) return;
        setStorageStats(stats);
        if (stats.exceedsLimit && !notifiedLimitRef.current) {
          notifiedLimitRef.current = true;
          if (autoEnabled) {
            const res = await cleanupAppStorageAsync({ clearDrafts: true, clearMedia: true });
            if (!active) return;
            setStorageStats(res.remaining);
            Alert.alert(
              'Auto-limpeza concluída',
              `O armazenamento do app atingiu ${formatBytes(stats.totalBytes)} (limite de 1 GB).\n\nForam liberados ${formatBytes(res.freedBytes)} em rascunhos e vídeos baixados.`
            );
          } else {
            Alert.alert(
              'Armazenamento cheio (≥ 1 GB)',
              `Os rascunhos e vídeos baixados do app atingiram ${formatBytes(stats.totalBytes)}. Deseja fazer uma limpeza agora?`,
              [
                { text: 'Depois', style: 'cancel' },
                { text: 'Limpar agora', onPress: () => setCleanupVisible(true) },
              ]
            );
          }
        }
      } catch {
        // Non-fatal
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const requestRef = useRef(0);
  const fetchRdos = useCallback(async () => {
    const id = ++requestRef.current;
    setLoading(true);
    setLoadErrors([]);
    try {
      const now = new Date();
      const startStr = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('pt-BR');
      const endStr = now.toLocaleDateString('pt-BR');
      const targets =
        selectedAccount === 'ALL'
          ? sessions
          : sessions.filter((s) => s.login.toLowerCase() === selectedAccount.toLowerCase());

      const results = await Promise.allSettled(
        targets.map(async (acc) => {
          const list =
            activeTab === 'abertos'
              ? await getOpenRdosAsync(acc)
              : await getClosedRdosAsync(acc, startStr, endStr);
          return list.map((item) => ({
            ...item,
            accountLogin: acc.login,
            accountName: acc.name,
            accountTeam: acc.team,
          }));
        })
      );

      if (id !== requestRef.current) return;
      const combined: RdoSummary[] = [];
      const errors: string[] = [];
      results.forEach((res, idx) => {
        const acc = targets[idx];
        if (res.status === 'fulfilled') {
          combined.push(...res.value);
        } else {
          errors.push(
            `Conta ${acc.login}: ${res.reason?.message || 'Falha na comunicação com o servidor.'}`
          );
        }
      });

      setRdos(combined);
      setLoadErrors(errors);
      if (errors.length > 0 && combined.length === 0 && targets.length === 1) {
        Alert.alert('Erro ao carregar RDOs', errors[0]);
      }
    } finally {
      if (id === requestRef.current) setLoading(false);
    }
  }, [activeTab, sessions, selectedAccount]);

  useEffect(() => {
    void fetchRdos();
    return () => {
      requestRef.current++;
    };
  }, [fetchRdos]);

  const filteredRdos = rdos.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.number.toLowerCase().includes(q) ||
      r.project.toLowerCase().includes(q) ||
      r.contract.toLowerCase().includes(q) ||
      r.address.toLowerCase().includes(q) ||
      r.service.toLowerCase().includes(q) ||
      (r.accountLogin || '').toLowerCase().includes(q) ||
      (r.accountTeam || '').toLowerCase().includes(q)
    );
  });

  function getStatusStyle(status: string) {
    switch (status) {
      case 'Atendendo':
        return { bg: colors.warningSoft, text: colors.warningText };
      case 'Atendido':
        return { bg: colors.successSoft, text: colors.successText };
      case 'FechadaProdutiva':
      case 'FechadaImprodutiva':
        return { bg: colors.surfaceMuted, text: colors.textSecondary };
      default:
        return { bg: colors.primarySoft, text: colors.primarySoftText };
    }
  }

  function confirmDisconnect(acc: LoginSession) {
    Alert.alert(
      'Desconectar conta',
      `Deseja desconectar a conta ${acc.login} (${acc.name || acc.team})?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: () => onDisconnectAccount(acc.login),
        },
      ]
    );
  }

  function handleLogoutPress() {
    if (sessions.length <= 1) {
      onLogoutAll();
      return;
    }
    Alert.alert(
      'Encerrar sessões',
      `Você tem ${sessions.length} contas conectadas. Deseja sair de todas as contas?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair de todas', style: 'destructive', onPress: onLogoutAll },
      ]
    );
  }

  const singleSession = sessions.length === 1 ? sessions[0] : null;
  const fabBottom = Math.max(insets.bottom, 16) + 20;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.appBarTitle}>Obras & RDO</Text>
          <Text style={styles.appBarSubtitle} numberOfLines={1}>
            {singleSession
              ? `${singleSession.name} • Equipe ${singleSession.team}`
              : `${sessions.length} contas conectadas`}
          </Text>
        </View>
        <View style={styles.appBarActions}>
          <TouchableOpacity
            style={styles.themeBtn}
            onPress={onAddAccount}
            accessibilityLabel="Conectar outra conta"
          >
            <MaterialIcons name="person-add" size={21} color={colors.primarySoftText} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.themeBtn,
              storageStats?.exceedsLimit && styles.cleanupBtnAlert,
            ]}
            onPress={() => setCleanupVisible(true)}
            accessibilityLabel="Auto-limpeza e armazenamento"
          >
            <MaterialIcons
              name="cleaning-services"
              size={21}
              color={storageStats?.exceedsLimit ? colors.danger : colors.primarySoftText}
            />
            {storageStats?.exceedsLimit && <View style={styles.alertDot} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.themeBtn}
            onPress={toggleTheme}
            accessibilityLabel={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
          >
            <MaterialIcons
              name={isDark ? 'light-mode' : 'dark-mode'}
              size={21}
              color={colors.primarySoftText}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogoutPress}>
            <MaterialIcons name="logout" size={21} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Multi-Account Switcher Bar */}
      <View style={styles.accountsBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.accountsScrollContent}
        >
          {sessions.length > 1 && (
            <TouchableOpacity
              style={[
                styles.accountChip,
                selectedAccount === 'ALL' && styles.accountChipActive,
              ]}
              onPress={() => onSelectAccount('ALL')}
            >
              <MaterialIcons
                name="groups"
                size={15}
                color={selectedAccount === 'ALL' ? '#FFF' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.accountChipText,
                  selectedAccount === 'ALL' && styles.accountChipTextActive,
                ]}
              >
                Todas ({sessions.length})
              </Text>
            </TouchableOpacity>
          )}

          {sessions.map((acc) => {
            const isSelected =
              sessions.length === 1 ||
              selectedAccount.toLowerCase() === acc.login.toLowerCase();
            return (
              <View
                key={acc.login}
                style={[
                  styles.accountChipWrap,
                  isSelected && styles.accountChipActive,
                ]}
              >
                <TouchableOpacity
                  style={styles.accountChipMain}
                  onPress={() => onSelectAccount(acc.login)}
                >
                  <MaterialIcons
                    name="person"
                    size={15}
                    color={isSelected ? '#FFF' : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.accountChipText,
                      isSelected && styles.accountChipTextActive,
                    ]}
                  >
                    {acc.login}
                    {acc.team ? ` · ${acc.team}` : ''}
                  </Text>
                </TouchableOpacity>
                {sessions.length > 1 && (
                  <TouchableOpacity
                    style={styles.accountChipClose}
                    onPress={() => confirmDisconnect(acc)}
                    accessibilityLabel={`Desconectar ${acc.login}`}
                  >
                    <MaterialIcons
                      name="close"
                      size={14}
                      color={isSelected ? '#E6FFFA' : colors.iconMuted}
                    />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          <TouchableOpacity style={styles.addAccountChip} onPress={onAddAccount}>
            <MaterialIcons name="add" size={16} color={colors.primarySoftText} />
            <Text style={styles.addAccountChipText}>Conta</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'abertos' && styles.tabActive]}
          onPress={() => setActiveTab('abertos')}
        >
          <Text style={[styles.tabText, activeTab === 'abertos' && styles.tabTextActive]}>
            RDOs Abertos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'fechados' && styles.tabActive]}
          onPress={() => setActiveTab('fechados')}
        >
          <Text style={[styles.tabText, activeTab === 'fechados' && styles.tabTextActive]}>
            RDOs Fechados
          </Text>
        </TouchableOpacity>
      </View>

      {/* Partial Account Load Error Banner */}
      {loadErrors.length > 0 && (
        <View style={styles.storageBanner}>
          <MaterialIcons name="error-outline" size={18} color={colors.danger} />
          <Text style={styles.storageBannerText}>{loadErrors.join('\n')}</Text>
        </View>
      )}

      {/* 1 GB Storage Warning Banner */}
      {storageStats?.exceedsLimit && (
        <View style={styles.storageBanner}>
          <MaterialIcons name="warning-amber" size={20} color={colors.danger} />
          <Text style={styles.storageBannerText}>
            Armazenamento em {formatBytes(storageStats.totalBytes)} (limite 1 GB). Limpe rascunhos e vídeos em cache.
          </Text>
          <TouchableOpacity
            style={styles.storageBannerBtn}
            onPress={() => setCleanupVisible(true)}
          >
            <Text style={styles.storageBannerBtnText}>Limpar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={20} color={colors.iconMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por obra, INEP, contrato, conta ou endereço..."
          placeholderTextColor={colors.placeholder}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialIcons name="clear" size={18} color={colors.iconMuted} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={{ paddingHorizontal: 20, marginBottom: 4, color: colors.textSecondary, fontSize: 12 }}>
        {filteredRdos.length} encontrado(s) de {rdos.length} RDOs
      </Text>

      {/* List */}
      {loading && rdos.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Carregando obras...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRdos}
          keyExtractor={(item, idx) =>
            `${item.accountLogin || 'acc'}-${item.contract}-${item.project}-${item.number}-${idx}`
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: fabBottom + 76 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchRdos}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialIcons name="assignment-late" size={48} color={colors.borderStrong} />
              <Text style={styles.emptyText}>Nenhum RDO encontrado.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusStyle = getStatusStyle(item.status);
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => onSelectRdo(item)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.obraBadge}>
                    <Text style={styles.obraText}>RDO #{item.number}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusText, { color: statusStyle.text }]}>
                      {item.status}
                    </Text>
                  </View>
                </View>

                {sessions.length > 1 && item.accountLogin ? (
                  <View style={styles.accountOwnerPill}>
                    <MaterialIcons name="badge" size={13} color={colors.info} />
                    <Text style={styles.accountOwnerText}>
                      Conta {item.accountLogin}
                      {item.accountTeam ? ` · Equipe ${item.accountTeam}` : ''}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.projectText}>
                  Projeto / INEP: <Text style={styles.projectVal}>{item.project}</Text>
                </Text>
                <Text style={styles.serviceText}>{item.service}</Text>

                {item.address ? (
                  <View style={styles.addressRow}>
                    <MaterialIcons name="location-on" size={16} color={colors.iconMuted} />
                    <Text style={styles.addressText} numberOfLines={2}>
                      {item.address}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.cardFooter}>
                  <Text style={styles.contractText}>Contrato: {item.contract}</Text>
                  {item.date ? <Text style={styles.dateText}>{item.date}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Floating Action Button (New RDO) — positioned safely above Android nav bar */}
      <TouchableOpacity style={[styles.fab, { bottom: fabBottom }]} onPress={onCreateRdo}>
        <MaterialIcons name="add" size={26} color="#FFF" />
        <Text style={styles.fabText}>Novo RDO</Text>
      </TouchableOpacity>

      <StorageCleanupModal
        visible={cleanupVisible}
        onClose={() => setCleanupVisible(false)}
        onStatsUpdated={setStorageStats}
      />
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  appBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  themeBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#E6F4F1',
    position: 'relative',
  },
  cleanupBtnAlert: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FEB2B2',
  },
  alertDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E53E3E',
  },
  accountsBar: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
    paddingVertical: 8,
  },
  accountsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EDF2F7',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
  },
  accountChipWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF2F7',
    borderRadius: 16,
  },
  accountChipMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 11,
    paddingRight: 9,
    paddingVertical: 6,
  },
  accountChipClose: {
    paddingRight: 8,
    paddingLeft: 2,
    paddingVertical: 6,
  },
  accountChipActive: {
    backgroundColor: '#08776F',
  },
  accountChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2D3748',
  },
  accountChipTextActive: {
    color: '#FFF',
  },
  addAccountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E6F4F1',
    borderWidth: 1,
    borderColor: '#B2DFDB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  addAccountChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#08776F',
  },
  accountOwnerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#EBF8FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  accountOwnerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2B6CB0',
  },
  storageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FEB2B2',
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  storageBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#C53030',
  },
  storageBannerBtn: {
    backgroundColor: '#C53030',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  storageBannerBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  appBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  appBarTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  appBarSubtitle: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FFF5F5',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#08776F',
  },
  tabText: {
    fontSize: 14,
    color: '#718096',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#08776F',
    fontWeight: 'bold',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF2F7',
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#2D3748',
  },
  listContent: {
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  obraBadge: {
    backgroundColor: '#EDF2F7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  obraText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  projectText: {
    fontSize: 14,
    color: '#4A5568',
    marginBottom: 4,
  },
  projectVal: {
    fontWeight: 'bold',
    color: '#1A202C',
  },
  serviceText: {
    fontSize: 13,
    color: '#718096',
    marginBottom: 8,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  addressText: {
    fontSize: 12,
    color: '#718096',
    marginLeft: 4,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F7FAFC',
    paddingTop: 8,
  },
  contractText: {
    fontSize: 11,
    color: '#A0AEC0',
  },
  dateText: {
    fontSize: 11,
    color: '#A0AEC0',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#718096',
  },
  emptyBox: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    color: '#A0AEC0',
  },
  fab: {
    position: 'absolute',
    right: 20,
    backgroundColor: '#08776F',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 28,
    shadowColor: '#08776F',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15,
    marginLeft: 6,
  },
});
