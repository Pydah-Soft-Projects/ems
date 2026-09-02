export type RazorpayOrderResponse = {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  paymentId: number;
  companionPaymentId?: number | null;
  receiptNumber: string;
  feeRecordId: number;
  studentName: string;
  studentRollNumber: string;
  studentContact?: string | null;
  studentEmail?: string | null;
  baseAmount?: number;
  convenienceFee?: number;
  totalAmount?: number;
  convenienceFeeApplied?: boolean;
  convenienceFeeRate?: number;
  description: string;
};

export type RazorpayVerifyResult = {
  payment: import('@/types/fee').Payment;
  feeRecord: import('@/types/fee').ExamFeeRecord;
  alreadyPaid?: boolean;
};

export type RazorpayStatus = {
  enabled: boolean;
  configured: boolean;
  ready: boolean;
};

export type PaymentGatewaySettings = {
  enabled: boolean;
  configured: boolean;
  razorpayKeyId: string | null;
  razorpayKeySecretMasked: string | null;
  hasKeySecret: boolean;
  selfOnlineEnabled?: boolean;
  selfOnlineConfigured?: boolean;
  selfOnlineReady?: boolean;
  selfOnlineUpiId?: string | null;
  selfOnlineMerchantName?: string;
  selfOnlinePaymentNote?: string;
  selfOnlineExpiryHours?: number;
  duplicateHallTicketFee?: number;
  /** When true, overdue Fee Mgmt dues block exam apply + hall tickets. */
  restrictExamApplyOnFeeDues?: boolean;
  updatedAt: string;
};

type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; contact?: string; email?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: {
    ondismiss?: () => void;
    confirm_close?: boolean;
    escape?: boolean;
    backdropclose?: boolean;
  };
  retry?: { enabled: boolean; max_count?: number };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => {
      open: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
}

export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const existing = document.querySelector(
      'script[data-razorpay-checkout]',
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = '1';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export async function openRazorpayCheckout(opts: {
  order: RazorpayOrderResponse;
  prefillName?: string;
  prefillContact?: string;
  prefillEmail?: string;
}): Promise<RazorpaySuccessResponse> {
  const ok = await loadRazorpayScript();
  if (!ok || !window.Razorpay) {
    throw new Error('Failed to load Razorpay Checkout. Check your network.');
  }

  const contact =
    opts.prefillContact?.replace(/\D/g, '').slice(-10) ||
    opts.order.studentContact?.replace(/\D/g, '').slice(-10) ||
    undefined;
  const email =
    opts.prefillEmail?.trim() || opts.order.studentEmail?.trim() || undefined;

  return new Promise((resolve, reject) => {
    let settled = false;
    const rzp = new window.Razorpay!({
      key: opts.order.keyId,
      amount: opts.order.amount,
      currency: opts.order.currency || 'INR',
      name: 'EMS Examination Fees',
      description: opts.order.description,
      order_id: opts.order.orderId,
      prefill: {
        name: opts.prefillName || opts.order.studentName,
        ...(contact ? { contact } : {}),
        ...(email ? { email } : {}),
      },
      notes: {
        feeRecordId: String(opts.order.feeRecordId),
        paymentId: String(opts.order.paymentId),
        roll: opts.order.studentRollNumber,
      },
      theme: { color: '#2563eb' },
      retry: { enabled: true, max_count: 3 },
      handler: (response) => {
        settled = true;
        resolve(response);
      },
      modal: {
        confirm_close: true,
        escape: true,
        backdropclose: false,
        ondismiss: () => {
          if (!settled) {
            reject(new Error('Payment cancelled'));
          }
        },
      },
    });

    rzp.on('payment.failed', () => {
      if (!settled) {
        reject(new Error('Payment failed. Please try again.'));
      }
    });

    rzp.open();
  });
}
