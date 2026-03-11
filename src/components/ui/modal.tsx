"use client";

import type { ReactNode } from "react";

type ModalProps = {
  children: ReactNode;
  closeIcon?: string;
  onClose: () => void;
  open: boolean;
  title: ReactNode;
};

export function Modal({ children, closeIcon = "×", onClose, open, title }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" onClick={onClose} type="button">
          {closeIcon}
        </button>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}