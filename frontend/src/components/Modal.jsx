import clsx from 'clsx';
import { X, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';

export default function Modal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    children,
    confirmText = "Confirm",
    cancelText = "Cancel",
    type = "info",
}) {
    if (!isOpen) return null;

    const IconMap = {
        info: AlertCircle,
        danger: AlertTriangle,
        warning: AlertTriangle,
        success: CheckCircle
    };
    const Icon = IconMap[type] || AlertCircle;

    const typeColors = {
        info: "text-accent-blue",
        danger: "text-accent-red",
        warning: "text-accent-yellow",
        success: "text-accent-green"
    };

    const confirmColors = {
        info: "bg-accent-blue hover:bg-accent-blue/80",
        danger: "bg-accent-red hover:bg-accent-red/80",
        warning: "bg-accent-yellow hover:bg-accent-yellow/80",
        success: "bg-accent-green hover:bg-accent-green/80"
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-overlay-modal backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative glass border border-white/[0.08] rounded-xl shadow-2xl w-full max-w-md transform transition-all scale-100 opacity-100 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#0c101c]">
                    <div className="flex items-center gap-2 font-medium text-white">
                        <Icon size={18} className={typeColors[type]} />
                        <span>{title}</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-white/10 text-text-secondary hover:text-white transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 text-text-secondary text-sm leading-relaxed">
                    {children || message}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-4 py-3 bg-[#0c101c] border-t border-white/[0.06]">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 rounded text-sm font-medium text-text-secondary hover:text-white hover:bg-white/5 transition-colors"
                    >
                        {cancelText}
                    </button>
                    {onConfirm && (
                        <button
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className={clsx(
                                "px-3 py-1.5 rounded text-sm font-medium text-white transition-colors shadow-lg",
                                confirmColors[type]
                            )}
                        >
                            {confirmText}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
