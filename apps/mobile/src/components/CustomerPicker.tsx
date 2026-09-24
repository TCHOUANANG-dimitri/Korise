import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import UserPlus from 'lucide-react-native/icons/user-plus';

import { addCustomer, customerRef, searchCustomers, CustomerWithBalance } from '../db/repo';
import { formatFcfa } from '../format';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { Button, Field } from './ui';

// Sélection d'un client à crédit : recherche dans les clients déjà connus
// localement (donc utilisable hors-ligne), ou création à la volée. On renvoie la
// référence à envoyer au serveur (server_id si connu, sinon client_uuid).
export function CustomerPicker({
  selected,
  onSelect,
  label = 'Client (vente à crédit)',
}: {
  selected: CustomerWithBalance | null;
  onSelect: (customer: CustomerWithBalance | null) => void;
  label?: string;
}) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<CustomerWithBalance[]>([]);
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (selected) return;
    setMatches(query.trim() === '' ? searchCustomers('') : searchCustomers(query));
  }, [query, selected]);

  if (selected) {
    return (
      <View style={styles.selected}>
        <View style={{ flex: 1 }}>
          <Text style={[typo.body, { fontWeight: '700' }]} numberOfLines={1}>
            {selected.full_name}
          </Text>
          <Text style={typo.muted}>
            {selected.balance > 0 ? `Doit déjà ${formatFcfa(selected.balance)}` : 'Aucune dette en cours'}
          </Text>
        </View>
        <Button
          title="Changer"
          variant="secondary"
          onPress={() => {
            onSelect(null);
            setQuery('');
            setPhone('');
          }}
        />
      </View>
    );
  }

  const exact = matches.some((m) => m.full_name.toLowerCase() === query.trim().toLowerCase());
  const canCreate = query.trim() !== '' && !exact;

  const create = () => {
    const row = addCustomer(query, phone.trim() || null);
    if (row) onSelect({ ...row, balance: 0 });
  };

  return (
    <View>
      <Field
        label={label}
        placeholder="Nom du client"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />

      {matches.map((c) => (
        <Pressable key={c.client_uuid} style={styles.row} onPress={() => onSelect(c)}>
          <View style={{ flex: 1 }}>
            <Text style={[typo.body, { fontWeight: '600' }]} numberOfLines={1}>
              {c.full_name}
            </Text>
            {c.phone ? <Text style={typo.muted}>{c.phone}</Text> : null}
          </View>
          {c.balance > 0 ? (
            <Text style={[typo.body, { color: palette.danger, fontWeight: '700' }]}>{formatFcfa(c.balance)}</Text>
          ) : null}
        </Pressable>
      ))}

      {canCreate && (
        <View style={styles.createBox}>
          <View style={styles.createHead}>
            <UserPlus size={16} color={palette.accent} />
            <Text style={typo.microLabel}>Nouveau client</Text>
          </View>
          <Field
            placeholder="Téléphone (optionnel)"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <Button title={`Créer « ${query.trim()} »`} variant="secondary" onPress={create} />
        </View>
      )}
    </View>
  );
}

export { customerRef };

const styles = StyleSheet.create({
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: RADIUS.field,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  createBox: {
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: RADIUS.field,
    padding: SPACING.md,
  },
  createHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
});
