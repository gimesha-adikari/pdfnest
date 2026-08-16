export interface TextElement {
    id: string;
    text: string;
    x: number;
    y: number;
    page: number;
    fontSize: number;
    color: string;
}

export type PdfcpuWorkerRequest =
    | {
          id: string;
          type: "watermark-text";
          pdfBytes: ArrayBuffer;
          text: string;
          description: string;
      }
    | {
          id: string;
          type: "watermark-image";
          pdfBytes: ArrayBuffer;
          imageBytes: ArrayBuffer;
          description: string;
      }
    | {
          id: string;
          type: "add-text";
          pdfBytes: ArrayBuffer;
          elements: TextElement[];
      }
    | {
          id: string;
          type: "decrypt";
          pdfBytes: ArrayBuffer;
          password: string;
      }
    | {
          id: string;
          type: "encrypt";
          pdfBytes: ArrayBuffer;
          password: string;
          keyLength?: number;
      };

export type PdfcpuWorkerResponse =
    | {
          id: string;
          type: "success";
          pdfBytes: ArrayBuffer;
      }
    | {
          id: string;
          type: "error";
          code: string;
          message: string;
      };
