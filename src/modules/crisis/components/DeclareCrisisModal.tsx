'use client';

/**
 * Props the crisis page passes when it opens the declare-crisis modal.
 *
 * NOTE (P-19): this component is a placeholder -- it renders nothing. The
 * "Declare Crisis" button on /crisis therefore opens no dialog. Typing the
 * props (they were `_props: any`) does not change that; it only makes the
 * caller checkable against the shape the real modal will take.
 */
export interface DeclareCrisisModalProps {
  entityId?: string;
  onClose?: () => void;
  onSuccess?: () => void;
}

export default function DeclareCrisisModal(_props: DeclareCrisisModalProps) {
  return null;
}
