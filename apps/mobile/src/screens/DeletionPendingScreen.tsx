import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../context/AppContext';
import { cancelBusinessDeletion } from '../api/extraApi';
import { shareHistory } from '../pdf';
import { formatDate } from '../format';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { Button, Card } from '../components/ui';
import { Notice } from '../components/shared';

// Les dates du serveur sont en UTC sans suffixe : on l'ajoute avant l'affichage local.
function asUtc(iso: string): string {
  return /[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`;
}

// Écran unique pendant le délai de grâce de suppression : l'app métier est fermée, le propriétaire
// peut seulement récupérer son historique ou annuler (les employés ne peuvent plus se connecter).
export function DeletionPendingScreen() {
  const { session, updateSession, logout } = useApp();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const when = formatDate(asUtc(session?.deletion_scheduled_for ?? ''));

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancelBusinessDeletion();
      await updateSession({ deletion_scheduled_for: null });
    } catch {
      setError('Annulation impossible (connexion requise).');
      setBusy(false);
    }
  };

  const download = (kind: 'pdf' | 'xlsx') =>
    void shareHistory(kind).catch((e) => setError(e instanceof Error ? e.message : 'Téléchargement impossible.'));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACING.xl, paddingBottom: insets.bottom + SPACING.xl }]}>
      <Image source={require('../../assets/brand/korise-icon-white.png')} style={styles.icon} resizeMode="contain" />
      <Card>
        <Text style={[typo.heading, { color: palette.danger }]}>Suppression en cours</Text>
        <Text style={[typo.muted, { marginTop: SPACING.sm }]}>
          L’entreprise {session?.business_name} et tout son historique seront effacés définitivement le {when}. Tes employés ne peuvent
          plus se connecter.
        </Text>

        <Text style={[typo.microLabel, { marginTop: SPACING.lg, marginBottom: SPACING.sm }]}>Récupérer l’historique</Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button title="PDF" variant="secondary" onPress={() => download('pdf')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Excel" variant="secondary" onPress={() => download('xlsx')} />
          </View>
        </View>

        <View style={{ marginTop: SPACING.lg, gap: SPACING.sm }}>
          <Button title="Annuler la suppression" variant="accent" onPress={() => void cancel()} disabled={busy} />
          <Button title="Se déconnecter" variant="secondary" onPress={() => void logout()} />
        </View>
        {error ? (
          <View style={{ marginTop: SPACING.md }}>
            <Notice tone="danger">{error}</Notice>
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: SPACING.lg },
  icon: { width: 64, height: 64, borderRadius: RADIUS.card, alignSelf: 'center', marginBottom: SPACING.lg },
  row: { flexDirection: 'row', gap: SPACING.sm },
});
