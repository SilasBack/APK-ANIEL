import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, Camera } from 'expo-camera';

interface Props {
  visible: boolean;
  title?: string;
  onScanned: (serial: string) => void;
  onClose: () => void;
}

export function BarcodeScannerModal({
  visible,
  title = 'Escanear código de barras / serial',
  onScanned,
  onClose,
}: Props) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scannedSerial, setScannedSerial] = useState<string | null>(null);
  const [torch, setTorch] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    if (visible) {
      void (async () => {
        try {
          const { status } = await Camera.requestCameraPermissionsAsync();
          if (active) setHasPermission(status === 'granted');
        } catch {
          if (active) setHasPermission(false);
        }
      })();
    }
    return () => {
      active = false;
    };
  }, [visible]);

  async function requestCameraPermission() {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    } catch {
      setHasPermission(false);
    }
  }

  function handleClose() {
    setScannedSerial(null);
    onClose();
  }

  function handleBarcodeScanned({ data }: { data: string }) {
    if (!data) return;
    const clean = data.trim().toUpperCase();
    if (clean.length > 0) {
      setScannedSerial(clean);
    }
  }

  function handleConfirmInject() {
    if (scannedSerial) {
      onScanned(scannedSerial);
      setScannedSerial(null);
      onClose();
    }
  }

  function handleRescan() {
    setScannedSerial(null);
  }

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <MaterialIcons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.headerSub}>
              Aponte para o código de barras ou serial
            </Text>
          </View>
          <TouchableOpacity
            style={styles.torchBtn}
            onPress={() => setTorch((prev) => !prev)}
          >
            <MaterialIcons
              name={torch ? 'flash-on' : 'flash-off'}
              size={24}
              color={torch ? '#FFD700' : '#FFF'}
            />
          </TouchableOpacity>
        </View>

        {/* Camera Area */}
        {hasPermission === null ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#08776F" />
            <Text style={styles.permText}>Solicitando acesso à câmera…</Text>
          </View>
        ) : hasPermission === false ? (
          <View style={styles.centered}>
            <MaterialIcons name="videocam-off" size={48} color="#E53E3E" />
            <Text style={styles.permErrorTitle}>Acesso à câmera não concedido</Text>
            <Text style={styles.permErrorText}>
              Permita o uso da câmera nas configurações para utilizar o leitor de código de barras.
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={requestCameraPermission}>
              <Text style={styles.retryBtnText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraWrapper}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{
                barcodeTypes: [
                  'code128',
                  'code39',
                  'qr',
                  'ean13',
                  'ean8',
                  'upc_a',
                  'upc_e',
                  'itf14',
                  'datamatrix',
                  'pdf417',
                  'codabar',
                ],
              }}
              onBarcodeScanned={scannedSerial ? undefined : handleBarcodeScanned}
            />

            {/* Viewfinder Target Mask */}
            <View style={styles.maskContainer} pointerEvents="none">
              <View style={styles.maskTop} />
              <View style={styles.maskMiddleRow}>
                <View style={styles.maskSide} />
                <View style={[styles.targetBox, scannedSerial ? styles.targetBoxScanned : null]}>
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                  <View style={styles.scanLine} />
                </View>
                <View style={styles.maskSide} />
              </View>
              <View style={styles.maskBottom} />
            </View>
          </View>
        )}

        {/* Bottom Panel */}
        <View style={styles.bottomPanel}>
          {scannedSerial ? (
            <View style={styles.scannedBox}>
              <View style={styles.scannedBadge}>
                <MaterialIcons name="check-circle" size={18} color="#22543D" />
                <Text style={styles.scannedBadgeText}>Serial lido com sucesso!</Text>
              </View>
              <Text style={styles.scannedValue} selectable>
                {scannedSerial}
              </Text>

              <View style={styles.scannedActions}>
                <TouchableOpacity
                  style={styles.injectBtn}
                  onPress={handleConfirmInject}
                >
                  <MaterialIcons name="done" size={20} color="#FFF" />
                  <Text style={styles.injectBtnText}>Injetar no detalhamento</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.rescanBtn}
                  onPress={handleRescan}
                >
                  <MaterialIcons name="refresh" size={20} color="#2D3748" />
                  <Text style={styles.rescanBtnText}>Ler outro código</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.instructionBox}>
              <MaterialIcons name="qr-code-scanner" size={28} color="#A0AEC0" />
              <Text style={styles.instructionText}>
                Posicione o código de barras ou QR Code do equipamento no centro do quadro.
              </Text>
              <Text style={styles.instructionHint}>
                Compatível com seriais de Controladoras, Switches, APs e Nobreak.
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    backgroundColor: '#1A202C',
    zIndex: 10,
  },
  closeBtn: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  headerSub: {
    fontSize: 12,
    color: '#A0AEC0',
    marginTop: 2,
  },
  torchBtn: {
    padding: 8,
  },
  cameraWrapper: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#1A202C',
  },
  permText: {
    color: '#FFF',
    marginTop: 14,
    fontSize: 14,
  },
  permErrorTitle: {
    color: '#FEB2B2',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 14,
  },
  permErrorText: {
    color: '#E2E8F0',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 20,
    backgroundColor: '#08776F',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  maskContainer: {
    ...StyleSheet.absoluteFill,
  },
  maskTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  maskMiddleRow: {
    flexDirection: 'row',
    height: 220,
  },
  maskSide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  targetBox: {
    width: 280,
    height: 220,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    borderRadius: 12,
  },
  targetBoxScanned: {
    borderColor: '#38A169',
    backgroundColor: 'rgba(56, 161, 105, 0.15)',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#08776F',
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  scanLine: {
    width: '90%',
    height: 2,
    backgroundColor: '#00E5FF',
    opacity: 0.8,
  },
  maskBottom: {
    flex: 1.2,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  bottomPanel: {
    backgroundColor: '#1A202C',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  instructionBox: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  instructionText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  instructionHint: {
    color: '#A0AEC0',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  scannedBox: {
    backgroundColor: '#2D3748',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#4A5568',
  },
  scannedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#C6F6D5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    gap: 4,
  },
  scannedBadgeText: {
    color: '#22543D',
    fontSize: 12,
    fontWeight: 'bold',
  },
  scannedValue: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
    marginVertical: 6,
  },
  scannedActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  injectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#08776F',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  injectBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 4,
  },
  rescanBtnText: {
    color: '#2D3748',
    fontSize: 13,
    fontWeight: '600',
  },
});
