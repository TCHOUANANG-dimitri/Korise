import Image from 'next/image';

// Sert les PNG copiés depuis packages/shared/brand (voir scripts/sync-brand.mjs)
// — jamais une copie éditée à la main. Voir documentation/DESIGN_SYSTEM.md §1.
export default function Logo({ variant = 'icon', className }: { variant?: 'full' | 'icon'; className?: string }) {
  if (variant === 'full') {
    return (
      <div className="flex flex-col items-center gap-2">
        <Image
          src="/brand/korise-logo-full.png?v=2"
          alt="Korise — Votre activité, sous contrôle"
          width={480}
          height={218}
          className={className}
          priority
        />
        {/* Sous-titre géré en texte (l'image n'en contient pas) — voir opencode.md §A.2. */}
        <p className="font-body text-sm font-medium tracking-wide text-white/60">Korah Business Manager</p>
      </div>
    );
  }
  return (
    <Image
      src="/brand/korise-icon.png?v=2"
      alt="Korise"
      width={40}
      height={40}
      className={className}
      priority
    />
  );
}