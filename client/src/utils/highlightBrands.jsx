// Helper function to render text with brand highlighting
export const highlightBrands = (text) => {
    if (!text) return text;

    // Split by ** markers
    const parts = text.split('**');

    return parts.map((part, index) => {
        // Odd indices are the highlighted parts
        if (index % 2 === 1) {
            return (
                <span key={index} className="text-marriott font-extrabold bg-marriott/20 px-2 py-0.5 rounded border border-marriott/30">
                    {part}
                </span>
            );
        }
        return part;
    });
};
