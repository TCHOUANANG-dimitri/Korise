// Formatage FCFA + dates (fuseau local du navigateur). Les données du serveur sont en UTC sans
// suffixe : on les interprète comme UTC pour éviter un décalage silencieux.

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const hasZone = /Z$|[+-]\d\d:?\d\d$/.test(iso);
  const d = new Date(hasZone ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fcfa(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

export function fdate(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? d.toLocaleDateString('fr-FR') : '—';
}

export function fdatetime(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : '—';
}

export function ago(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return 'jamais';
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 90) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 172800) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}

export const HEALTH_LABEL = { healthy: 'Healthy', a_surveiller: 'À surveiller', a_risque: 'À risque' } as const;

export const STATUS_LABEL: Record<string, string> = {
  trial: 'Essai',
  active: 'Actif',
  expired: 'Expiré',
  payment_failed: 'Paiement échoué',
  cancelled: 'Annulé',
  open: 'Ouvert',
  in_progress: 'En cours',
  resolved: 'Résolu',
};

export const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  product_manager: 'Product Manager',
  support: 'Support',
  developer: 'Developer / Tech',
};

export const EVENT_LABEL: Record<string, string> = {
  'business.registered': 'Inscription et création de l’entreprise',
  'user.login': 'Connexion',
  'sync.completed': 'Synchronisation terminée',
  'sync.failed': 'Synchronisation échouée',
  'sync.rejected': 'Opérations refusées (conflit)',
  'server.error': 'Erreur serveur',
  'business.suspended': 'Entreprise suspendue',
  'business.reactivated': 'Entreprise réactivée',
  'subscription.changed': 'Abonnement modifié',
  'feature.report': 'Rapport généré',
  'business.suspend': 'Suspension',
  'business.reactivate': 'Réactivation',
  'subscription.change': 'Changement d’abonnement',
  'note.add': 'Note interne ajoutée',
  'ticket.create': 'Ticket créé',
  'ticket.update': 'Ticket mis à jour',
  'user.deactivate': 'Utilisateur désactivé',
  'admin.login': 'Connexion Super Admin',
  'admin.create': 'Compte Super Admin créé',
  'admin.update': 'Compte Super Admin modifié',
  'plan.create': 'Plan créé',
  'plan.update': 'Plan modifié',
};
