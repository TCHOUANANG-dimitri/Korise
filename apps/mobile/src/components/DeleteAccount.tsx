import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../context/AppContext';
import { ApiError } from '../api/client';
import { scheduleBusinessDeletion, verifyPin } from '../api/extraApi';
import { shareHistory } from '../pdf';
import { PIN_MAX, PIN_MIN } from '../config';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { Button, Card, Field } from './ui';
import { Notice, SectionTitle } from './shared';

export const DELETION_GRACE_DAYS = 7;

type Step = 'idle' | 'pin' | 'choice';
type Choice = 'export' | 'everything' | null;

// Suppression du compte propriétaire = suppression de l'entreprise entière (décision du fondateur,
// 2026-09-30) : PIN d'abord, puis « télécharger l'historique puis supprimer » ou « tout supprimer ».
// Dans les deux cas l'effacement a lieu 7 jours plus tard, annulable jusque-là. Même parcours que le web.
export function DeleteAccount() {
  const { updateSession } = useApp();
  const [step, setStep] = useState<Step>('idle');
  const [pin, setPin] = useState('');
  const [choice, setChoice] = useState<Choice>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep('idle');
    setPin('');
    setChoice(null);
    setDownloaded(false);
    setError(null);
  };

  const checkPin = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyPin(pin);
      setStep('choice');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'PIN incorrect.' : 'Vérification impossible (connexion requise).');
    } finally {
      setBusy(false);
    }
  };

  const download = async (kind: 'pdf' | 'xlsx') => {
    setError(null);
    try {
      await shareHistory(kind);
      setDownloaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Téléchargement impossible (connexion requise).');
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const business = await scheduleBusinessDeletion(pin, choice === 'export');
      await updateSession({ deletion_scheduled_for: business.deletion_scheduled_for ?? null });
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'PIN incorrect.' : 'Suppression impossible (connexion requise).');
      setBusy(false);
    }
  };

  return (
    <>
      <SectionTitle title="Supprimer mon compte" />
      <Card>
        <Text style={[typo.muted, { marginBottom: SPACING.md }]}>
          Supprime l’entreprise entière : ton compte, tous les employés, les produits et tout l’historique. L’effacement a lieu{' '}
          {DELETION_GRACE_DAYS} jours après ta demande ; d’ici là tu peux annuler, et tes employés ne peuvent plus se connecter.
        </Text>

        {step === 'idle' && <Button title="Supprimer mon compte" variant="secondary" onPress={() => setStep('pin')} />}

        {step === 'pin' && (
          <>
            <Field
              label="Confirme avec ton PIN"
              value={pin}
              onChangeText={(v) => setPin(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={PIN_MAX}
              autoFocus
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button title="Annuler" variant="secondary" onPress={reset} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Continuer" onPress={() => void checkPin()} disabled={busy || pin.length < PIN_MIN} />
              </View>
            </View>
          </>
        )}

        {step === 'choice' && (
          <View style={{ gap: SPACING.sm }}>
            <Text style={typo.microLabel}>Que veux-tu faire de ton historique ?</Text>
            <Option
              selected={choice === 'export'}
              onPress={() => setChoice('export')}
              title="Télécharger l’historique puis supprimer"
              text="PDF (résumé) et Excel (détail) : ventes, argent, stock, clôtures, shifts, clients, équipe."
            />
            <Option
              selected={choice === 'everything'}
              onPress={() => setChoice('everything')}
              title="Tout supprimer"
              text="Aucun fichier conservé. Tout est effacé définitivement au bout de 7 jours."
            />
            {choice === 'export' && (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Button title="PDF" variant="secondary" onPress={() => void download('pdf')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Excel" variant="secondary" onPress={() => void download('xlsx')} />
                </View>
              </View>
            )}
            {choice === 'export' && !downloaded ? <Text style={typo.muted}>Télécharge au moins un fichier pour continuer.</Text> : null}
            <Button
              title={`Supprimer dans ${DELETION_GRACE_DAYS} jours`}
              onPress={() => void confirm()}
              disabled={busy || choice === null || (choice === 'export' && !downloaded)}
              style={{ backgroundColor: palette.danger }}
            />
            <Button title="Garder mon compte" variant="secondary" onPress={reset} />
          </View>
        )}

        {error ? (
          <View style={{ marginTop: SPACING.md }}>
            <Notice tone="danger">{error}</Notice>
          </View>
        ) : null}
      </Card>
    </>
  );
}

function Option({ selected, onPress, title, text }: { selected: boolean; onPress: () => void; title: string; text: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.option, selected && styles.optionSelected]}>
      <Text style={[typo.body, { fontWeight: '700' }]}>{title}</Text>
      <Text style={typo.muted}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.sm },
  option: { borderWidth: 1, borderColor: palette.border, borderRadius: RADIUS.field, padding: SPACING.md, gap: 2 },
  optionSelected: { borderColor: palette.background, borderWidth: 2 },
});
