const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080/api";

export async function uploadAndDownloadFile(
    subPath: string,
    formData: FormData,
    defaultFileName: string
): Promise<void> {
    const response = await fetch(`${BASE_URL}${subPath}`, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Server transaction failed with status ${response.status}`);
    }

    const fileBlob = await response.blob();
    const clientDownloadUrl = URL.createObjectURL(fileBlob);

    const executionAnchor = document.createElement("a");
    executionAnchor.href = clientDownloadUrl;
    executionAnchor.download = defaultFileName;

    document.body.appendChild(executionAnchor);
    executionAnchor.click();

    document.body.removeChild(executionAnchor);
    URL.revokeObjectURL(clientDownloadUrl);
}