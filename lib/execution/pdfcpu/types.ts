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
