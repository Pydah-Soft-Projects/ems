/**
 * Pydah Payment Gateway (PPG) Checkout SDK integration.
 * See: docs/ONLINE_PAYMENTS_EXTERNAL_APP_GUIDE.md
 */

export type PpgOrderResponse = {
  success: boolean;
  orderId: string;
  paymentId: number;
  ppgPaymentId?: string;
  checkoutUrl: string;
  sdkUrl?: string;
  receiptNumber: string;
  feeRecordId: number;
  studentName: string;
  studentRollNumber: string;
  amount: number;
  currency: string;
  baseAmount?: number;
  convenienceFee?: number;
  totalAmount?: number;
  convenienceFeeApplied?: boolean;
  convenienceFeeRate?: number;
  description: string;
};

export type PpgSuccessResult = {
  paymentId: string;
  reference?: string;
  status?: string;
  [key: string]: unknown;
};

export type PpgCheckoutOptions = {
  checkoutUrl: string;
  sdkUrl?: string;
  onSuccess: (result: PpgSuccessResult) => void;
  onFailure?: (error: { message?: string }) => void;
  onClose?: () => void;
};

declare global {
  interface Window {
    PPG?: {
      openCheckout: (options: {
        checkoutUrl: string;
        onSuccess: (result: PpgSuccessResult) => void;
        onFailure?: (error: { message?: string }) => void;
        onClose?: () => void;
      }) => void;
      close?: () => void;
    };
  }
}

export function loadPpgScript(sdkUrl?: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    if (window.PPG) {
      resolve(true);
      return;
    }

    const targetUrl =
      sdkUrl ||
      process.env.NEXT_PUBLIC_PPG_SDK_URL ||
      'http://localhost:5005/sdk/ppg.js';
    const existing = document.querySelector(
      'script[data-ppg-sdk]',
    ) as HTMLScriptElement | null;

    if (existing) {
      if (window.PPG) {
        resolve(true);
        return;
      }
      existing.addEventListener('load', () => resolve(Boolean(window.PPG)), {
        once: true,
      });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = targetUrl;
    script.async = true;
    script.dataset.ppgSdk = '1';
    script.onload = () => resolve(Boolean(window.PPG));
    script.onerror = () => {
      console.warn('Failed to load PPG script from:', targetUrl);
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

export async function openPpgCheckout(
  opts: PpgCheckoutOptions,
): Promise<PpgSuccessResult> {
  const loaded = await loadPpgScript(opts.sdkUrl);
  if (!loaded || !window.PPG) {
    // If the external PPG SDK is unreachable, open checkout in a popup window
    return new Promise((resolve, reject) => {
      const popup = window.open(
        opts.checkoutUrl,
        'PPGCheckout',
        'width=480,height=700,left=200,top=100',
      );
      if (!popup) {
        reject(new Error('Pop-up blocked. Please allow popups to continue payment.'));
        return;
      }

      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          opts.onClose?.();
        }
      }, 1000);

      const messageListener = (evt: MessageEvent) => {
        if (
          evt.data?.type === 'PPG_PAYMENT_SUCCESS' ||
          evt.data?.event === 'PPG_PAYMENT_SUCCESS'
        ) {
          clearInterval(timer);
          window.removeEventListener('message', messageListener);
          popup.close();
          const res = evt.data?.data || evt.data || { paymentId: 'ppg_success' };
          opts.onSuccess(res);
          resolve(res);
        }
      };
      window.addEventListener('message', messageListener);
    });
  }

  return new Promise((resolve, reject) => {
    let resolved = false;

    // Safety fallback: Top-level postMessage listener in case PPG SDK callback is blocked
    const fallbackListener = (evt: MessageEvent) => {
      if (
        !resolved &&
        (evt.data?.type === 'PPG_PAYMENT_SUCCESS' ||
          evt.data?.event === 'PPG_PAYMENT_SUCCESS')
      ) {
        resolved = true;
        window.removeEventListener('message', fallbackListener);
        const res = evt.data?.data || evt.data || { paymentId: 'ppg_success' };
        try {
          window.PPG?.close?.();
        } catch {}
        opts.onSuccess(res);
        resolve(res);
      }
    };
    window.addEventListener('message', fallbackListener);

    window.PPG!.openCheckout({
      checkoutUrl: opts.checkoutUrl,
      onSuccess: (result) => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener('message', fallbackListener);
          opts.onSuccess(result);
          resolve(result);
        }
      },
      onFailure: (err) => {
        if (!resolved) {
          window.removeEventListener('message', fallbackListener);
          opts.onFailure?.(err);
          reject(err);
        }
      },
      onClose: () => {
        window.removeEventListener('message', fallbackListener);
        opts.onClose?.();
      },
    });
  });
}

