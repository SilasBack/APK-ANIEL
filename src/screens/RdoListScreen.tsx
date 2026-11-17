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

interface Props {
  session: LoginSession;
  onSelectRdo: (rdo: RdoSummary) => void;
  onCreateRdo: () => void;
  onLogout: () => void;
}

export function RdoListScreen({ session, onSelectRdo, onCreateRdo, onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<'abertos' | 'fechados'>('abertos');
  const [loading, setLoading] = useState(false);
  const [rdos, setRdos] = useState<RdoSummary[]>([]);
  const [search, setSearch] = useState('');

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
        return { bg: '#FEFCBF', text: '#B7791F' };
      case 'Atendido':
        return { bg: '#C6F6D5', text: '#22543D' };
      case 'FechadaProdutiva':
      case 'FechadaImprodutiva':
        return { bg: '#E2E8F0', text: '#4A5568' };
      default:
        return { bg: '#E6F4F1', text: '#08776F' };
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <View>
          <Text style={styles.appBarTitle}>Obras & RDO</Text>
          <Text style={styles.appBarSubtitle}>
            {session.name} • Equipe {session.team}
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <MaterialIcons name="logout" size={22} color="#E53E3E" />
        </TouchableOpacity>
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

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={20} color="#718096" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por obra, INEP, contrato ou endereço..."
          placeholderTextColor="#A0AEC0"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialIcons name="clear" size={18} color="#718096" />
          </TouchableOpacity>
        )}
      </View>

      <Text style={{paddingHorizontal:20,color:'#4A5568'}}>{filteredRdos.length} encontrado(s) de {rdos.length} RDOs</Text>
      {/* List */}
      {loading && rdos.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#08776F" />
          <Text style={styles.loadingText}>Carregando obras...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRdos}
          keyExtractor={(item, idx) => `${item.number}-${idx}`}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={fetchRdos} colors={['#08776F']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialIcons name="assignment-late" size={48} color="#CBD5E0" />
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
                    <MaterialIcons name="location-on" size={16} color="#718096" />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
