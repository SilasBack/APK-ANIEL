import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LoginSession, RdoSummary, RdoAttachment } from '../types';
import { getRdoAttachmentsAsync, handleResponse } from '../services/apiClient';
import { CONFIG } from '../constants/config';

interface Props {
  session: LoginSession;
  rdo: RdoSummary;
  onBack: () => void;
}

export function AttachmentsScreen({ session, rdo, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<RdoAttachment[]>([]);

  useEffect(() => {
    loadAttachments();
  }, []);

  async function loadAttachments() {
    setLoading(true);
    try {
      const list = await getRdoAttachmentsAsync(session, rdo);
      setAttachments(list);
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível carregar os anexos.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePickMedia() {
    if (uploading) return;
    Alert.alert('Novo Anexo', 'Selecione o tipo de mídia para anexar:', [
      {
        text: 'Vídeo da Obra (MP4)',
        onPress: () => pickMedia('videos'),
      },
      {
        text: 'Foto da Obra',
        onPress: () => pickMedia('images'),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function pickMedia(mediaTypes: 'videos' | 'images') {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão necessária', 'É necessário conceder acesso à galeria para enviar anexos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: [mediaTypes],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mime=asset.mimeType || (asset.type==='video' ? 'video/mp4' : 'image/jpeg');
        const ext=({'video/mp4':'mp4','video/quicktime':'mov','image/jpeg':'jpg','image/png':'png','image/webp':'webp'} as Record<string,string>)[mime];
        if (!ext) throw new Error('Formato de arquivo não suportado. Use MP4, MOV, JPEG, PNG ou WebP.');
        if (!asset.fileSize || asset.fileSize>=CONFIG.ATTACHMENT_LIMIT_BYTES) throw new Error('O arquivo deve ter menos de 100 MB e tamanho identificável.');
        await uploadFile(asset.uri, `anexo_${Date.now()}.${ext}`,mime,asset.fileSize);

      }
    } catch (err: any) {
      Alert.alert('Erro', 'Falha ao selecionar arquivo: ' + err?.message);
    }
  }

  async function uploadFile(uri: string, filename: string, mime: string, size: number) {
    setUploading(true);
    try {
      // Create FormData
      const formData = new FormData();
      const seq = rdo.raw.contrato;

      const doc = {
        nomeDocumento: filename,
        extensao: filename.split('.').pop(),
        uuId: `uuid-${Date.now()}`,
        caminho: filename,
        tamanho: `${(size/1048576).toFixed(2)} MB`,
        isRDO: true,
      };

      const envelope = {
        usuario: session.employee,
        senha: session.password,
        token: CONFIG.TOUCH_TOKEN,
        objeto: {
          contratoAniel: rdo.contract,
          projetoAniel: rdo.project,
          contrato: seq,
          obra: rdo.number,
          usuario: session.login,
          isRDO: true,
          arquivos: [doc],
        },
      };

      formData.append('json', JSON.stringify(envelope));
      // @ts-ignore
      formData.append(doc.uuId, {
        uri,
        name: filename,
        type: mime,
      });

      // Post to upload endpoint
      const base = CONFIG.BASE_URL.replace(/\/+$/, '');
      const url = `${base}/${CONFIG.API_VERSION}AnielTV.Touch.WebApi/api/Arquivo/SalvarArquivo`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          culture: 'pt-BR',
        },
        body: formData,
      });

      await handleResponse(res,[session.password,CONFIG.TOUCH_TOKEN]);
      Alert.alert('Sucesso', 'Arquivo confirmado pelo servidor.');
      await loadAttachments();
    } catch (err: any) {
      Alert.alert('Erro no envio', err?.message || 'Falha ao enviar arquivo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#1A202C" />
        </TouchableOpacity>
        <View style={styles.appBarTitleBox}>
          <Text style={styles.appBarTitle}>Anexos do RDO</Text>
          <Text style={styles.appBarSubtitle}>RDO #{rdo.number}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={handlePickMedia} disabled={uploading}>
          <MaterialIcons name="add" size={24} color="#08776F" />
        </TouchableOpacity>
      </View>

      {uploading && (
        <View style={styles.uploadingBar}>
          <ActivityIndicator size="small" color="#08776F" />
          <Text style={styles.uploadingText}>Enviando anexo para o servidor...</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#08776F" />
          <Text style={styles.loadingText}>Consultando anexos...</Text>
        </View>
      ) : (
        <FlatList
          data={attachments}
          keyExtractor={(item, idx) => `${item.uuId || item.nomeDocumento}-${idx}`}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialIcons name="folder-open" size={48} color="#CBD5E0" />
              <Text style={styles.emptyText}>Nenhum anexo encontrado no servidor.</Text>
              <Text style={styles.emptySubtext}>
                Clique no botão &quot;+&quot; acima para anexar fotos ou vídeos.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isVideo =
              (item.extensao || '').toLowerCase() === 'mp4' ||
              (item.nomeDocumento || '').toLowerCase().endsWith('.mp4');

            return (
              <View style={styles.itemCard}>
                <View
                  style={[
                    styles.itemIconCircle,
                    { backgroundColor: isVideo ? '#FEFCBF' : '#EBF8FF' },
                  ]}
                >
                  <MaterialIcons
                    name={isVideo ? 'videocam' : 'insert-drive-file'}
                    size={24}
                    color={isVideo ? '#B7791F' : '#2B6CB0'}
                  />
                </View>
                <View style={styles.itemTextCol}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.nomeDocumento}
                  </Text>
                  <Text style={styles.itemSize}>
                    {isVideo ? 'Vídeo da Obra • ' : 'Documento • '}
                    {item.tamanho || 'Tamanho desconhecido'}
                  </Text>
                </View>
                {isVideo && (
                  <View style={styles.videoBadge}>
                    <Text style={styles.videoBadgeText}>Vídeo Válido</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  appBarTitleBox: {
    flex: 1,
  },
  appBarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  appBarSubtitle: {
    fontSize: 12,
    color: '#718096',
  },
  addBtn: {
    padding: 8,
    backgroundColor: '#E6F4F1',
    borderRadius: 8,
  },
  uploadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4F1',
    padding: 12,
    paddingHorizontal: 20,
  },
  uploadingText: {
    fontSize: 13,
    color: '#08776F',
    fontWeight: '600',
    marginLeft: 10,
  },
  listContent: {
    padding: 16,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  itemIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemTextCol: {
    flex: 1,
    marginLeft: 12,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3748',
  },
  itemSize: {
    fontSize: 12,
    color: '#A0AEC0',
    marginTop: 2,
  },
  videoBadge: {
    backgroundColor: '#C6F6D5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  videoBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#22543D',
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
    paddingHorizontal: 20,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#718096',
  },
  emptySubtext: {
    marginTop: 4,
    fontSize: 13,
    color: '#A0AEC0',
    textAlign: 'center',
  },
});
