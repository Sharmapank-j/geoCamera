// src/components/NavBar.tsx
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { triggerHaptic } from '@/lib/feedback';
import { getAllPhotos } from '@/lib/localDB';

interface NavBarProps {
  active: 'camera' | 'gallery' | 'map' | 'settings';
  darkTheme?: boolean;
}

function renderNavIcon(id: string) {
  switch (id) {
    case 'camera':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
        </svg>
      );
    case 'gallery':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18M3 10.5h18M3 6.75h18" />
        </svg>
      );
    case 'map':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      );
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return null;
  }
}

const navItems = [
  { href: '/camera', id: 'camera' as const, label: 'Camera' },
  { href: '/gallery', id: 'gallery' as const, label: 'Gallery' },
  { href: '/map', id: 'map' as const, label: 'Map' },
  { href: '/settings', id: 'settings' as const, label: 'Settings' },
];

export default function NavBar({ active, darkTheme = false }: NavBarProps) {
  const [photoCount, setPhotoCount] = useState<number | null>(null);

  useEffect(() => {
    getAllPhotos()
      .then((photos) => setPhotoCount(photos.length))
      .catch(() => {});
  }, []);

  const barClasses = darkTheme
    ? 'bg-gray-950/90 border-gray-800 text-gray-300'
    : 'bg-white/90 border-gray-200 text-gray-600';

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 backdrop-blur-md border-t flex justify-around items-center px-2 py-1.5 pb-[calc(env(safe-area-inset-bottom,0px)+0.375rem)] transition-colors duration-200 ${barClasses}`}
    >
      {navItems.map((item) => {
        const isActive = active === item.id;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => triggerHaptic('selection')}
            className={`btn-press relative flex flex-col items-center justify-center min-w-[64px] py-1 px-2.5 rounded-xl transition-all duration-150 ${
              isActive
                ? darkTheme
                  ? 'text-blue-400 font-bold bg-blue-500/15'
                  : 'text-blue-600 font-bold bg-blue-50'
                : darkTheme
                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/60'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/70'
            }`}
          >
            <div className="relative">
              {renderNavIcon(item.id)}
              {item.id === 'gallery' && photoCount !== null && photoCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 px-1 min-w-[15px] h-[15px] flex items-center justify-center text-[9px] font-extrabold rounded-full bg-blue-600 text-white shadow-xs">
                  {photoCount > 99 ? '99+' : photoCount}
                </span>
              )}
            </div>
            <span className="text-[11px] mt-0.5 tracking-tight">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
