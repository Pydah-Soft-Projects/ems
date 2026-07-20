'use strict';

const BillType = Object.freeze({
  QP_SETTING: 'qp_setting',
  LAB_PROJECT: 'lab_project',
  EVALUATION: 'evaluation',
  OBSERVER: 'observer',
  EXAMINER: 'examiner',
});

const BillStatus = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  PASSED: 'passed',
  PAID: 'paid',
});

const BILL_TYPE_LABELS = Object.freeze({
  [BillType.QP_SETTING]: 'QP Setting',
  [BillType.LAB_PROJECT]: 'Externals for Lab/Project',
  [BillType.EVALUATION]: 'Evaluation',
  [BillType.OBSERVER]: 'Observer',
  [BillType.EXAMINER]: 'Examiner',
});

/** Suggested “Remuneration for” rows per bill type (editable in the form). */
const DEFAULT_LINE_SUGGESTIONS = Object.freeze({
  [BillType.QP_SETTING]: [
    'Setting of Question Paper',
    'Scheme of Valuation',
  ],
  [BillType.LAB_PROJECT]: [
    'Laboratory Exams/Observer',
    'Project Viva Voce',
    'TA',
    'DA',
  ],
  [BillType.EVALUATION]: [
    'Script Valuation',
    'Revaluation',
  ],
  [BillType.OBSERVER]: [
    'Observer Duty',
    'TA',
    'DA',
  ],
  [BillType.EXAMINER]: [
    'External Examiner',
    'TA',
    'DA',
  ],
});

module.exports = {
  BillType,
  BillStatus,
  BILL_TYPE_LABELS,
  DEFAULT_LINE_SUGGESTIONS,
};
