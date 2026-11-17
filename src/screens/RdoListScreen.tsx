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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  session: LoginSession;
  onSelectRdo: (rdo: RdoSummary) => void;
  onCreateRdo: () => void;
  onLogout: () => void;
}

export function RdoListScreen({ session, onSelectRdo, onCreateRdo, onLogout }: Props) {
  const { isDark, colors, toggleTheme } = useTheme();
  const styles = useThemedStyles(baseStyles);
  const [activeTab, setActiveTab] = useState<'abertos' | 'fechados'>('abertos');
  const [loading, setLoading] = useState(false);
  const [rdos, setRdos] = useState<RdoSummary[]>([]);
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

  const requestRef=useRef(0);
  const fetchRdos=useCallback(async () => {
    const id=++requestRef.current;
    setLoading(true);
    try {
      const now=new Date();
      const list=activeTab==='abertos'
        ? await getOpenRdosAsync(session)
        : await getClosedRdosAsync(session,new Date(now.getFullYear(),now.getMonth(),1).toLocaleDateString('pt-BR'),now.toLocaleDateString('pt-BR'));
      if (id===requestRef.current) setRdos(list);
    } catch(err: any) {
      if (id===requestRef.current) Alert.alert('Erro ao carregar RDOs',err?.message || 'Falha na comunicação com o servidor.');
    } finally { if (id===requestRef.current) setLoading(false); }
  },[activeTab,session]);
  useEffect(() => { void fetchRdos(); return () => { requestRef.current++; }; },[fetchRdos]);

  const filteredRdos = rdos.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.number.toLowerCase().includes(q) ||
      r.project.toLowerCase().includes(q) ||
      r.contract.toLowerCase().includes(q) ||
      r.address.toLowerCase().includes(q) ||
      r.service.toLowerCase().includes(q)
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

  return (
    <SafeAreaView style={styles.container}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.appBarTitle}>Obras & RDO</Text>
          <Text style={styles.appBarSubtitle} numberOfLines={1}>
            {session.name} • Equipe {session.team}
          </Text>
        </View>
        <View style={styles.appBarActions}>
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
              size={22}
              color={colors.primarySoftText}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <MaterialIcons name="logout" size={22} color={colors.danger} />
          </TouchableOpacity>
        </View>
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
          placeholder="Buscar por obra, INEP, contrato ou endereço..."
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

      <Text style={{ paddingHorizontal: 20, marginBottom: 4, color: colors.textSecondary }}>
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
          keyExtractor={(item, idx) => `${item.number}-${idx}`}
          contentContainerStyle={styles.listContent}
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

      {/* Floating Action Button (New RDO) */}
      <TouchableOpacity style={styles.fab} onPress={onCreateRdo}>
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
    gap: 8,
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  appBarTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  appBarSubtitle: {
    fontSize: 13,
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
    paddingVertical: 12,
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
    marginVertical: 12,
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
    paddingBottom: 90,
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
    bottom: 24,
    right: 20,
    backgroundColor: '#08776F',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  fabText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginLeft: 6,
  },
});
