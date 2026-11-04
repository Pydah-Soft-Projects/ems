import { api, ApiError } from '@/lib/api';
import { PaymentMethod } from '@/types/fee';
import { RazorpayOrderResponse } from '@/lib/razorpayCheckout';
import { openPpgCheckout } from '@/lib/ppgCheckout';

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
 * Online UPI Payment flow via Pydah Payment Gateway (PPG).
 * Creates order → opens seamless In-Page Checkout modal → verifies payment on success.
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

    const checkoutBase = process.env.NEXT_PUBLIC_PPG_CHECKOUT_URL;
    const checkoutUrl =
      (checkoutBase && order.orderId
        ? `${checkoutBase.replace(/\/+$/, '')}/${order.orderId}`
        : null) ||
      (order as unknown as { checkoutUrl?: string }).checkoutUrl ||
      `http://localhost:5005/checkout/${order.orderId}`;

    const sdkUrl =
      process.env.NEXT_PUBLIC_PPG_SDK_URL ||
      (order as unknown as { sdkUrl?: string }).sdkUrl;

    setPhase('opening_checkout', 'Opening UPI payment window…');
    setPhase('awaiting_payment', 'Complete payment in the checkout window');

    const result = await openPpgCheckout({
      checkoutUrl,
      sdkUrl,
      onSuccess: () => {
        setPhase('verifying', 'Confirming payment…');
      },
      onFailure: (err) => {
        setPhase('failed', err?.message || 'Payment failed');
      },
      onClose: () => {
        setPhase('cancelled', 'Payment window closed');
      },
    });

    setPhase('verifying', 'Confirming payment…');
    const verification = await api.verifyRazorpayPayment({
      feeRecordId,
      razorpayOrderId: String(result.paymentId || order.orderId),
      razorpayPaymentId: String(result.paymentId || order.orderId),
      razorpaySignature: 'ppg_verified',
      paymentId: order.paymentId || undefined,
    });

    setPhase('success', 'Payment successful');
    return {
      paymentId: verification.payment.id,
      receiptNumber: verification.payment.receiptNumber,
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
      return 'Waiting for payment — complete payment in the UPI modal';
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
