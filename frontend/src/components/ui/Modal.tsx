'use client';

import { ReactNode } from 'react';
import { Dialog } from './Dialog';

/** @deprecated Prefer Dialog / ConfirmDialog for new code. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size={size}
    >
      {children}
    </Dialog>
  );
}
