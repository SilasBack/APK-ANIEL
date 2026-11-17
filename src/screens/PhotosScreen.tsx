import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LoginSession, RdoSummary } from '../types';

interface Props {
  session: LoginSession;
  rdo: RdoSummary;
  onBack: () => void;
}

interface PhotoItem {
  id: string;
  uri: string;
  label: string;
}

export function PhotosScreen({ session, rdo, onBack }: Props) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);

  async function handleTakeCamera() {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permissão necessária', 'Permita o acesso à câmera para fotografar a obra.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        addPhoto(res.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Falha ao abrir câmera.');
    }
  }

  async function handlePickGallery() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permissão necessária', 'Permita o acesso à galeria.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (!res.canceled && res.assets) {
        res.assets.forEach((a) => addPhoto(a.uri));
      }
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Falha ao selecionar fotos.');
    }
  }

  function addPhoto(uri: string) {
    setPhotos((prev) => [
      ...prev,
      {
        id: `photo_${Date.now()}_${Math.random()}`,
        uri,
        label: `Foto ${prev.length + 1}`,
      },
    ]);
  }

  function handleRemovePhoto(id: string) {
    Alert.alert('Remover foto', 'Deseja remover esta foto do registro local?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          setPhotos((prev) => prev.filter((p) => p.id !== id));
          if (selectedPhoto?.id === id) setSelectedPhoto(null);
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#1A202C" />
        </TouchableOpacity>
        <View style={styles.appBarTitleBox}>
          <Text style={styles.appBarTitle}>Fotos selecionadas neste celular</Text>
          <Text style={styles.appBarSubtitle}>
            {photos.length} foto(s) • RDO #{rdo.number}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionIconBtn} onPress={handleTakeCamera}>
            <MaterialIcons name="photo-camera" size={22} color="#08776F" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionIconBtn} onPress={handlePickGallery}>
            <MaterialIcons name="photo-library" size={22} color="#08776F" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Selected Preview Modal/Overlay */}
      {selectedPhoto && (
        <View style={styles.previewContainer}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>{selectedPhoto.label}</Text>
            <TouchableOpacity onPress={() => setSelectedPhoto(null)}>
              <MaterialIcons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          <Image source={{ uri: selectedPhoto.uri }} style={styles.previewImage} resizeMode="contain" />
          <TouchableOpacity
            style={styles.deletePhotoBtn}
            onPress={() => handleRemovePhoto(selectedPhoto.id)}
          >
            <MaterialIcons name="delete" size={20} color="#FFF" />
            <Text style={styles.deletePhotoText}>Remover Foto</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Grid of Photos */}
      <FlatList
        data={photos}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <MaterialIcons name="add-a-photo" size={54} color="#CBD5E0" />
            <Text style={styles.emptyTitle}>Nenhuma foto adicionada</Text>
            <Text style={styles.emptySubtitle}>
              Tire fotos com a câmera ou escolha da galeria para registrar o antes e depois da obra.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={styles.photoThumbContainer}
            onPress={() => setSelectedPhoto(item)}
          >
            <Image source={{ uri: item.uri }} style={styles.photoThumb} />
            <View style={styles.photoIndexBadge}>
              <Text style={styles.photoIndexText}>{`#${index + 1}`}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
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
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionIconBtn: {
    padding: 8,
    backgroundColor: '#E6F4F1',
    borderRadius: 8,
  },
  listContent: {
    padding: 12,
    flexGrow: 1,
  },
  photoThumbContainer: {
    flex: 1 / 3,
    aspectRatio: 1,
    padding: 4,
    position: 'relative',
  },
  photoThumb: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#EDF2F7',
  },
  photoIndexBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  photoIndexText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4A5568',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#A0AEC0',
    textAlign: 'center',
    marginTop: 6,
  },
  previewContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.95)',
    zIndex: 99,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  previewHeader: {
    position: 'absolute',
    top: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  previewImage: {
    width: '100%',
    height: '75%',
  },
  deletePhotoBtn: {
    position: 'absolute',
    bottom: 30,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E53E3E',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  deletePhotoText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 6,
  },
});
