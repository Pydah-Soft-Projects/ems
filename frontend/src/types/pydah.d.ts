import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'pydah-sso-loader': DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          portal?: string;
          title?: string;
          heading?: string;
          detail?: string;
        },
        HTMLElement
      >;
      'portal-switcher': DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }

  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'pydah-sso-loader': DetailedHTMLProps<
          HTMLAttributes<HTMLElement> & {
            portal?: string;
            title?: string;
            heading?: string;
            detail?: string;
          },
          HTMLElement
        >;
        'portal-switcher': DetailedHTMLProps<
          HTMLAttributes<HTMLElement>,
          HTMLElement
        >;
      }
    }
  }
}

export {};
