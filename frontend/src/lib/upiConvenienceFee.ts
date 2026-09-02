/** UPI online convenience / bank charges — 2.2% of exam fee */
export const UPI_CONVENIENCE_FEE_RATE = 0.022;

export function isDuplicateHallTicketFeeRecord(
  feeBreakdown?: Array<{ subjectCode?: string | null }> | null,
) {
  return (feeBreakdown ?? []).some((item) => {
    const code = String(item?.subjectCode ?? '').trim().toUpperCase();
    return code === 'DHT' || code.includes('DUPLICATE');
  });
}

export function feeRecordDisplayName(
  feeRecord?:
    | {
        feeBreakdown?: Array<{ subjectCode?: string | null }> | null;
        exam?: { name?: string | null } | null;
      }
    | null,
) {
  if (isDuplicateHallTicketFeeRecord(feeRecord?.feeBreakdown)) {
    return 'Duplicate hall ticket fee';
  }
  return feeRecord?.exam?.name ?? 'Exam fee';
}

export function calcUpiConvenienceFee(
  baseAmount: number | string,
  paymentMethod: string,
) {
  const base = Math.round(Number(baseAmount) * 100) / 100;
  if (paymentMethod !== 'upi') {
    return {
      base,
      convenienceFee: 0,
      total: base,
      applies: false as const,
      rate: 0,
    };
  }
  const convenienceFee =
    Math.round(base * UPI_CONVENIENCE_FEE_RATE * 100) / 100;
  const total = Math.round((base + convenienceFee) * 100) / 100;
  return {
    base,
    convenienceFee,
    total,
    applies: true as const,
    rate: UPI_CONVENIENCE_FEE_RATE,
  };
}

export function paymentLineLabel(payment: {
  remarks?: string | null;
  gatewayResponse?: string | null;
  feeRecord?: {
    exam?: { name?: string } | null;
    feeBreakdown?: Array<{ subjectCode?: string | null }> | null;
  };
}) {
  const gw = payment.gatewayResponse ?? '';
  if (
    gw.includes('convenience_fee') ||
    payment.remarks?.toLowerCase().includes('convenience')
  ) {
    return 'UPI convenience / bank charges (2.2%)';
  }
  return feeRecordDisplayName(payment.feeRecord);
}
