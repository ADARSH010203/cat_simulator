'use client';

// The whole app is one interactive client page — no SSR for the 3D scene.

import dynamic from 'next/dynamic';

const CatSimulator = dynamic(() => import('@/components/cat-sim/CatSimulator'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-amber-50 to-orange-100">
      <div className="text-6xl">🐾</div>
      <div className="text-sm font-semibold text-stone-600">Loading Mochi…</div>
    </div>
  ),
});

export default function Home(): React.ReactElement {
  return <CatSimulator />;
}
