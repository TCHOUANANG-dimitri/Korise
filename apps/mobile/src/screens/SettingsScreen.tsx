import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../context/AppContext';
import { fetchBusinessSettings, updateBusinessSettings, BusinessSettingsApi } from '../api/extraApi';
import { APP_VERSION, getDeviceKey, getPlatformName } from '../api/telemetryApi';
import { getLockMinutes, setLockMinutes } from '../lock';
import { palette, SPACING, typo } from '../theme';
import { Button, Card, Field, Segmented } from '../components/ui';
import { BusinessCodeCard, Notice, ScreenHeader, SectionTitle } from '../components/shared';

const LOCKS = [
  { value: '0', label: 'Jamais' },
  { value: '1', label: '1 min' },
  { value: '5', label: '5 min' },
  { value: '10', label: '10 min' },
  { value: '30', label: '30 min' },
] as const;

// Paramètres limités (cahier fonctionnel §15) : identité de l'entreprise (édition par le propriétaire,
// le logo se règle depuis le web), verrouillage de la caisse, informations de l'appareil.
export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { session, logout } = useApp();
  const isOwner = session?.role === 'owner';
  const [biz, setBiz] = useState<BusinessSettingsApi | null>(null);
  const [form, setForm] = useState({ name: '', sector: '', address: '', phone: '', email: '' });
  const [lock, setLock] = useState(String(getLockMinutes()) as (typeof LOCKS)[number]['value']);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBusinessSettings()
      .then((b) => {
        setBiz(b);
        setForm({ name: b.name, sector: b.sector ?? '', address: b.address ?? '', phone: b.phone ?? '', email: b.email ?? '' });
      })
      .catch(() => setError('Paramètres entreprise indisponibles (connexion requise).'));
  }, []);

  const save = async () => {
    setError(null);
    try {
      const b = await updateBusinessSettings({
        name: form.name.trim(),
        sector: form.sector.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      });
      setBiz(b);
      setFlash('Enregistré — visible sur les reçus, factures et rapports PDF.');
      setTimeout(() => setFlash(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible');
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} hitSlop={10}>
        <Text style={[typo.muted, { color: palette.accent, marginBottom: SPACING.sm }]}>‹ Retour</Text>
      </Pressable>
      <ScreenHeader title="Paramètres" subtitle="Entreprise, verrouillage de la caisse et appareil." />
      {flash ? <Notice tone="success">{flash}</Notice> : null}
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {session ? <BusinessCodeCard code={session.business_code} /> : null}

      <SectionTitle title="Entreprise" />
      <Card>
        {!isOwner && <Text style={[typo.muted, { marginBottom: SPACING.md }]}>Seul le propriétaire peut modifier ces informations.</Text>}
        <Field label="Nom" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} editable={isOwner} />
        <Field label="Activité" value={form.sector} onChangeText={(v) => setForm({ ...form, sector: v })} editable={isOwner} />
        <Field label="Adresse" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} editable={isOwner} />
        <Field label="Téléphone" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} editable={isOwner} keyboardType="phone-pad" />
        <Field label="Email" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} editable={isOwner} keyboardType="email-address" autoCapitalize="none" />
        {biz?.logo_data ? <Text style={typo.muted}>Logo enregistré (modifiable depuis le web).</Text> : <Text style={typo.muted}>Logo : à ajouter depuis le web (Paramètres).</Text>}
        {isOwner && (
          <View style={{ marginTop: SPACING.md }}>
            <Button title="Enregistrer" variant="accent" onPress={() => void save()} disabled={!form.name.trim()} />
          </View>
        )}
      </Card>

      <SectionTitle title="Verrouillage de la caisse" />
      <Card>
        <Text style={[typo.muted, { marginBottom: SPACING.md }]}>Après cette durée d’inactivité, le PIN est redemandé (caisse partagée).</Text>
        <Segmented
          options={LOCKS}
          value={lock}
          onChange={(v) => {
            setLock(v);
            setLockMinutes(Number(v));
          }}
        />
      </Card>

      <SectionTitle title="Cet appareil" />
      <Card>
        <Text style={typo.body}>Compte : {session?.full_name} ({isOwner ? 'propriétaire' : 'employé'})</Text>
        <Text style={typo.muted}>Plateforme : {getPlatformName() === 'ios' ? 'iOS' : 'Android'} · Version {APP_VERSION}</Text>
        <Text style={typo.muted}>Identifiant appareil : …{getDeviceKey().slice(-8)}</Text>
        <View style={{ marginTop: SPACING.md }}>
          <Button title="Se déconnecter" variant="secondary" onPress={() => void logout()} />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
});
