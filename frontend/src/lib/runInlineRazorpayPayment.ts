import { api, ApiError } from '@/lib/api';
import { PaymentMethod } from '@/types/fee';
import {
  openRazorpayCheckout,
  RazorpayOrderResponse,
} from '@/lib/razorpayCheckout';

export type InlinePayPhase =
  | 'idle'
  | 'creating_order'
  | 'opening_checkout'
  | 'awaiting_payment'
  | 'verifying'
  | 'success'
  | 'failed'
  | 'cancelled';

export type InlinePayCallbacks = {
  onPhase?: (phase: InlinePayPhase, message?: string) => void;
};

/**
 * Full on-page Razorpay flow — no webhook required.
 * Creates order → opens Checkout modal overlay → verifies signature on success.
 */
export async function runInlineRazorpayPayment(
  feeRecordId: number,
  opts: {
    paymentMethod?: PaymentMethod;
    prefillName?: string;
    prefillContact?: string;
    prefillEmail?: string;
  } & InlinePayCallbacks = {},
): Promise<{ paymentId: number; receiptNumber: string }> {
  const setPhase = (phase: InlinePayPhase, message?: string) => {
    opts.onPhase?.(phase, message);
  };

  try {
    setPhase('creating_order', 'Creating payment order…');
    const order = await api.createRazorpayOrder(
      feeRecordId,
      opts.paymentMethod ?? 'upi',
    );

    setPhase('opening_checkout', 'Opening secure payment window…');
    setPhase('awaiting_payment', 'Complete payment in the Razorpay window');

    const checkout = await openRazorpayCheckout({
      order,
      prefillName: opts.prefillName,
      prefillContact: opts.prefillContact,
      prefillEmail: opts.prefillEmail,
    });

    setPhase('verifying', 'Confirming payment…');
    const result = await api.verifyRazorpayPayment({
      razorpayOrderId: checkout.razorpay_order_id,
      razorpayPaymentId: checkout.razorpay_payment_id,
      razorpaySignature: checkout.razorpay_signature,
      paymentId: order.paymentId,
    });

    setPhase('success', 'Payment successful');
    return {
      paymentId: result.payment.id,
      receiptNumber: result.payment.receiptNumber,
    };
  } catch (err) {
    if (err instanceof Error && err.message === 'Payment cancelled') {
      setPhase('cancelled', 'Payment cancelled');
      throw err;
    }
    const msg =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Payment failed';
    setPhase('failed', msg);
    throw err;
  }
}

export function phaseLabel(phase: InlinePayPhase): string {
  switch (phase) {
    case 'creating_order':
      return 'Creating order…';
    case 'opening_checkout':
      return 'Opening payment window…';
    case 'awaiting_payment':
      return 'Waiting for payment — use the Razorpay popup';
    case 'verifying':
      return 'Verifying payment…';
    case 'success':
      return 'Payment successful';
    case 'failed':
      return 'Payment failed';
    case 'cancelled':
      return 'Payment cancelled';
    default:
      return 'Ready to pay';
  }
}

export type { RazorpayOrderResponse };
