import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../context/AppContext';
import { createEmployee } from '../api/authApi';
import { listEmployees, updateEmployee, EmployeeApi } from '../api/extraApi';
import { sharePdf } from '../pdf';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { Badge, Button, Card, Field } from '../components/ui';
import { BusinessCodeCard, EmptyText, Notice, ScreenHeader } from '../components/shared';
import { PIN_MAX, PIN_MIN } from '../config';

// Équipe (propriétaire) : créer un employé, régler ses permissions, le désactiver, ouvrir son rapport.
export function TeamScreen({ onBack }: { onBack: () => void }) {
  const { session } = useApp();
  const isOwner = session?.role === 'owner';
  const [employees, setEmployees] = useState<EmployeeApi[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');

  const load = useCallback(() => {
    listEmployees()
      .then(setEmployees)
      .catch((e) => setError(e instanceof Error ? e.message : 'Chargement impossible (connexion requise)'));
  }, []);

  useEffect(() => {
    if (isOwner) load();
  }, [load, isOwner]);

  const say = (t: string) => {
    setFlash(t);
    setTimeout(() => setFlash(null), 4000);
  };

  const create = async () => {
    setError(null);
    try {
      await createEmployee({ full_name: name.trim(), phone: phone.trim() || null, pin });
      setName('');
      setPhone('');
      setPin('');
      setShowNew(false);
      say('Employé créé — il se connecte avec le code entreprise et son PIN.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création impossible');
    }
  };

  const patch = async (e: EmployeeApi, p: { can_view_purchase_prices?: boolean; can_view_owner_dashboard?: boolean; is_active?: boolean }) => {
    try {
      await updateEmployee(e.id, p);
      say(`${e.full_name} mis à jour.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action refusée');
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} hitSlop={10}>
        <Text style={[typo.muted, { color: palette.accent, marginBottom: SPACING.sm }]}>‹ Retour</Text>
      </Pressable>
      <ScreenHeader title="Équipe" subtitle="Employés, rôles et permissions — chaque action sensible est tracée." />
      {!isOwner ? (
        <Notice tone="warning">L’équipe est gérée par le propriétaire.</Notice>
      ) : (
        <>
          {session ? <BusinessCodeCard code={session.business_code} hint="Code entreprise à donner aux employés" /> : null}
          {flash ? <Notice tone="success">{flash}</Notice> : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}

          <View style={{ marginVertical: SPACING.md }}>
            <Button title={showNew ? 'Fermer' : 'Nouvel employé'} variant="accent" onPress={() => setShowNew((v) => !v)} />
          </View>
          {showNew && (
            <Card>
              <Field label="Nom complet" value={name} onChangeText={setName} />
              <Field label="Téléphone (optionnel)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              <Field label={`PIN (${PIN_MIN} à ${PIN_MAX} chiffres)`} value={pin} onChangeText={(v) => setPin(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" secureTextEntry maxLength={PIN_MAX} />
              <Button title="Créer l’employé" variant="accent" onPress={() => void create()} disabled={!name.trim() || pin.length < PIN_MIN} />
            </Card>
          )}

          {employees.length === 0 ? (
            <EmptyText label="Aucun employé — ajoute ton premier collaborateur." />
          ) : (
            employees.map((e) => (
              <Card key={e.id}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typo.body, { fontWeight: '700' }]}>{e.full_name}</Text>
                    {e.phone ? <Text style={typo.muted}>{e.phone}</Text> : null}
                  </View>
                  <Badge label={e.role === 'owner' ? 'Propriétaire' : e.is_active ? 'Employé' : 'Désactivé'} tone={e.role === 'owner' ? 'primary' : e.is_active ? 'success' : 'danger'} />
                </View>
                {e.role !== 'owner' && (
                  <View style={{ marginTop: SPACING.md, gap: SPACING.sm }}>
                    <Button
                      title={e.can_view_purchase_prices ? 'Prix d’achat : visibles' : 'Prix d’achat : masqués'}
                      variant="secondary"
                      onPress={() => void patch(e, { can_view_purchase_prices: !e.can_view_purchase_prices })}
                    />
                    <Button
                      title={e.can_view_owner_dashboard ? 'Tableau de bord : autorisé' : 'Tableau de bord : refusé'}
                      variant="secondary"
                      onPress={() => void patch(e, { can_view_owner_dashboard: !e.can_view_owner_dashboard })}
                    />
                    <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                      <View style={{ flex: 1 }}>
                        <Button title="Rapport PDF" variant="secondary" onPress={() => void sharePdf(`/reports/employee.pdf?user_id=${e.id}`, 'rapport-employe.pdf').catch((err) => setError(err.message))} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button title={e.is_active ? 'Désactiver' : 'Réactiver'} variant="secondary" onPress={() => void patch(e, { is_active: !e.is_active })} />
                      </View>
                    </View>
                  </View>
                )}
              </Card>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
});
