'use client';

import { useEffect } from 'react';
import {
  AuthUser,
  CRM_BACKEND_URL,
  CRM_FRONTEND_URL,
  getToken,
  getStoredUser,
  isSSOLogin,
  LOGIN_METHOD_KEY,
} from '@/lib/auth';

declare global {
  interface Window {
    PydahSwitcher?: {
      init: (config: {
        currentPortal: string;
        apiBaseUrl?: string;
        landingUrl?: string;
        position?: 'bottom-right' | 'bottom-left';
        token?: string;
        user?: unknown;
      }) => void;
      destroy?: () => void;
    };
  }
}

const SWITCHER_SCRIPT_ID = 'pydah-portal-switcher-script';
export const CURRENT_PORTAL_ID = 'examination-portal';

interface PortalSwitcherProps {
  user?: AuthUser | null;
}

/**
 * Pydah Universal Portal Switcher Widget.
 *
 * Strictly rendered ONLY for SSO authenticated users as per integration guide:
 * - When an SSO user is authenticated, dynamically loads and initializes the CDN widget.
 * - When a non-SSO user is logged in, or on logout, tears down the script and removes
 *   all switcher elements from the DOM so non-SSO users never see or interact with it.
 */
export function PortalSwitcher({ user: propUser }: PortalSwitcherProps) {
  const currentUser = propUser || (typeof window !== 'undefined' ? getStoredUser() : null);

  const isSsoUser = Boolean(
    currentUser &&
      (isSSOLogin() ||
        (typeof window !== 'undefined' &&
          (localStorage.getItem(LOGIN_METHOD_KEY) === 'sso' ||
            document.cookie.split('; ').some((c) => c.trim().startsWith('ems_is_sso=1'))))),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function cleanupWidget() {
      try {
        if (typeof window.PydahSwitcher?.destroy === 'function') {
          window.PydahSwitcher.destroy();
        }
      } catch {
        /* ignore */
      }

      const script = document.getElementById(SWITCHER_SCRIPT_ID);
      if (script) {
        script.remove();
      }

      // Clean up any web components or DOM containers injected by the widget
      const selector =
        'portal-switcher, pydah-portal-switcher, #pydah-portal-switcher, [data-pydah-switcher], .pydah-portal-switcher';
      document.querySelectorAll(selector).forEach((el) => {
        try {
          el.remove();
        } catch {
          /* ignore */
        }
      });
    }

    if (!isSsoUser) {
      cleanupWidget();
      return;
    }

    const scriptSrc = `${CRM_FRONTEND_URL}/portal-switcher.js`;
    const crmBackend = CRM_BACKEND_URL;
    const crmFrontend = CRM_FRONTEND_URL;
    const activeToken =
      getToken() ||
      localStorage.getItem('token') ||
      localStorage.getItem('accessToken') ||
      undefined;

    function initializeSwitcher() {
      if (window.PydahSwitcher?.init) {
        window.PydahSwitcher.init({
          currentPortal: CURRENT_PORTAL_ID,
          apiBaseUrl: crmBackend,
          landingUrl: crmFrontend,
          position: 'bottom-right',
          token: activeToken,
          user: currentUser
            ? {
                id: currentUser.id,
                username: currentUser.username,
                name: currentUser.fullName || currentUser.username,
                email: currentUser.email || undefined,
                role: currentUser.role,
                isSso: true,
              }
            : undefined,
        });
      }
    }

    let script = document.getElementById(SWITCHER_SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = SWITCHER_SCRIPT_ID;
      script.src = scriptSrc;
      script.async = true;
      script.setAttribute('data-current-portal', CURRENT_PORTAL_ID);
      script.setAttribute('data-api-base-url', crmBackend);
      script.setAttribute('data-landing-url', crmFrontend);
      script.setAttribute('data-position', 'bottom-right');
      script.addEventListener('load', initializeSwitcher);
      document.body.appendChild(script);
    } else {
      initializeSwitcher();
    }

    // Polling fallback to ensure initialization after async script execution
    const timer = setInterval(() => {
      if (window.PydahSwitcher?.init) {
        initializeSwitcher();
        clearInterval(timer);
      }
    }, 300);

    const timeout = setTimeout(() => {
      clearInterval(timer);
    }, 5000);

    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
      if (!isSsoUser) {
        cleanupWidget();
      }
    };
  }, [isSsoUser, currentUser]);

  return null;
}
