export function getDefaultTextPosition(pageWidth: number, pageHeight: number, requestedFontSize: number) {
    const width = Number.isFinite(pageWidth) && pageWidth > 0 ? pageWidth : 612;
    const height = Number.isFinite(pageHeight) && pageHeight > 0 ? pageHeight : 792;
    const margin = Math.min(36, width / 4, height / 4);
    const availableWidth = Math.max(1, width - margin * 2);
    const availableHeight = Math.max(1, height - margin * 2);
    const label = "Type here...";
    const fontSize = Math.max(4, Math.min(
        Number.isFinite(requestedFontSize) && requestedFontSize > 0 ? requestedFontSize : 24,
        availableWidth / (label.length * 0.65),
        availableHeight / 1.5,
    ));
    const textWidth = label.length * fontSize * 0.65;
    const textHeight = fontSize * 1.5;
    return {
        x: margin,
        y: Math.max(margin, height - margin - textHeight),
        fontSize,
        width: textWidth,
        height: textHeight,
    };
}
