import {
    PDFDocument,
    StandardFonts,
    rgb,
    degrees,
} from "pdf-lib";

export type WatermarkPosition =
    | "center"
    | "topLeft"
    | "topRight"
    | "bottomLeft"
    | "bottomRight";

export default async function applyWatermark(
    pdf: PDFDocument,
    text: string,
    fontSize: number,
    opacity: number,
    position: WatermarkPosition
) {
    const font =
        await pdf.embedFont(
            StandardFonts.HelveticaBold
        );

    const pages = pdf.getPages();

    for (const page of pages) {
        const { width, height } =
            page.getSize();

        const textWidth =
            font.widthOfTextAtSize(
                text,
                fontSize
            );

        let x = 0;
        let y = 0;

        let rotation =
            degrees(-45);

        switch (position) {
            case "center": {
                const centerX = width / 2;
                const centerY = height / 2;

                x = centerX;
                y = centerY;

                break;
            }

            case "topLeft":
                x = 40;
                y = height - 80;
                rotation = degrees(0);
                break;

            case "topRight":
                x =
                    width -
                    textWidth -
                    40;

                y = height - 80;
                rotation = degrees(0);
                break;

            case "bottomLeft":
                x = 40;
                y = 40;
                rotation = degrees(0);
                break;

            case "bottomRight":
                x =
                    width -
                    textWidth -
                    40;

                y = 40;
                rotation = degrees(0);
                break;
        }

        page.drawText(text, {

            x:
                position === "center"
                    ? x
                    - textWidth / 3
                    : x,

            y:
                position === "center"
                    ? y + textWidth / 3
                    : y,

            size: fontSize,
            font,
            rotate: rotation,
            opacity,
            color: rgb(
                0.5,
                0.5,
                0.5
            ),
        });
    }
}