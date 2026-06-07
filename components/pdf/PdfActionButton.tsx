interface PdfActionButtonProps {
    text: string;
    loadingText?: string;
    loading?: boolean;
    disabled?: boolean;
    onClick: () => void;
}

export default function PdfActionButton({
                                            text,
                                            loadingText = "Processing...",
                                            loading = false,
                                            disabled = false,
                                            onClick,
                                        }: PdfActionButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled || loading}
            className="
        mt-8
        w-full
        rounded-xl
        bg-gradient-to-r
        from-indigo-500
        to-purple-600
        px-6
        py-4
        text-lg
        font-semibold
        text-white
        transition-all
        duration-300
        hover:scale-[1.01]
        hover:shadow-lg
        disabled:opacity-50
        disabled:hover:scale-100
      "
        >
            {loading ? loadingText : text}
        </button>
    );
}