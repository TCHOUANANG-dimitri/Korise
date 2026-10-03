// Télécharge un PDF protégé (Bearer) généré par le serveur (reçu, facture, rapport) puis ouvre la
// feuille de partage/impression du téléphone. Nécessite le réseau : le texte du reçu reste
// disponible hors-ligne (receipt.ts).

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { API_BASE_URL } from './config';
import { getToken } from './auth/session';
import { clientHeaders } from './api/telemetryApi';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function shareFile(path: string, filename: string, mimeType: string, UTI: string): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('Non connecté');
  const target = `${FileSystem.cacheDirectory}${filename}`;
  const res = await FileSystem.downloadAsync(`${API_BASE_URL}${path}`, target, {
    headers: { Authorization: `Bearer ${token}`, ...clientHeaders() },
  });
  if (res.status === 404) throw new Error('PDF disponible dès que la vente est synchronisée (connexion requise).');
  if (res.status >= 400) throw new Error(`Fichier indisponible (erreur ${res.status}).`);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage de fichiers est indisponible sur cet appareil.');
  await Sharing.shareAsync(res.uri, { mimeType, UTI, dialogTitle: filename });
}

export function sharePdf(path: string, filename: string): Promise<void> {
  return shareFile(path, filename, 'application/pdf', 'com.adobe.pdf');
}

// Historique complet de l'entreprise (propriétaire), proposé avant la suppression du compte.
export function shareHistory(kind: 'pdf' | 'xlsx'): Promise<void> {
  const filename = `historique-korise.${kind}`;
  return kind === 'pdf'
    ? sharePdf('/business/export.pdf', filename)
    : shareFile('/business/export.xlsx', filename, XLSX_MIME, 'org.openxmlformats.spreadsheetml.sheet');
}
