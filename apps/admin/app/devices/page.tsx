'use client';

import { useEffect, useMemo, useState } from 'react';

import { fetchDevices, Device, ApiError } from '../../lib/api';
import { DeviceTable } from '../../components/DeviceTable';
import { ErrorNote, Loading, PageHeader } from '../../components/ui';

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  const [onlyObsolete, setOnlyObsolete] = useState(false);

  useEffect(() => {
    fetchDevices()
      .then(setDevices)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Erreur de chargement'));
  }, []);

  const filtered = useMemo(
    () => (devices ?? []).filter((d) => (!platform || d.platform === platform) && (!status || d.status === status) && (!onlyObsolete || d.obsolete)),
    [devices, platform, status, onlyObsolete],
  );

  return (
    <>
      <PageHeader title="Devices & Versions" sub="Appareils connectés par entreprise : plateforme, version, dernière activité et synchronisation, versions obsolètes." />
      <ErrorNote error={error} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="field-input !w-auto !py-2" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">Toute plateforme</option>
          <option value="web">Web</option>
          <option value="android">Android</option>
          <option value="windows">Windows</option>
        </select>
        <select className="field-input !w-auto !py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tout statut</option>
          <option value="online">En ligne</option>
          <option value="offline">Hors ligne</option>
          <option value="never_synced">Jamais synchronisé</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" checked={onlyObsolete} onChange={(e) => setOnlyObsolete(e.target.checked)} />
          Versions obsolètes seulement
        </label>
        <span className="text-sm text-text-muted">{filtered.length} appareil(s)</span>
      </div>
      {!devices && !error ? <Loading /> : <DeviceTable devices={filtered} empty="Aucun appareil ne correspond." />}
      <p className="mt-3 text-xs text-text-muted">
        Un appareil est « en ligne » s’il a été vu dans les 10 dernières minutes. Une version est « obsolète » si une version plus récente
        est déjà utilisée sur la même plateforme.
      </p>
    </>
  );
}
