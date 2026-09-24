import React, { useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import X from 'lucide-react-native/icons/x';

import { palette, RADIUS, SPACING, typo } from '../theme';
import { Button } from './ui';

// Scanner de code-barres (caméra du téléphone) : renvoie le premier code lu puis se ferme.
// Cahier fonctionnel §8 : « rechercher/identifier rapidement un produit ».
export function BarcodeScanner({
  visible,
  onScanned,
  onClose,
}: {
  visible: boolean;
  onScanned: (code: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.bar}>
          <Text style={[typo.heading, { color: palette.surface, flex: 1 }]}>Scanner un produit</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={24} color={palette.surface} />
          </Pressable>
        </View>

        {!permission ? null : !permission.granted ? (
          <View style={styles.center}>
            <Text style={[typo.body, { color: palette.surface, textAlign: 'center', marginBottom: SPACING.lg }]}>
              L’accès à la caméra est nécessaire pour lire les codes-barres.
            </Text>
            <Button title="Autoriser la caméra" variant="accent" onPress={() => void requestPermission()} />
          </View>
        ) : (
          <View style={styles.camWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
              onBarcodeScanned={(r) => {
                if (handled.current) return;
                handled.current = true;
                onScanned(r.data);
                setTimeout(() => {
                  handled.current = false;
                }, 800);
              }}
            />
            <View style={styles.frame} pointerEvents="none" />
            <Text style={styles.hint}>Place le code-barres dans le cadre</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  bar: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  camWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: 260,
    height: 160,
    borderWidth: 2,
    borderColor: palette.accent,
    borderRadius: RADIUS.card,
  },
  hint: { position: 'absolute', bottom: SPACING.xxl, color: palette.surface, fontFamily: typo.body.fontFamily },
});
