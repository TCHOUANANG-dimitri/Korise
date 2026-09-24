import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import AlertTriangle from 'lucide-react-native/icons/triangle-alert';
import Building2 from 'lucide-react-native/icons/building';
import CheckCircle2 from 'lucide-react-native/icons/circle-check';
import KeyRound from 'lucide-react-native/icons/key-round';
import Phone from 'lucide-react-native/icons/phone';
import User from 'lucide-react-native/icons/user';

import { useApp } from '../context/AppContext';
import { PIN_MAX, PIN_MIN } from '../config';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { Button, Card, Field } from '../components/ui';
import { recoverBusinessCode, RecoverCodeResult } from '../api/authApi';

type Mode = 'login' | 'register' | 'registered' | 'recover';

export function AuthScreen() {
  const { login, register, enterAfterRegister, apiBaseUrl } = useApp();
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // login
  const [businessCode, setBusinessCode] = useState('');
  const [pin, setPin] = useState('');

  // register
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [createdCode, setCreatedCode] = useState('');

  // recover (code entreprise oublié — parité web)
  const [recovered, setRecovered] = useState<RecoverCodeResult | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  };

  const doLogin = () =>
    run(async () => {
      if (!businessCode.trim()) throw new Error('Saisis le code de ton entreprise.');
      if (pin.trim().length < PIN_MIN) throw new Error(`Le PIN doit faire au moins ${PIN_MIN} chiffres.`);
      await login(businessCode, pin);
    });

  const doRegister = () =>
    run(async () => {
      if (!businessName.trim()) throw new Error('Saisis le nom de ton entreprise.');
      if (!ownerName.trim()) throw new Error('Saisis ton nom complet.');
      if (newPin.trim().length < PIN_MIN || newPin.trim().length > PIN_MAX)
        throw new Error(`Le PIN doit faire entre ${PIN_MIN} et ${PIN_MAX} chiffres.`);
      if (newPin !== confirmPin) throw new Error('Les deux PIN ne correspondent pas.');
      const res = await register({
        business_name: businessName.trim(),
        owner_full_name: ownerName.trim(),
        owner_phone: ownerPhone.trim() || null,
        pin: newPin.trim(),
      });
      setCreatedCode(res.business_code);
      setMode('registered');
    });

  const doRecover = () =>
    run(async () => {
      if (!businessName.trim()) throw new Error('Saisis le nom de ton entreprise.');
      if (!ownerName.trim()) throw new Error('Saisis ton nom complet (propriétaire).');
      if (!ownerPhone.trim()) throw new Error('Saisis le numéro de téléphone du compte.');
      setRecovered(
        await recoverBusinessCode({
          business_name: businessName.trim(),
          owner_full_name: ownerName.trim(),
          owner_phone: ownerPhone.trim(),
        }),
      );
    });

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/brand/korise-logo-full.png')} style={styles.logo} resizeMode="contain" />
        <Text style={[typo.heading, styles.tagline, { color: palette.surface }]}>Votre activité, sous contrôle</Text>
        <Text style={[typo.muted, styles.taglineSub]}>Enregistrer · Suivre · Décider</Text>

        {mode === 'registered' ? (
          <Card style={{ marginTop: SPACING.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
              <CheckCircle2 size={22} color={palette.success} />
              <Text style={typo.heading}>Entreprise créée</Text>
            </View>
            <Text style={typo.muted}>Note bien ce code : c’est lui qui permet à tes employés (et à toi, sur un autre appareil) de se connecter à ton entreprise. Il est réaffiché dans le menu et sur l’écran Équipe.</Text>
            <Text selectable style={[typo.kpi, { fontSize: 40, letterSpacing: 2, marginVertical: SPACING.md }]}>{createdCode}</Text>
            <Button title="J’ai noté mon code — continuer" variant="accent" onPress={() => void run(enterAfterRegister)} disabled={busy} />
          </Card>
        ) : mode === 'recover' ? (
          <Card style={{ marginTop: SPACING.lg }}>
            <View style={styles.cardTitle}>
              <KeyRound size={18} color={palette.primary} />
              <Text style={typo.microLabel}>Code entreprise oublié ?</Text>
            </View>
            <Text style={[typo.muted, { marginBottom: SPACING.md }]}>
              Les trois informations doivent correspondre exactement à celles saisies à la création de l’entreprise. Ton code PIN, lui, n’est
              jamais demandé ici.
            </Text>
            {recovered ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
                  <CheckCircle2 size={22} color={palette.success} />
                  <Text style={typo.heading}>Code retrouvé</Text>
                </View>
                <Text style={typo.muted}>
                  Entreprise {recovered.business_name} — note bien ce code : c’est celui de ta connexion, avec ton PIN.
                </Text>
                <Text selectable style={[typo.kpi, { fontSize: 40, letterSpacing: 2, marginVertical: SPACING.md }]}>
                  {recovered.business_code}
                </Text>
                <Button title="Me connecter maintenant" variant="accent" onPress={() => { setError(null); setMode('login'); }} disabled={busy} />
              </>
            ) : (
              <>
                <Field label="Nom de l’entreprise" placeholder="ex. Boutique Awa" value={businessName} onChangeText={setBusinessName} />
                <Field label="Ton nom (propriétaire)" placeholder="ex. Awa Ngo" value={ownerName} onChangeText={setOwnerName} />
                <Field
                  label="Numéro de téléphone du compte"
                  placeholder="ex. 6 90 00 00 00"
                  keyboardType="phone-pad"
                  value={ownerPhone}
                  onChangeText={setOwnerPhone}
                />
                {error ? <ErrorLine message={error} /> : null}
                <Button title="Retrouver mon code" variant="accent" onPress={() => void doRecover()} disabled={busy} />
                <View style={{ height: SPACING.md }} />
                <Button title="Retour à la connexion" variant="secondary" onPress={() => { setError(null); setRecovered(null); setMode('login'); }} disabled={busy} />
              </>
            )}
          </Card>
        ) : mode === 'login' ? (
          <Card style={{ marginTop: SPACING.lg }}>
            <View style={styles.cardTitle}>
              <Building2 size={18} color={palette.primary} />
              <Text style={typo.microLabel}>Connexion</Text>
            </View>
            <Field
              label="Code entreprise"
              placeholder="ex. KRH4X2"
              autoCapitalize="characters"
              autoCorrect={false}
              value={businessCode}
              onChangeText={setBusinessCode}
            />
            <Field
              label="Code PIN"
              placeholder="4 à 8 chiffres"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={PIN_MAX}
              value={pin}
              onChangeText={setPin}
            />
            {error ? <ErrorLine message={error} /> : null}
            <Button title="Se connecter" variant="accent" onPress={() => void doLogin()} disabled={busy} />
            <View style={{ height: SPACING.md }} />
            <Button title="Créer mon entreprise" variant="secondary" onPress={() => { setError(null); setMode('register'); }} disabled={busy} />
            <View style={{ height: SPACING.sm }} />
            <Button
              title="Code entreprise oublié ?"
              variant="secondary"
              onPress={() => {
                setError(null);
                setRecovered(null);
                setMode('recover');
              }}
              disabled={busy}
            />
          </Card>
        ) : (
          <Card style={{ marginTop: SPACING.lg }}>
            <View style={styles.cardTitle}>
              <KeyRound size={18} color={palette.primary} />
              <Text style={typo.microLabel}>Créer mon entreprise</Text>
            </View>
            <Field label="Nom de l’entreprise" placeholder="ex. Boutique Awa" value={businessName} onChangeText={setBusinessName} />
            <View style={styles.inlineIcon}>
              <User size={16} color={palette.textMuted} />
              <Text style={[typo.muted, { fontSize: 12 }]}>Toi, le propriétaire</Text>
            </View>
            <Field label="Votre nom" placeholder="ex. Awa Ngo" value={ownerName} onChangeText={setOwnerName} />
            <View style={styles.inlineIcon}>
              <Phone size={16} color={palette.textMuted} />
              <Text style={[typo.muted, { fontSize: 12 }]}>Optionnel</Text>
            </View>
            <Field label="Téléphone (optionnel)" placeholder="ex. 6 90 00 00 00" keyboardType="phone-pad" value={ownerPhone} onChangeText={setOwnerPhone} />
            <Field label="Choisissez un code PIN" placeholder="4 à 8 chiffres" keyboardType="number-pad" secureTextEntry maxLength={PIN_MAX} value={newPin} onChangeText={setNewPin} />
            <Field label="Confirmer le PIN" placeholder="retape le PIN" keyboardType="number-pad" secureTextEntry maxLength={PIN_MAX} value={confirmPin} onChangeText={setConfirmPin} />
            {error ? <ErrorLine message={error} /> : null}
            <Button title="Créer l’entreprise" variant="accent" onPress={() => void doRegister()} disabled={busy} />
            <View style={{ height: SPACING.md }} />
            <Button title="J’ai déjà un code" variant="secondary" onPress={() => { setError(null); setMode('login'); }} disabled={busy} />
          </Card>
        )}

        <Text style={[typo.muted, styles.footer]}>{apiBaseUrl}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <View style={styles.errorLine}>
      <AlertTriangle size={16} color={palette.danger} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  content: { padding: SPACING.lg, paddingTop: SPACING.xxl, flexGrow: 1, justifyContent: 'center' },
  logo: { width: 220, height: 140, alignSelf: 'center' },
  tagline: { textAlign: 'center', marginTop: SPACING.md },
  taglineSub: { textAlign: 'center', marginTop: SPACING.xs },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg },
  inlineIcon: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: -SPACING.sm, marginBottom: SPACING.xs },
  errorLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  errorText: { fontFamily: typo.body.fontFamily, fontSize: 13, color: palette.danger, flex: 1 },
  footer: { textAlign: 'center', marginTop: SPACING.lg, fontSize: 12 },
});