'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    ThemeLoader?: {
      init: (opts?: Record<string, unknown>) => void;
      checkNow: (cb?: () => void) => void;
    };
  }
}

/**
 * Loads the centralized theme runtime only in authenticated sidebar portals.
 * Ensures Login and Landing pages are never touched by the theme.
 */
export function ThemeLoader() {
  useEffect(() => {
    const themeServer =
      process.env.NEXT_PUBLIC_THEME_SERVER ||
      (process.env.NODE_ENV === 'production'
        ? 'https://ui-theme.pydah.edu.in'
        : 'http://localhost:7000');

    // Injects direct theme.css fallback link if not already present
    const linkId = 'central-theme-css-fallback';
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = `${themeServer}/themes/theme.css`;
      document.head.appendChild(link);
    }

    // Injects theme-loader.js runtime SDK if not already present
    const scriptId = 'central-theme-loader-sdk';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `${themeServer}/themes/theme-loader.js`;
      script.setAttribute('data-theme-server', themeServer);
      script.setAttribute(
        'data-poll-interval',
        process.env.NODE_ENV === 'production' ? '30' : '10'
      );
      document.head.appendChild(script);
    } else if (window.ThemeLoader && typeof window.ThemeLoader.checkNow === 'function') {
      window.ThemeLoader.checkNow();
    }

    return () => {
      // Clean up injected theme elements if navigating away from authenticated portal
      document.getElementById('central-theme-css-fallback')?.remove();
      document.getElementById('central-theme-loader-sdk')?.remove();
      document.getElementById('app-theme-active')?.remove();
      document.getElementById('app-theme-cached')?.remove();
    };
  }, []);

  return null;
}

