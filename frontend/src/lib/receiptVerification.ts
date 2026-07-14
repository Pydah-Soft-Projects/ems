import { Payment } from '@/types/fee';

/** Public verification page URL encoded into receipt QR codes. */
export function buildReceiptVerificationUrl(payment: Payment): string {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const receipt = encodeURIComponent(payment.receiptNumber);
  const token = payment.verificationToken
    ? `?v=${encodeURIComponent(payment.verificationToken)}`
    : '';

  return `${origin}/verify/receipt/${receipt}${token}`;
}
