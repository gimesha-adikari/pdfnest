import { DropzoneInputProps, DropzoneRootProps } from "react-dropzone";

interface PdfDropzoneProps {
    getRootProps: () => DropzoneRootProps;
    getInputProps: () => DropzoneInputProps;
    isDragActive: boolean;
}

export default function PdfDropzone({
                                        getRootProps,
                                        getInputProps,
                                        isDragActive,
                                    }: PdfDropzoneProps) {
    return (
        <div
            {...getRootProps()}
            className={`
        flex
        min-h-[280px]
        cursor-pointer
        flex-col
        items-center
        justify-center
        rounded-2xl
        border-2
        border-dashed
        transition-all
        duration-300

        ${
                isDragActive
                    ? "border-indigo-500 bg-indigo-500/10 scale-[1.01]"
                    : "border-[color:var(--border)] hover:border-indigo-500 hover:bg-indigo-500/5"
            }
      `}
        >
            <input {...getInputProps()} />

            <div className="text-center">
                <div className="mb-4 text-6xl">
                    📄
                </div>

                <h2 className="text-2xl font-bold">
                    {isDragActive
                        ? "Drop PDFs Here"
                        : "Drag & Drop PDFs"}
                </h2>

                <p className="mt-3 text-[color:var(--muted)]">
                    or click to browse files
                </p>

                <p className="mt-2 text-sm text-[color:var(--muted)]">
                    Select multiple PDFs and merge them instantly
                </p>
            </div>
        </div>
    );
}