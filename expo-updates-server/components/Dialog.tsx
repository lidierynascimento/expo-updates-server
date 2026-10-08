import { useEffect, useRef, ReactNode } from "react";
import s from "../styles/Dashboard.module.css";
export default function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog className={s.dialog} ref={ref} onClose={onClose}>
      <div className={s.dialogHeader}>
        <h2>{title}</h2>
        <button
          type="button"
          aria-label="Fechar modal"
          onClick={() => ref.current?.close()}
        >
          ×
        </button>
      </div>
      <div className={s.dialogBody}>{children}</div>
    </dialog>
  );
}
